import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * El HUD de la carta tiene dos sitios según el tamaño de la carta (container query sobre el widget `@container`):
 * con sitio (≥ 28rem) va sobre el mapa en pastillas; en cartas pequeñas (móvil) baja a una franja bajo el mapa
 * para no tapar la simulación. Solo uno de los dos está visible (el otro, con display: none, tampoco se lee).
 */
export const HUD_OVERLAY = "hidden @md:flex";

/** Franja compacta bajo la carta con el HUD, solo en cartas pequeñas. */
export function StageStrip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 pt-2 font-mono text-xs tabular-nums text-muted-foreground @md:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
