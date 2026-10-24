"use client";

import { LANE_STYLE, type RaysTarget } from "@/components/compare/lanes";
import { ChartCanvas, type SceneContent } from "@/components/simulation/ChartCanvas";
import { CurrentBadge } from "@/components/simulation/CurrentBadge";
import { Flash } from "@/components/simulation/Flash";
import type { RaceLogEntry } from "@/hooks/useComparison";
import type { Connection } from "@/hooks/useServerSocket";
import { describeModel } from "@/lib/checkpoints";
import { relativeRays } from "@/lib/draw/chart";
import { EPISODE_OUTCOMES } from "@/lib/episodes";
import type { FrameStore } from "@/lib/sim/frameStore";
import { LANE_IDS, type CompareStateMsg, type LaneId, type WorldInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

type CompareStageProps = {
  className?: string;
  world: WorldInfo | null;
  frames: Record<LaneId, FrameStore>;
  snapshot: CompareStateMsg | null;
  connection: Connection;
  rays: RaysTarget;
  lastRace: RaceLogEntry | null;
};

/** La regata: los dos barcos en la misma carta, cada uno con su color, su letra y su estela. */
export function CompareStage({ className, world, frames, snapshot, connection, rays, lastRace }: CompareStageProps) {
  const buildScene = (now: number): SceneContent => {
    const shared = frames.A.current; // los dos barcos navegan el mismo escenario
    const raysLane = rays === "none" ? null : frames[rays];
    const raysBoat = raysLane?.boatAt(now) ?? null;
    return {
      boats: LANE_IDS.map((id) => ({
        boat: frames[id].boatAt(now),
        trail: frames[id].trail,
        tone: LANE_STYLE[id].tone,
        label: id,
      })),
      goal: shared?.goal ?? null,
      obstacles: shared?.obstacles ?? [],
      rays: raysLane?.current ? relativeRays(raysLane.current.rays, raysLane.current.boat.heading) : [],
      raysBoat,
      current: shared?.current ?? null,
      showRays: rays !== "none",
      drag: null,
    };
  };

  const lanes = snapshot?.lanes ?? [];
  const description = lanes.length
    ? `Regata: ${lanes.map((lane) => `barco ${lane.id} (${describeModel(lane.model)})`).join(" contra ")}.`
    : "Regata cargando.";

  return (
    <div className={cn("widget flex flex-col justify-center p-2 sm:p-3", className)}>
      <ChartCanvas
        world={world}
        connection={connection}
        buildScene={buildScene}
        ariaLabel={description}
        touchClassName="touch-auto" // en la comparativa no se edita la carta: el scroll táctil es libre
      >
        {lanes[0] && (
          <div className="pointer-events-none absolute top-3 right-3 font-mono text-sm tabular-nums">
            <CurrentBadge current={lanes[0].sim.current} />
          </div>
        )}
        <ul className="pointer-events-none absolute inset-x-3 top-3 flex flex-col items-start gap-1.5 font-mono text-sm tabular-nums">
          {lanes.map((lane) => (
            <li
              key={lane.id}
              className="flex max-w-full min-w-0 items-center gap-2 rounded-full bg-card/90 px-3 py-1 shadow-sm backdrop-blur"
            >
              <span aria-hidden="true" className={cn("size-2.5 rounded-full", LANE_STYLE[lane.id].dot)} />
              <span className="font-semibold">{lane.id}</span>
              <span className="min-w-0 truncate">{describeModel(lane.model)}</span>
              <span className="shrink-0 text-muted-foreground">· paso {lane.sim.step}</span>
            </li>
          ))}
        </ul>
        {lastRace && (
          <Flash key={lastRace.id}>
            {lastRace.results.map((result) => {
              const outcome = EPISODE_OUTCOMES[result.event];
              return (
                <p key={result.id} className={cn("flex items-center gap-2", outcome.textClass)}>
                  <span className={cn("font-mono not-italic", LANE_STYLE[result.id].text)}>{result.id}</span>
                  <outcome.icon aria-hidden="true" className="size-5" />
                  {outcome.describe(result.steps)}
                </p>
              );
            })}
          </Flash>
        )}
      </ChartCanvas>
    </div>
  );
}
