import type { Connection } from "@/hooks/useSimulation";
import { cn } from "@/lib/utils";

const LABELS: Record<Connection, { text: string; dot: string }> = {
  open: { text: "Conectado", dot: "bg-success" },
  connecting: { text: "Conectando…", dot: "bg-warning animate-pulse" },
  closed: { text: "Sin conexión · reintentando", dot: "bg-danger" },
};

export function ConnectionBadge({ connection }: { connection: Connection }) {
  const { text, dot } = LABELS[connection];
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1 text-sm shadow-sm"
    >
      <span aria-hidden="true" className={cn("size-2.5 rounded-full", dot)} />
      {text}
    </span>
  );
}
