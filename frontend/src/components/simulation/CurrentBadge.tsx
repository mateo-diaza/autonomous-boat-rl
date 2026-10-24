import { ArrowUp } from "lucide-react";

import type { Vector } from "@/lib/types";

/** Pastilla con la fuerza y la dirección de la corriente (no se muestra en mar en calma). */
export function CurrentBadge({ current }: { current: Vector }) {
  const speed = Math.hypot(current.x, current.y);
  if (speed < 0.05) return null;
  // ArrowUp apunta a -90° (arriba); en pantalla el eje y crece hacia abajo, igual que en el mundo
  const degrees = (Math.atan2(current.y, current.x) * 180) / Math.PI + 90;
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1 text-boat-b shadow-sm backdrop-blur">
      <ArrowUp aria-hidden="true" className="size-4" style={{ transform: `rotate(${degrees.toFixed(0)}deg)` }} />
      Corriente {speed.toLocaleString("es-ES", { maximumFractionDigits: 1 })} u/s
    </span>
  );
}
