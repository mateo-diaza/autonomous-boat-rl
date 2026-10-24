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
- `models/` — checkpoints de los agentes (no versionados). Lo que hay en `models/_archivo/` no se muestra en la web
- `logs/` — logs de TensorBoard (no versionados)

## Demo web (backend + frontend)

Requisitos adicionales: Node.js ≥ 20.9 y pnpm.

```bash
pnpm install && pnpm --dir frontend install   # una sola vez
pnpm dev                                      # API en :8000 + web en http://localhost:3000
```

La web tiene dos modos (selector en la cabecera):

- **Navegación**: un modelo en vivo; se elige el momento del aprendizaje (línea del tiempo o clic en la curva)
  y se puede editar la carta (mover, añadir y quitar rocas, mover la boya).
- **Comparativa**: dos modelos (A y B) navegan a la vez exactamente el mismo escenario, con marcador acumulado
  y **torneo rápido** (20/50/100 escenarios simulados sin animación en unos segundos).

## Uso

Todos los comandos se lanzan desde la raíz del repo con el venv activado.

```bash
# Probar el entorno a mano (← → girar, R reiniciar, ESC salir)
python -m scripts.play

# Entrenar (checkpoints en models/<run>/checkpoints, mejor modelo en models/<run>/best).
# Por defecto: entrenamientos cortos con ~30 checkpoints para ver la progresión del aprendizaje:
#   PPO: 30k pasos, 1 checkpoint por actualización (cada 1024 pasos)  -> ~1 min
#   DQN: 50k pasos, 1 checkpoint cada 2.5k pasos                      -> ~1 min
python -m scripts.train --algo ppo --run ppo
python -m scripts.train --algo dqn --run dqn
# Todo es configurable: --steps, --ckpt-freq, --n-envs, --n-steps, --n-epochs, --lr, --obstacles

# Ver cómo aprende: reproduce los checkpoints en orden sobre los mismos escenarios
python -m scripts.replay models/ppo --every 2
# (ESPACIO salta episodio, N salta checkpoint, ESC sale)

# Solo el tramo donde aprende, cortando episodios a 300 pasos y con acciones muestreadas
python -m scripts.replay models/ppo --upto 20000 --max-steps 300 --stochastic

# Ver el agente final
python -m scripts.replay models/ppo/best/best_model.zip --episodes 10

# Servidor web (API REST + simulación en vivo por WebSocket); docs en http://localhost:8000/docs
uvicorn server.main:app --reload --port 8000

# Tests y lint
python -m pytest tests
ruff check src scripts server tests

# Curvas de aprendizaje (rollout/success_rate, eval/mean_reward...)
tensorboard --logdir logs
```

## Entorno (`src/boat_env.py`)

- **Acciones**: `Discrete(3)` → girar izquierda / recto / girar derecha. Velocidad constante; el giro tiene inercia.
- **Observación** (17 dims): 12 rayos lidar en 180° frontales, sin/cos del ángulo a la meta, distancia a la meta, velocidad angular y velocidad lineal.
- **Recompensa**: `+progreso hacia la meta − 0.01/paso`, `−100` al chocar o salir del mapa, `+100` al llegar. Máximo 1000 pasos.
