"""Comparativa: dos barcos (lanes A y B) navegan exactamente el mismo escenario, cada uno con su modelo.

Las simulaciones son independientes (los barcos no se ven ni chocan entre sí). Una "regata" termina
cuando ambos han terminado; entonces se apunta el resultado en el marcador.
"""

from __future__ import annotations

import numpy as np
from stable_baselines3.common.base_class import BaseAlgorithm

from server.config import DEFAULT_OBSTACLES
from server.lane import Lane
from server.playback import Playback
from server.schemas import (
    LANE_IDS,
    CompareCommand,
    CompareStateMsg,
    CompareStatus,
    CompareUnloadModelCmd,
    EpisodeEndMsg,
    LaneId,
    LaneResult,
    LaneScore,
    LaneState,
    ModelRef,
    NewScenarioCmd,
    PauseCmd,
    PlayCmd,
    RaceEndMsg,
    ResetScoresCmd,
    RestartCmd,
    SetAutoResetCmd,
    SetLaneDeterministicCmd,
    SetSpeedCmd,
    StepCmd,
)


class ScoreKeeper:
    """Acumula resultados de travesías de un barco."""

    def __init__(self) -> None:
        self.events: dict[str, int] = {"goal": 0, "crash": 0, "timeout": 0}
        self._goal_steps: list[int] = []
        self._returns: list[float] = []

    def add(self, end: EpisodeEndMsg) -> None:
        self.events[end.event] += 1
        self._returns.append(end.episode_return)
        if end.event == "goal":
            self._goal_steps.append(end.steps)

    def summary(self) -> LaneScore:
        return LaneScore(
            episodes=len(self._returns),
            goals=self.events["goal"],
            crashes=self.events["crash"],
            timeouts=self.events["timeout"],
            mean_steps_to_goal=round(float(np.mean(self._goal_steps)), 1) if self._goal_steps else None,
            mean_return=round(float(np.mean(self._returns)), 1) if self._returns else None,
        )


def reset_same_scenario(lanes: list[Lane], seed: int, options: dict | None = None) -> None:
    """La primera lane genera el escenario y las demás lo copian exactamente."""
    lanes[0].reset(seed, options)
    shared = lanes[0].scenario()
    for lane in lanes[1:]:
        lane.reset(seed, shared)


def run_tournament(
    models: list[tuple[BaseAlgorithm | None, bool]],
    n_obstacles: int | tuple[int, int],
    episodes: int,
    seed: int,
) -> list[LaneScore]:
    """Simula `episodes` escenarios sin animación (síncrono: llamar con asyncio.to_thread).

    Usa sus propias lanes: no toca la regata en vivo. `models` = [(modelo o None, determinista)] por lane.
    """
    lanes = [Lane(n_obstacles) for _ in models]
    for lane, (model, deterministic) in zip(lanes, models, strict=True):
        if model is not None:
            lane.set_model(model)
        lane.deterministic = deterministic
    keepers = [ScoreKeeper() for _ in lanes]
    for i in range(episodes):
        reset_same_scenario(lanes, seed + i)
        for lane, keeper in zip(lanes, keepers, strict=True):
            end = None
            while end is None:
                end = lane.step()
            keeper.add(end)
    return [k.summary() for k in keepers]


