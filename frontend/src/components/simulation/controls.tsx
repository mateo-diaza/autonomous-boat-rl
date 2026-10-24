"use client";

import { Pause, Play, RotateCcw, Shuffle, StepForward } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Clases de la opción elegida en controles segmentados y toggles. */
export const SELECTED = "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

const SPEEDS = [
  { value: 10, label: "Lenta", hint: "10 pasos/s (tiempo real)" },
  { value: 30, label: "Normal", hint: "30 pasos/s" },
  { value: 90, label: "Rápida", hint: "90 pasos/s" },
  { value: 240, label: "Turbo", hint: "240 pasos/s" },
];

/** Comandos de reproducción comunes a la navegación y a la comparativa. */
export type PlaybackCommand =
  | { type: "play" }
  | { type: "pause" }
  | { type: "step" }
  | { type: "restart" }
  | { type: "new_scenario" }
  | { type: "set_speed"; speed: number }
  | { type: "set_auto_reset"; auto_reset: boolean };

type PlaybackControlsProps = {
  playing: boolean;
  speed: number;
  autoReset: boolean;
  enabled: boolean;
  send: (command: PlaybackCommand) => void;
  /** Controles extra al final de la fila (p. ej. "Sin azar"). */
  children?: ReactNode;
};

/** Navegar/pausar, paso, repetir, nuevo escenario, velocidad y encadenar travesías. */
export function PlaybackControls({ playing, speed, autoReset, enabled, send, children }: PlaybackControlsProps) {
  const speedLabelId = useId();
  return (
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
        <span id={speedLabelId} className="text-sm text-muted-foreground">
          Velocidad
        </span>
        <ToggleGroup
          type="single"
          aria-labelledby={speedLabelId}
          value={String(speed)}
          onValueChange={(value) => value && send({ type: "set_speed", speed: Number(value) })}
          disabled={!enabled}
          className="flex-wrap rounded-xl bg-secondary p-1"
        >
          {SPEEDS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={String(option.value)}
              title={option.hint}
              className={`rounded-lg px-3 ${SELECTED}`}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {children}
        <LabeledSwitch
          label="Encadenar travesías"
          hint="Al terminar una travesía empieza otra en un escenario nuevo."
          checked={autoReset}
          disabled={!enabled}
          onChange={(auto_reset) => send({ type: "set_auto_reset", auto_reset })}
        />
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
export function IconAction({ label, shortcut, disabled, className, onClick, children }: IconActionProps) {
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
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

export function LabeledSwitch({ label, hint, checked, disabled, onChange }: LabeledSwitchProps) {
  const id = useId();
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

export const DETERMINISTIC_HINT =
  "Activado: el agente elige siempre su acción favorita. Desactivado: la sortea según sus probabilidades.";
