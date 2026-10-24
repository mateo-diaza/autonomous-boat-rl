"use client";

import { useEffect, useState } from "react";

import { fetchRun } from "@/lib/api";
import type { RunDetail } from "@/lib/types";

type Loaded = { runId: string; detail: RunDetail } | { runId: string; error: string };

/** Detalle (checkpoints + curva) del run elegido. Mientras llega el de un run nuevo, devuelve null. */
export function useRunDetail(runId: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    fetchRun(runId, controller.signal)
      .then((detail) => setLoaded({ runId, detail }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({ runId, error: error instanceof Error ? error.message : String(error) });
      });
    return () => controller.abort();
  }, [runId]);

  // Se descarta lo cargado para otro run: así nunca se mezclan checkpoints de runs distintos
  const current = loaded && loaded.runId === runId ? loaded : null;
  return {
    detail: current && "detail" in current ? current.detail : null,
    error: current && "error" in current ? current.error : null,
  };
}
