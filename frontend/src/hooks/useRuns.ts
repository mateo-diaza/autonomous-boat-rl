"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchRuns } from "@/lib/api";
import type { RunSummary } from "@/lib/types";

type RunsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; runs: RunSummary[] };

export function useRuns() {
  const [state, setState] = useState<RunsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchRuns(controller.signal)
      .then((runs) => setState({ status: "ready", runs }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
