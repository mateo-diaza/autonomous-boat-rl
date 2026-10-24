"use client";

import { Keyboard, Sailboat, Swords } from "lucide-react";

import { BoatLogo } from "@/components/dashboard/BoatLogo";
import { ConnectionBadge } from "@/components/dashboard/ConnectionBadge";
import { SELECTED } from "@/components/simulation/controls";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Connection } from "@/hooks/useServerSocket";

export type AppMode = "navigate" | "compare";

type AppHeaderProps = {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  connection: Connection;
  onOpenShortcuts: () => void;
};

export function AppHeader({ mode, onModeChange, connection, onOpenShortcuts }: AppHeaderProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h1 className="flex items-center gap-3 text-2xl font-semibold italic xl:text-3xl">
          <BoatLogo className="size-10 xl:size-11" />
          Bitácora de Barco Autónomo
        </h1>
        <p className="text-sm text-muted-foreground">
          Un agente que aprende a navegar entre rocas mediante aprendizaje por refuerzo
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          aria-label="Modo"
          value={mode}
          onValueChange={(value) => value && onModeChange(value as AppMode)}
          className="flex-wrap rounded-full border border-border/70 bg-card p-1 shadow-sm"
        >
          <ToggleGroupItem value="navigate" className={`gap-1.5 rounded-full px-3 ${SELECTED}`}>
            <Sailboat aria-hidden="true" />
            Navegación
          </ToggleGroupItem>
          <ToggleGroupItem value="compare" className={`gap-1.5 rounded-full px-3 ${SELECTED}`}>
            <Swords aria-hidden="true" />
            Comparativa
          </ToggleGroupItem>
        </ToggleGroup>
        <Button variant="outline" className="h-9 rounded-full px-3" onClick={onOpenShortcuts} aria-keyshortcuts="?">
          <Keyboard aria-hidden="true" />
          Atajos
        </Button>
        <ConnectionBadge connection={connection} />
      </div>
    </header>
  );
}
