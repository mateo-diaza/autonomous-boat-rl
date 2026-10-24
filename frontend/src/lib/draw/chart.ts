/**
 * Pintado de la carta náutica en canvas. Funciones puras: reciben el contexto y lo que hay que pintar.
 * Se trabaja en coordenadas del mundo (0..size); `px` convierte píxeles CSS a unidades del mundo.
 */

import type { ChartTheme } from "@/lib/draw/theme";
import type { Point } from "@/lib/sim/frameStore";
import type { Boat, Circle, Obstacle, Ray, Vector, WorldInfo } from "@/lib/types";

const GRID_STEP = 10;
const NEAR_RAY_FRACTION = 0.4;
const PULSE_PERIOD_MS = 1800;

/** Elemento que el usuario está arrastrando: se pinta en la posición del puntero. */
export type DragPreview =
  | { kind: "goal"; x: number; y: number }
  | { kind: "obstacle"; index: number; x: number; y: number };

/** Un barco a pintar. `tone` elige el color; `label` (A, B…) lo identifica sin depender del color. */
export type BoatLayer = { boat: Boat | null; trail: Point[]; tone: "a" | "b"; label?: string };

export type ChartScene = {
  world: WorldInfo;
  boats: BoatLayer[];
  goal: Circle | null;
  obstacles: Obstacle[];
  /** Rayos con ángulo RELATIVO al rumbo de `raysBoat` (ver relativeRays). */
  rays: Ray[];
  raysBoat: Boat | null;
  /** Corriente del episodio (u/s); null o (0, 0) = sin corriente. */
  current: Vector | null;
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
  if (scene.current) drawCurrent(ctx, scene.current, scene.world.size, px, theme);
  drawCompass(ctx, scene.world.size, px, theme);
  for (const layer of scene.boats) drawTrail(ctx, layer.trail, px, toneColor(layer.tone, theme));
  if (scene.goal) drawGoal(ctx, withDrag(scene.goal, scene.drag, "goal"), px, theme, scene);
  drawObstacles(ctx, scene.obstacles, scene.drag, px, theme);
  if (scene.showRays && scene.raysBoat) drawRays(ctx, scene.raysBoat, scene.rays, scene.world.ray_range, px, theme);
  for (const layer of scene.boats) {
    if (!layer.boat) continue;
    drawBoat(ctx, layer.boat, px, theme, toneColor(layer.tone, theme));
    // A encima del barco y B debajo: si navegan juntos, las letras no se tapan
    const side = layer.tone === "a" ? -1 : 1;
    if (layer.label) drawBoatLabel(ctx, layer.boat, layer.label, side, px, theme, toneColor(layer.tone, theme));
  }
}

function toneColor(tone: BoatLayer["tone"], theme: ChartTheme): string {
  return tone === "a" ? theme.boat : theme.boatB;
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

const CURRENT_GRID = 20;
const MAX_ARROW = 7; // unidades del mundo para la corriente más fuerte (~8 u/s)

/** Flechas tenues sobre el agua en la dirección de la corriente; su largo indica la fuerza. */
function drawCurrent(ctx: CanvasRenderingContext2D, current: Vector, size: number, px: number, theme: ChartTheme) {
  const speed = Math.hypot(current.x, current.y);
  if (speed < 1e-6) return;
  const ux = current.x / speed;
  const uy = current.y / speed;
  const length = Math.min(speed, 8) / 8 * MAX_ARROW;
  const head = 1.6;
  ctx.save();
  ctx.strokeStyle = theme.boatB;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5 * px;
  ctx.beginPath();
  for (let gx = CURRENT_GRID / 2; gx < size; gx += CURRENT_GRID) {
    for (let gy = CURRENT_GRID / 2; gy < size; gy += CURRENT_GRID) {
      const x0 = gx - (ux * length) / 2;
      const y0 = gy - (uy * length) / 2;
      const x1 = x0 + ux * length;
      const y1 = y0 + uy * length;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      // Punta: dos trazos a ±150° de la dirección
      for (const side of [-1, 1]) {
        const angle = Math.atan2(uy, ux) + side * (5 * Math.PI) / 6;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + Math.cos(angle) * head, y1 + Math.sin(angle) * head);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
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

function drawTrail(ctx: CanvasRenderingContext2D, trail: Point[], px: number, color: string) {
  if (trail.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
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
  obstacles: Obstacle[],
  drag: DragPreview | null,
  px: number,
  theme: ChartTheme,
) {
  obstacles.forEach((rock) => drawWake(ctx, rock, px, theme));
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

const WAKE_SECONDS = 1.2; // largo de la estela: lo que la roca recorre en este tiempo

/** Estela detrás de una roca móvil: indica hacia dónde va y lo rápido que se mueve. */
function drawWake(ctx: CanvasRenderingContext2D, rock: Obstacle, px: number, theme: ChartTheme) {
  const speed = Math.hypot(rock.vx, rock.vy);
  if (speed < 1e-6) return;
  const ux = rock.vx / speed;
  const uy = rock.vy / speed;
  const length = speed * WAKE_SECONDS;
  const nx = -uy;
  const ny = ux;
  ctx.save();
  ctx.strokeStyle = theme.rockStroke;
  ctx.lineWidth = 1.5 * px;
  for (const offset of [-0.5, 0, 0.5]) {
    const sx = rock.x + nx * rock.radius * offset - ux * rock.radius;
    const sy = rock.y + ny * rock.radius * offset - uy * rock.radius;
    const trail = length * (offset === 0 ? 1 : 0.7);
    const gradient = ctx.createLinearGradient(sx, sy, sx - ux * trail, sy - uy * trail);
    gradient.addColorStop(0, theme.rockStroke);
    gradient.addColorStop(1, "transparent");
    ctx.strokeStyle = gradient;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - ux * trail, sy - uy * trail);
    ctx.stroke();
  }
  ctx.restore();
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

function drawBoat(ctx: CanvasRenderingContext2D, boat: Boat, px: number, theme: ChartTheme, fill: string) {
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
  ctx.fillStyle = fill;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 1.5 * px;
  ctx.beginPath();
  hull.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Letra del barco en una pastilla junto a él (fuera del casco para no taparlo). */
function drawBoatLabel(
  ctx: CanvasRenderingContext2D,
  boat: Boat,
  label: string,
  side: -1 | 1,
  px: number,
  theme: ChartTheme,
  color: string,
) {
  const r = 9 * px;
  const x = boat.x;
  const y = boat.y + side * (boat.radius * 2.4 + r);
  ctx.save();
  ctx.fillStyle = theme.card;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * px;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `600 ${11 * px}px ${theme.monoFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y + 0.5 * px);
  ctx.restore();
}

function withDrag(goal: Circle, drag: DragPreview | null, kind: "goal"): Circle {
  return drag?.kind === kind ? { ...goal, x: drag.x, y: drag.y } : goal;
}

/** El servidor manda ángulos absolutos; relativos al rumbo siguen al barco interpolado sin desfase. */
export function relativeRays(rays: Ray[], heading: number): Ray[] {
  return rays.map((ray) => ({ ...ray, angle: ray.angle - heading }));
}
