"""Sesión de simulación en vivo: un BoatEnv + (opcionalmente) un modelo SB3.

No sabe nada de red: el WebSocket llama a `apply(cmd)` con los comandos del cliente y a
`tick(now)` a frecuencia fija, y envía los mensajes que devuelve.
"""

from __future__ import annotations

import numpy as np
from stable_baselines3.common.base_class import BaseAlgorithm

from server.config import DEFAULT_OBSTACLES, DEFAULT_SPEED, END_PAUSE_S
from server.models_cache import action_probabilities
from server.schemas import (
    AddObstacleCmd,
    ClientCommand,
    EpisodeEndMsg,
    ModelRef,
    MoveObstacleCmd,
    NewScenarioCmd,
    PauseCmd,
    PlayCmd,
    RemoveObstacleCmd,
    RestartCmd,
    SessionStatus,
    SetAutoResetCmd,
    SetDeterministicCmd,
    SetGoalCmd,
    SetSpeedCmd,
    SimState,
    StateMsg,
    StepCmd,
    UnloadModelCmd,
)
from src.boat_env import BoatEnv

STRAIGHT = 1                 # acción sin modelo: seguir recto
MAX_STEPS_PER_TICK = 16      # evita ráfagas si un tick llega tarde
MAX_TICK_ELAPSED_S = 0.25


