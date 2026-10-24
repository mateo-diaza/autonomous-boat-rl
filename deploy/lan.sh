#!/usr/bin/env bash
# Demo en la red local: backend y web compilada escuchando en todas las interfaces, para que
# cualquiera en la misma wifi abra http://<ip-del-portátil>:3000. Uso: pnpm demo:lan
# (para antes `pnpm dev`: comparten frontend/.next y los puertos 3000 y 8000).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
IP="${LAN_IP:-$(hostname -I | awk '{print $1}')}"
URL="http://$IP:3000"

# Web optimizada (más ligera que el modo dev con muchos visitantes). Sin NEXT_PUBLIC_API_URL,
# cada navegador busca el backend en la misma IP que la web, puerto 8000.
pnpm --dir frontend build

echo
echo "  Demo en la wifi: $URL"
command -v qrencode >/dev/null && qrencode -t ansiutf8 "$URL"
echo

export CORS_ORIGINS="$URL,http://localhost:3000,http://127.0.0.1:3000"
exec pnpm exec concurrently --kill-others -n api,web -c blue,magenta \
  ".venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000" \
  "pnpm --dir frontend start --hostname 0.0.0.0 --port 3000"
