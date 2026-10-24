# Despliegue

- **Backend** (FastAPI + WebSockets + modelos) → [Hugging Face Spaces](https://huggingface.co/spaces) con el SDK
  Gradio (el de Docker es de pago). Gratis, 2 CPU y 16 GB de RAM. No se usa Gradio: `app.py` arranca el backend.
- **Frontend** (Next.js) → [Vercel](https://vercel.com).

El backend necesita un proceso siempre encendido (una simulación por visitante a 30 Hz, PyTorch y los
modelos en disco), así que no cabe en plataformas serverless.

## 1. Backend en Hugging Face Spaces

1. Crea un Space **público** en <https://huggingface.co/new-space> con **SDK: Gradio** (plantilla *Blank*) y
   hardware *CPU basic* (gratis). Su URL pública será `https://<usuario>-<space>.hf.space`.
2. Empaqueta código y modelos:

   ```bash
   deploy/build_space.sh
   ```

   Genera `deploy/space/build/` con `app.py`, el backend, el entorno y los modelos que ve la web
   (sin `_archivo/` ni experimentos `exp_*`). La cabecera de `deploy/space/README.md` configura el Space.
3. Súbelo (una vez: `pip install -U huggingface_hub` y `hf auth login` con un token de escritura):

   ```bash
   hf upload <usuario>/<space> deploy/space/build . --repo-type space
   ```

   Los `.zip` de los modelos se suben como ficheros grandes automáticamente. El Space se construye solo
   (unos minutos) y queda en *Running*.
4. En **Settings → Variables and secrets** del Space añade la variable
   `CORS_ORIGINS=https://<tu-app>.vercel.app` (varias separadas por comas, sin barra final).
   Sin ella el backend rechaza las conexiones de la web.
5. Comprueba `https://<usuario>-<space>.hf.space/api/health` → `{"status":"ok"}`.

Para actualizar modelos o código: repite los pasos 2 y 3.

## 2. Frontend en Vercel

1. *Add New → Project* e importa el repositorio de GitHub.
2. **Root Directory**: `frontend` (Vercel detecta Next.js y pnpm).
3. **Environment Variables**: `NEXT_PUBLIC_API_URL=https://<usuario>-<space>.hf.space`
   (sin barra final; los WebSockets pasan solos a `wss://`).
4. *Deploy*. Si cambias la variable después, vuelve a desplegar: se incrusta al compilar.

## Probar el paquete en local

```bash
deploy/build_space.sh
cd deploy/space/build && ../../../.venv/bin/python app.py
```

En plataformas con Docker (Railway, Fly.io, Spaces de pago) se usa el `Dockerfile` del paquete:
`docker build -t bitacora-api deploy/space/build` y `docker run -p 7860:7860 -e CORS_ORIGINS=... bitacora-api`.

Y el frontend apuntando a ella: `NEXT_PUBLIC_API_URL=http://localhost:7860 pnpm --dir frontend dev`.

## A tener en cuenta

- **Arranque en frío**: el Space gratuito se duerme tras 48 h sin visitas y tarda ~1 min en despertar.
  Abre la web unos minutos antes de una demo.
- **Capacidad**: cada pestaña abierta es una simulación en el servidor. Con 2 CPU van bien ~10-20 visitantes
  a la vez; los torneos de la comparativa son lo que más CPU consume.
- **Versiones**: `deploy/space/requirements.txt` fija las versiones con las que se entrenaron los modelos.
  Si actualizas stable-baselines3 o PyTorch en local, actualízalas también ahí.
