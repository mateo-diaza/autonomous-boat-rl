"""Tests del backend con un directorio models/ temporal (no dependen de modelos entrenados)."""

import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from stable_baselines3 import PPO
from starlette.websockets import WebSocketDisconnect

from server.config import get_models_dir
from server.main import app
from server.models_cache import load_model
from server.schemas import (
    AddObstacleCmd,
    MoveObstacleCmd,
    PlayCmd,
    RemoveObstacleCmd,
    RestartCmd,
    SetAutoResetCmd,
    SetGoalCmd,
    StepCmd,
)
from server.simulation import SimulationSession
from src.boat_env import BoatEnv

RUN = "ppo_test"


@pytest.fixture(scope="module")
def models_dir(tmp_path_factory):
    """Run mínimo con la misma estructura que genera scripts/train.py."""
    root = tmp_path_factory.mktemp("models")
    run = root / RUN
    (run / "checkpoints").mkdir(parents=True)
    (run / "eval").mkdir()
    (run / "config.json").write_text(json.dumps({"algo": "ppo", "obstacles": "4-10", "steps": 1000, "seed": 0}))
    model = PPO("MlpPolicy", BoatEnv(), n_steps=64, batch_size=64, seed=0)
    for steps in (0, 500):
        model.save(run / "checkpoints" / f"ppo_{steps}_steps")
    model.save(run / "final")
    np.savez(run / "eval" / "evaluations.npz", timesteps=np.array([500, 1000]),
             results=np.array([[1.0, 3.0], [5.0, 7.0]]), successes=np.array([[0, 0], [1, 0]]))
    (root / "sin_config").mkdir()  # carpeta ajena: debe ignorarse
    return root


@pytest.fixture
def client(models_dir):
    app.dependency_overrides[get_models_dir] = lambda: models_dir
    yield TestClient(app)
    app.dependency_overrides.clear()


# --------------------------------------------------------------------------- REST
def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_list_runs(client):
    runs = client.get("/api/runs").json()
    assert [r["id"] for r in runs] == [RUN]
    assert runs[0]["n_checkpoints"] == 3 and runs[0]["best_success_rate"] == 0.5


def test_run_detail(client):
    run = client.get(f"/api/runs/{RUN}").json()
    assert [c["id"] for c in run["checkpoints"]] == ["0", "500", "final"]
    assert run["checkpoints"][0]["label"] == "Sin entrenar"
    assert run["curve"] == [
        {"steps": 500, "mean_reward": 2.0, "success_rate": 0.0},
        {"steps": 1000, "mean_reward": 6.0, "success_rate": 0.5},
    ]


@pytest.mark.parametrize("run_id", ["no_existe", "sin_config", "..", "..%2F..%2Fetc"])
def test_unknown_or_malicious_run_is_404(client, run_id):
    assert client.get(f"/api/runs/{run_id}").status_code == 404


# --------------------------------------------------------------------- Sesión
def test_session_restart_keeps_edited_scenario():
    s = SimulationSession(seed=1)
    s.apply(AddObstacleCmd(type="add_obstacle", x=10, y=10, radius=4))
    s.apply(SetGoalCmd(type="set_goal", x=90, y=90))
    before = s.state_msg().sim
    s.apply(StepCmd(type="step"))
    s.apply(RestartCmd(type="restart"))
    after = s.state_msg().sim
    assert after.step == 0
    assert after.obstacles == before.obstacles and after.goal == before.goal and after.boat == before.boat


def test_session_edit_obstacles_and_invalid_index():
    s = SimulationSession(seed=1)
    n = len(s.state_msg().sim.obstacles)
    s.apply(AddObstacleCmd(type="add_obstacle", x=10, y=10))
    s.apply(MoveObstacleCmd(type="move_obstacle", index=n, x=20, y=30))
    assert (s.state_msg().sim.obstacles[n].x, s.state_msg().sim.obstacles[n].y) == (20, 30)
    s.apply(RemoveObstacleCmd(type="remove_obstacle", index=n))
    assert len(s.state_msg().sim.obstacles) == n
    with pytest.raises(ValueError):
        s.apply(RemoveObstacleCmd(type="remove_obstacle", index=99))


def test_session_tick_advances_by_speed_and_reports_episode_end(models_dir):
    s = SimulationSession(seed=3)
    s.apply(SetAutoResetCmd(type="set_auto_reset", auto_reset=False))
    s.apply(PlayCmd(type="play"))
    s.tick(0.0)
    msgs = s.tick(0.1)  # 0.1 s a 30 pasos/s -> 3 pasos
    assert msgs[0].type == "state" and msgs[0].sim.step == 3
    assert msgs[0].sim.action == 1 and msgs[0].sim.action_probs is None  # sin modelo: recto

    t, end = 0.1, None
    while end is None and t < 100:
        t += 0.1
        end = next((m for m in s.tick(t) if m.type == "episode_end"), None)
    assert end is not None and end.event in {"goal", "crash", "timeout"}
    assert s.playing is False  # sin auto_reset se queda en pausa al terminar


def test_session_with_model_reports_probabilities(models_dir):
    from server.schemas import ModelRef

    s = SimulationSession(seed=0)
    model = load_model(models_dir / RUN / "final.zip", "ppo")
    s.set_model(model, ModelRef(run_id=RUN, checkpoint_id="final", algo="ppo"))
    probs = s.state_msg().sim.action_probs
    assert probs is not None and len(probs) == 3 and abs(sum(probs) - 1) < 1e-3


# ------------------------------------------------------------------- WebSocket
def test_ws_hello_state_and_commands(client):
    with client.websocket_connect("/ws/sim") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello" and hello["world"]["size"] == 100
        state = ws.receive_json()
        assert state["type"] == "state" and state["status"]["model"] is None

        ws.send_json({"type": "load_model", "run_id": RUN, "checkpoint_id": "500"})
        state = ws.receive_json()
        assert state["status"]["model"]["checkpoint_id"] == "500"
        assert len(state["sim"]["action_probs"]) == 3

        ws.send_json({"type": "step"})
        assert ws.receive_json()["sim"]["step"] == 1


@pytest.mark.parametrize("payload, fragment", [
    ({"type": "volar"}, "Comando no válido"),
    ({"type": "set_speed", "speed": 9999}, "speed"),
    ({"type": "load_model", "run_id": "no_existe", "checkpoint_id": "final"}, "Run no encontrado"),
    ({"type": "load_model", "run_id": RUN, "checkpoint_id": "123"}, "Checkpoint no encontrado"),
    ({"type": "remove_obstacle", "index": 99}, "No existe el obstáculo"),
])
def test_ws_invalid_commands_return_error_without_closing(client, payload, fragment):
    with client.websocket_connect("/ws/sim") as ws:
        ws.receive_json(), ws.receive_json()  # hello + state
        ws.send_json(payload)
        err = ws.receive_json()
        assert err["type"] == "error" and fragment in err["message"]
        ws.send_json({"type": "step"})  # la conexión sigue viva
        assert ws.receive_json()["type"] == "state"


def test_ws_rejects_foreign_origin(client):
    with pytest.raises(WebSocketDisconnect), client.websocket_connect(
        "/ws/sim", headers={"origin": "http://evil.example"}
    ) as ws:
        ws.receive_json()