class ComparisonSession:
    def __init__(self, n_obstacles: int | tuple[int, int] = DEFAULT_OBSTACLES, seed: int | None = None):
        self.lanes: dict[LaneId, Lane] = {lane_id: Lane(n_obstacles) for lane_id in LANE_IDS}
        self.playback = Playback()
        self.scores = {lane_id: ScoreKeeper() for lane_id in LANE_IDS}
        self.tournament_running = False
        self._rng = np.random.default_rng(seed)
        self._race_counted = False   # la regata actual ya se apuntó (o se reinició a medias)
        self._dirty = True
        self.new_scenario()

    # ----------------------------------------------------------------- Escenario
    def new_scenario(self, seed: int | None = None, n_obstacles: int | None = None) -> None:
        if n_obstacles is not None:
            for lane in self.lanes.values():
                lane.env.n_obstacles = n_obstacles
        self.scenario_seed = int(self._rng.integers(2**31 - 1)) if seed is None else seed
        reset_same_scenario(list(self.lanes.values()), self.scenario_seed)
        self._after_reset()

    def restart(self) -> None:
        first = self.lanes[LANE_IDS[0]]
        reset_same_scenario(list(self.lanes.values()), self.scenario_seed, first.scenario())
        self._after_reset()

    def _after_reset(self) -> None:
        self.playback.clear()
        self._race_counted = False
        self._dirty = True

    @property
    def n_obstacles(self) -> int | tuple[int, int]:
        return self.lanes[LANE_IDS[0]].env.n_obstacles

    # -------------------------------------------------------------------- Modelo
    def set_model(self, lane_id: LaneId, model: BaseAlgorithm, ref: ModelRef) -> None:
        self.lanes[lane_id].set_model(model, ref)
        self._dirty = True

    def tournament_models(self) -> list[tuple[BaseAlgorithm | None, bool]]:
        return [(lane.model, lane.deterministic) for lane in self.lanes.values()]

    def tournament_refs(self) -> list[ModelRef | None]:
        return [lane.model_ref for lane in self.lanes.values()]

    # ------------------------------------------------------------------ Comandos
    def apply(self, cmd: CompareCommand) -> None:
        """Comandos síncronos (load_model y run_tournament los gestiona la ruta)."""
        match cmd:
            case PlayCmd():
                if self._race_over():
                    self.restart()
                self.playback.play()
            case PauseCmd():
                self.playback.playing = False
            case StepCmd():
                self.playback.playing = False
                if self._race_over():
                    self.restart()
                self._step_all()
            case SetSpeedCmd(speed=speed):
                self.playback.speed = speed
            case SetAutoResetCmd(auto_reset=auto_reset):
                self.playback.auto_reset = auto_reset
            case SetLaneDeterministicCmd(lane=lane_id, deterministic=deterministic):
                self.lanes[lane_id].deterministic = deterministic
            case CompareUnloadModelCmd(lane=lane_id):
                self.lanes[lane_id].unload_model()
            case NewScenarioCmd(seed=seed, n_obstacles=n_obstacles):
                self.new_scenario(seed, n_obstacles)
            case RestartCmd():
                self.restart()
            case ResetScoresCmd():
                self.scores = {lane_id: ScoreKeeper() for lane_id in LANE_IDS}
            case _:
                raise ValueError(f"Comando no soportado por la comparativa: {cmd.type}")
        self._dirty = True

    def mark_dirty(self) -> None:
        self._dirty = True

    # -------------------------------------------------------------- Bucle (tick)
    def tick(self, now: float) -> list[CompareStateMsg | RaceEndMsg]:
        if self.playback.should_resume(now):
            self.new_scenario()
        race_end: RaceEndMsg | None = None
        for _ in range(self.playback.advance(now)):
            race_end = self._step_all()
            if race_end:
                self.playback.episode_ended(now)
                break

        messages: list[CompareStateMsg | RaceEndMsg] = []
        if self._dirty:
            messages.append(self.state_msg())
            self._dirty = False
        if race_end:
            messages.append(race_end)
        return messages

    def state_msg(self) -> CompareStateMsg:
        return CompareStateMsg(
            lanes=[
                LaneState(id=lane_id, model=lane.model_ref, deterministic=lane.deterministic, sim=lane.sim_state())
                for lane_id, lane in self.lanes.items()
            ],
            status=CompareStatus(
                playing=self.playback.playing,
                speed=self.playback.speed,
                auto_reset=self.playback.auto_reset,
                scenario_seed=self.scenario_seed,
                tournament_running=self.tournament_running,
            ),
            scores=[keeper.summary() for keeper in self.scores.values()],
        )

    # ------------------------------------------------------------------ Internas
    def _step_all(self) -> RaceEndMsg | None:
        """Avanza las lanes que siguen navegando; si con esto terminan todas, cierra la regata."""
        for lane in self.lanes.values():
            if not lane.done:
                lane.step()
        self._dirty = True
        if not self._race_over() or self._race_counted:
            return None
        self._race_counted = True
        results = []
        for lane_id, lane in self.lanes.items():
            end = EpisodeEndMsg(event=lane.env.last_event, steps=lane.env.steps,
                                episode_return=round(lane.env.episode_return, 2))
            self.scores[lane_id].add(end)
            results.append(LaneResult(id=lane_id, event=end.event, steps=end.steps,
                                      episode_return=end.episode_return))
        return RaceEndMsg(results=results)

    def _race_over(self) -> bool:
        return all(lane.done for lane in self.lanes.values())
