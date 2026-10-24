import { CircleCheck, OctagonX, Timer, type LucideIcon } from "lucide-react";

import type { EpisodeEvent } from "@/lib/types";

type EpisodeOutcome = {
  label: string;
  /** Frase completa para el aviso de fin de travesía y la región aria-live. */
  describe: (steps: number) => string;
  icon: LucideIcon;
  textClass: string;
  bgClass: string;
};

/** Cómo se presenta cada final de travesía. Icono + texto: nunca solo el color. */
export const EPISODE_OUTCOMES: Record<EpisodeEvent, EpisodeOutcome> = {
  goal: {
    label: "Arribada",
    describe: (steps) => `Arribada a la boya en ${steps} pasos`,
    icon: CircleCheck,
    textClass: "text-success",
    bgClass: "bg-success/10",
  },
  crash: {
    label: "Encallado",
    describe: (steps) => `Encallado tras ${steps} pasos`,
    icon: OctagonX,
    textClass: "text-danger",
    bgClass: "bg-danger/10",
  },
  timeout: {
    label: "Sin rumbo",
    describe: (steps) => `Sin rumbo: tiempo agotado (${steps} pasos)`,
    icon: Timer,
    textClass: "text-warning",
    bgClass: "bg-warning/10",
  },
};
