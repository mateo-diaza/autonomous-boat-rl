"""Catálogo de problemas: variantes de dificultad del entorno, cada una con la lección de RL que ilustra.

Un problema = parámetros de BoatEnv + textos para la web. Añadir una dificultad = añadir una entrada aquí
(y, si hace falta, el parámetro correspondiente en BoatEnv con un valor por defecto que no cambie el base).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from training.boat_env import BoatEnv

DEFAULT_PROBLEM = "base"


@dataclass(frozen=True)
class Problem:
    id: str
    title: str
    #: Qué cambia y qué dificultad de RL ilustra, en lenguaje llano (se muestra en la web)
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
                "Mismo mar, pero el agente solo recibe +100 al llegar y −100 al chocar: ninguna pista intermedia. "
                "Ilustra el problema de la exploración: solo aprende de las veces que llega por casualidad, "
                "así que tarda más y avanza a trompicones."
            ),
            env_kwargs={**_BASE_ENV, "reward_mode": "sparse"},
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
