import { ArrowUp, ArrowUpLeft, ArrowUpRight, BrainCircuit } from "lucide-react";

import { Widget } from "@/components/dashboard/Widget";
import { formatPercent } from "@/lib/format";
import type { Algo, SimState, WorldInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACTIONS = [
  { label: "Babor", hint: "girar a la izquierda", icon: ArrowUpLeft },
  { label: "Avante", hint: "seguir recto", icon: ArrowUp },
  { label: "Estribor", hint: "girar a la derecha", icon: ArrowUpRight },
] as const;

const NEAR_FRACTION = 0.4;

type BrainPanelProps = {
  sim: SimState | null;
  world: WorldInfo | null;
  algo: Algo | null;
};

/** Qué "ve" el agente (rayos) y cuánto prefiere cada acción en este instante. */
export function BrainPanel({ sim, world, algo }: BrainPanelProps) {
  const probs = sim?.action_probs ?? null;
  return (
    <Widget title="Cerebro del agente" icon={<BrainCircuit />}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
        <SensorFan sim={sim} world={world} />
        <ul className="flex flex-col gap-2.5" aria-label="Preferencia por cada acción">
          {ACTIONS.map((action, index) => {
            const chosen = sim?.action === index;
            const value = probs?.[index] ?? null;
            const Icon = action.icon;
            return (
              <li key={action.label} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className={cn("flex items-center gap-1.5", chosen && "font-semibold")}>
                    <Icon aria-hidden="true" className={cn("size-4", chosen ? "text-vermilion-text" : "text-muted-foreground")} />
                    {action.label}
                    {chosen && <span className="sr-only">(acción elegida)</span>}
                  </span>
                  <span className="font-mono tabular-nums">{formatPercent(value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-150", chosen ? "bg-vermilion" : "bg-foreground/35")}
                    style={{ width: `${(value ?? 0) * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {probs === null
          ? "Sin modelo cargado: el barco sigue recto."
          : algo === "dqn"
            ? "DQN no tiene probabilidades: se muestra el reparto de sus valores Q."
            : "Probabilidad que la red asigna a cada maniobra."}
      </p>
    </Widget>
  );
}

/** Abanico de los 12 rayos con el barco mirando hacia arriba. */
function SensorFan({ sim, world }: { sim: SimState | null; world: WorldInfo | null }) {
  // Semicírculo: ancho = 2 radios, alto = 1 radio (+ margen para el barco)
  const maxLength = 52;
  const width = 2 * maxLength + 8;
  const height = maxLength + 16;
  const center = { x: width / 2, y: maxLength + 6 };
  const rays = sim && world ? sim.rays : [];
  const nearCount = rays.filter((r) => world && r.distance < world.ray_range * NEAR_FRACTION).length;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={
        sim ? `Sensor: ${nearCount} de ${rays.length} rayos detectan un obstáculo cercano` : "Sensor sin datos"
      }
      className="shrink-0"
    >
      <path
        d={`M ${center.x - maxLength} ${center.y} A ${maxLength} ${maxLength} 0 0 1 ${center.x + maxLength} ${center.y}`}
        fill="var(--secondary)"
      />
      {rays.map((ray, i) => {
        const relative = ray.angle - (sim?.boat.heading ?? 0);
        const fraction = world ? ray.distance / world.ray_range : 1;
        const near = fraction < NEAR_FRACTION;
        const length = fraction * maxLength;
        const x = center.x + Math.sin(relative) * length;
        const y = center.y - Math.cos(relative) * length;
        return (
          <line
            key={i}
            x1={center.x}
            y1={center.y}
            x2={x}
            y2={y}
            stroke={near ? "var(--danger)" : "var(--foreground)"}
            strokeOpacity={near ? 0.95 : 0.4}
            strokeWidth={near ? 2.5 : 1.5}
            strokeLinecap="round"
          />
        );
      })}
      <path
        d={`M ${center.x} ${center.y - 10} L ${center.x + 5} ${center.y + 2} L ${center.x - 5} ${center.y + 2} Z`}
        fill="var(--vermilion)"
        stroke="var(--foreground)"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
