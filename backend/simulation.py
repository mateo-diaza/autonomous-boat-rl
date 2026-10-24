"""Sesión de navegación en vivo: un barco (Lane) con el escenario editable.

No sabe nada de red: el WebSocket llama a `apply(cmd)` con los comandos del cliente y a
`tick(now)` a frecuencia fija, y envía los mensajes que devuelve.
"""

from __future__ import annotations

import numpy as np
from stable_baselines3.common.base_class import BaseAlgorithm

from backend.config import DEFAULT_OBSTACLES
from backend.lane import Lane
from backend.playback import Playback
from backend.schemas import (
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
    StateMsg,
    StepCmd,
    UnloadModelCmd,
)


class SimulationSession:
    def __init__(self, n_obstacles: int | tuple[int, int] = DEFAULT_OBSTACLES, seed: int | None = None):
        self.lane = Lane(n_obstacles)
        self.playback = Playback()
        self._rng = np.random.default_rng(seed)
        self._dirty = True  # hay cambios que el cliente aún no ha recibido
        self.new_scenario()

    @property
    def playing(self) -> bool:
        return self.playback.playing

    # ----------------------------------------------------------------- Escenario
    def new_scenario(self, seed: int | None = None, n_obstacles: int | None = None) -> None:
        if n_obstacles is not None:
            self.lane.env.n_obstacles = n_obstacles
        self.scenario_seed = int(self._rng.integers(2**31 - 1)) if seed is None else seed
        self.lane.reset(self.scenario_seed)
        self._after_reset()

    def restart(self) -> None:
        """Mismo escenario (incluidas las ediciones) desde la posición de salida."""
        self.lane.reset(self.scenario_seed, options=self.lane.scenario())
        self._after_reset()

    def _after_reset(self) -> None:
        self.playback.clear()
        self._dirty = True

    # -------------------------------------------------------------------- Modelo
    def set_model(self, model: BaseAlgorithm, ref: ModelRef) -> None:
        self.lane.set_model(model, ref)
        self._dirty = True

    def unload_model(self) -> None:
        self.lane.unload_model()
        self._dirty = True

    # ------------------------------------------------------------------ Comandos
    def apply(self, cmd: ClientCommand) -> None:
        """Aplica un comando del cliente (salvo load_model, que carga de disco y lo gestiona la ruta).

        Lanza ValueError si el comando no tiene sentido en el estado actual.
        """
        match cmd:
            case PlayCmd():
                if self.lane.done:
                    self.restart()
                self.playback.play()
            case PauseCmd():
                self.playback.playing = False
            case StepCmd():
                self.playback.playing = False
                if self.lane.done:
                    self.restart()
                self.lane.step()
            case SetSpeedCmd(speed=speed):
                self.playback.speed = speed
            case SetDeterministicCmd(deterministic=deterministic):
                self.lane.deterministic = deterministic
            case SetAutoResetCmd(auto_reset=auto_reset):
                self.playback.auto_reset = auto_reset
            case NewScenarioCmd(seed=seed, n_obstacles=n_obstacles):
                self.new_scenario(seed, n_obstacles)
            case RestartCmd():
                self.restart()
            case AddObstacleCmd(x=x, y=y, radius=radius):
                self._edit_obstacles([*self.lane.obstacles(), [x, y, radius]])
            case RemoveObstacleCmd(index=index):
                obstacles = self.lane.obstacles()
                self._check_index(index, obstacles)
                del obstacles[index]
                self._edit_obstacles(obstacles)
            case MoveObstacleCmd(index=index, x=x, y=y):
                obstacles = self.lane.obstacles()
                self._check_index(index, obstacles)
                obstacles[index][:2] = [x, y]
                self._edit_obstacles(obstacles)
            case SetGoalCmd(x=x, y=y):
                self.lane.env.set_goal([x, y])
                self.lane.observe()
            case UnloadModelCmd():
                self.unload_model()
            case _:
                raise ValueError(f"Comando no soportado por la sesión: {cmd.type}")
        self._dirty = True

    # -------------------------------------------------------------- Bucle (tick)
    def tick(self, now: float) -> list[StateMsg | EpisodeEndMsg]:
        """Avanza la simulación según el tiempo real transcurrido y devuelve los mensajes a enviar."""
        if self.playback.should_resume(now):
            self.new_scenario()
        episode_end: EpisodeEndMsg | None = None
        for _ in range(self.playback.advance(now)):
            episode_end = self.lane.step()
            self._dirty = True
            if episode_end:
                self.playback.episode_ended(now)
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
            sim=self.lane.sim_state(),
            status=SessionStatus(
                playing=self.playback.playing,
                speed=self.playback.speed,
                deterministic=self.lane.deterministic,
                auto_reset=self.playback.auto_reset,
                scenario_seed=self.scenario_seed,
                model=self.lane.model_ref,
            ),
        )

    # ------------------------------------------------------------------ Internas
    def _edit_obstacles(self, obstacles: list[list[float]]) -> None:
        self.lane.env.set_obstacles(obstacles)
        self.lane.observe()

    @staticmethod
    def _check_index(index: int, obstacles: list) -> None:
        if index >= len(obstacles):
            raise ValueError(f"No existe el obstáculo {index} (hay {len(obstacles)})")
