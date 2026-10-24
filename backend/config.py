"""Configuración del servidor: rutas y parámetros de la simulación en vivo."""

from __future__ import annotations

import os
import re
from pathlib import Path

from training.paths import MODELS_DIR

# Webs que pueden usar la API y los WebSockets. En producción: CORS_ORIGINS="https://mi-app.vercel.app"
# (varias separadas por comas; sin barra final, tal como el navegador envía la cabecera Origin).
_LOCAL_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
CORS_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", _LOCAL_ORIGINS).split(",") if o.strip()]

# Demo en la wifi (ALLOW_LAN_ORIGINS=1, lo activa `pnpm demo:lan`): cualquier web servida desde una IP privada
# o un nombre .local, se abra con la IP que se abra. Nunca en un despliegue público.
LAN_ORIGIN_REGEX = (
    r"http://(localhost|127\.0\.0\.1|[\w-]+\.local|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}"
    r"|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d+)?"
)
CORS_ORIGIN_REGEX = LAN_ORIGIN_REGEX if os.environ.get("ALLOW_LAN_ORIGINS") == "1" else None


def origin_allowed(origin: str) -> bool:
    """La misma regla que el middleware CORS, para validar a mano el Origin de los WebSockets."""
    if origin in CORS_ORIGINS:
        return True
    return CORS_ORIGIN_REGEX is not None and re.fullmatch(CORS_ORIGIN_REGEX, origin) is not None


SIM_HZ = 30                       # mensajes de estado por segundo hacia el cliente
DEFAULT_SPEED = 30.0              # pasos de simulación por segundo (1 paso = 0.1 s simulados)
SPEED_LIMITS = (1.0, 240.0)
END_PAUSE_S = 1.2                 # pausa tras terminar un episodio antes del siguiente


def get_models_dir() -> Path:
    """Dependencia de FastAPI: los tests la sustituyen por un directorio temporal."""
    return MODELS_DIR
