"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Lo que dura un aviso (coincide con la animación .episode-flash de globals.css). */
const FLASH_MS = 1400;

/**
 * Aviso breve en la parte superior central de la carta. Se desmonta solo tras FLASH_MS: la animación CSS es solo
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
    // Arriba y centrado, bajo el HUD (≈ 2 filas de pastillas): no tapa el centro de la carta, donde suele estar el barco
    <div className="episode-flash pointer-events-none absolute inset-x-3 top-[5.5rem] flex justify-center">
      <div className="flex flex-col gap-0.5 rounded-2xl bg-card/95 px-4 py-2 font-heading text-lg italic shadow-lg">
        {children}
      </div>
    </div>
  );
}
