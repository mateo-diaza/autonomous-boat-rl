"""Fixtures compartidas: un models/ temporal con la misma estructura que genera training/train.py."""

import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from stable_baselines3 import PPO

from backend.config import get_models_dir
from backend.main import app
from training.boat_env import BoatEnv

RUN = "ppo_test"


@pytest.fixture(scope="module")
def models_dir(tmp_path_factory):
    """Run mínimo con la misma estructura que genera training/train.py."""
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
