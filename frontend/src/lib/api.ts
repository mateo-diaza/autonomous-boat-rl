import { API_URL } from "@/lib/config";
import type { ProblemInfo, RunDetail, RunSummary } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { signal, cache: "no-store" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(`No se puede conectar con el servidor (${API_URL}). ¿Está arrancado?`);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(body?.detail ?? `Error ${response.status} al pedir ${path}`, response.status);
  }
  return (await response.json()) as T;
}

export function fetchRuns(signal?: AbortSignal): Promise<RunSummary[]> {
  return getJson("/api/runs", signal);
}

export function fetchRun(runId: string, signal?: AbortSignal): Promise<RunDetail> {
  return getJson(`/api/runs/${encodeURIComponent(runId)}`, signal);
}

export function fetchProblems(signal?: AbortSignal): Promise<ProblemInfo[]> {
  return getJson("/api/problems", signal);
}
