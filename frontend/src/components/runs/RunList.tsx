"use client";

import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRuns } from "@/hooks/useRuns";
import { formatPercent, formatSteps } from "@/lib/format";

/** Travesías (runs) entrenadas disponibles en el backend. */
export function RunList() {
  const { state, retry } = useRuns();

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando entrenamientos">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full bg-border/40" />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="flex flex-col gap-3 border-l-[3px] border-danger bg-danger/5 p-3 text-sm">
        <p>{state.message}</p>
        <Button variant="outline" size="sm" onClick={retry} className="self-start border-input">
          <RotateCw aria-hidden="true" />
          Reintentar
        </Button>
      </div>
    );
  }

  if (state.runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no hay travesías registradas. Entrena un modelo con{" "}
        <code className="font-mono text-foreground">python -m scripts.train</code>.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {state.runs.map((run) => (
        <li key={run.id} className="flex items-baseline justify-between gap-4 py-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm">{run.id}</p>
            <p className="text-xs text-muted-foreground">
              {run.algo.toUpperCase()} · {run.obstacles} rocas · {formatSteps(run.total_steps)} pasos ·{" "}
              {run.n_checkpoints} checkpoints
            </p>
          </div>
          <p className="shrink-0 font-mono text-sm tabular-nums" title="Mejor tasa de arribada en evaluación">
            {formatPercent(run.best_success_rate)}
          </p>
        </li>
      ))}
    </ul>
  );
}
