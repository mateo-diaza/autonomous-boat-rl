"""Punto de entrada del backend desplegado (Render u otra plataforma que asigne el puerto en $PORT).

Arranca el backend FastAPI (API REST + WebSockets de la simulación) con un solo proceso:
cada visitante tiene su sesión en memoria.
"""

import os

# Una simulación por visitante: un hilo de PyTorch por inferencia evita que compitan por las CPU
os.environ.setdefault("OMP_NUM_THREADS", "1")

import uvicorn  # noqa: E402

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, proxy_headers=True, forwarded_allow_ips="*")
