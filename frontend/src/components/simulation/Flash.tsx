"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Lo que dura un aviso (coincide con la animación .episode-flash de globals.css). */
const FLASH_MS = 1400;

/**
 * Aviso breve y centrado sobre la carta. Se desmonta solo tras FLASH_MS: la animación CSS es solo
 * estética, nunca la responsable de ocultarlo (si no se aplicara, el aviso se quedaría fijo).
 * Para mostrar un aviso nuevo, cambia su `key`.
 */
export function Flash({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;

  return (
    <div className="episode-flash pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col gap-1 rounded-2xl bg-card/95 px-5 py-3 font-heading text-xl italic shadow-lg">
        {children}
      </div>
    </div>
  );
}
