"""Dónde viven los artefactos del entrenamiento. Única fuente de verdad (también la usa el backend)."""

from pathlib import Path

TRAINING_DIR = Path(__file__).resolve().parent
MODELS_DIR = TRAINING_DIR / "models"   # un subdirectorio por run (no versionado)
LOGS_DIR = TRAINING_DIR / "logs"       # TensorBoard (no versionado)
