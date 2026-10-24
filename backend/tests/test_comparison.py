"""Tests de la comparativa (sesión + WebSocket), con el models/ temporal de test_server."""

import pytest

from backend.comparison import ComparisonSession, run_tournament
from backend.models_cache import load_model
from backend.schemas import ModelRef, PlayCmd, ResetScoresCmd, RestartCmd, SetAutoResetCmd, StepCmd
from backend.tests.conftest import RUN


def lanes(session: ComparisonSession):
    return [lane.sim_state() for lane in session.lanes.values()]


def test_both_lanes_share_the_exact_scenario():
    s = ComparisonSession(seed=3)
    a, b = lanes(s)
    assert a.obstacles == b.obstacles and a.goal == b.goal and a.boat == b.boat
    s.apply(StepCmd(type="step"))
    s.apply(RestartCmd(type="restart"))
    a2, b2 = lanes(s)
    assert a2.step == b2.step == 0 and a2.obstacles == a.obstacles and a2.boat == a.boat


def test_race_ends_when_both_lanes_finish_and_counts_once(models_dir):
    s = ComparisonSession(seed=5)
    model = load_model(models_dir / RUN / "final.zip", "ppo")
    s.set_model("A", model, ModelRef(run_id=RUN, checkpoint_id="final", algo="ppo"))  # B sin modelo: recto
    s.apply(SetAutoResetCmd(type="set_auto_reset", auto_reset=False))
    s.apply(PlayCmd(type="play"))
    t, race_end = 0.0, None
    while race_end is None and t < 200:
        t += 0.25
        race_end = next((m for m in s.tick(t) if m.type == "race_end"), None)
    assert race_end is not None and [r.id for r in race_end.results] == ["A", "B"]
    assert all(lane.done for lane in s.lanes.values())
    scores = s.state_msg().scores
    assert scores[0].episodes == scores[1].episodes == 1
    s.tick(t + 1)  # un tick extra no vuelve a contar la regata
    assert s.state_msg().scores[0].episodes == 1
    s.apply(ResetScoresCmd(type="reset_scores"))
    assert s.state_msg().scores[0].episodes == 0


def test_tournament_is_reproducible(models_dir):
    model = load_model(models_dir / RUN / "final.zip", "ppo")
    env_kwargs = {"n_obstacles": (4, 10)}
    first = run_tournament([(model, True), (None, True)], env_kwargs, episodes=3, seed=42)
    again = run_tournament([(model, True), (None, True)], env_kwargs, episodes=3, seed=42)
    assert first == again and first[0].episodes == first[1].episodes == 3


def test_ws_compare_load_per_lane_and_tournament(client):
    with client.websocket_connect("/ws/compare") as ws:
        assert ws.receive_json()["type"] == "hello"
        state = ws.receive_json()
        assert state["type"] == "compare_state" and [lane["id"] for lane in state["lanes"]] == ["A", "B"]

        ws.send_json({"type": "load_model", "lane": "B", "run_id": RUN, "checkpoint_id": "500"})
        state = ws.receive_json()
        assert state["lanes"][0]["model"] is None and state["lanes"][1]["model"]["checkpoint_id"] == "500"

        ws.send_json({"type": "run_tournament", "episodes": 2})
        msg = ws.receive_json()
        while msg["type"] != "tournament":
            msg = ws.receive_json()
        result = msg["result"]
        assert result["episodes"] == 2 and len(result["scores"]) == 2
        assert result["models"][1]["checkpoint_id"] == "500"


@pytest.mark.parametrize("payload, fragment", [
    ({"type": "load_model", "lane": "C", "run_id": RUN, "checkpoint_id": "final"}, "lane"),
    ({"type": "run_tournament", "episodes": 0}, "episodes"),
    ({"type": "add_obstacle", "x": 1, "y": 1}, "Comando no válido"),
])
def test_ws_compare_rejects_invalid_commands(client, payload, fragment):
    with client.websocket_connect("/ws/compare") as ws:
        ws.receive_json(), ws.receive_json()
        ws.send_json(payload)
        err = ws.receive_json()
        assert err["type"] == "error" and fragment in err["message"]
