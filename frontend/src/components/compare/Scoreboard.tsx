"use client";

import { Loader2, RotateCcw, Trophy } from "lucide-react";
import { useId } from "react";

import { LANE_STYLE } from "@/components/compare/lanes";
import { Widget } from "@/components/dashboard/Widget";
import { SELECTED } from "@/components/simulation/controls";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { describeModel } from "@/lib/checkpoints";
import { formatPercent, formatReturn } from "@/lib/format";
import { LANE_IDS, type CompareCommand, type LaneScore, type ModelRef, type TournamentResult } from "@/lib/types";
import { cn } from "@/lib/utils";

export const TOURNAMENT_SIZES = [20, 50, 100];

type ScoreboardProps = {
  scores: LaneScore[] | null;
  models: (ModelRef | null)[];
  tournament: TournamentResult | null;
  tournamentRunning: boolean;
  tournamentSize: number;
  onTournamentSizeChange: (size: number) => void;
  enabled: boolean;
  send: (command: CompareCommand) => void;
};

/** Marcador de la regata en vivo + torneo rápido (N escenarios simulados sin animación). */
export function Scoreboard(props: ScoreboardProps) {
  const { scores, models, tournament, tournamentRunning, tournamentSize, onTournamentSizeChange, enabled, send } = props;
  const sizeLabelId = useId();

  return (
    <Widget
      title="Marcador"
      icon={<Trophy />}
      className="!basis-full"
      actions={
        <Button variant="ghost" size="sm" disabled={!enabled} onClick={() => send({ type: "reset_scores" })}>
          <RotateCcw aria-hidden="true" />
          Reiniciar
        </Button>
      }
    >
      {/* Dos columnas según el ancho del propio marcador (no de la ventana): con menos de 48rem, una debajo de otra */}
      <div className="@container">
        <div className="grid gap-x-6 gap-y-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-label="Regatas en vivo" className="flex min-w-0 flex-col gap-2">
            <h3 className="font-sans text-sm font-semibold">En vivo</h3>
            {scores && scores[0].episodes > 0 ? (
              <ScoreTable scores={scores} models={models} caption="Resultados de las regatas en vivo" />
            ) : (
              <p className="text-sm text-muted-foreground">
                Pulsa navegar: cada regata terminada se apunta aquí. Ambos barcos navegan siempre el mismo escenario.
              </p>
            )}
          </section>

          <section aria-label="Torneo rápido" className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-sans text-sm font-semibold">Torneo rápido</h3>
              <div className="flex items-center gap-2">
                <span id={sizeLabelId} className="sr-only">
                  Escenarios del torneo
                </span>
                <ToggleGroup
                  type="single"
                  aria-labelledby={sizeLabelId}
                  value={String(tournamentSize)}
                  onValueChange={(value) => value && onTournamentSizeChange(Number(value))}
                  className="rounded-xl bg-secondary p-1"
                  size="sm"
                >
                  {TOURNAMENT_SIZES.map((size) => (
                    <ToggleGroupItem key={size} value={String(size)} className={`rounded-lg px-2.5 ${SELECTED}`}>
                      {size}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Button
                  size="sm"
                  className="rounded-full px-3"
                  disabled={!enabled || tournamentRunning}
                  aria-keyshortcuts="T"
                  onClick={() => send({ type: "run_tournament", episodes: tournamentSize })}
                >
                  {tournamentRunning ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Trophy aria-hidden="true" />}
                  {tournamentRunning ? "Simulando…" : "Lanzar"}
                </Button>
              </div>
            </div>
            <div aria-live="polite">
              {tournamentRunning ? (
                <p className="text-sm text-muted-foreground">Simulando {tournamentSize} escenarios sin animación…</p>
              ) : tournament ? (
                <>
                  <ScoreTable
                    scores={tournament.scores}
                    models={tournament.models}
                    caption={`Torneo de ${tournament.episodes} escenarios`}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tournament.episodes} escenarios idénticos para ambos · semilla {tournament.seed}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Simula muchos escenarios de golpe para una comparación con más datos que unas pocas regatas.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </Widget>
  );
}

type Row = {
  label: string;
  value: (s: LaneScore) => number | null;
  format: (s: LaneScore) => string;
  better: "higher" | "lower";
};

const ROWS: Row[] = [
  {
    label: "Arribadas",
    value: (s) => (s.episodes ? s.goals / s.episodes : null),
    format: (s) => `${s.goals}/${s.episodes} · ${formatPercent(s.episodes ? s.goals / s.episodes : null)}`,
    better: "higher",
  },
  { label: "Encallados", value: (s) => s.crashes, format: (s) => String(s.crashes), better: "lower" },
  { label: "Sin rumbo", value: (s) => s.timeouts, format: (s) => String(s.timeouts), better: "lower" },
  {
    label: "Pasos hasta la boya",
    value: (s) => s.mean_steps_to_goal,
    format: (s) => (s.mean_steps_to_goal === null ? "—" : s.mean_steps_to_goal.toFixed(0)),
    better: "lower",
  },
  {
    label: "Retorno medio",
    value: (s) => s.mean_return,
    format: (s) => (s.mean_return === null ? "—" : formatReturn(s.mean_return)),
    better: "higher",
  },
];

/**
 * Tabla A vs B; el mejor valor de cada fila va en negrita con ▲ (no solo color).
 * Los nombres de los modelos (pueden ser muy largos) van en una leyenda que hace salto de línea; la tabla usa
 * anchos fijos (`table-fixed`) para que ningún contenido la ensanche y pise a la de al lado.
 */
function ScoreTable({ scores, models, caption }: { scores: LaneScore[]; models: (ModelRef | null)[]; caption: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground" aria-label="Modelos comparados">
        {LANE_IDS.map((id, i) => (
          <li key={id} className="flex items-baseline gap-1.5 [overflow-wrap:anywhere]">
            <span aria-hidden="true" className={cn("size-2 shrink-0 translate-y-[-1px] rounded-full", LANE_STYLE[id].dot)} />
            <span className={cn("shrink-0 font-semibold", LANE_STYLE[id].text)}>{id}</span>
            <span>{describeModel(models[i] ?? null)}</span>
          </li>
        ))}
      </ul>
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-[40%]" />
          <col className="w-[30%]" />
          <col className="w-[30%]" />
        </colgroup>
        <thead>
          <tr className="text-left">
            <th scope="col" className="pb-1 text-xs font-normal text-muted-foreground">
              Métrica
            </th>
            {LANE_IDS.map((id) => (
              <th key={id} scope="col" className="pb-1 font-normal">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn("size-2.5 rounded-full", LANE_STYLE[id].dot)} />
                  <span className={cn("font-semibold", LANE_STYLE[id].text)}>{LANE_STYLE[id].name}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {ROWS.map((row) => {
            const winner = winnerIndex(scores.map(row.value), row.better);
            return (
              <tr key={row.label} className="border-t border-border/50">
                <th scope="row" className="py-1 pr-2 text-left font-sans text-xs font-normal text-muted-foreground">
                  {row.label}
                </th>
                {scores.map((score, i) => (
                  <td key={LANE_IDS[i]} className={cn("py-1 [overflow-wrap:anywhere]", i === winner && "font-semibold")}>
                    {row.format(score)}
                    {i === winner && (
                      <>
                        <span aria-hidden="true"> ▲</span>
                        <span className="sr-only"> (mejor)</span>
                      </>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function winnerIndex(values: (number | null)[], better: Row["better"]): number {
  if (values.some((v) => v === null) || values[0] === values[1]) return -1;
  const [a, b] = values as number[];
  return (better === "higher" ? a > b : a < b) ? 0 : 1;
}
