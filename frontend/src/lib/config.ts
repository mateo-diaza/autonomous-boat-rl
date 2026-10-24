/** Único punto que conoce la dirección del backend. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const WS_URL = `${API_URL.replace(/^http/, "ws")}/ws/sim`;

export const WS_COMPARE_URL = `${API_URL.replace(/^http/, "ws")}/ws/compare`;
