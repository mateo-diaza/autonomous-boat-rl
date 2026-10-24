"""Piezas comunes de los WebSockets de simulación (/ws/sim y /ws/compare)."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Protocol

from fastapi import WebSocket, status
from pydantic import BaseModel, ValidationError
from stable_baselines3.common.base_class import BaseAlgorithm

from backend.config import CORS_ORIGINS, SIM_HZ, SPEED_LIMITS
from backend.models_cache import load_model
from backend.playback import Playback
from backend.runs import checkpoint_path, read_config
from backend.schemas import ErrorMsg, ModelRef, WorldInfo
from training.boat_env import DT, EDIT_RADIUS_LIMITS, MAX_STEPS, N_RAYS, RAY_RANGE, WORLD_SIZE
from training.problems import run_env_kwargs, sensor_kwargs, sensor_names

log = logging.getLogger(__name__)

WORLD = WorldInfo(
    size=WORLD_SIZE, ray_range=RAY_RANGE, n_rays=N_RAYS, dt=DT, max_steps=MAX_STEPS,
    obstacle_radius_limits=EDIT_RADIUS_LIMITS, speed_limits=SPEED_LIMITS, sim_hz=SIM_HZ,
)


class TickingSession(Protocol):
    playback: Playback

    def tick(self, now: float) -> list[BaseModel]: ...


#: Aviso al usuario si algo inesperado falla dentro de la simulación (el detalle técnico va al log)
SIMULATION_ERROR = "Algo ha fallado en la simulación y se ha pausado. Prueba con «Nuevo escenario» o recarga la página."


class Connection:
    """Envoltorio que serializa los envíos: varias tareas escriben en el mismo socket."""

    def __init__(self, ws: WebSocket):
        self.ws = ws
        self._lock = asyncio.Lock()

    async def send(self, msg: BaseModel) -> None:
        async with self._lock:
            await self.ws.send_text(msg.model_dump_json())


async def accept_local(ws: WebSocket) -> bool:
    """CORS no protege los WebSockets: se valida el origen a mano (sin Origin = cliente no navegador)."""
    origin = ws.headers.get("origin")
    if origin is not None and origin not in CORS_ORIGINS:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return False
    await ws.accept()
    return True


async def run_loop(conn: Connection, session: TickingSession) -> None:
    """Llama a session.tick a SIM_HZ y envía lo que devuelva."""
    loop = asyncio.get_running_loop()
    period = 1.0 / SIM_HZ
    next_tick = loop.time()
    while True:
        try:
            messages = session.tick(loop.time())
        except Exception:
            # Un fallo inesperado no debe tumbar la conexión: se registra, se pausa y se avisa
            log.exception("Error en el tick de la simulación")
            session.playback.playing = False
            messages = [ErrorMsg(message=SIMULATION_ERROR)]
        for msg in messages:
            await conn.send(msg)
        next_tick += period
        delay = next_tick - loop.time()
        if delay < 0:  # vamos tarde: no intentar recuperar ticks perdidos
            next_tick, delay = loop.time(), 0
        await asyncio.sleep(delay)


async def load_checkpoint(
    models_dir: Path, run_id: str, checkpoint_id: str
) -> tuple[BaseAlgorithm, ModelRef, dict]:
    """Valida la ruta y carga el modelo fuera del event loop (tarda ~100 ms).

    Devuelve también los sensores con los que se entrenó (el barco debe navegar con ellos).
    """
    path = checkpoint_path(models_dir, run_id, checkpoint_id)
    config = read_config(models_dir, run_id)
    sensors = sensor_kwargs(run_env_kwargs(config))
    model = await asyncio.to_thread(load_model, path, config["algo"])
    ref = ModelRef(run_id=run_id, checkpoint_id=checkpoint_id, algo=config["algo"], sensors=sensor_names(sensors))
    return model, ref, sensors


def first_error(e: ValidationError) -> str:
    err = e.errors()[0]
    where = ".".join(str(p) for p in err["loc"])
    return f"{where}: {err['msg']}" if where else err["msg"]
