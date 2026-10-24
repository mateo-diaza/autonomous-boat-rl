"""Entrena un agente (DQN o PPO) en BoatEnv guardando checkpoints periódicos.

Estructura de salida:
    models/<run>/config.json              parámetros del entrenamiento (los lee replay.py)
    models/<run>/checkpoints/*_steps.zip  instantáneas para ver la evolución
    models/<run>/best/best_model.zip      mejor modelo según la evaluación periódica
    models/<run>/final.zip
    logs/<run>_1/                         TensorBoard (tensorboard --logdir logs)

Uso: python -m training.train --problem base --run dqn

Por defecto se entrena poco y se guardan muchos checkpoints (~30): el agente aprende pronto y lo
interesante para la demo es ver la progresión, no exprimir los últimos puntos de rendimiento.
"""

import argparse
import json
import time

from stable_baselines3 import DQN, PPO
from stable_baselines3.common.callbacks import CheckpointCallback, EvalCallback
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.vec_env import SubprocVecEnv

from training.boat_env import BoatEnv
from training.paths import LOGS_DIR, MODELS_DIR
from training.problems import DEFAULT_PROBLEM, PROBLEMS, get_problem


def parse_obstacles(s: str):
    """'6' -> 6 ; '3-8' -> (3, 8) (número aleatorio por episodio)."""
    if "-" in s:
        lo, hi = s.split("-")
        return int(lo), int(hi)
    return int(s)


# Valores por defecto por algoritmo (ver la nota del docstring)
DEFAULTS = {
    # Elegidos comparando curvas: PPO con actualizaciones pequeñas (4*256 = 1024 pasos), 5 épocas y lr 2e-4
    # aprende de forma gradual (0 -> 45 -> 90 % en ~16k pasos) y se mantiene estable; con 10 épocas y
    # lr 3e-4 aprendía a saltos y recaía. DQN llega al ~90 % hacia los 30k y más allá se vuelve inestable.
    "ppo": {"steps": 30_000, "n_envs": 4, "n_steps": 256, "n_epochs": 5, "lr": 2e-4},
    "dqn": {"steps": 50_000, "n_envs": 4, "ckpt_freq": 2_500},
}


EVAL_EPISODES = 40  # más episodios = curva de aprendizaje menos ruidosa


def format_obstacles(n_obstacles: int | tuple[int, int]) -> str:
    """(4, 10) -> '4-10'; 6 -> '6' (formato legible que se guarda en config.json)."""
    return f"{n_obstacles[0]}-{n_obstacles[1]}" if isinstance(n_obstacles, (tuple, list)) else str(n_obstacles)


