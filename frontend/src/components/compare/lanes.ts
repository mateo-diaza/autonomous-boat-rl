import type { LaneId } from "@/lib/types";

/** Cómo se presenta cada barco de la comparativa. Siempre color + letra (nunca solo color). */
export const LANE_STYLE: Record<LaneId, { tone: "a" | "b"; dot: string; text: string; name: string }> = {
  A: { tone: "a", dot: "bg-vermilion", text: "text-vermilion-text", name: "Barco A" },
  B: { tone: "b", dot: "bg-boat-b", text: "text-boat-b", name: "Barco B" },
};

export type RaysTarget = LaneId | "none";
