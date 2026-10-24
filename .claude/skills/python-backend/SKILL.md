---
name: python-backend
description: Buenas prácticas para el backend FastAPI de autonomous-boat-rl (backend/) que sirve la simulación del barco y los modelos SB3 por REST y WebSocket. Úsala siempre que crees o modifiques código en server/, endpoints, esquemas Pydantic, el bucle de simulación por WebSocket, la carga de modelos, o los tests del backend.
---

# Backend FastAPI (backend/)

Objetivo: exponer `BoatEnv` + modelos SB3 a un frontend Next.js, con simulación en vivo por WebSocket.
Se ejecuta **solo en local** (`localhost:8000`). Lee también la skill `clean-code`.

## 1. Estructura

```
backend/
├── __init__.py
├── main.py          # crea la app, CORS, incluye routers. Sin lógica de negocio.
├── config.py        # rutas (ROOT, MODELS_DIR), constantes, settings
├── schemas.py       # modelos Pydantic: contrato con el frontend (REST + mensajes WS)
├── runs.py          # descubrir runs, checkpoints y curvas en training/models/ (lectura de disco)
├── models_cache.py  # carga de modelos SB3 con caché
├── lane.py          # Lane: un barco con su "cerebro" (BoatEnv + modelo opcional). Pieza común
├── playback.py      # Playback: reloj play/pausa/velocidad/pausa entre travesías. Pieza común
├── simulation.py    # SimulationSession: navegación (1 Lane + escenario editable); sin nada de red
├── comparison.py    # ComparisonSession: 2 Lanes en el mismo escenario + marcador; run_tournament()
├── routes/
│   ├── _ws.py       # común a los WS: origen, Connection (envío serializado), run_loop, load_checkpoint
│   ├── runs.py      # GET /api/runs, GET /api/runs/{run_id} (checkpoints + curva)
│   ├── sim.py       # WS /ws/sim
│   └── compare.py   # WS /ws/compare (el torneo corre en un hilo: la regata en vivo no se congela)
```
Tests del backend en `backend/tests/` (`test_server.py`, `test_comparison.py`). Las fixtures compartidas
(`models_dir` temporal, `client` con `get_models_dir` sustituida) viven en `backend/tests/conftest.py`.
Una sesión nueva = componer `Lane` + `Playback`, no copiar lógica de otra sesión.

Regla: **la lógica no vive en las rutas.** Las rutas validan, delegan y serializan.
`simulation.py` debe poder usarse y testearse sin FastAPI.

## 2. Contrato (schemas.py) — la pieza más importante

- Todo lo que cruza la red es un modelo Pydantic v2. Nada de `dict` sueltos.
- Mensajes WebSocket como **uniones discriminadas** por el campo `type`:

```python
class PauseCmd(BaseModel):
    type: Literal["pause"]

class AddObstacleCmd(BaseModel):
    type: Literal["add_obstacle"]
    x: float = Field(ge=0, le=WORLD_SIZE)
    y: float = Field(ge=0, le=WORLD_SIZE)
    radius: float = Field(ge=1, le=15)

ClientCommand = Annotated[PauseCmd | AddObstacleCmd | ..., Field(discriminator="type")]
command_adapter = TypeAdapter(ClientCommand)
```

- Mensajes servidor→cliente igual: `{"type": "state", ...}`, `{"type": "episode_end", ...}`, `{"type": "error", ...}`.
- Nombres de campos en **snake_case** en Python; el frontend define tipos TS espejo con los mismos nombres
  (no convertir a camelCase: un contrato, un nombre).
- Si cambias un esquema, actualiza en el mismo commit los tipos de `frontend/src/lib/types.ts`.
- Redondea floats al serializar (2–3 decimales) para reducir el tamaño del mensaje a 60 Hz.

## 3. WebSocket de simulación

Patrón: **una `SimulationSession` por conexión** y dos tareas concurrentes:

