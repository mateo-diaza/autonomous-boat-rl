"""App FastAPI: REST de runs + WebSocket de simulación.

Arranque local: .venv/bin/uvicorn backend.main:app --reload --port 8000
Despliegue: deploy/README.md (demo en la wifi o Render + Vercel).
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from backend.config import CORS_ORIGINS
from backend.routes import compare, problems, runs, sim

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Q-Captain: Learning the Ropes", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET"], allow_headers=["*"])
app.include_router(runs.router)
app.include_router(problems.router)
app.include_router(sim.router)
app.include_router(compare.router)


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse("/docs")


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
