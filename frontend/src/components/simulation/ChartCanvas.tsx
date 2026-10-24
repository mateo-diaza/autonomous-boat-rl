"use client";

import { useEffect, useRef, type PointerEventHandler, type ReactNode } from "react";

import type { Connection } from "@/hooks/useServerSocket";
import { drawChart, type ChartScene } from "@/lib/draw/chart";
import { readChartTheme } from "@/lib/draw/theme";
import type { WorldInfo } from "@/lib/types";

/** Lo que cada carta decide en cada frame; el resto (mundo, tiempo, movimiento reducido) lo pone ChartCanvas. */
export type SceneContent = Omit<ChartScene, "world" | "time" | "reducedMotion">;

type ChartCanvasProps = {
  world: WorldInfo | null;
  connection: Connection;
  /** Se llama en cada frame (60 fps). Se lee de una ref: puede cambiar sin reiniciar el bucle. */
  buildScene: (now: number) => SceneContent;
  ariaLabel: string;
  onPointerDown?: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove?: PointerEventHandler<HTMLCanvasElement>;
  onPointerUp?: PointerEventHandler<HTMLCanvasElement>;
  onPointerCancel?: PointerEventHandler<HTMLCanvasElement>;
  /** Capas HTML sobre la carta (HUD, avisos). */
  children?: ReactNode;
};

/** Carta cuadrada pintada en canvas a 60 fps, con soporte HiDPI y velo de desconexión. */
export function ChartCanvas({ world, connection, buildScene, ariaLabel, children, ...pointer }: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputsRef = useRef({ world, buildScene });

  useEffect(() => {
    inputsRef.current = { world, buildScene };
  }, [world, buildScene]);

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
      const { world: currentWorld, buildScene: build } = inputsRef.current;
      if (!currentWorld || cssSize === 0) return;
      drawChart(ctx, cssSize, dpr, theme, {
        ...build(performance.now()),
        world: currentWorld,
        time,
        reducedMotion: reducedMotion.matches,
      });
    };
    rafId = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative aspect-square w-full overflow-hidden rounded-[0.875rem] bg-water">
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} className="absolute inset-0 size-full touch-none" {...pointer} />
      {children}
      {connection !== "open" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
          <p className="rounded-full bg-card px-4 py-2 text-sm shadow-sm">
            {connection === "connecting" ? "Conectando con el servidor…" : "Reconectando con el servidor…"}
          </p>
        </div>
      )}
    </div>
  );
}
