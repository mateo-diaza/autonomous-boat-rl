"""Carga de modelos SB3 con caché e inspección de la política para el panel "cerebro"."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import torch
from stable_baselines3 import DQN, PPO
from stable_baselines3.common.base_class import BaseAlgorithm

ALGOS: dict[str, type[BaseAlgorithm]] = {"dqn": DQN, "ppo": PPO}


@lru_cache(maxsize=32)
def load_model(path: Path, algo: str) -> BaseAlgorithm:
    """Cargar un .zip cuesta ~100 ms: se comparte entre sesiones (los modelos no se modifican)."""
    if algo not in ALGOS:
        raise ValueError(f"Algoritmo no soportado: {algo!r}")
    return ALGOS[algo].load(path, device="cpu")


def action_probabilities(model: BaseAlgorithm, obs: np.ndarray) -> list[float]:
    """Preferencia del agente por cada acción.

    PPO: probabilidades reales de la política. DQN no tiene política estocástica:
    se muestra el softmax de los Q-values, que ordena las acciones igual que el agente.
    """
    obs_tensor, _ = model.policy.obs_to_tensor(obs)
    with torch.no_grad():
        if isinstance(model, DQN):
            probs = torch.softmax(model.q_net(obs_tensor), dim=1)
        else:
            probs = model.policy.get_distribution(obs_tensor).distribution.probs
    return [round(float(p), 4) for p in probs[0]]
