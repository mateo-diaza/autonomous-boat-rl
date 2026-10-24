import type { SimState, WorldInfo } from "@/lib/types";

const ATTEMPTS = 60;
const CLEARANCE = 3;

/**
 * Punto al azar donde cabe un círculo de `radius` sin pisar rocas, barco ni boya.
 * Solo se llama desde manejadores de eventos (Math.random no puede ir en el render).
 */
export function randomFreeSpot(world: WorldInfo, sim: SimState, radius: number): { x: number; y: number } | null {
  const margin = radius + CLEARANCE;
  const blockers = [
    ...sim.obstacles,
    { x: sim.boat.x, y: sim.boat.y, radius: sim.boat.radius + 6 },
    sim.goal,
  ];
  for (let i = 0; i < ATTEMPTS; i++) {
    const x = margin + Math.random() * (world.size - 2 * margin);
    const y = margin + Math.random() * (world.size - 2 * margin);
    const free = blockers.every((c) => Math.hypot(c.x - x, c.y - y) > c.radius + radius + CLEARANCE);
    if (free) return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }
  return null;
}
