from __future__ import annotations

from fastapi import APIRouter

from backend.schemas import ProblemInfo
from training.problems import seas

router = APIRouter(prefix="/api/problems", tags=["problems"])


@router.get("", response_model=list[ProblemInfo])
def problems_index() -> list[ProblemInfo]:
    """Condiciones del mar (física distinta), en orden de catálogo. Las variantes que solo cambian la
    recompensa no aparecen: la recompensa solo importa al entrenar, no al navegar con un modelo ya entrenado."""
    return [ProblemInfo(id=p.id, title=p.title, description=p.description) for p in seas()]
