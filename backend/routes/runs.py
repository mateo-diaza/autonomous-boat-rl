from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from backend.config import get_models_dir
from backend.runs import RunNotFoundError, get_run, list_runs
from backend.schemas import RunDetail, RunSummary

router = APIRouter(prefix="/api/runs", tags=["runs"])

ModelsDir = Annotated[Path, Depends(get_models_dir)]


@router.get("", response_model=list[RunSummary])
def runs_index(models_dir: ModelsDir) -> list[RunSummary]:
    return list_runs(models_dir)


@router.get("/{run_id}", response_model=RunDetail)
def run_detail(run_id: str, models_dir: ModelsDir) -> RunDetail:
    try:
        return get_run(models_dir, run_id)
    except RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
