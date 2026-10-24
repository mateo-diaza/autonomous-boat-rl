"use client";

import { useEffect, useRef, type PointerEvent } from "react";

import type { Connection, EpisodeLogEntry } from "@/hooks/useSimulation";
import { drawChart, relativeRays, type DragPreview } from "@/lib/draw/chart";
import { hitObstacle, isInside, screenToWorld, type WorldPoint } from "@/lib/draw/geometry";
import { readChartTheme } from "@/lib/draw/theme";
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

/** La carta: canvas a 60 fps + HUD + avisos. Toda la edición del mapa con puntero pasa por aquí. */
export function SimStage(props: SimStageProps) {
  const { world, frames, snapshot, connection, tool, showRays, modelLabel, lastEpisode, send } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragPreview | null>(null);
  const optionsRef = useRef({ world, showRays });

  useEffect(() => {
    optionsRef.current = { world, showRays };
  }, [world, showRays]);

  useChartLoop(canvasRef, containerRef, frames, optionsRef, dragRef);

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

  return (
    <div className="widget relative p-2 sm:p-3">
      <div ref={containerRef} className="relative aspect-square w-full overflow-hidden rounded-[0.875rem] bg-water">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={description}
          className="absolute inset-0 size-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => (dragRef.current = null)}
        />

        {sim && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2 font-mono text-sm tabular-nums">
            <span className="rounded-full bg-card/90 px-3 py-1 shadow-sm backdrop-blur">
              Paso {sim.step} · Retorno {formatReturn(sim.episode_return)}
            </span>
            <span className="rounded-full bg-card/90 px-3 py-1 shadow-sm backdrop-blur">{modelLabel}</span>
          </div>
        )}

        {lastEpisode && <EpisodeFlash key={lastEpisode.id} episode={lastEpisode} />}

        {connection !== "open" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
            <p className="rounded-full bg-card px-4 py-2 text-sm shadow-sm">
              {connection === "connecting" ? "Conectando con el servidor…" : "Reconectando con el servidor…"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Aviso breve y centrado al terminar una travesía (se desvanece solo con CSS). */
function EpisodeFlash({ episode }: { episode: EpisodeLogEntry }) {
  const outcome = EPISODE_OUTCOMES[episode.event];
  const Icon = outcome.icon;
  return (
    <div className="episode-flash pointer-events-none absolute inset-0 flex items-center justify-center">
      <p
        className={cn(
          "flex items-center gap-2 rounded-2xl bg-card/95 px-5 py-3 font-heading text-xl italic shadow-lg",
          outcome.textClass,
        )}
      >
        <Icon aria-hidden="true" className="size-6" />
        {outcome.describe(episode.steps)}
      </p>
    </div>
  );
}

/** Bucle de pintado con requestAnimationFrame, independiente de los renders de React. */
function useChartLoop(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  frames: FrameStore,
  optionsRef: React.RefObject<{ world: WorldInfo | null; showRays: boolean }>,
  dragRef: React.RefObject<DragPreview | null>,
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !container || !ctx) return;

    let theme = readChartTheme();
    let cssSize = 0;
    let dpr = 1;
    const resize = () => {
      cssSize = container.getBoundingClientRect().width;
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssSize * dpr);
      canvas.height = Math.round(cssSize * dpr);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    // Las fuentes web llegan después del primer pintado: se releen los tokens cuando están listas
    void document.fonts.ready.then(() => (theme = readChartTheme()));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let rafId = 0;
    const paint = (time: number) => {
      rafId = requestAnimationFrame(paint);
      const { world, showRays } = optionsRef.current;
      const state = frames.current;
      if (!world || cssSize === 0) return;
      const boat = frames.boatAt(performance.now());
      drawChart(ctx, cssSize, dpr, theme, {
        world,
        boat,
        goal: state?.goal ?? null,
        obstacles: state?.obstacles ?? [],
        rays: state ? relativeRays(state.rays, state.boat.heading) : [],
        trail: frames.trail,
        showRays,
        drag: dragRef.current,
        time,
        reducedMotion: reducedMotion.matches,
      });
    };
    rafId = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [canvasRef, containerRef, frames, optionsRef, dragRef]);
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
