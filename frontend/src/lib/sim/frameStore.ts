import type { Boat, SimState } from "@/lib/types";

const MAX_TRAIL_POINTS = 1500;

export type Point = { x: number; y: number };

/**
 * Últimos estados recibidos del servidor, fuera de React.
 * El canvas lo lee en cada frame (60 fps) aunque el servidor mande menos estados:
 * interpola el barco entre los dos últimos y acumula la estela.
 */
export class FrameStore {
  current: SimState | null = null;
  private previous: SimState | null = null;
  private currentAt = 0;
  private previousAt = 0;
  trail: Point[] = [];

  push(state: SimState, now: number): void {
    const restarted = this.current === null || state.step === 0 || state.step < this.current.step;
    if (restarted) {
      this.previous = null;
      this.trail = [{ x: state.boat.x, y: state.boat.y }];
    } else if (this.current && state.step !== this.current.step) {
      this.previous = this.current;
      this.previousAt = this.currentAt;
      this.trail.push({ x: state.boat.x, y: state.boat.y });
      if (this.trail.length > MAX_TRAIL_POINTS) this.trail.shift();
    }
    this.current = state;
    this.currentAt = now;
  }

  /** Barco interpolado: se pinta un intervalo por detrás del último estado para que el movimiento sea suave. */
  boatAt(now: number): Boat | null {
    const cur = this.current;
    if (!cur) return null;
    const prev = this.previous;
    if (!prev) return cur.boat;
    const span = Math.max(this.currentAt - this.previousAt, 1);
    const t = Math.min(Math.max((now - this.currentAt) / span, 0), 1);
    return {
      ...cur.boat,
      x: lerp(prev.boat.x, cur.boat.x, t),
      y: lerp(prev.boat.y, cur.boat.y, t),
      heading: lerpAngle(prev.boat.heading, cur.boat.heading, t),
    };
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpola por el camino más corto (de 179° a -179° hay 2°, no 358°). */
function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}
