import json

import numpy as np
import pytest
from stable_baselines3.common.env_checker import check_env

from training.boat_env import EDIT_RADIUS_LIMITS, WORLD_SIZE, BoatEnv


def test_check_env_passes():
    check_env(BoatEnv(), warn=True)


def test_same_seed_same_scenario():
    a, b = BoatEnv(n_obstacles=(4, 10)), BoatEnv(n_obstacles=(4, 10))
    obs_a, _ = a.reset(seed=7)
    obs_b, _ = b.reset(seed=7)
    np.testing.assert_array_equal(obs_a, obs_b)
    np.testing.assert_array_equal(a.obs_centers, b.obs_centers)


def test_options_fix_full_scenario():
    env = BoatEnv()
    env.reset(seed=0, options={
        "start": [20, 20], "goal": [80, 80], "heading": 0.5,
        "obstacles": [[50, 50, 5], [30, 70, 3]],
    })
    state = env.get_state()
    assert (state["boat"]["x"], state["boat"]["y"]) == (20, 20)
    assert state["boat"]["heading"] == 0.5
    assert (state["goal"]["x"], state["goal"]["y"]) == (80, 80)
    assert [(o["x"], o["y"], o["radius"]) for o in state["obstacles"]] == [(50, 50, 5), (30, 70, 3)]


def test_partial_options_keep_random_rest():
    env = BoatEnv(n_obstacles=6)
    env.reset(seed=0, options={"goal": [90, 90]})
    np.testing.assert_array_equal(env.goal, [90, 90])
    assert len(env.obs_radii) > 0


def test_empty_obstacles_list_means_none():
    env = BoatEnv(n_obstacles=6)
    env.reset(seed=0, options={"obstacles": []})
    assert env.get_state()["obstacles"] == []


def test_options_are_clipped_to_world():
    env = BoatEnv()
    env.reset(seed=0, options={"goal": [-10, 500], "obstacles": [[200, 50, 99]]})
    assert env.goal.tolist() == [0.0, WORLD_SIZE]
    assert env.obs_centers[0].tolist() == [WORLD_SIZE, 50.0]
    assert env.obs_radii[0] == EDIT_RADIUS_LIMITS[1]


@pytest.mark.parametrize("options", [
    {"goal": [1, 2, 3]},
    {"start": ["a", 2]},
    {"obstacles": [[1, 2]]},
    {"obstacles": [[1, 2, float("nan")]]},
])
def test_invalid_options_raise(options):
    with pytest.raises(ValueError):
        BoatEnv().reset(seed=0, options=options)


def test_set_goal_resets_progress_reference():
    env = BoatEnv(n_obstacles=0)
    env.reset(seed=0, options={"start": [50, 50], "heading": 0.0})
    env.set_goal([50, 90])
    # Mover la meta no debe dar una recompensa de progreso gigante en el siguiente paso
    _, reward, *_ = env.step(1)
    assert abs(reward) < 2.0


def test_set_obstacles_mid_episode_affects_rays():
    env = BoatEnv(n_obstacles=0)
    env.reset(seed=0, options={"start": [50, 50], "heading": 0.0})
    free = env.get_state()["rays"]
    env.set_obstacles([[60, 50, 3]])
    blocked = env.get_state()["rays"]
    assert min(r["distance"] for r in blocked) < min(r["distance"] for r in free)


def test_get_state_is_json_serializable_and_tracks_event():
    env = BoatEnv(n_obstacles=0)
    env.reset(seed=0, options={"start": [50, 50], "goal": [55, 50], "heading": 0.0})
    state = env.get_state()
    json.dumps(state)
    assert state["event"] is None and len(state["rays"]) == 12
    terminated = False
    while not terminated:
        *_, terminated, _, info = env.step(1)
    assert env.get_state()["event"] == info["event"] == "goal"


def test_observe_reflects_live_edits():
    env = BoatEnv(n_obstacles=0)
    obs, _ = env.reset(seed=0, options={"start": [50, 50], "heading": 0.0})
    np.testing.assert_array_equal(env.observe(), obs)
    env.set_obstacles([[60, 50, 3]])
    assert env.observe()[:12].min() < obs[:12].min()


def test_sparse_reward_only_at_the_end():
    env = BoatEnv(n_obstacles=0, reward_mode="sparse")
    env.reset(seed=0, options={"start": [50, 50], "goal": [56, 50], "heading": 0.0})
    rewards, terminated = [], False
    while not terminated:
        _, reward, terminated, _, info = env.step(1)
        rewards.append(reward)
    assert info["event"] == "goal" and rewards[-1] == 100.0 and all(r == 0.0 for r in rewards[:-1])


def test_invalid_reward_mode_raises():
    with pytest.raises(ValueError):
        BoatEnv(reward_mode="mucha")


def test_every_problem_builds_a_valid_env():
    from stable_baselines3.common.env_checker import check_env

    from training.problems import PROBLEMS, make_env

    for problem_id in PROBLEMS:
        check_env(make_env(problem_id), warn=True)


def test_run_env_kwargs_supports_old_and_new_configs():
    from training.problems import run_env_kwargs

    assert run_env_kwargs({"obstacles": "4-10"}) == {"n_obstacles": (4, 10)}
    assert run_env_kwargs({"obstacles": "6"}) == {"n_obstacles": 6}
    new = {"env_kwargs": {"n_obstacles": [4, 10], "reward_mode": "sparse"}}
    assert run_env_kwargs(new) == {"n_obstacles": (4, 10), "reward_mode": "sparse"}


def test_calm_sea_has_no_current():
    env = BoatEnv(n_obstacles=0)
    env.reset(seed=0)
    assert env.current.tolist() == [0.0, 0.0] and env.get_state()["current"] == {"x": 0.0, "y": 0.0}


def test_current_drifts_the_boat():
    env = BoatEnv(n_obstacles=0)
    env.reset(seed=0, options={"start": [50, 50], "goal": [90, 90], "heading": 0.0, "current": [0.0, 5.0]})
    env.step(1)  # recto hacia +x; la corriente empuja hacia +y
    assert env.pos[1] == pytest.approx(50.5) and env.pos[0] > 50


def test_random_current_respects_range_and_is_reproducible():
    a, b = BoatEnv(current_speed=(5.0, 8.0)), BoatEnv(current_speed=(5.0, 8.0))
    a.reset(seed=3), b.reset(seed=3)
    assert 5.0 <= np.linalg.norm(a.current) <= 8.0
    np.testing.assert_array_equal(a.current, b.current)


def test_current_sensor_reports_drift_in_boat_frame():
    env = BoatEnv(n_obstacles=0, observe_current=True)
    assert env.observation_space.shape == (19,)
    # Rumbo +x y corriente hacia +y (estribor, con el eje y hacia abajo): todo de costado, nada a favor
    obs, _ = env.reset(seed=0, options={"start": [50, 50], "heading": 0.0, "current": [0.0, 8.0]})
    assert obs[-2] == pytest.approx(0.0, abs=1e-6) and obs[-1] == pytest.approx(0.8)
    assert np.all(np.abs(obs) <= 1.0)
