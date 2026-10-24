import type { MetadataRoute } from "next";

/** Web app manifest: icono y nombre al añadir la web a la pantalla de inicio en Android. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Q-Captain: Learning the Ropes",
    short_name: "Q-Captain",
    description: "Un barco que aprende a navegar entre rocas con aprendizaje por refuerzo, en vivo.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4ecd8",
    theme_color: "#f4ecd8",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android recorta los iconos en círculo u otras formas: esta versión deja el barco en la zona segura
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
