#!/usr/bin/env bash
# Empaqueta el backend, el entorno y los modelos en deploy/server/build/: una carpeta autónoma
# para su propio repositorio de GitHub, que Render despliega (render.yaml; también vale con Docker).
# Uso: deploy/build_server.sh   (desde cualquier carpeta)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy/server/build"
MODELS="$ROOT/training/models"

# Se conserva .git: la carpeta es un repositorio propio que se actualiza con cada empaquetado
find "$OUT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} + 2>/dev/null || true
mkdir -p "$OUT/training/models"
cp "$ROOT/deploy/server/"{.gitignore,app.py,Dockerfile,README.md,render.yaml,requirements.txt} "$OUT/"
rsync -a --exclude '__pycache__' --exclude 'tests' "$ROOT/backend" "$OUT/"
# Del módulo de entrenamiento solo hace falta el código que importa el backend
cp "$ROOT/training/"{__init__.py,boat_env.py,problems.py,paths.py} "$OUT/training/"

# Modelos: los que ve la web, sin archivados (_*) ni experimentos (exp_*)
for run in "$MODELS"/*/; do
  name="$(basename "$run")"
  [[ "$name" == _* || "$name" == exp_* || ! -f "$run/config.json" ]] && continue
  rsync -a --include 'config.json' --include 'final.zip' --include 'checkpoints/***' --include 'best/***' \
    --include 'eval/***' --exclude '*' "$run" "$OUT/training/models/$name/"
  echo "  modelo: $name"
done

echo "Listo: $OUT ($(du -sh "$OUT" | cut -f1))"
