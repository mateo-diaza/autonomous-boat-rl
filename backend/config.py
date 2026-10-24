"""Configuración del servidor: rutas y parámetros de la simulación en vivo."""

from __future__ import annotations

import os
from pathlib import Path

from training.paths import MODELS_DIR

# Webs que pueden usar la API y los WebSockets. En producción: CORS_ORIGINS="https://mi-app.vercel.app"
# (varias separadas por comas; sin barra final, tal como el navegador envía la cabecera Origin).
_LOCAL_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
CORS_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", _LOCAL_ORIGINS).split(",") if o.strip()]

SIM_HZ = 30                       # mensajes de estado por segundo hacia el cliente
DEFAULT_SPEED = 30.0              # pasos de simulación por segundo (1 paso = 0.1 s simulados)
SPEED_LIMITS = (1.0, 240.0)
END_PAUSE_S = 1.2                 # pausa tras terminar un episodio antes del siguiente


def get_models_dir() -> Path:
    """Dependencia de FastAPI: los tests la sustituyen por un directorio temporal."""
    return MODELS_DIR
