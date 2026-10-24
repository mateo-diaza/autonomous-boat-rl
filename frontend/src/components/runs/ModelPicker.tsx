"use client";

import { GraduationCap, RotateCw, Trophy } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Widget } from "@/components/dashboard/Widget";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { chronologicalCheckpoints, successAt } from "@/lib/checkpoints";
import { formatPercent } from "@/lib/format";
import { problemTitle } from "@/hooks/useProblems";
import type { ProblemInfo, RunDetail, RunSummary } from "@/lib/types";

type ModelPickerProps = {
  /** Por defecto "Modelo"; en la comparativa, "Barco A" / "Barco B". */
  title?: string;
  icon?: ReactNode;
  /** Controles extra junto al título (p. ej. "Sin azar" por barco). */
  actions?: ReactNode;
  className?: string;
  runs: RunSummary[] | null;
  /** Para mostrar en qué condiciones del mar se entrenó cada run. */
  problems?: ProblemInfo[];
  runsError: string | null;
  onRetryRuns: () => void;
  runId: string | null;
  onRunChange: (runId: string) => void;
  detail: RunDetail | null;
  checkpointId: string | null;
  onCheckpointChange: (checkpointId: string) => void;
};

/** Elegir el "cerebro": qué entrenamiento y en qué momento de su aprendizaje. */
export function ModelPicker(props: ModelPickerProps) {
  const { runs, runsError, onRetryRuns, runId, onRunChange, detail, checkpointId, onCheckpointChange } = props;
  const runLabelId = useId();
  const selectedRun = runs?.find((run) => run.id === runId);

  return (
    <Widget
      title={props.title ?? "Modelo"}
      icon={props.icon ?? <GraduationCap />}
      actions={props.actions}
      className={props.className}
    >
      {runsError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/8 p-3 text-sm">
          <p>{runsError}</p>
          <Button variant="outline" size="sm" onClick={onRetryRuns} className="self-start">
            <RotateCw aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      ) : !runs ? (
        <Skeleton className="h-9 w-full rounded-xl bg-border/40" />
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay travesías registradas. Entrena un modelo con{" "}
          <code className="font-mono text-foreground">python -m training.train</code>.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span id={runLabelId} className="text-sm text-muted-foreground">
              Entrenamiento
            </span>
            <Select value={runId ?? undefined} onValueChange={onRunChange}>
              <SelectTrigger aria-labelledby={runLabelId} className="h-10 w-full rounded-xl bg-card">
                <SelectValue placeholder="Elige un entrenamiento" />
              </SelectTrigger>
              <SelectContent>
                {runs.map((run) => (
                  <SelectItem key={run.id} value={run.id}>
                    <span className="font-mono">{run.id}</span>
                    <span className="text-muted-foreground">
                      {run.algo.toUpperCase()} · {formatPercent(run.best_success_rate)} ·{" "}
                      {problemTitle(props.problems ?? [], run.problem)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRun && (
              <p className="text-xs text-muted-foreground">
                Entrenado en: <span className="text-foreground">{problemTitle(props.problems ?? [], selectedRun.problem)}</span>
              </p>
            )}
          </div>

          {detail ? (
            <CheckpointTimeline detail={detail} checkpointId={checkpointId} onChange={onCheckpointChange} />
          ) : (
            <Skeleton className="h-24 w-full rounded-xl bg-border/40" />
          )}
        </div>
      )}
    </Widget>
  );
}

type CheckpointTimelineProps = {
  detail: RunDetail;
  checkpointId: string | null;
  onChange: (checkpointId: string) => void;
};

/** Línea del tiempo del aprendizaje: se arrastra para ver el modelo en distintos momentos. */
function CheckpointTimeline({ detail, checkpointId, onChange }: CheckpointTimelineProps) {
  const timeline = chronologicalCheckpoints(detail);
  const selectedIndex = timeline.findIndex((c) => c.id === checkpointId);
  // Mientras se arrastra solo se previsualiza la etiqueta; el modelo se carga al soltar
  const [preview, setPreview] = useState<number | null>(null);
  const shownIndex = preview ?? (selectedIndex >= 0 ? selectedIndex : timeline.length - 1);
  const isBest = checkpointId === "best";
  const shown = isBest && preview === null ? detail.checkpoints.find((c) => c.id === "best") : timeline[shownIndex];
  const success = shown ? successAt(detail, shown) : null;
  const hasBest = detail.checkpoints.some((c) => c.id === "best");

  if (timeline.length === 0) return <p className="text-sm text-muted-foreground">Este run no tiene checkpoints.</p>;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-secondary p-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Momento del aprendizaje</p>
          <p className="font-heading text-2xl font-semibold">{shown?.label ?? "—"}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Éxito en evaluación</p>
          <p className="font-mono text-2xl tabular-nums">{formatPercent(success)}</p>
        </div>
      </div>

      <Slider
        min={0}
        max={timeline.length - 1}
        step={1}
        value={[shownIndex]}
        thumbLabel="Checkpoint del modelo"
        valueText={shown?.label}
        onValueChange={([index]) => setPreview(index)}
        onValueCommit={([index]) => {
          setPreview(null);
          onChange(timeline[index].id);
        }}
        className={isBest && preview === null ? "opacity-60" : undefined}
      />
      <div className="flex justify-between font-mono text-xs text-muted-foreground" aria-hidden="true">
        <span>{timeline[0].label}</span>
        <span>{timeline.at(-1)?.label}</span>
      </div>

      {hasBest && (
        <Toggle
          pressed={isBest}
          onPressedChange={(pressed) => pressed && onChange("best")}
          variant="outline"
          size="sm"
          className="self-start rounded-full px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <Trophy aria-hidden="true" />
          Mejor evaluación
        </Toggle>
      )}
    </div>
  );
}
