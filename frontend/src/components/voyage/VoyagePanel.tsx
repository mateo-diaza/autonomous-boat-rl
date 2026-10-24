import { Sailboat } from "lucide-react";

import { Widget } from "@/components/dashboard/Widget";
import type { EpisodeLogEntry } from "@/hooks/useSimulation";
import { EPISODE_OUTCOMES } from "@/lib/episodes";
import { formatReturn } from "@/lib/format";
import type { SimState } from "@/lib/types";
import { cn } from "@/lib/utils";

const VISIBLE_LOG_ENTRIES = 4;

type VoyagePanelProps = {
  sim: SimState | null;
  episodes: EpisodeLogEntry[];
};

/** Métricas de la travesía en curso y bitácora de las últimas. */
export function VoyagePanel({ sim, episodes }: VoyagePanelProps) {
  const distance = sim ? Math.hypot(sim.goal.x - sim.boat.x, sim.goal.y - sim.boat.y) : null;
  const last = episodes[0];
  const arrivals = episodes.filter((e) => e.event === "goal").length;

  return (
    <Widget title="Travesía" icon={<Sailboat />}>
      <dl className="grid grid-cols-3 gap-2">
        <Metric label="Paso" value={sim ? String(sim.step) : "—"} />
        <Metric label="Retorno" value={sim ? formatReturn(sim.episode_return) : "—"} />
        <Metric label="A la boya" value={distance === null ? "—" : `${distance.toFixed(0)} u`} />
      </dl>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <h3 className="font-sans text-sm font-semibold">Bitácora</h3>
        {episodes.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {arrivals} de {episodes.length} arribadas
          </p>
        )}
      </div>

      {episodes.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Las travesías terminadas aparecerán aquí.</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-1.5">
          {episodes.slice(0, VISIBLE_LOG_ENTRIES).map((episode) => {
            const outcome = EPISODE_OUTCOMES[episode.event];
            const Icon = outcome.icon;
            return (
              <li key={episode.id} className={cn("flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm", outcome.bgClass)}>
                <Icon aria-hidden="true" className={cn("size-4 shrink-0", outcome.textClass)} />
                <span className="font-semibold">{outcome.label}</span>
                <span className="ml-auto font-mono tabular-nums text-muted-foreground">
                  {episode.steps} pasos · {formatReturn(episode.episode_return)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {/* Anuncio para lectores de pantalla: solo el último final, no cada paso */}
      <p className="sr-only" aria-live="polite">
        {last ? EPISODE_OUTCOMES[last.event].describe(last.steps) : ""}
      </p>
    </Widget>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xl tabular-nums">{value}</dd>
    </div>
  );
}
