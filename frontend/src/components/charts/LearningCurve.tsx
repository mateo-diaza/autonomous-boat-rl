"use client";

import { LineChart as LineChartIcon } from "lucide-react";
import type { MouseEvent } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { Widget } from "@/components/dashboard/Widget";
import { Skeleton } from "@/components/ui/skeleton";
import { chronologicalCheckpoints, stepsOfCheckpoint } from "@/lib/checkpoints";
import { formatPercent, formatReturn, formatSteps } from "@/lib/format";
import type { RunDetail } from "@/lib/types";

const GOOD_SUCCESS = 0.9;
const MARGIN = { top: 8, right: 12, bottom: 0, left: 0 };
const Y_AXIS_WIDTH = 52;
const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12, fontFamily: "var(--font-plex-mono)" };

type CurveDatum = { steps: number; success: number | null; reward: number };

type LearningCurveProps = {
  detail: RunDetail | null;
  checkpointId: string | null;
  onSelectCheckpoint: (checkpointId: string) => void;
};

/** Tasa de éxito en evaluación a lo largo del entrenamiento, sincronizada con el checkpoint elegido. */
export function LearningCurve({ detail, checkpointId, onSelectCheckpoint }: LearningCurveProps) {
  return (
    <Widget title="Aprendizaje" icon={<LineChartIcon />} className="flex flex-col">
      {!detail ? (
        <Skeleton className="min-h-44 flex-1 rounded-xl bg-border/40" />
      ) : detail.curve.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este entrenamiento no tiene evaluaciones registradas.</p>
      ) : (
        <CurveBody detail={detail} checkpointId={checkpointId} onSelectCheckpoint={onSelectCheckpoint} />
      )}
    </Widget>
  );
}

function CurveBody({ detail, checkpointId, onSelectCheckpoint }: LearningCurveProps & { detail: RunDetail }) {
  const data: CurveDatum[] = detail.curve.map((p) => ({
    steps: p.steps,
    success: p.success_rate === null ? null : Math.round(p.success_rate * 100),
    reward: p.mean_reward,
  }));
  const selectedSteps = checkpointId ? stepsOfCheckpoint(detail, checkpointId) : null;
  const summary = describeCurve(detail);

  // Clic en la curva -> se carga el checkpoint más cercano a esos pasos.
  // Se calcula con la posición del puntero (no con el tooltip de Recharts, que solo se actualiza al
  // mover el ratón: un toque en pantalla táctil seleccionaría un punto viejo).
  const maxSteps = data.at(-1)?.steps ?? 0;
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const plotLeft = MARGIN.left + Y_AXIS_WIDTH;
    const plotWidth = rect.width - plotLeft - MARGIN.right;
    const fraction = (event.clientX - rect.left - plotLeft) / plotWidth;
    if (fraction < 0 || fraction > 1) return;
    selectNearest(fraction * maxSteps);
  };
  const selectNearest = (target: number) => {
    const numbered = chronologicalCheckpoints(detail).filter((c) => c.steps !== null);
    const nearest = numbered.reduce((best, c) => (Math.abs(c.steps! - target) < Math.abs(best.steps! - target) ? c : best));
    onSelectCheckpoint(nearest.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="text-sm">{summary}</p>
      <div
        className="min-h-28 flex-1 cursor-pointer"
        role="img"
        aria-label={`Curva de aprendizaje. ${summary}`}
        onClick={handleClick}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={MARGIN}
          >
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.7} vertical={false} />
            <XAxis
              dataKey="steps"
              type="number"
              domain={[0, "dataMax"]}
              tickFormatter={formatSteps}
              tick={AXIS_TICK}
              stroke="var(--input)"
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v} %`}
              tick={AXIS_TICK}
              stroke="var(--input)"
              tickLine={false}
              width={Y_AXIS_WIDTH}
            />
            <Tooltip content={CurveTooltip} cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.3 }} />
            <Area
              type="monotone"
              dataKey="success"
              stroke="var(--foreground)"
              strokeWidth={2}
              fill="var(--vermilion)"
              fillOpacity={0.12}
              activeDot={{ r: 5, fill: "var(--vermilion)", stroke: "var(--foreground)" }}
              isAnimationActive={false}
            />
            {selectedSteps !== null && (
              <ReferenceLine x={selectedSteps} stroke="var(--vermilion)" strokeWidth={2} strokeDasharray="5 4" />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Clic en la curva: carga ese momento. Línea discontinua: modelo cargado.
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Ver datos</summary>
        <table className="mt-2 w-full font-mono text-xs tabular-nums">
          <caption className="sr-only">Evaluaciones durante el entrenamiento</caption>
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="font-normal">Pasos</th>
              <th scope="col" className="font-normal">Éxito</th>
              <th scope="col" className="font-normal">Recompensa media</th>
            </tr>
          </thead>
          <tbody>
            {detail.curve.map((p) => (
              <tr key={p.steps}>
                <td>{formatSteps(p.steps)}</td>
                <td>{formatPercent(p.success_rate)}</td>
                <td>{formatReturn(p.mean_reward)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function CurveTooltip({ active, payload }: TooltipContentProps) {
  const datum = payload?.[0]?.payload as CurveDatum | undefined;
  if (!active || !datum) return null;
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-mono">{formatSteps(datum.steps)} pasos</p>
      <p>
        Éxito: <span className="font-mono">{datum.success === null ? "—" : `${datum.success} %`}</span>
      </p>
      <p>
        Recompensa media: <span className="font-mono">{formatReturn(datum.reward)}</span>
      </p>
    </div>
  );
}

/** Frase en lenguaje llano: cuándo se vuelve bueno el agente. */
function describeCurve(detail: RunDetail): string {
  const rated = detail.curve.filter((p) => p.success_rate !== null);
  if (rated.length === 0) return "Sin datos de éxito.";
  const good = rated.find((p) => (p.success_rate ?? 0) >= GOOD_SUCCESS);
  const best = Math.max(...rated.map((p) => p.success_rate ?? 0));
  if (good) return `Supera el ${formatPercent(GOOD_SUCCESS)} de arribadas a los ${formatSteps(good.steps)} pasos.`;
  return `Mejor resultado: ${formatPercent(best)} de arribadas.`;
}
