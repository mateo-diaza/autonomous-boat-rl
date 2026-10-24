import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type WidgetProps = {
  title: string;
  icon: ReactNode;
  /** Controles opcionales a la derecha del título. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** Tarjeta redondeada con título e icono en chip: la unidad visual de la interfaz. */
export function Widget({ title, icon, actions, className, children }: WidgetProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn("widget p-4 sm:p-5", className)}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 id={titleId} className="widget-title">
          <span className="widget-icon" aria-hidden="true">
            {icon}
          </span>
          {title}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  );
}
