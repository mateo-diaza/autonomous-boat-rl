"""Reloj de reproducción: convierte tiempo real en pasos de simulación según la velocidad elegida."""

from __future__ import annotations

from backend.config import DEFAULT_SPEED, END_PAUSE_S

MAX_STEPS_PER_TICK = 16      # evita ráfagas si un tick llega tarde
MAX_TICK_ELAPSED_S = 0.25


class Playback:
    def __init__(self) -> None:
        self.playing = False
        self.speed = DEFAULT_SPEED      # pasos de simulación por segundo
        self.auto_reset = True          # al terminar, otro escenario tras una pausa
        self._step_budget = 0.0         # pasos pendientes (fraccionarios)
        self._last_tick: float | None = None
        self._resume_at: float | None = None

    def play(self) -> None:
        self.playing = True
        self._last_tick = None

    def clear(self) -> None:
        """Tras reiniciar el escenario: sin pasos pendientes ni pausa programada."""
        self._step_budget = 0.0
        self._resume_at = None

    def advance(self, now: float) -> int:
        """Pasos a simular en este tick (0 si está en pausa o esperando para continuar)."""
        elapsed = 0.0 if self._last_tick is None else min(now - self._last_tick, MAX_TICK_ELAPSED_S)
        self._last_tick = now
        if not self.playing or self._resume_at is not None:
            return 0
        self._step_budget += elapsed * self.speed
        n_steps = min(int(self._step_budget), MAX_STEPS_PER_TICK)
        self._step_budget = min(self._step_budget - n_steps, 1.0)
        return n_steps

    def episode_ended(self, now: float) -> None:
        self._step_budget = 0.0
        if self.auto_reset:
            self._resume_at = now + END_PAUSE_S
        else:
            self.playing = False

    def should_resume(self, now: float) -> bool:
        """True una sola vez cuando termina la pausa entre travesías."""
        if self._resume_at is not None and now >= self._resume_at:
            self._resume_at = None
            return True
        return False
