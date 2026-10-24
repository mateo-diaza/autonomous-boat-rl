"""Punto de entrada del Space de Hugging Face (SDK Gradio, gratuito).

El SDK Gradio solo ejecuta `python app.py` y publica el puerto 7860: no se usa Gradio,
se arranca directamente el backend FastAPI (API REST + WebSockets de la simulación).
"""

import os

# Una simulación por visitante: un hilo de PyTorch por inferencia evita que compitan por las CPU
os.environ.setdefault("OMP_NUM_THREADS", "1")

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=7860, proxy_headers=True, forwarded_allow_ips="*")
