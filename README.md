# Barco autónomo con Reinforcement Learning

Simulador 2D de un barco que aprende a esquivar obstáculos y llegar a una meta mediante RL (DQN / PPO con Stable-Baselines3).

## Instalación

```bash
python -m venv .venv
source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

## Estructura

- `src/` — entorno Gymnasium (`BoatEnv`) y utilidades
- `scripts/` — entrenamiento, evaluación y control manual
- `models/` — checkpoints de los agentes (no versionados)
- `logs/` — logs de TensorBoard (no versionados)

## Uso

Todos los comandos se lanzan desde la raíz del repo con el venv activado.

```bash
# Probar el entorno a mano (← → girar, R reiniciar, ESC salir)
python -m scripts.play

# Entrenar (checkpoints en models/<run>/checkpoints, mejor modelo en models/<run>/best)
python -m scripts.train --algo dqn --steps 300000 --run dqn_baseline
python -m scripts.train --algo ppo --steps 500000 --run ppo_baseline --obstacles 3-8

# Ver cómo aprende: reproduce los checkpoints en orden sobre los mismos escenarios
python -m scripts.replay models/dqn_baseline --every 2
# (ESPACIO salta episodio, N salta checkpoint, ESC sale)

# Ver el agente final
python -m scripts.replay models/dqn_baseline/best/best_model.zip --episodes 10

# Curvas de aprendizaje (rollout/success_rate, eval/mean_reward...)
tensorboard --logdir logs
```

## Entorno (`src/boat_env.py`)

- **Acciones**: `Discrete(3)` → girar izquierda / recto / girar derecha. Velocidad constante; el giro tiene inercia.
- **Observación** (17 dims): 12 rayos lidar en 180° frontales, sin/cos del ángulo a la meta, distancia a la meta, velocidad angular y velocidad lineal.
- **Recompensa**: `+progreso hacia la meta − 0.01/paso`, `−100` al chocar o salir del mapa, `+100` al llegar. Máximo 1000 pasos.
