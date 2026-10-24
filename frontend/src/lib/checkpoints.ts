import type { CheckpointInfo, RunDetail } from "@/lib/types";

/** Checkpoints en orden de entrenamiento (los numéricos y "final"); "best" va aparte. */
export function chronologicalCheckpoints(detail: RunDetail): CheckpointInfo[] {
  return detail.checkpoints.filter((c) => c.id !== "best");
}

/** Checkpoint por defecto al elegir un run: el mejor evaluado, si existe. */
export function defaultCheckpointId(detail: RunDetail): string | null {
  const ids = detail.checkpoints.map((c) => c.id);
  if (ids.includes("best")) return "best";
  return ids.at(-1) ?? null;
}

/** Tasa de éxito en evaluación asociada a un checkpoint (la evaluación más reciente a esos pasos). */
export function successAt(detail: RunDetail, checkpoint: CheckpointInfo): number | null {
  const rated = detail.curve.filter((p) => p.success_rate !== null);
  if (rated.length === 0) return null;
  if (checkpoint.id === "best") return Math.max(...rated.map((p) => p.success_rate ?? 0));
  if (checkpoint.steps === null) return rated.at(-1)?.success_rate ?? null;
  const before = rated.filter((p) => p.steps <= checkpoint.steps!);
  return before.at(-1)?.success_rate ?? (checkpoint.steps === 0 ? 0 : null);
}

/** Etiqueta corta para el HUD: "PPO · 25k pasos". */
export function modelLabel(detail: RunDetail | null, checkpointId: string | null): string {
  if (!detail || !checkpointId) return "Sin modelo";
  const checkpoint = detail.checkpoints.find((c) => c.id === checkpointId);
  return `${detail.algo.toUpperCase()} · ${checkpoint?.label ?? checkpointId}`;
}
