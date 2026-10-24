/** Formatos de número en español para toda la interfaz. */

const percent = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const integer = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, signDisplay: "exceptZero" });

/** 25000 -> "25k"; 1500000 -> "1,5M". */
export function formatSteps(steps: number): string {
  if (steps >= 1_000_000) return `${(steps / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}M`;
  if (steps >= 1_000) return `${Math.round(steps / 1_000)}k`;
  return String(steps);
}

/** 0.95 -> "95 %"; null -> "—". */
export function formatPercent(value: number | null): string {
  return value === null ? "—" : percent.format(value);
}

/** 163.27 -> "+163,3"; con `compact`, "+163" (para tarjetas de métrica estrechas). */
export function formatReturn(value: number, { compact = false } = {}): string {
  return (compact ? integer : decimal).format(value);
}
