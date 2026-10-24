"use client";

import { useCallback, useState } from "react";

import { useRunDetail } from "@/hooks/useRunDetail";
import { defaultCheckpointId } from "@/lib/checkpoints";
import type { RunDetail, RunSummary } from "@/lib/types";

type Options = {
  /** Qué run elegir por defecto (índice en la lista, recortado al último). */
  preferredRunIndex?: number;
  /** Checkpoint por defecto al elegir un run; por defecto, el mejor evaluado. */
  pickDefault?: (detail: RunDetail) => string | null;
};

/**
 * Un "cerebro" elegido: run + checkpoint. Lo que el usuario no ha elegido se deriva de los valores
 * por defecto (sin efectos), y elegir otro run descarta el checkpoint del anterior.
 */
export function useModelSelection(runs: RunSummary[] | null, { preferredRunIndex = 0, pickDefault }: Options = {}) {
  const [chosenRunId, setChosenRunId] = useState<string | null>(null);
  const fallbackRun = runs && runs.length > 0 ? runs[Math.min(preferredRunIndex, runs.length - 1)] : null;
  const runId = chosenRunId ?? fallbackRun?.id ?? null;
  const { detail } = useRunDetail(runId);

  const [chosenCheckpoint, setChosenCheckpoint] = useState<{ runId: string; id: string } | null>(null);
  const checkpointId =
    chosenCheckpoint && chosenCheckpoint.runId === runId
      ? chosenCheckpoint.id
      : detail
        ? (pickDefault ?? defaultCheckpointId)(detail)
        : null;

  const selectCheckpoint = useCallback((id: string) => runId && setChosenCheckpoint({ runId, id }), [runId]);

  return { runId, selectRun: setChosenRunId, detail, checkpointId, selectCheckpoint };
}
