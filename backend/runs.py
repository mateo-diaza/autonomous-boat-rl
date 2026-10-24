"""Descubre los entrenamientos guardados en training/models/ (solo lectura de disco).

Estructura esperada en training/models/ (la genera training/train.py):
    training/models/<run>/config.json
    training/models/<run>/checkpoints/<algo>_<steps>_steps.zip
    training/models/<run>/final.zip
    training/models/<run>/best/best_model.zip
    training/models/<run>/eval/evaluations.npz
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np

from backend.schemas import CheckpointInfo, CurvePoint, RunDetail, RunSummary
from training.problems import DEFAULT_PROBLEM

_STEPS_RE = re.compile(r"_(\d+)_steps\.zip$")
_RUN_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


class RunNotFoundError(LookupError):
    pass


class CheckpointNotFoundError(LookupError):
    pass


def list_runs(models_dir: Path) -> list[RunSummary]:
    """Runs con config.json, del más reciente al más antiguo."""
    if not models_dir.is_dir():
        return []
    run_dirs = [d for d in models_dir.iterdir() if (d / "config.json").is_file() and _RUN_ID_RE.match(d.name)]
    run_dirs.sort(key=lambda d: d.stat().st_mtime, reverse=True)
    return [_summary(d, _checkpoints(d), _curve(d)) for d in run_dirs]


def get_run(models_dir: Path, run_id: str) -> RunDetail:
    run_dir = _run_dir(models_dir, run_id)
    checkpoints, curve = _checkpoints(run_dir), _curve(run_dir)
    return RunDetail(**_summary(run_dir, checkpoints, curve).model_dump(), checkpoints=checkpoints, curve=curve)


def read_config(models_dir: Path, run_id: str) -> dict:
    return json.loads((_run_dir(models_dir, run_id) / "config.json").read_text())


def checkpoint_path(models_dir: Path, run_id: str, checkpoint_id: str) -> Path:
    """Ruta al .zip de un checkpoint. Los ids vienen del cliente: se valida que no se salga de models/."""
    run_dir = _run_dir(models_dir, run_id)
    if checkpoint_id == "final":
        path = run_dir / "final.zip"
    elif checkpoint_id == "best":
        path = run_dir / "best" / "best_model.zip"
    elif checkpoint_id.isdigit():
        algo = read_config(models_dir, run_id)["algo"]
        path = run_dir / "checkpoints" / f"{algo}_{int(checkpoint_id)}_steps.zip"
    else:
        raise CheckpointNotFoundError(f"Checkpoint no válido: {checkpoint_id!r}")
    if not path.is_file():
        raise CheckpointNotFoundError(f"Checkpoint no encontrado: {run_id}/{checkpoint_id}")
    return path


# --------------------------------------------------------------------- privadas
def _run_dir(models_dir: Path, run_id: str) -> Path:
    run_dir = (models_dir / run_id).resolve()
    if (
        not _RUN_ID_RE.match(run_id)
        or not run_dir.is_relative_to(models_dir.resolve())
        or not (run_dir / "config.json").is_file()
    ):
        raise RunNotFoundError(f"Run no encontrado: {run_id!r}. ¿Lo has entrenado con training/train.py?")
    return run_dir


def _summary(run_dir: Path, checkpoints: list[CheckpointInfo], curve: list[CurvePoint]) -> RunSummary:
    config = json.loads((run_dir / "config.json").read_text())
    rates = [p.success_rate for p in curve if p.success_rate is not None]
    return RunSummary(
        id=run_dir.name,
        algo=config["algo"],
        problem=config.get("problem", DEFAULT_PROBLEM),  # runs antiguos: anteriores al catálogo
        obstacles=str(config["obstacles"]),
        total_steps=int(config["steps"]),
        n_checkpoints=len(checkpoints),
        best_success_rate=max(rates) if rates else None,
    )


def _checkpoints(run_dir: Path) -> list[CheckpointInfo]:
    steps = sorted(
        int(m.group(1)) for f in (run_dir / "checkpoints").glob("*_steps.zip") if (m := _STEPS_RE.search(f.name))
    )
    out = [CheckpointInfo(id=str(s), label=f"{s // 1000}k pasos" if s else "Sin entrenar", steps=s) for s in steps]
    if (run_dir / "final.zip").is_file():
        out.append(CheckpointInfo(id="final", label="Final", steps=None))
    if (run_dir / "best" / "best_model.zip").is_file():
        out.append(CheckpointInfo(id="best", label="Mejor evaluación", steps=None))
    return out


def _curve(run_dir: Path) -> list[CurvePoint]:
    path = run_dir / "eval" / "evaluations.npz"
    if not path.is_file():
        return []
    data = np.load(path)
    rewards = data["results"].mean(axis=1)
    successes = data["successes"].mean(axis=1) if "successes" in data else [None] * len(rewards)
    return [
        CurvePoint(
            steps=int(t),
            mean_reward=round(float(r), 2),
            success_rate=None if s is None else round(float(s), 3),
        )
        for t, r, s in zip(data["timesteps"], rewards, successes, strict=True)
    ]
