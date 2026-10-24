import json

import numpy as np
import pytest
from stable_baselines3.common.env_checker import check_env

from src.boat_env import EDIT_RADIUS_LIMITS, WORLD_SIZE, BoatEnv


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
