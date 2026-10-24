import type { Circle } from "@/lib/types";

export type WorldPoint = { x: number; y: number };

/** Coordenadas de puntero (px CSS) -> coordenadas del mundo, recortadas a sus límites. */
export function screenToWorld(clientX: number, clientY: number, rect: DOMRect, worldSize: number): WorldPoint {
  const clamp = (v: number) => Math.min(Math.max(v, 0), worldSize);
  return {
    x: clamp(((clientX - rect.left) / rect.width) * worldSize),
    y: clamp(((clientY - rect.top) / rect.height) * worldSize),
  };
}

export function isInside(point: WorldPoint, circle: Circle, margin = 0): boolean {
  return Math.hypot(point.x - circle.x, point.y - circle.y) <= circle.radius + margin;
}

/** Índice del obstáculo bajo el punto (el último pintado gana), o -1. */
export function hitObstacle(point: WorldPoint, obstacles: Circle[], margin = 0): number {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    if (isInside(point, obstacles[i], margin)) return i;
  }
  return -1;
}