def build_model(algo: str, env, seed: int, tb_log: str, n_steps: int, lr: float | None, n_epochs: int):
    if algo == "dqn":
        return DQN(
            "MlpPolicy", env,
            learning_rate=lr or 5e-4,
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
        learning_rate=lr or 3e-4,
        n_steps=n_steps,
        batch_size=256,
        n_epochs=n_epochs,
        gamma=0.99,
        gae_lambda=0.95,
        ent_coef=0.01,
        policy_kwargs=dict(net_arch=[256, 256]),
        tensorboard_log=tb_log, seed=seed, verbose=1,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--algo", choices=["dqn", "ppo"], default="dqn")
    parser.add_argument("--steps", type=int, default=None, help="por defecto: 30k (ppo) / 50k (dqn)")
    parser.add_argument("--problem", choices=list(PROBLEMS), default=DEFAULT_PROBLEM,
                        help="variante de dificultad del entorno (ver training/problems.py)")
    parser.add_argument("--observe-current", action="store_true",
                        help="sensor de corriente: el agente observa la corriente (+2 dimensiones)")
    parser.add_argument("--observe-route", action="store_true",
                        help="sensor de ruta: dirección del camino navegable hacia la meta (+2 dimensiones)")
    parser.add_argument("--obstacles", default=None,
                        help="sobrescribe las rocas del problema: '6' fijo o '4-10' aleatorio por episodio")
    parser.add_argument("--n-envs", type=int, default=None, help="por defecto: 4")
    parser.add_argument("--n-steps", type=int, default=None,
                        help="PPO: pasos por entorno entre actualizaciones (por defecto 256)")
    parser.add_argument("--ckpt-freq", type=int, default=None,
                        help="pasos entre checkpoints; por defecto 1 por actualización en PPO (1024) y 2.5k en DQN")
    parser.add_argument("--n-epochs", type=int, default=None, help="PPO: pasadas por lote de experiencia (5)")
    parser.add_argument("--lr", type=float, default=None, help="tasa de aprendizaje (por defecto la del algoritmo)")
    parser.add_argument("--run", default=None, help="nombre del experimento (identificador técnico, carpeta)")
    parser.add_argument("--label", default=None,
                        help="nombre corto para la web; por defecto se deduce del problema y los sensores")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    defaults = DEFAULTS[args.algo]
    steps = args.steps or defaults["steps"]
    n_envs = args.n_envs or defaults["n_envs"]
    n_steps = args.n_steps or defaults.get("n_steps", 0)
    n_epochs = args.n_epochs or defaults.get("n_epochs", 10)
    lr = args.lr or defaults.get("lr")
    # En PPO, un checkpoint por actualización: entre actualizaciones la red no cambia y saldrían repetidos
    ckpt_freq = args.ckpt_freq or defaults.get("ckpt_freq") or n_envs * n_steps
    env_kwargs = dict(get_problem(args.problem).env_kwargs)
    if args.obstacles:
        env_kwargs["n_obstacles"] = parse_obstacles(args.obstacles)
    if args.observe_current:
        env_kwargs["observe_current"] = True
    if args.observe_route:
        env_kwargs["observe_route"] = True
    run = args.run or f"{args.algo}_{time.strftime('%Y%m%d_%H%M%S')}"
    run_dir = MODELS_DIR / run
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "config.json").write_text(json.dumps(
        {"algo": args.algo, "problem": args.problem, "env_kwargs": env_kwargs,
         "obstacles": format_obstacles(env_kwargs["n_obstacles"]), "steps": steps, "seed": args.seed,
         "n_envs": n_envs, "n_steps": n_steps or None, "ckpt_freq": ckpt_freq,
         "lr": lr, "n_epochs": n_epochs if args.algo == "ppo" else None,
         **({"label": args.label} if args.label else {})}, indent=2))

    env = make_vec_env(BoatEnv, n_envs=n_envs, seed=args.seed, env_kwargs=env_kwargs,
                       vec_env_cls=SubprocVecEnv if n_envs > 1 else None)
    eval_env = make_vec_env(BoatEnv, n_envs=1, seed=args.seed + 10_000, env_kwargs=env_kwargs)

    # Los callbacks cuentan llamadas a step() del VecEnv, no pasos individuales -> dividir por n_envs
    callbacks = [
        CheckpointCallback(save_freq=max(ckpt_freq // n_envs, 1),
                           save_path=str(run_dir / "checkpoints"), name_prefix=args.algo),
        EvalCallback(eval_env, n_eval_episodes=EVAL_EPISODES, eval_freq=max(ckpt_freq // n_envs, 1),
                     best_model_save_path=str(run_dir / "best"), log_path=str(run_dir / "eval"),
                     deterministic=True),
    ]

    model = build_model(args.algo, env, args.seed, str(LOGS_DIR), n_steps, lr, n_epochs)
    # Checkpoint en el paso 0: el agente sin entrenar, para que el replay empiece desde cero
    model.save(run_dir / "checkpoints" / f"{args.algo}_0_steps")
    model.learn(total_timesteps=steps, callback=callbacks, tb_log_name=run, progress_bar=False)
    model.save(run_dir / "final")
    print(f"\nModelos guardados en {run_dir}")
    env.close()
    eval_env.close()


if __name__ == "__main__":
    main()
