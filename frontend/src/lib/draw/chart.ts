/**
 * Pintado de la carta náutica en canvas. Funciones puras: reciben el contexto y lo que hay que pintar.
 * Se trabaja en coordenadas del mundo (0..size); `px` convierte píxeles CSS a unidades del mundo.
 */

import type { ChartTheme } from "@/lib/draw/theme";
import type { Point } from "@/lib/sim/frameStore";
import type { Boat, Circle, Ray, WorldInfo } from "@/lib/types";

const GRID_STEP = 10;
const NEAR_RAY_FRACTION = 0.4;
const PULSE_PERIOD_MS = 1800;

/** Elemento que el usuario está arrastrando: se pinta en la posición del puntero. */
export type DragPreview =
  | { kind: "goal"; x: number; y: number }
  | { kind: "obstacle"; index: number; x: number; y: number };

export type ChartScene = {
  world: WorldInfo;
  boat: Boat | null;
  goal: Circle | null;
  obstacles: Circle[];
  /** Rayos con ángulo RELATIVO al rumbo del barco (ver relativeRays). */
  rays: Ray[];
  trail: Point[];
  showRays: boolean;
  drag: DragPreview | null;
  time: number;
  reducedMotion: boolean;
};

export function drawChart(
  ctx: CanvasRenderingContext2D,
  cssSize: number,
  dpr: number,
  theme: ChartTheme,
  scene: ChartScene,
): void {
  const scale = cssSize / scene.world.size;
  const px = 1 / scale; // 1 píxel CSS en unidades del mundo
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  drawWater(ctx, scene.world.size, px, theme);
  drawCompass(ctx, scene.world.size, px, theme);
  drawTrail(ctx, scene.trail, px, theme);
  if (scene.goal) drawGoal(ctx, withDrag(scene.goal, scene.drag, "goal"), px, theme, scene);
  drawObstacles(ctx, scene.obstacles, scene.drag, px, theme);
  if (scene.showRays && scene.boat) drawRays(ctx, scene.boat, scene.rays, scene.world.ray_range, px, theme);
  if (scene.boat) drawBoat(ctx, scene.boat, px, theme);
}

function drawWater(ctx: CanvasRenderingContext2D, size: number, px: number, theme: ChartTheme) {
  ctx.fillStyle = theme.water;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = px;
  ctx.beginPath();
  for (let v = GRID_STEP; v < size; v += GRID_STEP) {
    ctx.moveTo(v, 0);
    ctx.lineTo(v, size);
    ctx.moveTo(0, v);
    ctx.lineTo(size, v);
  }
  ctx.stroke();

  // Coordenadas en el margen, como la graticule de una carta
  ctx.fillStyle = theme.muted;
  ctx.globalAlpha = 0.75;
  ctx.font = `${10 * px}px ${theme.monoFont}`;
  ctx.textBaseline = "top";
  for (let v = 2 * GRID_STEP; v < size; v += 2 * GRID_STEP) {
    ctx.fillText(String(v), v + 3 * px, 3 * px);
    ctx.fillText(String(v), 3 * px, v + 3 * px);
  }
  ctx.globalAlpha = 1;
}

