"""WebSocket de la comparativa: dos modelos en el mismo escenario + marcador + torneo rápido."""

from __future__ import annotations

import asyncio
import logging
import secrets
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from backend.comparison import ComparisonSession, run_tournament
from backend.config import get_models_dir
from backend.routes._ws import WORLD, Connection, accept_local, first_error, load_checkpoint, run_loop
from backend.schemas import (
    CompareLoadModelCmd,
    ErrorMsg,
    HelloMsg,
    RunTournamentCmd,
    TournamentMsg,
    TournamentResult,
    compare_command_adapter,
)

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/compare")
async def compare_ws(ws: WebSocket, models_dir: Annotated[Path, Depends(get_models_dir)]) -> None:
    if not await accept_local(ws):
        return
    conn = Connection(ws)
    session = ComparisonSession()
    await conn.send(HelloMsg(world=WORLD))
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(_receive_commands(conn, session, models_dir, tg))
            tg.create_task(run_loop(conn, session))
    except* WebSocketDisconnect:
        log.info("Cliente de la comparativa desconectado")


async def _receive_commands(
    conn: Connection, session: ComparisonSession, models_dir: Path, tg: asyncio.TaskGroup
) -> None:
    while True:
        raw = await conn.ws.receive_text()
        try:
            cmd = compare_command_adapter.validate_json(raw)
            if isinstance(cmd, CompareLoadModelCmd):
                session.set_model(cmd.lane, *await load_checkpoint(models_dir, cmd.run_id, cmd.checkpoint_id))
            elif isinstance(cmd, RunTournamentCmd):
                if session.tournament_running:
                    raise ValueError("Ya hay un torneo en marcha: espera a que termine.")
                # En segundo plano: la regata en vivo y los demás comandos siguen funcionando
                tg.create_task(_tournament(conn, session, cmd.episodes))
            else:
                session.apply(cmd)
        except ValidationError as e:
            await conn.send(ErrorMsg(message=f"Comando no válido: {first_error(e)}"))
        except (LookupError, ValueError) as e:
            await conn.send(ErrorMsg(message=str(e)))


async def _tournament(conn: Connection, session: ComparisonSession, episodes: int) -> None:
    session.tournament_running = True
    session.mark_dirty()
    seed = secrets.randbelow(2**31 - episodes)
    models, refs = session.tournament_models(), session.tournament_refs()
    try:
        scores = await asyncio.to_thread(run_tournament, models, session.n_obstacles, episodes, seed)
        result = TournamentResult(episodes=episodes, seed=seed, scores=scores, models=refs)
        await conn.send(TournamentMsg(result=result))
    finally:
        session.tournament_running = False
        session.mark_dirty()
