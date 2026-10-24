"use client";

import {
  Dices,
  Eraser,
  Flag,
  Hand,
  Minus,
  Pause,
  Play,
  Plus,
  Radar,
  RotateCcw,
  Shuffle,
  StepForward,
} from "lucide-react";
import type { ReactNode } from "react";

import { NEW_ROCK_RADIUS, type MapTool } from "@/components/simulation/SimStage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { randomFreeSpot } from "@/lib/sim/placement";
import type { ClientCommand, SessionStatus, SimState, WorldInfo } from "@/lib/types";

const SPEEDS = [
  { value: 10, label: "Lenta", hint: "10 pasos/s (tiempo real)" },
  { value: 30, label: "Normal", hint: "30 pasos/s" },
  { value: 90, label: "Rápida", hint: "90 pasos/s" },
  { value: 240, label: "Turbo", hint: "240 pasos/s" },
];

const TOOLS: { value: MapTool; label: string; hint: string; icon: ReactNode }[] = [
  { value: "move", label: "Mover", hint: "Arrastra una roca o la boya para moverla", icon: <Hand /> },
  { value: "add", label: "Añadir", hint: "Haz clic en el agua para añadir una roca", icon: <Plus /> },
  { value: "erase", label: "Borrar", hint: "Haz clic en una roca para quitarla", icon: <Eraser /> },
];

const SELECTED = "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

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
      {/* Reproducción */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2" role="group" aria-label="Reproducción">
          <Button
            size="icon-lg"
            className="size-11 rounded-full shadow-sm"
            aria-label={playing ? "Pausar" : "Navegar"}
            aria-keyshortcuts="Space"
            disabled={!enabled}
            onClick={() => send({ type: playing ? "pause" : "play" })}
          >
            {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
          </Button>
          <IconAction label="Avanzar un paso" shortcut="→" disabled={!enabled} onClick={() => send({ type: "step" })}>
            <StepForward />
          </IconAction>
          <IconAction label="Repetir travesía" shortcut="Mayús + R" disabled={!enabled} onClick={() => send({ type: "restart" })}>
            <RotateCcw />
          </IconAction>
          <IconAction label="Nuevo escenario" shortcut="R" disabled={!enabled} onClick={() => send({ type: "new_scenario" })}>
            <Shuffle />
          </IconAction>
        </div>

        <div className="flex items-center gap-3">
          <span id="speed-label" className="text-sm text-muted-foreground">
            Velocidad
          </span>
          <ToggleGroup
            type="single"
            aria-labelledby="speed-label"
            value={String(status?.speed ?? 30)}
            onValueChange={(value) => value && send({ type: "set_speed", speed: Number(value) })}
            disabled={!enabled}
            className="rounded-xl bg-secondary p-1"
          >
            {SPEEDS.map((speed) => (
              <ToggleGroupItem key={speed.value} value={String(speed.value)} title={speed.hint} className={`rounded-lg px-3 ${SELECTED}`}>
                {speed.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <LabeledSwitch
            id="deterministic"
            label="Sin azar"
            hint="Activado: el agente elige siempre su acción favorita. Desactivado: la sortea según sus probabilidades."
            checked={status?.deterministic ?? true}
            disabled={!enabled}
            onChange={(deterministic) => send({ type: "set_deterministic", deterministic })}
          />
          <LabeledSwitch
            id="auto-reset"
            label="Encadenar travesías"
            hint="Al terminar una travesía empieza otra en un escenario nuevo."
            checked={status?.auto_reset ?? true}
            disabled={!enabled}
            onChange={(auto_reset) => send({ type: "set_auto_reset", auto_reset })}
          />
        </div>
      </div>

      {/* Edición del mapa */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/60 pt-4">
        <div className="flex items-center gap-3">
          <span id="tool-label" className="text-sm text-muted-foreground">
            Editar carta
          </span>
          <ToggleGroup
            type="single"
            aria-labelledby="tool-label"
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

type IconActionProps = {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
  children: ReactNode;
};

/** Botón de icono redondo con tooltip (el nombre accesible es la etiqueta). */
function IconAction({ label, shortcut, disabled, className, onClick, children }: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-lg"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={`rounded-full ${className ?? ""}`}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <kbd className="ml-2 font-mono opacity-80">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

type LabeledSwitchProps = {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
};

function LabeledSwitch({ id, label, hint, checked, disabled, onChange }: LabeledSwitchProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} aria-describedby={`${id}-hint`} />
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <span id={`${id}-hint`} className="sr-only">
        {hint}
      </span>
    </div>
  );
}
