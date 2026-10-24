import { cn } from "@/lib/utils";

/**
 * Logo de la app: el mismo barquito que el favicon (app/icon.svg), sin su fondo, dentro de un chip.
 * Decorativo: el título de al lado ya da el nombre.
 */
export function BoatLogo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card shadow-sm",
        className,
      )}
    >
      <svg viewBox="4 6 56 46" className="size-[78%]">
        <path
          d="M8 49c5 0 5-3 10-3s5 3 10 3 5-3 10-3 5 3 10 3 5-3 10-3"
          fill="none"
          stroke="var(--boat-b)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path d="M31 9v29" stroke="var(--foreground)" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M34 12l15 24H34z" fill="var(--card)" stroke="var(--foreground)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M28 17L16 34h12z" fill="var(--card)" stroke="var(--foreground)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M10 39h44l-6 8H16z" fill="var(--vermilion)" stroke="var(--foreground)" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
