"""Catálogo de problemas: variantes de dificultad del entorno, cada una con la lección de RL que ilustra.

Un problema = parámetros de BoatEnv que definen el MAR (dinámica, recompensa) + textos para la web.
Añadir una dificultad = añadir una entrada aquí (y, si hace falta, el parámetro correspondiente en BoatEnv
con un valor por defecto que no cambie el base).

Los SENSORES (qué observa el barco) no son parte del mar sino del modelo: se eligen al entrenar
(p. ej. `--observe-current`) y se guardan en su config.json. Así un mismo mar sirve para modelos con
sensores distintos, y cada modelo navega siempre con los sensores con los que aprendió.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from training.boat_env import BoatEnv

DEFAULT_PROBLEM = "base"

#: Parámetros de BoatEnv que cambian la observación (y por tanto la red): son del modelo, no del mar
SENSOR_KEYS = ("observe_current",)
SENSOR_NAMES = {"observe_current": "current"}


@dataclass(frozen=True)
class Problem:
    id: str
    title: str
    #: Qué cambia y qué dificultad de RL ilustra, en lenguaje llano. Se muestra en la barra de la web:
    #: máximo ~130 caracteres (2 líneas), o la columna derecha deja de caber a 1920x1080
    description: str
    env_kwargs: dict = field(default_factory=dict)


_BASE_ENV = {"n_obstacles": (4, 10)}

PROBLEMS: dict[str, Problem] = {
    p.id: p
    for p in [
        Problem(
            id="base",
            title="Mar en calma",
            description=(
                "El problema original: entre 4 y 10 rocas. La recompensa premia cada paso que acerca a la boya."
            ),
            env_kwargs=_BASE_ENV,
        ),
        Problem(
            id="sparse",
            title="Recompensa escasa",
            description=(
                "Solo +100 al llegar y −100 al chocar, sin pistas intermedias. Problema de exploración: "
                "aprende de las veces que acierta por casualidad, tarde y a trompicones."
            ),
            env_kwargs={**_BASE_ENV, "reward_mode": "sparse"},
        ),
        Problem(
            id="current",
            title="Corrientes",
            description=(
                "Corriente aleatoria de 5–8 u/s (más de media velocidad del barco). Sin sensor no la ve "
                "y debe deducirla de la deriva: observabilidad parcial."
            ),
            env_kwargs={**_BASE_ENV, "current_speed": (5.0, 8.0)},
        ),
        Problem(
            id="u_trap",
            title="Trampa en U",
            description=(
                "Un arrecife en U abierto hacia el barco tapa el camino recto. Ir directo a la boya lleva a un "
                "callejón: un mínimo local de la recompensa."
            ),
            env_kwargs={"n_obstacles": (0, 3), "u_trap": True},
        ),
    ]
}


def get_problem(problem_id: str) -> Problem:
    try:
        return PROBLEMS[problem_id]
    except KeyError:
        raise ValueError(f"Problema desconocido: {problem_id!r}. Disponibles: {', '.join(PROBLEMS)}") from None


def make_env(problem_id: str = DEFAULT_PROBLEM, **overrides) -> BoatEnv:
    """Factory: el entorno de un problema, con parámetros sobrescribibles (p. ej. render_mode)."""
    return BoatEnv(**{**get_problem(problem_id).env_kwargs, **overrides})


def run_env_kwargs(config: dict) -> dict:
    """Parámetros del entorno con los que se entrenó un run (a partir de su config.json).

    Los runs anteriores al catálogo de problemas solo guardaban "obstacles" ('6' o '4-10').
    """
    if "env_kwargs" in config:
        kwargs = dict(config["env_kwargs"])
        if isinstance(kwargs.get("n_obstacles"), list):  # JSON no tiene tuplas
            kwargs["n_obstacles"] = tuple(kwargs["n_obstacles"])
        return kwargs
    raw = str(config.get("obstacles", "4-10"))
    lo, _, hi = raw.partition("-")
    return {"n_obstacles": (int(lo), int(hi)) if hi else int(lo)}


def sensor_kwargs(env_kwargs: dict) -> dict:
    """Solo los parámetros de sensores activos de un run (p. ej. {"observe_current": True})."""
    return {key: env_kwargs[key] for key in SENSOR_KEYS if env_kwargs.get(key)}


def sensor_names(sensors: dict) -> list[str]:
    """{"observe_current": True} -> ["current"] (identificadores estables para la API)."""
    return [SENSOR_NAMES[key] for key in SENSOR_KEYS if sensors.get(key)]
