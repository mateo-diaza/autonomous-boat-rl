#!/usr/bin/env bash
# Empaqueta el backend, el entorno y los modelos en deploy/space/build/, listo para subir a un
# Space de Hugging Face (SDK Docker). Uso: deploy/build_space.sh   (desde cualquier carpeta)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy/space/build"
MODELS="$ROOT/training/models"

rm -rf "$OUT"
mkdir -p "$OUT/training/models"
cp "$ROOT/deploy/space/"{Dockerfile,README.md,requirements.txt} "$OUT/"
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