```python
@router.websocket("/ws/sim")
async def sim_ws(ws: WebSocket):
    await ws.accept()
    session = SimulationSession(...)
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(receive_commands(ws, session))   # lee y aplica comandos
            tg.create_task(run_loop(ws, session))           # step + send a tick fijo
    except* WebSocketDisconnect:
        pass
    finally:
        session.close()
```

- **Tick fijo** (p. ej. 30–60 Hz) con `asyncio.sleep` ajustado al tiempo consumido; la velocidad
  de reproducción cambia los pasos por tick, no la frecuencia de envío.
- Un `step` + `predict` cuesta < 1 ms: se puede hacer en el event loop. Si algo tarda > 5 ms
  (cargar un modelo, generar escenario complejo), usa `await asyncio.to_thread(...)` para no bloquear.
- Validar cada comando entrante con `command_adapter.validate_json`; si es inválido, responder
  `{"type": "error", "message": ...}` y **no cerrar** la conexión.
- La sesión nunca comparte estado mutable con otras sesiones (el caché de modelos es de solo lectura).
- Cerrar siempre recursos en `finally`.

## 4. Carga de modelos

- `models_cache.load_model(path: Path)` con `functools.lru_cache(maxsize=32)`; `device="cpu"`.
- Validar que la ruta está **dentro de** `MODELS_DIR` (`path.resolve().is_relative_to(MODELS_DIR)`):
  los ids de run/checkpoint vienen del cliente → evita path traversal.
- El algoritmo se lee de `training/models/<run>/config.json` (Registry `ALGOS`).
- Para el panel "cerebro": probabilidades de acción con
  `model.policy.get_distribution(obs_tensor).distribution.probs` (PPO) o softmax de `q_net` (DQN),
  encapsulado en una función `action_probabilities(model, obs) -> list[float]`.

## 5. REST

- Prefijo `/api`. Respuestas con `response_model` explícito.
- Errores con `HTTPException(status_code=404, detail="Run no encontrado: ...")`.
- Endpoints de solo lectura sobre `training/models/` → funciones sync normales están bien (FastAPI las pasa a threadpool).
- Leer `eval/evaluations.npz` → convertir a listas Python (`.tolist()`) antes de devolver.

## 6. Configuración y CORS

- CORS solo para `http://localhost:3000` y `http://127.0.0.1:3000`.
- CORS **no** protege WebSockets: `/ws/sim` comprueba la cabecera `Origin` contra la misma lista.
- Todo cambio de estado de la sesión debe marcarla como `_dirty`, o el cliente no recibirá el estado nuevo.
- Un error inesperado nunca debe tumbar el WebSocket: `run_loop` y los receptores de comandos capturan
  `Exception`, lo registran con `log.exception`, pausan la simulación y envían un `ErrorMsg` legible.
- Al cambiar de modelo con sensores distintos, retirar el modelo anterior ANTES de reconstruir el entorno:
  cualquier recálculo (probabilidades del "cerebro") con el modelo viejo y la observación nueva revienta.
  Probar siempre el cambio entre modelos de distinta observación, no solo cargarlos desde "sin modelo".
- Rutas con `pathlib.Path`, nunca strings concatenados.
- Nada de secretos (no hay); si apareciera alguno, va en `.env` ignorado por git.

## 7. Calidad

- Type hints completos; `from __future__ import annotations`.
- `ruff check backend && ruff format backend`.
- Logging con `logging.getLogger(__name__)`, no `print`.
- Tests con `pytest` + `fastapi.testclient.TestClient` (también soporta WebSocket con `client.websocket_connect`):
  - `SimulationSession` sin red: reset reproducible con semilla, comandos cambian el estado.
  - REST: lista de runs, 404 en run inexistente, path traversal rechazado.
  - WS: conectar, recibir un `state`, enviar comando inválido → `error` sin desconexión.

## 8. Ejecución

```bash
.venv/bin/uvicorn backend.main:app --reload --port 8000
```
Dependencias nuevas → `backend/requirements.txt` (las de RL van en `training/requirements.txt`; las de desarrollo en el `requirements.txt` raíz).
