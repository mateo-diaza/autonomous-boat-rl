"""Contrato con el frontend (REST + WebSocket).

Cualquier cambio aquí debe reflejarse en el mismo commit en frontend/src/lib/types.ts.
Los nombres de campo se mantienen en snake_case en ambos lados.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter

from backend.config import SPEED_LIMITS
from training.boat_env import EDIT_RADIUS_LIMITS, WORLD_SIZE

Coord = Annotated[float, Field(ge=0, le=WORLD_SIZE)]
Radius = Annotated[float, Field(ge=EDIT_RADIUS_LIMITS[0], le=EDIT_RADIUS_LIMITS[1])]
RunId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]+$", max_length=100)]
ProblemId = Annotated[str, Field(pattern=r"^[a-z_]+$", max_length=40)]
CheckpointId = Annotated[str, Field(pattern=r"^(\d+|final|best)$")]
Event = Literal["goal", "crash", "timeout"]
SensorId = Literal["current", "route", "memory"]


# ------------------------------------------------------------------------- REST
class CheckpointInfo(BaseModel):
    id: CheckpointId
    label: str
    steps: int | None  # None para "final" y "best"


class CurvePoint(BaseModel):
    steps: int
    mean_reward: float
    success_rate: float | None


class ProblemInfo(BaseModel):
    id: ProblemId
    title: str
    description: str


class RunSummary(BaseModel):
    id: RunId
    algo: Literal["dqn", "ppo"]
    problem: ProblemId          # en qué problema se entrenó
    sensors: list[SensorId]     # sensores extra con los que se entrenó
    label: str                  # nombre corto para la web ("Corrientes + sensor")
    subtitle: str               # cómo se entrenó, en una línea ("corriente aleatoria · sensor de corriente")
    obstacles: str
    total_steps: int
    n_checkpoints: int
    best_success_rate: float | None


class RunDetail(RunSummary):
    checkpoints: list[CheckpointInfo]
    curve: list[CurvePoint]


# ------------------------------------------------------------- Estado del mundo
class WorldInfo(BaseModel):
    size: float
    ray_range: float
    n_rays: int
    dt: float
    max_steps: int
    obstacle_radius_limits: tuple[float, float]
    speed_limits: tuple[float, float]
    sim_hz: int


class Boat(BaseModel):
    x: float
    y: float
    heading: float
    omega: float
    speed: float
    radius: float


class Circle(BaseModel):
    x: float
    y: float
    radius: float


class Vector(BaseModel):
    x: float
    y: float


class Obstacle(Circle):
    vx: float = 0.0              # velocidad (u/s); 0 = roca quieta
    vy: float = 0.0


class Ray(BaseModel):
    angle: float
    distance: float


class ModelRef(BaseModel):
    run_id: RunId
    checkpoint_id: CheckpointId
    algo: Literal["dqn", "ppo"]
    sensors: list[SensorId] = []   # sensores extra con los que se entrenó (p. ej. "current")
    label: str = ""                # nombre corto para la web ("Trampa en U + GPS")


class SimState(BaseModel):
    step: int
    episode_return: float
    event: Event | None
    boat: Boat
    goal: Circle
    obstacles: list[Obstacle]
    current: Vector                    # corriente del episodio (u/s); (0, 0) si no hay
    rays: list[Ray]
    action: int | None                 # 0 izq / 1 recto / 2 der; None si aún no ha actuado
    action_probs: list[float] | None   # PPO: probabilidades; DQN: softmax de los Q-values


class SessionStatus(BaseModel):
    problem: ProblemId
    playing: bool
    speed: float
    deterministic: bool
    auto_reset: bool
    scenario_seed: int
    model: ModelRef | None


# ------------------------------------------------------- Mensajes servidor -> cliente
class HelloMsg(BaseModel):
    type: Literal["hello"] = "hello"
    world: WorldInfo


class StateMsg(BaseModel):
    type: Literal["state"] = "state"
    sim: SimState
    status: SessionStatus


class EpisodeEndMsg(BaseModel):
    type: Literal["episode_end"] = "episode_end"
    event: Event
    steps: int
    episode_return: float


class ErrorMsg(BaseModel):
    type: Literal["error"] = "error"
    message: str


ServerMessage = HelloMsg | StateMsg | EpisodeEndMsg | ErrorMsg


# ------------------------------------------------------- Comandos cliente -> servidor
class LoadModelCmd(BaseModel):
    type: Literal["load_model"]
    run_id: RunId
    checkpoint_id: CheckpointId


class UnloadModelCmd(BaseModel):
    type: Literal["unload_model"]


class PlayCmd(BaseModel):
    type: Literal["play"]


class PauseCmd(BaseModel):
    type: Literal["pause"]


class StepCmd(BaseModel):
    type: Literal["step"]


class SetSpeedCmd(BaseModel):
    type: Literal["set_speed"]
    speed: Annotated[float, Field(ge=SPEED_LIMITS[0], le=SPEED_LIMITS[1])]


class SetDeterministicCmd(BaseModel):
    type: Literal["set_deterministic"]
    deterministic: bool


class SetAutoResetCmd(BaseModel):
    type: Literal["set_auto_reset"]
    auto_reset: bool


class NewScenarioCmd(BaseModel):
    type: Literal["new_scenario"]
    seed: Annotated[int, Field(ge=0, le=2**31 - 1)] | None = None
    n_obstacles: Annotated[int, Field(ge=0, le=30)] | None = None


class RestartCmd(BaseModel):
    """Repite el escenario actual (con las ediciones) desde la salida."""

    type: Literal["restart"]


class AddObstacleCmd(BaseModel):
    type: Literal["add_obstacle"]
    x: Coord
    y: Coord
    radius: Radius = 5.0


class RemoveObstacleCmd(BaseModel):
    type: Literal["remove_obstacle"]
    index: Annotated[int, Field(ge=0)]


class MoveObstacleCmd(BaseModel):
    type: Literal["move_obstacle"]
    index: Annotated[int, Field(ge=0)]
    x: Coord
    y: Coord


class SetProblemCmd(BaseModel):
    """Cambia las condiciones del mar (el problema) y empieza un escenario nuevo; el modelo se conserva."""

    type: Literal["set_problem"]
    problem: ProblemId


class SetGoalCmd(BaseModel):
    type: Literal["set_goal"]
    x: Coord
    y: Coord


ClientCommand = Annotated[
    LoadModelCmd | UnloadModelCmd | PlayCmd | PauseCmd | StepCmd | SetSpeedCmd | SetDeterministicCmd
    | SetAutoResetCmd | NewScenarioCmd | RestartCmd | AddObstacleCmd | RemoveObstacleCmd | MoveObstacleCmd
    | SetGoalCmd | SetProblemCmd,
    Field(discriminator="type"),
]
command_adapter: TypeAdapter[ClientCommand] = TypeAdapter(ClientCommand)


# =============================================================== Comparativa
LaneId = Literal["A", "B"]
LANE_IDS: tuple[LaneId, LaneId] = ("A", "B")


class LaneScore(BaseModel):
    """Resultados acumulados de un barco en la comparativa (o en un torneo)."""

    episodes: int
    goals: int
    crashes: int
    timeouts: int
    mean_steps_to_goal: float | None   # solo travesías con arribada
    mean_return: float | None


class LaneState(BaseModel):
    id: LaneId
    model: ModelRef | None
    deterministic: bool
    sim: SimState


class TournamentResult(BaseModel):
    problem: ProblemId
    episodes: int
    seed: int
    scores: list[LaneScore]            # en el orden de LANE_IDS
    models: list[ModelRef | None]


class CompareStatus(BaseModel):
    problem: ProblemId
    playing: bool
    speed: float
    auto_reset: bool
    scenario_seed: int
    tournament_running: bool


class CompareStateMsg(BaseModel):
    type: Literal["compare_state"] = "compare_state"
    lanes: list[LaneState]
    status: CompareStatus
    scores: list[LaneScore]


class LaneResult(BaseModel):
    id: LaneId
    event: Event
    steps: int
    episode_return: float


class RaceEndMsg(BaseModel):
    """Ambos barcos han terminado la travesía (cada uno puede haber acabado en un paso distinto)."""

    type: Literal["race_end"] = "race_end"
    results: list[LaneResult]


class TournamentMsg(BaseModel):
    type: Literal["tournament"] = "tournament"
    result: TournamentResult


class CompareLoadModelCmd(BaseModel):
    type: Literal["load_model"]
    lane: LaneId
    run_id: RunId
    checkpoint_id: CheckpointId


class CompareUnloadModelCmd(BaseModel):
    type: Literal["unload_model"]
    lane: LaneId


class SetLaneDeterministicCmd(BaseModel):
    type: Literal["set_deterministic"]
    lane: LaneId
    deterministic: bool


class ResetScoresCmd(BaseModel):
    type: Literal["reset_scores"]


class RunTournamentCmd(BaseModel):
    type: Literal["run_tournament"]
    episodes: Annotated[int, Field(ge=1, le=200)] = 50


CompareCommand = Annotated[
    CompareLoadModelCmd | CompareUnloadModelCmd | SetLaneDeterministicCmd | PlayCmd | PauseCmd | StepCmd
    | SetSpeedCmd | SetAutoResetCmd | NewScenarioCmd | RestartCmd | ResetScoresCmd | RunTournamentCmd
    | SetProblemCmd,
    Field(discriminator="type"),
]
compare_command_adapter: TypeAdapter[CompareCommand] = TypeAdapter(CompareCommand)
