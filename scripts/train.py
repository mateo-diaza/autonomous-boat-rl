"""Entrena un agente (DQN o PPO) en BoatEnv guardando checkpoints periódicos.

Estructura de salida:
    models/<run>/config.json              parámetros del entrenamiento (los lee replay.py)
    models/<run>/checkpoints/*_steps.zip  instantáneas para ver la evolución
    models/<run>/best/best_model.zip      mejor modelo según la evaluación periódica
    models/<run>/final.zip
    logs/<run>_1/                         TensorBoard (tensorboard --logdir logs)

Uso: python -m scripts.train --algo dqn --steps 300000 --obstacles 6
"""

import argparse
import json
import time
from pathlib import Path

from stable_baselines3 import DQN, PPO
from stable_baselines3.common.callbacks import CheckpointCallback, EvalCallback
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.vec_env import SubprocVecEnv

from src.boat_env import BoatEnv

ROOT = Path(__file__).resolve().parent.parent


def parse_obstacles(s: str):
    """'6' -> 6 ; '3-8' -> (3, 8) (número aleatorio por episodio)."""
    if "-" in s:
        lo, hi = s.split("-")
        return int(lo), int(hi)
    return int(s)


def build_model(algo: str, env, seed: int, tb_log: str):
    if algo == "dqn":
        return DQN(
            "MlpPolicy", env,
            learning_rate=5e-4,
            buffer_size=100_000,
            learning_starts=5_000,
            batch_size=128,
            gamma=0.99,
            train_freq=4,
            target_update_interval=1_000,
            exploration_fraction=0.2,
            exploration_final_eps=0.05,
            policy_kwargs=dict(net_arch=[256, 256]),
            tensorboard_log=tb_log, seed=seed, verbose=1,
        )
    return PPO(
        "MlpPolicy", env,
        learning_rate=3e-4,
        n_steps=1024,
        batch_size=256,
        n_epochs=10,
        gamma=0.99,
        gae_lambda=0.95,
        ent_coef=0.01,
        policy_kwargs=dict(net_arch=[256, 256]),
        tensorboard_log=tb_log, seed=seed, verbose=1,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--algo", choices=["dqn", "ppo"], default="dqn")
    parser.add_argument("--steps", type=int, default=300_000)
    parser.add_argument("--obstacles", default="6", help="'6' fijo o '3-8' aleatorio por episodio")
    parser.add_argument("--n-envs", type=int, default=None, help="por defecto: 4 (dqn) / 8 (ppo)")
    parser.add_argument("--ckpt-freq", type=int, default=25_000, help="pasos entre checkpoints")
    parser.add_argument("--run", default=None, help="nombre del experimento")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    n_envs = args.n_envs or (4 if args.algo == "dqn" else 8)
    obstacles = parse_obstacles(args.obstacles)
    run = args.run or f"{args.algo}_{time.strftime('%Y%m%d_%H%M%S')}"
    run_dir = ROOT / "models" / run
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "config.json").write_text(json.dumps(
        {"algo": args.algo, "obstacles": args.obstacles, "steps": args.steps, "seed": args.seed}, indent=2))

    env_kwargs = dict(n_obstacles=obstacles)
    env = make_vec_env(BoatEnv, n_envs=n_envs, seed=args.seed, env_kwargs=env_kwargs,
                       vec_env_cls=SubprocVecEnv if n_envs > 1 else None)
    eval_env = make_vec_env(BoatEnv, n_envs=1, seed=args.seed + 10_000, env_kwargs=env_kwargs)

    # Los callbacks cuentan llamadas a step() del VecEnv, no pasos individuales -> dividir por n_envs
    callbacks = [
        CheckpointCallback(save_freq=max(args.ckpt_freq // n_envs, 1),
                           save_path=str(run_dir / "checkpoints"), name_prefix=args.algo),
        EvalCallback(eval_env, n_eval_episodes=20, eval_freq=max(args.ckpt_freq // n_envs, 1),
                     best_model_save_path=str(run_dir / "best"), log_path=str(run_dir / "eval"),
                     deterministic=True),
    ]

    model = build_model(args.algo, env, args.seed, str(ROOT / "logs"))
    # Checkpoint en el paso 0: el agente sin entrenar, para que el replay empiece desde cero
    model.save(run_dir / "checkpoints" / f"{args.algo}_0_steps")
    model.learn(total_timesteps=args.steps, callback=callbacks, tb_log_name=run, progress_bar=False)
    model.save(run_dir / "final")
    print(f"\nModelos guardados en {run_dir}")
    env.close()
    eval_env.close()


if __name__ == "__main__":
    main()
