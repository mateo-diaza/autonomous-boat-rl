import { ArrowUp } from "lucide-react";

import type { Vector } from "@/lib/types";
import { cn } from "@/lib/utils";

const PILL = "rounded-full bg-card/90 px-3 py-1 shadow-sm backdrop-blur";

/**
 * Fuerza y dirección de la corriente (no se muestra en mar en calma).
 * `compact`: sin pastilla ni la palabra "Corriente", para la franja bajo la carta en móvil.
 */
export function CurrentBadge({ current, compact = false }: { current: Vector; compact?: boolean }) {
  const speed = Math.hypot(current.x, current.y);
  if (speed < 0.05) return null;
  // ArrowUp apunta a -90° (arriba); en pantalla el eje y crece hacia abajo, igual que en el mundo
  const degrees = (Math.atan2(current.y, current.x) * 180) / Math.PI + 90;
  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-boat-b", !compact && cn("gap-1.5", PILL))}>
      <ArrowUp
        aria-hidden="true"
        className={compact ? "size-3.5" : "size-4"}
        style={{ transform: `rotate(${degrees.toFixed(0)}deg)` }}
      />
      <span className={cn(compact && "sr-only")}>Corriente</span> {speed.toLocaleString("es-ES", { maximumFractionDigits: 1 })} u/s
    </span>
  );
}
