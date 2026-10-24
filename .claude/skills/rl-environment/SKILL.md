---
name: rl-environment
description: Cómo modificar o extender el entorno Gymnasium BoatEnv (training/boat_env.py) y el entrenamiento de autonomous-boat-rl - añadir variantes de dificultad (recompensa escasa, corrientes, trampa en U, obstáculos móviles, ruido en sensores, curriculum), cambiar observación, acciones o recompensa, y mantener la compatibilidad con modelos entrenados, el replay y el servidor web. Úsala siempre que toques training/ (boat_env.py, train.py) o la definición de problemas.
---

# Entorno de RL (training/boat_env.py)

Lee también `clean-code`.

## 1. Invariantes que no se rompen

- API Gymnasium: `reset(seed, options) -> (obs, info)`, `step(a) -> (obs, r, terminated, truncated, info)`.
- `check_env` de SB3 debe pasar para **toda** variante:
  ```bash
  .venv/bin/python -c "from stable_baselines3.common.env_checker import check_env; from src.boat_env import BoatEnv; check_env(BoatEnv())"
  ```
- Observaciones `float32` dentro de los límites del `observation_space` (se recortan con `np.clip`).
- `info["is_success"]` al final del episodio (lo usan SB3, EvalCallback y el replay) e `info["event"]` ∈ {`goal`, `crash`, `timeout`}.
- Reproducibilidad: toda aleatoriedad sale de `self.np_random` (nunca `np.random` global ni `random`).
- `training/` no importa nada de `backend/` ni de `frontend/`.

## 2. Compatibilidad con modelos ya entrenados

Un modelo depende de la **forma y el significado** de la observación y las acciones.

- Cambiar la forma del `observation_space` o del `action_space` **invalida** los modelos existentes:
  hazlo como variante nueva y entrena un run nuevo; no lo cambies en el entorno por defecto.
- Cambiar física o recompensa no rompe la carga, pero sí el comportamiento: documenta en el commit
  qué runs quedan obsoletos.
- Cada run guarda su configuración en `training/models/<run>/config.json`. Si añades parámetros de entorno,
  **guárdalos ahí** para que replay y servidor reconstruyan exactamente el mismo entorno.

## 3. Cómo añadir una variante de dificultad

Preferir **composición y parámetros** a subclases en cadena (patrón Strategy + Registry):

1. Parámetro en el constructor con valor por defecto que mantiene el comportamiento actual
   (p. ej. `current_strength: float = 0.0`, `reward_mode: Literal["shaped", "sparse"] = "shaped"`).
2. Lógica encapsulada en un método privado pequeño (`_apply_current`, `_compute_reward`).
3. Registrar el problema en el catálogo `training/problems.py` (ya existe; el backend lo expone en `/api/problems`
   y la web lo muestra en "Condiciones del mar"):
   ```python
   PROBLEMS = {
       "base":    Problem(title="Base", description="...", env_kwargs={"n_obstacles": (4, 10)}),
       "sparse":  Problem(title="Recompensa escasa", description="...", env_kwargs={..., "reward_mode": "sparse"}),
       "current": Problem(title="Corrientes", description="...", env_kwargs={..., "current_strength": 0.3}),
   }
   ```
   `title`/`description` en español: los muestra el frontend (lenguaje llano + qué dificultad de RL ilustra).
   La descripción, ≤ ~130 caracteres (2 líneas en la barra de controles).
   Además `model_name` y `training_note` (y `no_sensor_note` si hay sensores que importan): de ahí sale el
   nombre de los modelos en la web ("Corrientes + sensor" · "corriente aleatoria · sensor de corriente").
   Nada de ids técnicos (`dqn_current_sensor`) ni del algoritmo en la interfaz: solo en tooltips.
   Los parámetros que cambian la OBSERVACIÓN (sensores: `observe_current`, `observe_route`) no van en el problema sino en
   el modelo: se eligen al entrenar (`--observe-current`), se guardan en su config.json y el backend reconstruye
   el entorno del barco con ellos al cargarlo (`SENSOR_KEYS` en problems.py, `Lane._set_sensors`).
   Un parámetro nuevo de BoatEnv con valor por defecto "apagado" NO debe consumir azar ni cambiar el orden de las
   operaciones: el mar en calma debe reproducir bit a bit los escenarios de siempre (verificar con una foto).
4. `train.py --problem <id>` usa `PROBLEMS[id].env_kwargs` y lo guarda en `config.json`.
5. Si la variante necesita información para ser Markov (velocidad de obstáculos, corriente), decide
   explícitamente si se observa o no — y documéntalo: es justo la lección de RL de esa variante.
6. Render: la variante debe verse (flechas de corriente, obstáculos moviéndose) en pygame **y** en
   `get_state()` para el frontend.

## 4. Recompensa

- Mantener la escala: ±100 terminal, progreso ~1 por unidad, −0.01 por paso. Cambiar escalas afecta a
  DQN mucho más que a PPO.
- Shaping basado en potencial (Φ = −distancia) preserva la política óptima; cualquier otro bonus
  puede introducir atajos indeseados — vigila el replay buscando "trampas" (dar vueltas, pegarse a la pared).

## 5. Estado para la web

- `get_state() -> dict` devuelve solo tipos JSON (floats redondeados, listas), sin arrays NumPy.
  No incluye la estela (crecería sin límite a 60 Hz): el cliente la acumula a partir de `boat`.
- `reset(options={"start": [x, y], "goal": [x, y], "heading": rad, "obstacles": [[x, y, r], ...]})`
  fija el escenario desde fuera (lo omitido es aleatorio); valida y recorta a los límites del mundo.
- Edición en vivo sin reiniciar: `set_obstacles([[x, y, r], ...])` y `set_goal([x, y])`.
- Toda variante nueva debe conservar estas tres APIs y sus tests en `training/tests/test_boat_env.py`.

## 6. Validación de cada cambio

1. `check_env` pasa.
2. Smoke test: 100 episodios aleatorios sin excepciones; las proporciones de `goal/crash/timeout` tienen sentido.
3. Entrenamiento corto (PPO, 50–100k pasos) y comparar `success_rate` con el baseline.
4. Replay visual de al menos un checkpoint temprano y el final.
5. Commit local describiendo la variante y su resultado (p. ej. "éxito 95 % → 40 % con corriente 0.3").
