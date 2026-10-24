"""WebSocket de simulación en vivo: una SimulationSession por conexión."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from server.config import get_models_dir
from server.routes._ws import WORLD, Connection, accept_local, first_error, load_checkpoint, run_loop
from server.schemas import ErrorMsg, HelloMsg, LoadModelCmd, command_adapter
from server.simulation import SimulationSession

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/sim")
async def sim_ws(ws: WebSocket, models_dir: Annotated[Path, Depends(get_models_dir)]) -> None:
    if not await accept_local(ws):
        return
    conn = Connection(ws)
    session = SimulationSession()
    await conn.send(HelloMsg(world=WORLD))
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(_receive_commands(conn, session, models_dir))
            tg.create_task(run_loop(conn, session))
    except* WebSocketDisconnect:
        log.info("Cliente desconectado")


async def _receive_commands(conn: Connection, session: SimulationSession, models_dir: Path) -> None:
    while True:
        raw = await conn.ws.receive_text()
        try:
            cmd = command_adapter.validate_json(raw)
            if isinstance(cmd, LoadModelCmd):
                session.set_model(*await load_checkpoint(models_dir, cmd.run_id, cmd.checkpoint_id))
            else:
                session.apply(cmd)
        except ValidationError as e:
            await conn.send(ErrorMsg(message=f"Comando no válido: {first_error(e)}"))
        except (LookupError, ValueError) as e:
            await conn.send(ErrorMsg(message=str(e)))