function drawCompass(ctx: CanvasRenderingContext2D, size: number, px: number, theme: ChartTheme) {
  const r = 5.5;
  const cx = size - r - 4;
  const cy = size - r - 4;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = px;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  // Estrella de 4 puntas
  ctx.fillStyle = theme.ink;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const radius = i % 2 === 0 ? r * 0.95 : r * 0.22;
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.8;
  ctx.font = `600 ${11 * px}px ${theme.monoFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("N", 0, -r - 1.5 * px);
  ctx.restore();
}

function drawTrail(ctx: CanvasRenderingContext2D, trail: Point[], px: number, theme: ChartTheme) {
  if (trail.length < 2) return;
  ctx.save();
  ctx.strokeStyle = theme.ink;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5 * px;
  ctx.setLineDash([4 * px, 4 * px]);
  ctx.beginPath();
  ctx.moveTo(trail[0].x, trail[0].y);
  for (const p of trail) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
}

function drawGoal(ctx: CanvasRenderingContext2D, goal: Circle, px: number, theme: ChartTheme, scene: ChartScene) {
  ctx.save();
  if (!scene.reducedMotion) {
    const phase = (scene.time % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
    ctx.globalAlpha = 0.5 * (1 - phase);
    ctx.strokeStyle = theme.goal;
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, goal.radius * (1 + 0.6 * phase), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = theme.goal;
  ctx.beginPath();
  ctx.arc(goal.x, goal.y, goal.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.goal;
  ctx.lineWidth = 2 * px;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(goal.x, goal.y, goal.radius * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawObstacles(
  ctx: CanvasRenderingContext2D,
  obstacles: Circle[],
  drag: DragPreview | null,
  px: number,
  theme: ChartTheme,
) {
  obstacles.forEach((rock, index) => {
    const dragged = drag?.kind === "obstacle" && drag.index === index;
    if (dragged) {
      drawRock(ctx, rock, px, theme, 0.3);
      drawRock(ctx, { ...rock, x: drag.x, y: drag.y }, px, theme, 0.85);
    } else {
      drawRock(ctx, rock, px, theme, 1);
    }
  });
}

function drawRock(ctx: CanvasRenderingContext2D, rock: Circle, px: number, theme: ChartTheme, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = theme.rock;
  ctx.strokeStyle = theme.rockStroke;
  ctx.lineWidth = 2 * px;
  ctx.beginPath();
  ctx.arc(rock.x, rock.y, rock.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Cruz interior: símbolo cartográfico de roca
  const arm = rock.radius * 0.32;
  ctx.globalAlpha = alpha * 0.6;
  ctx.lineWidth = 1.25 * px;
  ctx.beginPath();
  ctx.moveTo(rock.x - arm, rock.y);
  ctx.lineTo(rock.x + arm, rock.y);
  ctx.moveTo(rock.x, rock.y - arm);
  ctx.lineTo(rock.x, rock.y + arm);
  ctx.stroke();
  ctx.restore();
}

function drawRays(
  ctx: CanvasRenderingContext2D,
  boat: Boat,
  rays: Ray[],
  rayRange: number,
  px: number,
  theme: ChartTheme,
) {
  ctx.save();
  for (const ray of rays) {
    // Ángulo relativo al rumbo: así los rayos giran con el barco interpolado
    const angle = boat.heading + ray.angle;
    const endX = boat.x + Math.cos(angle) * ray.distance;
    const endY = boat.y + Math.sin(angle) * ray.distance;
    const near = ray.distance < rayRange * NEAR_RAY_FRACTION;
    ctx.strokeStyle = near ? theme.danger : theme.ink;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.globalAlpha = near ? 0.9 : 0.3;
    ctx.lineWidth = (near ? 2 : 1) * px;
    ctx.beginPath();
    ctx.moveTo(boat.x, boat.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    if (ray.distance < rayRange - 1e-3) {
      ctx.beginPath();
      ctx.arc(endX, endY, (near ? 3 : 2) * px, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBoat(ctx: CanvasRenderingContext2D, boat: Boat, px: number, theme: ChartTheme) {
  const r = boat.radius;
  const hull: [number, number][] = [
    [2.2 * r, 0],
    [0.7 * r, 0.95 * r],
    [-1.3 * r, 0.8 * r],
    [-1.3 * r, -0.8 * r],
    [0.7 * r, -0.95 * r],
  ];
  ctx.save();
  ctx.translate(boat.x, boat.y);
  ctx.rotate(boat.heading);
  ctx.fillStyle = theme.boat;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 1.5 * px;
  ctx.beginPath();
  hull.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function withDrag(goal: Circle, drag: DragPreview | null, kind: "goal"): Circle {
  return drag?.kind === kind ? { ...goal, x: drag.x, y: drag.y } : goal;
}

/** El servidor manda ángulos absolutos; relativos al rumbo siguen al barco interpolado sin desfase. */
export function relativeRays(rays: Ray[], heading: number): Ray[] {
  return rays.map((ray) => ({ ...ray, angle: ray.angle - heading }));
}
