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
SENSOR_KEYS = ("observe_current", "observe_route", "frame_stack")
SENSOR_NAMES = {"observe_current": "current", "observe_route": "route", "frame_stack": "memory"}
#: Cómo se nombra cada sensor: sufijo del nombre corto del modelo y texto de su descripción
SENSOR_DISPLAY = {
    "observe_current": (" + sensor", "sensor de corriente"),
    "observe_route": (" + GPS", "sensor de ruta"),
    "frame_stack": (" + memoria", "memoria de varios instantes"),
}


@dataclass(frozen=True)
class Problem:
    id: str
    title: str
    #: Qué cambia y qué dificultad de RL ilustra, en lenguaje llano. Se muestra en la barra de la web:
    #: máximo ~130 caracteres (2 líneas), o la columna derecha deja de caber a 1920x1080
    description: str
    env_kwargs: dict = field(default_factory=dict)
    #: Nombre corto de un MODELO entrenado en este problema ("Corrientes") y nota de cómo se entrenó
    model_name: str = ""
    training_note: str = ""
    #: Nota si el modelo se entrenó SIN sensores en un problema donde importan ("sin sensor")
    no_sensor_note: str = ""
    #: Si es una VARIANTE DE ENTRENAMIENTO de otro mar (misma física, otra recompensa): id de ese mar.
    #: No aparece en "Condiciones del mar": para navegar un modelo ya entrenado es el mismo mar.
    sea: str | None = None


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
            model_name="Mar en calma",
            training_note="sin dificultades extra",
        ),
        Problem(
            id="sparse",
            title="Recompensa escasa",
            description=(
                "Solo +100 al llegar y −100 al chocar, sin pistas intermedias. Problema de exploración: "
                "aprende de las veces que acierta por casualidad, tarde y a trompicones."
            ),
            env_kwargs={**_BASE_ENV, "reward_mode": "sparse"},
            model_name="Sin pistas",
            training_note="recompensa escasa",
            sea="base",
        ),
        Problem(
            id="current",
            title="Corrientes",
            description=(
                "Corriente aleatoria de 4–6,5 u/s (casi media velocidad del barco). Sin sensor no la ve "
                "y debe deducirla de la deriva: observabilidad parcial."
            ),
            env_kwargs={**_BASE_ENV, "current_speed": (4.0, 6.5)},
            model_name="Corrientes",
            training_note="corriente aleatoria",
            no_sensor_note="sin sensor",
        ),
        Problem(
            id="u_trap",
            title="Trampa en U",
            description=(
                "Un arrecife en U abierto hacia el barco tapa el camino recto. Ir directo a la boya lleva a un "
                "callejón: un mínimo local de la recompensa."
            ),
            env_kwargs={"n_obstacles": (0, 3), "u_trap": True},
            model_name="Trampa en U",
            training_note="recompensa normal",
        ),
        Problem(
            id="u_trap_path",
            title="Trampa en U · recompensa por ruta",
            description=(
                "El mismo arrecife, pero la recompensa premia acercarse por el camino navegable más corto: "
                "rodear la U ya no se castiga."
            ),
            env_kwargs={"n_obstacles": (0, 3), "u_trap": True, "reward_mode": "path"},
            model_name="Trampa en U",
            training_note="recompensa por ruta",
            sea="u_trap",
        ),
        Problem(
            id="moving",
            title="Rocas a la deriva",
            description=(
                "Las rocas se mueven y rebotan en los bordes. Con una sola «foto» de los rayos no se sabe hacia "
                "dónde van: hace falta memoria."
            ),
            env_kwargs={"n_obstacles": (5, 9), "obstacle_speed": (5.0, 8.0)},
            model_name="Rocas a la deriva",
            training_note="rocas en movimiento",
            no_sensor_note="sin memoria",
        ),
    ]
}


def get_problem(problem_id: str) -> Problem:
    try:
        return PROBLEMS[problem_id]
    except KeyError:
        raise ValueError(f"Problema desconocido: {problem_id!r}. Disponibles: {', '.join(PROBLEMS)}") from None


def get_sea(problem_id: str) -> Problem:
    """El mar (física) de un problema: las variantes de entrenamiento devuelven su mar base."""
    problem = get_problem(problem_id)
    return get_problem(problem.sea) if problem.sea else problem


def seas() -> list[Problem]:
    """Mares distintos (lo que se elige en "Condiciones del mar"), sin variantes de entrenamiento."""
    return [p for p in PROBLEMS.values() if p.sea is None]


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
    """Solo los parámetros de sensores activos de un run (p. ej. {"observe_current": True, "frame_stack": 4})."""
    return {key: env_kwargs[key] for key in SENSOR_KEYS if _sensor_active(key, env_kwargs.get(key))}


def _sensor_active(key: str, value) -> bool:
    return bool(value) and not (key == "frame_stack" and int(value) <= 1)


def sensor_names(sensors: dict) -> list[str]:
    """{"observe_current": True} -> ["current"] (identificadores estables para la API)."""
    return [SENSOR_NAMES[key] for key in SENSOR_KEYS if sensors.get(key)]


def model_display_name(config: dict) -> tuple[str, str]:
    """Nombre corto y descripción de un run para la web, a partir de su config.json.

    ("Trampa en U + GPS", "recompensa por ruta · sensor de ruta"). Un "label" en el config tiene prioridad.
    """
    problem = PROBLEMS.get(config.get("problem", DEFAULT_PROBLEM), PROBLEMS[DEFAULT_PROBLEM])
    sensors = sensor_kwargs(run_env_kwargs(config))
    name = problem.model_name + "".join(SENSOR_DISPLAY[key][0] for key in SENSOR_KEYS if sensors.get(key))
    details = [problem.training_note] + [SENSOR_DISPLAY[key][1] for key in SENSOR_KEYS if sensors.get(key)]
    if not sensors and problem.no_sensor_note:
        details.append(problem.no_sensor_note)
    return config.get("label") or name, " · ".join(details)
