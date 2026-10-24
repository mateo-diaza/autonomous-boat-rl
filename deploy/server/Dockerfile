# Alternativa con Docker (Railway, Fly.io, Cloud Run...). Render usa render.yaml sin Docker.
# Se construye desde la carpeta que genera deploy/build_server.sh, no desde la raíz del repo.
FROM python:3.12-slim

RUN useradd --create-home --uid 1000 user
WORKDIR /home/user/app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=user backend ./backend
COPY --chown=user training ./training
COPY --chown=user app.py .

USER user
ENV PYTHONUNBUFFERED=1 PORT=8000
EXPOSE 8000
CMD ["python", "app.py"]