class SimulationSession:
    def __init__(self, n_obstacles: int | tuple[int, int] = DEFAULT_OBSTACLES, seed: int | None = None):
        self.env = BoatEnv(n_obstacles=n_obstacles)
        self._rng = np.random.default_rng(seed)

        self.model: BaseAlgorithm | None = None
        self.model_ref: ModelRef | None = None
        self.playing = False
        self.speed = DEFAULT_SPEED
        self.deterministic = True
        self.auto_reset = True

        self._step_budget = 0.0         # pasos pendientes (fraccionarios) según la velocidad
        self._last_tick: float | None = None
        self._resume_at: float | None = None
        self._dirty = True              # hay cambios que el cliente aún no ha recibido

        self.new_scenario()

    # ----------------------------------------------------------------- Escenario
    def new_scenario(self, seed: int | None = None, n_obstacles: int | None = None) -> None:
        if n_obstacles is not None:
            self.env.n_obstacles = n_obstacles
        self.scenario_seed = int(self._rng.integers(2**31 - 1)) if seed is None else seed
        obs, _ = self.env.reset(seed=self.scenario_seed)
        self._initial = {"start": self.env.pos.tolist(), "heading": self.env.heading}
        self._after_reset(obs)

    def restart(self) -> None:
        """Mismo escenario (incluidas las ediciones) desde la posición de salida."""
        obs, _ = self.env.reset(seed=self.scenario_seed, options={
            **self._initial,
            "goal": self.env.goal.tolist(),
            "obstacles": self._obstacles(),
        })
        self._after_reset(obs)

    def _after_reset(self, obs: np.ndarray) -> None:
        self.obs = obs
        self.action: int | None = None
        self._resume_at = None
        self._step_budget = 0.0
        self._refresh_probs()
        self._dirty = True

    # -------------------------------------------------------------------- Modelo
    def set_model(self, model: BaseAlgorithm, ref: ModelRef) -> None:
        """Cambia el "cerebro" en vivo, sin reiniciar el episodio."""
        self.model, self.model_ref = model, ref
        self._refresh_probs()
        self._dirty = True

    def unload_model(self) -> None:
        self.model, self.model_ref = None, None
        self._refresh_probs()
        self._dirty = True

    # ------------------------------------------------------------------ Comandos
    def apply(self, cmd: ClientCommand) -> None:
        """Aplica un comando del cliente (salvo load_model, que carga de disco y lo gestiona la ruta).

        Lanza ValueError si el comando no tiene sentido en el estado actual.
        """
        match cmd:
            case PlayCmd():
                if self._episode_over():
                    self.restart()
                self.playing = True
                self._last_tick = None
            case PauseCmd():
                self.playing = False
            case StepCmd():
                self.playing = False
                if self._episode_over():
                    self.restart()
                self._step_once()
            case SetSpeedCmd(speed=speed):
                self.speed = speed
            case SetDeterministicCmd(deterministic=deterministic):
                self.deterministic = deterministic
            case SetAutoResetCmd(auto_reset=auto_reset):
                self.auto_reset = auto_reset
            case NewScenarioCmd(seed=seed, n_obstacles=n_obstacles):
                self.new_scenario(seed, n_obstacles)
            case RestartCmd():
                self.restart()
            case AddObstacleCmd(x=x, y=y, radius=radius):
                self._edit_obstacles([*self._obstacles(), [x, y, radius]])
            case RemoveObstacleCmd(index=index):
                obstacles = self._obstacles()
                self._check_index(index, obstacles)
                del obstacles[index]
                self._edit_obstacles(obstacles)
            case MoveObstacleCmd(index=index, x=x, y=y):
                obstacles = self._obstacles()
                self._check_index(index, obstacles)
                obstacles[index][:2] = [x, y]
                self._edit_obstacles(obstacles)
            case SetGoalCmd(x=x, y=y):
                self.env.set_goal([x, y])
                self._refresh_obs()
            case UnloadModelCmd():
                self.unload_model()
            case _:
                raise ValueError(f"Comando no soportado por la sesión: {cmd.type}")
        self._dirty = True

    # -------------------------------------------------------------- Bucle (tick)
    def tick(self, now: float) -> list[StateMsg | EpisodeEndMsg]:
        """Avanza la simulación según el tiempo real transcurrido y devuelve los mensajes a enviar."""
        elapsed = 0.0 if self._last_tick is None else min(now - self._last_tick, MAX_TICK_ELAPSED_S)
        self._last_tick = now
        episode_end: EpisodeEndMsg | None = None

        if self._resume_at is not None:
            if now >= self._resume_at:
                self.new_scenario()
        elif self.playing:
            self._step_budget += elapsed * self.speed
            n_steps = min(int(self._step_budget), MAX_STEPS_PER_TICK)
            self._step_budget = min(self._step_budget - n_steps, 1.0)
            for _ in range(n_steps):
                episode_end = self._step_once()
                if episode_end:
                    self._on_episode_end(now)
                    break

        messages: list[StateMsg | EpisodeEndMsg] = []
        if self._dirty:
            messages.append(self.state_msg())
            self._dirty = False
        if episode_end:
            messages.append(episode_end)
        return messages

    def state_msg(self) -> StateMsg:
        return StateMsg(
            sim=SimState(**self.env.get_state(), action=self.action, action_probs=self.action_probs),
            status=SessionStatus(
                playing=self.playing,
                speed=self.speed,
                deterministic=self.deterministic,
                auto_reset=self.auto_reset,
                scenario_seed=self.scenario_seed,
                model=self.model_ref,
            ),
        )

    # ------------------------------------------------------------------ Internas
    def _step_once(self) -> EpisodeEndMsg | None:
        if self.model is not None:
            action, _ = self.model.predict(self.obs, deterministic=self.deterministic)
            self.action = int(action)
        else:
            self.action = STRAIGHT
        self.obs, _, terminated, truncated, info = self.env.step(self.action)
        self._refresh_probs()
        self._dirty = True
        if terminated or truncated:
            return EpisodeEndMsg(event=info["event"], steps=self.env.steps,
                                 episode_return=round(self.env.episode_return, 2))
        return None

    def _on_episode_end(self, now: float) -> None:
        self._step_budget = 0.0
        if self.auto_reset:
            self._resume_at = now + END_PAUSE_S
        else:
            self.playing = False

    def _episode_over(self) -> bool:
        return self.env.last_event is not None

    def _obstacles(self) -> list[list[float]]:
        return [[*c, r] for c, r in zip(self.env.obs_centers.tolist(), self.env.obs_radii.tolist(), strict=True)]

    def _edit_obstacles(self, obstacles: list[list[float]]) -> None:
        self.env.set_obstacles(obstacles)
        self._refresh_obs()

    @staticmethod
    def _check_index(index: int, obstacles: list) -> None:
        if index >= len(obstacles):
            raise ValueError(f"No existe el obstáculo {index} (hay {len(obstacles)})")

    def _refresh_obs(self) -> None:
        self.obs = self.env.observe()
        self._refresh_probs()

    def _refresh_probs(self) -> None:
        self.action_probs = action_probabilities(self.model, self.obs) if self.model is not None else None
