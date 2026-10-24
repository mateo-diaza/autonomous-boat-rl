"""WebSocket de simulación en vivo: una SimulationSession por conexión."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, ValidationError

from server.config import CORS_ORIGINS, SIM_HZ, SPEED_LIMITS, get_models_dir
from server.models_cache import load_model
from server.runs import checkpoint_path, read_config
from server.schemas import ErrorMsg, HelloMsg, LoadModelCmd, ModelRef, WorldInfo, command_adapter
from server.simulation import SimulationSession
from src.boat_env import DT, EDIT_RADIUS_LIMITS, MAX_STEPS, N_RAYS, RAY_RANGE, WORLD_SIZE

log = logging.getLogger(__name__)
router = APIRouter()

WORLD = WorldInfo(
    size=WORLD_SIZE, ray_range=RAY_RANGE, n_rays=N_RAYS, dt=DT, max_steps=MAX_STEPS,
    obstacle_radius_limits=EDIT_RADIUS_LIMITS, speed_limits=SPEED_LIMITS, sim_hz=SIM_HZ,
)


class _Connection:
    """Envoltorio que serializa los envíos: dos tareas escriben en el mismo socket."""

    def __init__(self, ws: WebSocket):
        self.ws = ws
        self._lock = asyncio.Lock()

    async def send(self, msg: BaseModel) -> None:
        async with self._lock:
            await self.ws.send_text(msg.model_dump_json())


@router.websocket("/ws/sim")
async def sim_ws(ws: WebSocket, models_dir: Annotated[Path, Depends(get_models_dir)]) -> None:
    # CORS no protege los WebSockets: se valida el origen a mano (sin Origin = cliente no navegador)
    origin = ws.headers.get("origin")
    if origin is not None and origin not in CORS_ORIGINS:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await ws.accept()
    conn = _Connection(ws)
    session = SimulationSession()
    await conn.send(HelloMsg(world=WORLD))
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(_receive_commands(conn, session, models_dir))
            tg.create_task(_run_loop(conn, session))
    except* WebSocketDisconnect:
        log.info("Cliente desconectado")


async def _receive_commands(conn: _Connection, session: SimulationSession, models_dir: Path) -> None:
    while True:
        raw = await conn.ws.receive_text()
        try:
            cmd = command_adapter.validate_json(raw)
            if isinstance(cmd, LoadModelCmd):
                await _load_model(cmd, session, models_dir)
            else:
                session.apply(cmd)
        except ValidationError as e:
            await conn.send(ErrorMsg(message=f"Comando no válido: {_first_error(e)}"))
        except (LookupError, ValueError) as e:
            await conn.send(ErrorMsg(message=str(e)))


async def _load_model(cmd: LoadModelCmd, session: SimulationSession, models_dir: Path) -> None:
    path = checkpoint_path(models_dir, cmd.run_id, cmd.checkpoint_id)
    algo = read_config(models_dir, cmd.run_id)["algo"]
    # Cargar de disco tarda ~100 ms: fuera del event loop para no congelar la simulación
    model = await asyncio.to_thread(load_model, path, algo)
    session.set_model(model, ModelRef(run_id=cmd.run_id, checkpoint_id=cmd.checkpoint_id, algo=algo))


async def _run_loop(conn: _Connection, session: SimulationSession) -> None:
    loop = asyncio.get_running_loop()
    period = 1.0 / SIM_HZ
    next_tick = loop.time()
    while True:
        for msg in session.tick(loop.time()):
            await conn.send(msg)
        next_tick += period
        delay = next_tick - loop.time()
        if delay < 0:  # vamos tarde: no intentar recuperar ticks perdidos
            next_tick, delay = loop.time(), 0
        await asyncio.sleep(delay)


def _first_error(e: ValidationError) -> str:
    err = e.errors()[0]
    where = ".".join(str(p) for p in err["loc"])
    return f"{where}: {err['msg']}" if where else err["msg"]
