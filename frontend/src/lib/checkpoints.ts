import { formatSteps } from "@/lib/format";
import type { CheckpointInfo, ModelRef, RunDetail } from "@/lib/types";

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

/** Etiqueta corta para el HUD: "Corrientes + sensor · 25k pasos". */
export function modelLabel(detail: RunDetail | null, checkpointId: string | null): string {
  if (!detail || !checkpointId) return "Sin modelo";
  const checkpoint = detail.checkpoints.find((c) => c.id === checkpointId);
  return `${detail.label} · ${checkpoint?.label ?? checkpointId}`;
}

/** Pasos de entrenamiento que representa un checkpoint (para marcarlo en la curva). */
export function stepsOfCheckpoint(detail: RunDetail, checkpointId: string): number | null {
  const checkpoint = detail.checkpoints.find((c) => c.id === checkpointId);
  if (!checkpoint) return null;
  if (checkpoint.steps !== null) return checkpoint.steps;
  const rated = detail.curve.filter((p) => p.success_rate !== null);
  if (checkpointId === "best" && rated.length > 0) {
    // EvalCallback guarda "best" en la primera evaluación que alcanza el máximo
    const best = Math.max(...rated.map((p) => p.success_rate ?? 0));
    return rated.find((p) => p.success_rate === best)?.steps ?? null;
  }
  return detail.curve.at(-1)?.steps ?? null; // "final"
}

/** Nombre legible de un checkpoint a partir de su id ("24576" -> "25k pasos"). */
export function checkpointLabel(checkpointId: string): string {
  if (checkpointId === "best") return "Mejor evaluación";
  if (checkpointId === "final") return "Final";
  const steps = Number(checkpointId);
  return steps === 0 ? "Sin entrenar" : `${formatSteps(steps)} pasos`;
}

/** "Trampa en U + GPS · Mejor evaluación" para un modelo cargado, o "Sin modelo (recto)". */
export function describeModel(ref: ModelRef | null): string {
  if (!ref) return "Sin modelo (recto)";
  return `${ref.label || ref.run_id} · ${checkpointLabel(ref.checkpoint_id)}`;
}
