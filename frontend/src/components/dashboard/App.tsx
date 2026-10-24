"use client";

import { useState } from "react";

import { CompareDashboard } from "@/components/compare/CompareDashboard";
import type { AppMode } from "@/components/dashboard/AppHeader";
import { Dashboard } from "@/components/dashboard/Dashboard";

/** Alterna entre navegación y comparativa. Solo el modo visible mantiene su WebSocket abierto. */
export function App() {
  const [mode, setMode] = useState<AppMode>("navigate");
  return mode === "navigate" ? (
    <Dashboard mode={mode} onModeChange={setMode} />
  ) : (
    <CompareDashboard mode={mode} onModeChange={setMode} />
  );
}
