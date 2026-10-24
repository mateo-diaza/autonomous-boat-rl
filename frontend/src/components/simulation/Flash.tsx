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
    // Arriba y centrado, sin tapar el centro de la carta (donde suele estar el barco). Con el HUD sobre el mapa
    // va debajo de sus pastillas (≈ 2 filas); en cartas pequeñas el HUD está fuera y el aviso sube y se encoge.
    <div className="episode-flash pointer-events-none absolute inset-x-2 top-2 flex justify-center @md:inset-x-3 @md:top-[5.5rem]">
      <div className="flex flex-col gap-0.5 rounded-xl bg-card/95 px-3 py-1 font-heading text-sm italic shadow-md @md:rounded-2xl @md:px-4 @md:py-2 @md:text-lg @md:shadow-lg [&_svg]:size-4 @md:[&_svg]:size-5">
        {children}
      </div>
    </div>
  );
}
