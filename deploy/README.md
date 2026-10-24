# Despliegue

Dos formas de enseñar la app:

- **Demo en la wifi** (recomendada para presentar): todo corre en el portátil y cualquiera en la misma
  red abre `http://<ip-del-portátil>:3000`. Toda la CPU del portátil, sin cuentas ni esperas.
- **En internet**: backend en [Render](https://render.com) (gratis, sin tarjeta) y frontend en
  [Vercel](https://vercel.com).

## Demo en la wifi

```bash
pnpm demo:lan
```

Compila la web, arranca backend y web escuchando en la red e imprime la URL (`http://192.168.x.x:3000`).
Para antes `pnpm dev` (comparten puertos y `frontend/.next`). Si el portátil tiene varias redes, fuerza la IP
con `LAN_IP=192.168.1.20 pnpm demo:lan`.

- Sin `NEXT_PUBLIC_API_URL`, cada navegador busca el backend en la misma IP que la web (puerto 8000).
- Si el cortafuegos está activo, abre los puertos 3000 y 8000 (`sudo ufw allow 3000,8000/tcp`).
- Algunas wifis de eventos aíslan a los clientes entre sí: si nadie llega a la URL, comparte datos
  desde el móvil y conecta el portátil y el público a esa red.

## En internet

El backend necesita un proceso siempre encendido (una simulación por visitante a 30 Hz, PyTorch y los
modelos en disco), así que no cabe en plataformas serverless.

### 1. Backend en Render

Los modelos no están en el repositorio principal, así que el backend se despliega desde un repositorio
propio que genera `deploy/build_server.sh` (código + modelos, ~240 MB).

1. Empaqueta (la carpeta es un repo git con su propio historial; cada empaquetado se añade encima):

   ```bash
   deploy/build_server.sh
   cd deploy/server/build && git add -A && git commit -m "Actualiza el backend"
   ```

2. Crea un repositorio vacío en GitHub (por ejemplo `q-captain-api`; puede ser privado) y súbelo:

   ```bash
   cd deploy/server/build
   git remote add origin git@github.com:<usuario>/q-captain-api.git
   git push -u origin main
   ```

3. En Render: *New → Blueprint*, conecta ese repositorio y acepta. `render.yaml` crea el servicio web
   gratuito (`pip install -r requirements.txt`, `python app.py`, Python 3.12).
4. Cuando lo pida, rellena `CORS_ORIGINS=https://<tu-app>.vercel.app` (varias separadas por comas, sin barra
   final). Si aún no tienes la URL de Vercel, ponla después en *Environment* y vuelve a desplegar.
5. Comprueba `https://<servicio>.onrender.com/api/health` → `{"status":"ok"}`.

Para actualizar: repite 1 y `git push` (Render redespliega solo).

### 2. Frontend en Vercel

1. *Add New → Project* e importa el repositorio principal de GitHub.
2. **Root Directory**: `frontend` (Vercel detecta Next.js y pnpm).
3. **Environment Variables**: `NEXT_PUBLIC_API_URL=https://<servicio>.onrender.com`
   (sin barra final; los WebSockets pasan solos a `wss://`).
4. *Deploy*. Si cambias la variable después, vuelve a desplegar: se incrusta al compilar.

### Límites del plan gratuito de Render

- **0,1 CPU compartida y 512 MB**: la simulación va bien con 1-2 visitantes a la vez; los torneos tardan más.
- **Se duerme a los 15 min sin uso** y tarda ~1 min en despertar: la web muestra "reintentando" hasta entonces.
- **5 GB de tráfico al mes**: cada pestaña abierta recibe el estado a 30 Hz (~20 h de simulación vista).

## Probar el paquete en local

```bash
deploy/build_server.sh
cd deploy/server/build && PORT=8000 ../../../.venv/bin/python app.py
```

Con Docker (Railway, Fly.io, Cloud Run...): `docker build -t q-captain-api deploy/server/build` y
`docker run -p 8000:8000 -e CORS_ORIGINS=... q-captain-api`.

`deploy/server/requirements.txt` fija las versiones con las que se entrenaron los modelos. Si actualizas
stable-baselines3 o PyTorch en local, actualízalas también ahí.
