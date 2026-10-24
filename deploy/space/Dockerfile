# Backend de la Bitácora para Hugging Face Spaces (SDK Docker).
# Se construye desde la carpeta que genera deploy/build_space.sh, no desde la raíz del repo.
FROM python:3.12-slim

# Spaces ejecuta el contenedor con el usuario 1000
RUN useradd --create-home --uid 1000 user
WORKDIR /home/user/app

# PyTorch solo CPU desde su índice (~200 MB en vez de ~2 GB con CUDA); el resto, de PyPI
RUN pip install --no-cache-dir torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=user backend ./backend
COPY --chown=user training ./training

USER user
# Una simulación por visitante: un hilo de PyTorch por inferencia evita que compitan por las CPU
ENV OMP_NUM_THREADS=1 \
    PYTHONUNBUFFERED=1
EXPOSE 7860
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860", "--proxy-headers", "--forwarded-allow-ips", "*"]
