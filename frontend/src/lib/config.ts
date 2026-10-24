/** Único punto que conoce la dirección del backend. */

/**
 * Sin NEXT_PUBLIC_API_URL, el backend se busca en el mismo equipo que sirve la web (puerto 8000):
 * vale en local y en la demo por wifi (http://192.168.x.x:3000 → http://192.168.x.x:8000).
 * En el servidor de Next no hay `window`, pero ahí no se llama a la API.
 */
function defaultApiUrl(): string {
  if (typeof window === "undefined") return "http://localhost:8000";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? defaultApiUrl()).replace(/\/$/, "");

export const WS_URL = `${API_URL.replace(/^http/, "ws")}/ws/sim`;

export const WS_COMPARE_URL = `${API_URL.replace(/^http/, "ws")}/ws/compare`;
