"""Un barco con su "cerebro": un BoatEnv + (opcionalmente) un modelo SB3.

Pieza común de la navegación en vivo (una lane) y de la comparativa (dos lanes en el mismo escenario).
"""

from __future__ import annotations

import numpy as np
from stable_baselines3.common.base_class import BaseAlgorithm

from server.models_cache import action_probabilities
from server.schemas import EpisodeEndMsg, ModelRef, SimState
from src.boat_env import BoatEnv

STRAIGHT = 1  # acción sin modelo: seguir recto


class Lane:
    def __init__(self, n_obstacles: int | tuple[int, int]):
        self.env = BoatEnv(n_obstacles=n_obstacles)
        self.model: BaseAlgorithm | None = None
        self.model_ref: ModelRef | None = None
        self.deterministic = True
        self.obs: np.ndarray | None = None
        self.action: int | None = None
        self.action_probs: list[float] | None = None
        self._initial: dict = {}

    # ----------------------------------------------------------------- Escenario
    def reset(self, seed: int, options: dict | None = None) -> None:
        self.obs, _ = self.env.reset(seed=seed, options=options)
        self._initial = {"start": self.env.pos.tolist(), "heading": self.env.heading}
        self.action = None
        self._refresh_probs()

    def scenario(self) -> dict:
        """Escenario actual como `options` de reset: salida y rumbo iniciales + meta y obstáculos actuales."""
        return {**self._initial, "goal": self.env.goal.tolist(), "obstacles": self.obstacles()}

    def obstacles(self) -> list[list[float]]:
        env = self.env
        return [[*c, r] for c, r in zip(env.obs_centers.tolist(), env.obs_radii.tolist(), strict=True)]

    def observe(self) -> None:
        """Recalcula la observación tras editar el escenario sin dar un paso."""
        self.obs = self.env.observe()
        self._refresh_probs()

    @property
    def done(self) -> bool:
        return self.env.last_event is not None

    # -------------------------------------------------------------------- Modelo
    def set_model(self, model: BaseAlgorithm, ref: ModelRef | None = None) -> None:
        self.model, self.model_ref = model, ref
        self._refresh_probs()

    def unload_model(self) -> None:
        self.model, self.model_ref = None, None
        self._refresh_probs()

    # ---------------------------------------------------------------------- Paso
    def step(self) -> EpisodeEndMsg | None:
        """Un paso con la acción del modelo (o recto sin modelo). Devuelve el final si el episodio termina."""
        if self.model is not None:
            action, _ = self.model.predict(self.obs, deterministic=self.deterministic)
            self.action = int(action)
        else:
            self.action = STRAIGHT
        self.obs, _, terminated, truncated, info = self.env.step(self.action)
        self._refresh_probs()
        if terminated or truncated:
            return EpisodeEndMsg(event=info["event"], steps=self.env.steps,
                                 episode_return=round(self.env.episode_return, 2))
        return None

    def sim_state(self) -> SimState:
        return SimState(**self.env.get_state(), action=self.action, action_probs=self.action_probs)

    def _refresh_probs(self) -> None:
        # Sin observación todavía (modelo cargado antes del primer reset) no hay nada que evaluar
        ready = self.model is not None and self.obs is not None
        self.action_probs = action_probabilities(self.model, self.obs) if ready else None
