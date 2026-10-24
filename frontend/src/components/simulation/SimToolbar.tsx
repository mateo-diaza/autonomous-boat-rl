"use client";

import { Dices, Eraser, Flag, Hand, Minus, Plus, Radar } from "lucide-react";
import { useId, type ReactNode } from "react";

import {
  DETERMINISTIC_HINT,
  IconAction,
  LabeledSwitch,
  PlaybackControls,
  SELECTED,
} from "@/components/simulation/controls";
import { NEW_ROCK_RADIUS, type MapTool } from "@/components/simulation/SimStage";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { randomFreeSpot } from "@/lib/sim/placement";
import type { ClientCommand, SessionStatus, SimState, WorldInfo } from "@/lib/types";

const TOOLS: { value: MapTool; label: string; hint: string; icon: ReactNode }[] = [
  { value: "move", label: "Mover", hint: "Arrastra una roca o la boya para moverla", icon: <Hand /> },
  { value: "add", label: "Añadir", hint: "Haz clic en el agua para añadir una roca", icon: <Plus /> },
  { value: "erase", label: "Borrar", hint: "Haz clic en una roca para quitarla", icon: <Eraser /> },
];

type SimToolbarProps = {
  status: SessionStatus | null;
  sim: SimState | null;
  world: WorldInfo | null;
  enabled: boolean;
  tool: MapTool;
  onToolChange: (tool: MapTool) => void;
  showRays: boolean;
  onShowRaysChange: (show: boolean) => void;
  send: (command: ClientCommand) => void;
};

export function SimToolbar(props: SimToolbarProps) {
  const { status, sim, world, enabled, tool, onToolChange, showRays, onShowRaysChange, send } = props;
  const playing = status?.playing ?? false;
  const activeTool = TOOLS.find((t) => t.value === tool);
  const toolLabelId = useId();

  const addRandomRock = () => {
    if (!world || !sim) return;
    const spot = randomFreeSpot(world, sim, NEW_ROCK_RADIUS);
    if (spot) send({ type: "add_obstacle", ...spot, radius: NEW_ROCK_RADIUS });
  };
  const moveGoalRandomly = () => {
    if (!world || !sim) return;
    const spot = randomFreeSpot(world, sim, sim.goal.radius);
    if (spot) send({ type: "set_goal", ...spot });
  };
  const removeLastRock = () => {
    if (sim && sim.obstacles.length > 0) send({ type: "remove_obstacle", index: sim.obstacles.length - 1 });
  };

  return (
    <div className="widget flex flex-col gap-4 p-4 sm:p-5">
      <PlaybackControls
        playing={playing}
        speed={status?.speed ?? 30}
        autoReset={status?.auto_reset ?? true}
        enabled={enabled}
        send={send}
      >
        <LabeledSwitch
          label="Sin azar"
          hint={DETERMINISTIC_HINT}
          checked={status?.deterministic ?? true}
          disabled={!enabled}
          onChange={(deterministic) => send({ type: "set_deterministic", deterministic })}
        />
      </PlaybackControls>

      {/* Edición del mapa */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/60 pt-4">
        <div className="flex items-center gap-3">
          <span id={toolLabelId} className="text-sm text-muted-foreground">
            Editar carta
          </span>
          <ToggleGroup
            type="single"
            aria-labelledby={toolLabelId}
            value={tool}
            onValueChange={(value) => value && onToolChange(value as MapTool)}
            className="rounded-xl bg-secondary p-1"
          >
            {TOOLS.map((t) => (
              <ToggleGroupItem key={t.value} value={t.value} title={t.hint} className={`gap-1.5 rounded-lg px-3 ${SELECTED}`}>
                {t.icon}
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-2" role="group" aria-label="Edición sin ratón">
          <IconAction label="Añadir roca al azar" disabled={!enabled} onClick={addRandomRock}>
            <Dices />
          </IconAction>
          <IconAction label="Quitar la última roca" disabled={!enabled || !sim?.obstacles.length} onClick={removeLastRock}>
            <Minus />
          </IconAction>
          <IconAction label="Mover la boya al azar" disabled={!enabled} onClick={moveGoalRandomly}>
            <Flag />
          </IconAction>
        </div>

        <Toggle
          pressed={showRays}
          onPressedChange={onShowRaysChange}
          variant="outline"
          className={`gap-1.5 rounded-xl px-3 ${SELECTED}`}
        >
          <Radar />
          Rayos del sensor
        </Toggle>

        <p className="w-full text-sm text-muted-foreground" aria-live="polite">
          {activeTool?.hint}.
        </p>
      </div>
    </div>
  );
}
