# Barco autónomo con Reinforcement Learning

Simulador 2D de un barco que aprende a esquivar obstáculos y llegar a una meta mediante RL (PPO / DQN con
Stable-Baselines3), con una web para ver en vivo cómo navega y cómo ha ido aprendiendo.

## Estructura

```
autonomous-boat-rl/
├── training/            # Módulo de RL (Python)
│   ├── boat_env.py      #   entorno Gymnasium BoatEnv
│   ├── train.py         #   entrenamiento con checkpoints
│   ├── play.py          #   control manual con teclado (pygame)
│   ├── replay.py        #   reproducir checkpoints en pygame
│   ├── problems.py      #   catálogo de variantes de dificultad ("condiciones del mar")
│   ├── paths.py         #   dónde se guardan modelos y logs
│   ├── models/          #   checkpoints por run (no versionados; _archivo/ no se muestra en la web)
│   ├── logs/            #   TensorBoard (no versionados)
│   └── tests/
├── backend/             # API FastAPI + WebSockets de simulación en vivo (Python, usa training/)
│   ├── routes/          #   REST de runs, /ws/sim (navegación), /ws/compare (comparativa)
│   └── tests/
├── frontend/            # Web Next.js (TypeScript)
├── package.json         # arranque conjunto de la demo (pnpm dev)
├── requirements.txt     # dependencias Python de todo el repo (incluye training/ y backend/)
└── pyproject.toml       # configuración de ruff y pytest
```

Dependencias entre módulos: `frontend → backend → training`. `training/` no depende de nada del resto.
Todos los comandos se lanzan **desde la raíz del repo**.

## Instalación

```bash
python -m venv .venv
source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt          # o solo training/requirements.txt para entrenar

pnpm install && pnpm --dir frontend install   # web (Node.js ≥ 20.9 y pnpm)
```

## Demo web

```bash
pnpm dev     # API en :8000 (docs en /docs) + web en http://localhost:3000
```

La web tiene dos modos (selector en la cabecera):

- **Navegación**: un modelo en vivo; se elige el momento del aprendizaje (línea del tiempo o clic en la curva)
  y se puede editar la carta (mover, añadir y quitar rocas, mover la boya).
- **Comparativa**: dos modelos (A y B) navegan a la vez exactamente el mismo escenario, con marcador acumulado
  y **torneo rápido** (20/50/100 escenarios simulados sin animación en unos segundos).

Por separado: `pnpm dev:api` o `pnpm dev:web`.

## Entrenamiento (`training/`)

```bash
# Probar el entorno a mano (← → girar, R reiniciar, ESC salir)
python -m training.play

# Entrenar. Por defecto: entrenamientos cortos con ~30 checkpoints para ver la progresión del aprendizaje
#   PPO: 30k pasos, 1 checkpoint por actualización (cada 1024 pasos)  -> ~1 min
#   DQN: 50k pasos, 1 checkpoint cada 2.5k pasos                      -> ~1 min
python -m training.train --algo ppo --run ppo
python -m training.train --algo dqn --run dqn
# Variantes de dificultad (training/problems.py): --problem base | sparse
python -m training.train --algo ppo --problem sparse --run ppo_sparse
# Todo es configurable: --steps, --ckpt-freq, --n-envs, --n-steps, --n-epochs, --lr, --obstacles

# Ver cómo aprende en pygame: reproduce los checkpoints en orden sobre los mismos escenarios
python -m training.replay training/models/ppo --every 2
# (ESPACIO salta episodio, N salta checkpoint, ESC sale)
python -m training.replay training/models/ppo --upto 20000 --max-steps 300 --stochastic
python -m training.replay training/models/ppo/best/best_model.zip --episodes 10

# Curvas de aprendizaje (rollout/success_rate, eval/mean_reward...)
tensorboard --logdir training/logs
```

## Calidad

```bash
pnpm test    # pytest (training/tests + backend/tests)
pnpm lint    # ESLint (frontend) + ruff (training, backend)
```

## Entorno (`training/boat_env.py`)

- **Acciones**: `Discrete(3)` → girar izquierda / recto / girar derecha. Velocidad constante; el giro tiene inercia.
- **Observación** (17 dims): 12 rayos lidar en 180° frontales, sin/cos del ángulo a la meta, distancia a la meta, velocidad angular y velocidad lineal.
- **Recompensa**: `+progreso hacia la meta − 0.01/paso`, `−100` al chocar o salir del mapa, `+100` al llegar. Máximo 1000 pasos.
