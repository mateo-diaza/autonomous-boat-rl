from __future__ import annotations

from fastapi import APIRouter

from backend.schemas import ProblemInfo
from training.problems import PROBLEMS

router = APIRouter(prefix="/api/problems", tags=["problems"])


@router.get("", response_model=list[ProblemInfo])
def problems_index() -> list[ProblemInfo]:
    """Catálogo de condiciones del mar (variantes de dificultad), en el orden en que se definieron."""
    return [ProblemInfo(id=p.id, title=p.title, description=p.description) for p in PROBLEMS.values()]
