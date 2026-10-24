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
from training.problems import DEFAULT_PROBLEM, PROBLEMS, model_display_name, run_env_kwargs, sensor_kwargs, sensor_names

_STEPS_RE = re.compile(r"_(\d+)_steps\.zip$")
_RUN_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


class RunNotFoundError(LookupError):
    pass


class CheckpointNotFoundError(LookupError):
    pass


def list_runs(models_dir: Path) -> list[RunSummary]:
    """Runs con config.json, en el orden del catálogo de problemas (y sin sensores antes que con sensores).

    Así cada pareja comparable queda junta en la web ("Corrientes" / "Corrientes + sensor"). Dentro de un
    mismo grupo, el más reciente primero. Cada grupo lleva un número en ese orden ("4 · Corrientes + sensor").
    """
    if not models_dir.is_dir():
        return []
    run_dirs = [d for d in models_dir.iterdir() if (d / "config.json").is_file() and _RUN_ID_RE.match(d.name)]
    run_dirs.sort(key=lambda d: d.stat().st_mtime, reverse=True)
    runs = _unique_labels([_summary(d, _checkpoints(d), _curve(d)) for d in run_dirs])
    problem_order = {problem_id: i for i, problem_id in enumerate(PROBLEMS)}
    runs.sort(key=lambda r: (problem_order.get(r.problem, len(problem_order)), len(r.sensors)))
    return _numbered(runs)


def run_label(models_dir: Path, run_id: str) -> str | None:
    """Nombre numerado de un run tal como aparece en el desplegable (None si no existe)."""
    return next((r.label for r in list_runs(models_dir) if r.id == run_id), None)


def _numbered(runs: list[RunSummary]) -> list[RunSummary]:
    """Antepone el número de grupo: los runs del mismo problema y sensores (semillas) comparten número."""
    numbers: dict[tuple[str, tuple[str, ...]], int] = {}
    for run in runs:
        number = numbers.setdefault((run.problem, tuple(run.sensors)), len(numbers) + 1)
        run.label = f"{number} · {run.label}"
    return runs


def _unique_labels(runs: list[RunSummary]) -> list[RunSummary]:
    """Si dos runs se llaman igual ("Corrientes"), el más antiguo pasa a "Corrientes (2)"."""
    seen: dict[str, int] = {}
    for run in runs:
        seen[run.label] = seen.get(run.label, 0) + 1
        if seen[run.label] > 1:
            run.label = f"{run.label} ({seen[run.label]})"
    return runs


def get_run(models_dir: Path, run_id: str) -> RunDetail:
    run_dir = _run_dir(models_dir, run_id)
    checkpoints, curve = _checkpoints(run_dir), _curve(run_dir)
    summary = _summary(run_dir, checkpoints, curve)
    summary.label = run_label(models_dir, run_id) or summary.label  # el mismo nombre numerado que en la lista
    return RunDetail(**summary.model_dump(), checkpoints=checkpoints, curve=curve)


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
    label, subtitle = model_display_name(config)
    rates = [p.success_rate for p in curve if p.success_rate is not None]
    return RunSummary(
        id=run_dir.name,
        algo=config["algo"],
        problem=config.get("problem", DEFAULT_PROBLEM),  # runs antiguos: anteriores al catálogo
        sensors=sensor_names(sensor_kwargs(run_env_kwargs(config))),
        label=label,
        subtitle=subtitle,
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
