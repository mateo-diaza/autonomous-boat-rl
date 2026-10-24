"""Configuración del servidor: rutas y parámetros de la simulación en vivo."""

from __future__ import annotations

from pathlib import Path

from training.paths import MODELS_DIR

CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]

SIM_HZ = 30                       # mensajes de estado por segundo hacia el cliente
DEFAULT_SPEED = 30.0              # pasos de simulación por segundo (1 paso = 0.1 s simulados)
SPEED_LIMITS = (1.0, 240.0)
END_PAUSE_S = 1.2                 # pausa tras terminar un episodio antes del siguiente
DEFAULT_OBSTACLES: int | tuple[int, int] = (4, 10)


def get_models_dir() -> Path:
    """Dependencia de FastAPI: los tests la sustituyen por un directorio temporal."""
    return MODELS_DIR
