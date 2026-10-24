"""Un barco con su "cerebro": un BoatEnv + (opcionalmente) un modelo SB3.

Pieza común de la navegación en vivo (una lane) y de la comparativa (dos lanes en el mismo escenario).

El entorno combina dos cosas que vienen de sitios distintos:
- el MAR (problema: rocas, corriente, recompensa), que elige la sesión;
- los SENSORES (qué observa el barco), que vienen del modelo cargado: un modelo solo funciona con la
  forma de observación con la que se entrenó.
"""

from __future__ import annotations

import numpy as np
from stable_baselines3.common.base_class import BaseAlgorithm

from backend.models_cache import action_probabilities
from backend.schemas import EpisodeEndMsg, ModelRef, SimState
from training.boat_env import BoatEnv

STRAIGHT = 1  # acción sin modelo: seguir recto


class Lane:
    def __init__(self, sea_kwargs: dict):
        self.sea_kwargs = dict(sea_kwargs)
        self.sensors: dict = {}
        self.env = BoatEnv(**self.sea_kwargs)
        self.model: BaseAlgorithm | None = None
        self.model_ref: ModelRef | None = None
        self.deterministic = True
        self.obs: np.ndarray | None = None
        self.action: int | None = None
        self.action_probs: list[float] | None = None
        self._initial: dict = {}
        self._seed: int | None = None

    def reconfigure(self, sea_kwargs: dict) -> None:
        """Cambia el mar (otro problema) conservando modelo y sensores. Requiere un reset después."""
        self.sea_kwargs = dict(sea_kwargs)
        self.env = BoatEnv(**self.sea_kwargs, **self.sensors)
        self.obs, self.action = None, None
        self._refresh_probs()

    # ----------------------------------------------------------------- Escenario
    def reset(self, seed: int, options: dict | None = None) -> None:
        self._seed = seed
        self.obs, _ = self.env.reset(seed=seed, options=options)
        self._initial = {
            "start": self.env.pos.tolist(),
            "heading": self.env.heading,
            "current": self.env.current.tolist(),
        }
        self.action = None
        self._refresh_probs()

    def scenario(self) -> dict:
        """Escenario actual como `options` de reset: salida, rumbo y corriente iniciales + meta y obstáculos."""
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
    def set_model(self, model: BaseAlgorithm, ref: ModelRef | None = None, sensors: dict | None = None) -> None:
        """Carga un modelo con los sensores con los que se entrenó (p. ej. {"observe_current": True}).

        Si los sensores cambian, se reconstruye el entorno y se restaura el mismo escenario desde la salida.
        Lanza ValueError si el modelo no encaja con la observación (no debería pasar si `sensors` es correcto).
        """
        # El modelo anterior se retira ANTES de cambiar los sensores: al restaurar el escenario se recalculan las
        # probabilidades, y el modelo viejo no puede evaluar una observación con otra forma
        self.model, self.model_ref = None, None
        self._set_sensors(sensors or {})
        expected, got = model.observation_space.shape, self.env.observation_space.shape
        if expected != got:
            raise ValueError(f"El modelo espera observaciones de forma {expected} y el entorno da {got}.")
        self.model, self.model_ref = model, ref
        self._refresh_probs()

    def unload_model(self) -> None:
        self.model, self.model_ref = None, None
        self._set_sensors({})
        self._refresh_probs()

    def _set_sensors(self, sensors: dict) -> None:
        if sensors == self.sensors:
            return
        had_scenario = self.obs is not None and self._seed is not None
        scenario = self.scenario() if had_scenario else None
        self.sensors = dict(sensors)
        self.env = BoatEnv(**self.sea_kwargs, **self.sensors)
        if had_scenario:
            self.reset(self._seed, scenario)
        else:
            self.obs, self.action = None, None

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
