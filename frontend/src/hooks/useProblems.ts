"use client";

import { useEffect, useState } from "react";

import { fetchProblems } from "@/lib/api";
import type { ProblemInfo } from "@/lib/types";

/** Catálogo de condiciones del mar. Si falla, la UI simplemente no muestra el selector (no es crítico). */
export function useProblems() {
  const [problems, setProblems] = useState<ProblemInfo[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetchProblems(controller.signal)
      .then(setProblems)
      .catch(() => {
        /* sin catálogo no hay selector: el resto de la app funciona igual */
      });
    return () => controller.abort();
  }, []);

  return problems;
}
