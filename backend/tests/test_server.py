"""Tests del backend con un directorio models/ temporal (no dependen de modelos entrenados)."""

import pytest
from starlette.websockets import WebSocketDisconnect

from backend.models_cache import load_model
from backend.schemas import (
    AddObstacleCmd,
    ModelRef,
    MoveObstacleCmd,
    PlayCmd,
    RemoveObstacleCmd,
    RestartCmd,
    SetAutoResetCmd,
    SetGoalCmd,
    SetProblemCmd,
    StepCmd,
)
from backend.simulation import SimulationSession
from backend.tests.conftest import RUN, SENSOR_RUN


# --------------------------------------------------------------------------- REST
def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_list_runs(client):
    runs = {r["id"]: r for r in client.get("/api/runs").json()}
    assert set(runs) == {RUN, SENSOR_RUN}  # "sin_config" se ignora
    assert runs[RUN]["n_checkpoints"] == 3 and runs[RUN]["best_success_rate"] == 0.5


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
    from backend.schemas import ModelRef

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


# ------------------------------------------------------------------ Problemas
def test_problems_catalog(client):
    problems = client.get("/api/problems").json()
    assert problems[0]["id"] == "base" and {"id", "title", "description"} <= problems[0].keys()


def test_runs_report_their_problem_with_fallback_for_old_configs(client):
    runs = {r["id"]: r for r in client.get("/api/runs").json()}
    assert runs[RUN]["problem"] == "base" and runs[RUN]["sensors"] == []  # config sin "problem" -> base


def test_set_problem_keeps_model_and_changes_env(models_dir):
    s = SimulationSession(seed=0)
    model = load_model(models_dir / RUN / "final.zip", "ppo")
    s.set_model(model, ModelRef(run_id=RUN, checkpoint_id="final", algo="ppo"))
    s.apply(SetProblemCmd(type="set_problem", problem="sparse"))
    status = s.state_msg().status
    assert status.problem == "sparse" and status.model is not None
    assert s.lane.env.reward_mode == "sparse" and s.state_msg().sim.action_probs is not None


def test_ws_unknown_problem_returns_error(client):
    with client.websocket_connect("/ws/sim") as ws:
        ws.receive_json(), ws.receive_json()
        ws.send_json({"type": "set_problem", "problem": "huracan"})
        err = ws.receive_json()
        assert err["type"] == "error" and "Problema desconocido" in err["message"]


# ------------------------------------------------------------------- Sensores
def test_sensor_model_rebuilds_env_with_its_sensors_and_keeps_scenario(models_dir):
    s = SimulationSession(seed=4)
    s.apply(SetProblemCmd(type="set_problem", problem="current"))
    before = s.state_msg().sim
    model = load_model(models_dir / SENSOR_RUN / "final.zip", "ppo")
    s.set_model(model, ModelRef(run_id=SENSOR_RUN, checkpoint_id="final", algo="ppo", sensors=["current"]),
                {"observe_current": True})
    assert s.lane.env.observation_space.shape == (19,)
    after = s.state_msg().sim
    assert after.obstacles == before.obstacles and after.current == before.current and after.boat == before.boat
    s.unload_model()
    assert s.lane.env.observation_space.shape == (17,)


def test_model_with_wrong_sensors_is_rejected(models_dir):
    s = SimulationSession(seed=0)
    model = load_model(models_dir / SENSOR_RUN / "final.zip", "ppo")
    with pytest.raises(ValueError, match="observaciones"):
        s.set_model(model, ModelRef(run_id=SENSOR_RUN, checkpoint_id="final", algo="ppo"), sensors={})


def test_ws_loads_sensor_model_from_its_config(client):
    runs = {r["id"]: r for r in client.get("/api/runs").json()}
    assert runs[SENSOR_RUN]["sensors"] == ["current"] and runs[SENSOR_RUN]["problem"] == "current"
    with client.websocket_connect("/ws/sim") as ws:
        ws.receive_json(), ws.receive_json()
        ws.send_json({"type": "load_model", "run_id": SENSOR_RUN, "checkpoint_id": "final"})
        state = ws.receive_json()
        assert state["status"]["model"]["sensors"] == ["current"] and len(state["sim"]["action_probs"]) == 3


def test_switching_between_models_with_different_sensors(models_dir):
    """Regresión: al cambiar de sensores, el modelo anterior no debe evaluarse con la observación nueva."""
    plain = load_model(models_dir / RUN / "final.zip", "ppo")
    sensor = load_model(models_dir / SENSOR_RUN / "final.zip", "ppo")
    s = SimulationSession(seed=2)
    s.apply(SetProblemCmd(type="set_problem", problem="current"))
    for model, run, sensors in [(plain, RUN, {}), (sensor, SENSOR_RUN, {"observe_current": True}),
                                (plain, RUN, {}), (sensor, SENSOR_RUN, {"observe_current": True})]:
        s.set_model(model, ModelRef(run_id=run, checkpoint_id="final", algo="ppo"), sensors)
        s.apply(StepCmd(type="step"))
        assert len(s.state_msg().sim.action_probs) == 3


def test_unexpected_tick_error_pauses_and_warns_without_closing():
    import asyncio

    from backend.playback import Playback
    from backend.routes._ws import SIMULATION_ERROR, run_loop

    class FlakySession:
        def __init__(self):
            self.playback = Playback()
            self.playback.playing = True
            self.calls = 0

        def tick(self, now):
            self.calls += 1
            if self.calls == 2:
                raise RuntimeError("fallo inesperado")
            return []

    class FakeConnection:
        def __init__(self):
            self.sent = []

        async def send(self, msg):
            self.sent.append(msg)

    async def scenario():
        session, conn = FlakySession(), FakeConnection()
        task = asyncio.create_task(run_loop(conn, session))
        await asyncio.sleep(0.25)
        task.cancel()
        return session, conn

    session, conn = asyncio.run(scenario())
    assert session.calls > 2  # el bucle sigue vivo tras el fallo
    assert session.playback.playing is False
    assert [m.message for m in conn.sent] == [SIMULATION_ERROR]
