"""Reproduce los checkpoints de un entrenamiento en orden para ver cómo aprende el agente.

Todos los checkpoints se enfrentan a los MISMOS escenarios (mismas semillas), así se
compara directamente la evolución de la política.

    ESPACIO  saltar episodio     N  siguiente checkpoint     ESC  salir

Uso:
    python -m scripts.replay models/dqn_xxx                 # todos los checkpoints
    python -m scripts.replay models/dqn_xxx --every 2       # uno de cada dos
    python -m scripts.replay models/ppo_demo --upto 25000   # solo el tramo donde aprende
    python -m scripts.replay models/ppo_demo --max-steps 300 --stochastic
    python -m scripts.replay models/dqn_xxx/best/best_model.zip --episodes 10
"""

import argparse
import json
import re
from pathlib import Path

import pygame
from stable_baselines3 import DQN, PPO

from scripts.train import parse_obstacles
from src.boat_env import BoatEnv

ALGOS = {"dqn": DQN, "ppo": PPO}


def find_checkpoints(path: Path, upto: int | None = None):
    """Devuelve [(etiqueta, ruta_zip)] ordenados por número de pasos."""
    if path.is_file():
        return [(path.stem, path)]
    ckpts = []
    for f in (path / "checkpoints").glob("*_steps.zip"):
        steps = int(re.search(r"_(\d+)_steps", f.name).group(1))
        if upto is None or steps <= upto:
            ckpts.append((steps, f))
    ckpts.sort()
    out = [(f"{s // 1000}k pasos", f) for s, f in ckpts]
    if (path / "final.zip").exists():
        out.append(("final", path / "final.zip"))
    return out


def load_config(path: Path) -> dict:
    run_dir = path if path.is_dir() else next(p for p in path.parents if (p / "config.json").exists())
    return json.loads((run_dir / "config.json").read_text())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path, help="carpeta del run o un .zip concreto")
    parser.add_argument("--episodes", type=int, default=3, help="episodios por checkpoint")
    parser.add_argument("--every", type=int, default=1, help="mostrar uno de cada N checkpoints")
    parser.add_argument("--upto", type=int, default=None, help="solo checkpoints hasta N pasos (+ el final)")
    parser.add_argument("--obstacles", default=None, help="por defecto, los del entrenamiento")
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--fps", type=int, default=60)
    parser.add_argument("--max-steps", type=int, default=None,
                        help="corta cada episodio a N pasos (evita minutos de vueltas del agente sin entrenar)")
    parser.add_argument("--stochastic", action="store_true",
                        help="muestrea las acciones de la política en vez de elegir siempre la más probable")
    args = parser.parse_args()

    cfg = load_config(args.path)
    algo_cls = ALGOS[cfg["algo"]]
    ckpts = find_checkpoints(args.path, args.upto)
    if len(ckpts) > 1:
        ckpts = ckpts[::args.every] if ckpts[-1] in ckpts[::args.every] else ckpts[::args.every] + [ckpts[-1]]

    env = BoatEnv(n_obstacles=parse_obstacles(args.obstacles or cfg["obstacles"]), render_mode="human")
    env.metadata["render_fps"] = args.fps

    for label, ckpt in ckpts:
        model = algo_cls.load(ckpt, device="cpu")
        wins = 0
        next_ckpt = False
        for ep in range(args.episodes):
            obs, _ = env.reset(seed=args.seed + ep)
            if args.stochastic:
                model.set_random_seed(args.seed + ep)  # muestreo reproducible: mismo checkpoint -> mismas acciones
            done = skip = False
            while not done and not skip:
                mode = " (estoc.)" if args.stochastic else ""
                env.overlay_text = f"{label}{mode} | ep {ep + 1}/{args.episodes} | metas {wins}"
                action, _ = model.predict(obs, deterministic=not args.stochastic)
                obs, _, terminated, truncated, info = env.step(action)
                if args.max_steps and not terminated and env.steps >= args.max_steps:
                    truncated, info["event"] = True, "timeout"
                done = terminated or truncated
                for event in pygame.event.get():
                    if event.type == pygame.QUIT or (event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE):
                        env.close()
                        return
                    if event.type == pygame.KEYDOWN and event.key == pygame.K_SPACE:
                        skip = True
                    if event.type == pygame.KEYDOWN and event.key == pygame.K_n:
                        skip = next_ckpt = True
            if done:
                wins += int(info["is_success"])
                print(f"[{label:>12s}] ep {ep + 1}: {info['event']:8s} pasos={env.steps:4d} "
                      f"retorno={env.episode_return:8.1f}")
                pygame.time.wait(500)
            if next_ckpt:
                break
        print(f"[{label:>12s}] metas: {wins}/{args.episodes}\n")

    env.close()


if __name__ == "__main__":
    main()
