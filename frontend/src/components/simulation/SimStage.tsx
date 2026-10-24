"use client";

import { useRef, type PointerEvent } from "react";

import { ChartCanvas, type SceneContent } from "@/components/simulation/ChartCanvas";
import { CurrentBadge } from "@/components/simulation/CurrentBadge";
import { Flash } from "@/components/simulation/Flash";
import type { Connection, EpisodeLogEntry } from "@/hooks/useSimulation";
import { relativeRays, type DragPreview } from "@/lib/draw/chart";
import { hitObstacle, isInside, screenToWorld, type WorldPoint } from "@/lib/draw/geometry";
import { EPISODE_OUTCOMES } from "@/lib/episodes";
import { formatReturn } from "@/lib/format";
import type { FrameStore } from "@/lib/sim/frameStore";
import type { ClientCommand, StateMsg, WorldInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export type MapTool = "move" | "add" | "erase";

/** Margen (unidades del mundo) para acertar a rocas pequeñas con el puntero. */
const HIT_MARGIN = 1.5;
export const NEW_ROCK_RADIUS = 5;

type SimStageProps = {
  className?: string;
  world: WorldInfo | null;
  frames: FrameStore;
  snapshot: StateMsg | null;
  connection: Connection;
  tool: MapTool;
  showRays: boolean;
  modelLabel: string;
  lastEpisode: EpisodeLogEntry | undefined;
  send: (command: ClientCommand) => void;
};

/** La carta de navegación: un barco + HUD + avisos. Toda la edición del mapa con puntero pasa por aquí. */
export function SimStage(props: SimStageProps) {
  const { className, world, frames, snapshot, connection, tool, showRays, modelLabel, lastEpisode, send } = props;
  const dragRef = useRef<DragPreview | null>(null);

  const buildScene = (now: number): SceneContent => {
    const state = frames.current;
    const boat = frames.boatAt(now);
    return {
      boats: [{ boat, trail: frames.trail, tone: "a" }],
      goal: state?.goal ?? null,
      obstacles: state?.obstacles ?? [],
      rays: state ? relativeRays(state.rays, state.boat.heading) : [],
      raysBoat: boat,
      current: state?.current ?? null,
      showRays,
      drag: dragRef.current,
    };
  };

  const toWorld = (event: PointerEvent<HTMLCanvasElement>): WorldPoint | null =>
    world ? screenToWorld(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), world.size) : null;

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = toWorld(event);
    const state = frames.current;
    if (!point || !state) return;
    if (tool === "add") {
      send({ type: "add_obstacle", x: round(point.x), y: round(point.y), radius: NEW_ROCK_RADIUS });
      return;
    }
    const index = hitObstacle(point, state.obstacles, HIT_MARGIN);
    if (tool === "erase") {
      if (index >= 0) send({ type: "remove_obstacle", index });
      return;
    }
    if (isInside(point, state.goal, HIT_MARGIN)) dragRef.current = { kind: "goal", ...point };
    else if (index >= 0) dragRef.current = { kind: "obstacle", index, ...point };
    if (dragRef.current) {
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.style.cursor = "grabbing";
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = toWorld(event);
    const state = frames.current;
    if (!point || !state) return;
    const drag = dragRef.current;
    if (drag) {
      dragRef.current = { ...drag, ...point };
      return;
    }
    event.currentTarget.style.cursor = cursorFor(tool, point, state);
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    event.currentTarget.style.cursor = "";
    if (!drag) return;
    const x = round(drag.x);
    const y = round(drag.y);
    send(drag.kind === "goal" ? { type: "set_goal", x, y } : { type: "move_obstacle", index: drag.index, x, y });
  };

  const sim = snapshot?.sim;
  const description = sim
    ? `Carta de navegación: el barco navega hacia la boya entre ${sim.obstacles.length} rocas.`
    : "Carta de navegación cargando.";
  const outcome = lastEpisode ? EPISODE_OUTCOMES[lastEpisode.event] : null;

  return (
    // flex + justify-center: si el widget no puede ser cuadrado (ancho limitado), la carta queda centrada
    <div className={cn("widget flex flex-col justify-center p-2 sm:p-3", className)}>
      <ChartCanvas
        world={world}
        connection={connection}
        buildScene={buildScene}
        ariaLabel={description}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => (dragRef.current = null)}
      >
        {sim && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2 font-mono text-sm tabular-nums">
            <span className="rounded-full bg-card/90 px-3 py-1 shadow-sm backdrop-blur">
              Paso {sim.step} · Retorno {formatReturn(sim.episode_return)}
            </span>
            <span className="flex flex-col items-end gap-1.5">
              <span className="rounded-full bg-card/90 px-3 py-1 shadow-sm backdrop-blur">{modelLabel}</span>
              <CurrentBadge current={sim.current} />
            </span>
          </div>
        )}
        {lastEpisode && outcome && (
          <Flash key={lastEpisode.id}>
            <p className={cn("flex items-center gap-2", outcome.textClass)}>
              <outcome.icon aria-hidden="true" className="size-6" />
              {outcome.describe(lastEpisode.steps)}
            </p>
          </Flash>
        )}
      </ChartCanvas>
    </div>
  );
}

function cursorFor(tool: MapTool, point: WorldPoint, state: NonNullable<FrameStore["current"]>): string {
  if (tool === "add") return "crosshair";
  const overRock = hitObstacle(point, state.obstacles, HIT_MARGIN) >= 0;
  if (tool === "erase") return overRock ? "pointer" : "default";
  return overRock || isInside(point, state.goal, HIT_MARGIN) ? "grab" : "default";
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
