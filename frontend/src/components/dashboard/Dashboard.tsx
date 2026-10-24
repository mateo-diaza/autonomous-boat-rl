"use client";

import { useEffect, useMemo, useState } from "react";

import { BrainPanel } from "@/components/brain/BrainPanel";
import { LearningCurve } from "@/components/charts/LearningCurve";
import { AppHeader, type AppMode } from "@/components/dashboard/AppHeader";
import { NAVIGATION_SHORTCUTS, ShortcutsDialog } from "@/components/dashboard/ShortcutsDialog";
import { ModelPicker } from "@/components/runs/ModelPicker";
import { SimStage, type MapTool } from "@/components/simulation/SimStage";
import { SimToolbar } from "@/components/simulation/SimToolbar";
import { VoyagePanel } from "@/components/voyage/VoyagePanel";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useModelSelection } from "@/hooks/useModelSelection";
import { useRuns } from "@/hooks/useRuns";
import { useSimulation } from "@/hooks/useSimulation";
import { chronologicalCheckpoints, modelLabel } from "@/lib/checkpoints";

const TOOL_KEYS: Record<string, MapTool> = { "1": "move", "2": "add", "3": "erase" };

type DashboardProps = { mode: AppMode; onModeChange: (mode: AppMode) => void };

/** Modo navegación: compone la carta, los controles y los paneles. Único dueño del estado de su UI. */
export function Dashboard({ mode, onModeChange }: DashboardProps) {
  const { connection, world, snapshot, episodes, frames, send } = useSimulation();
  const { state: runsState, retry: retryRuns } = useRuns();

  const [tool, setTool] = useState<MapTool>("move");
  const [showRays, setShowRays] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const runs = runsState.status === "ready" ? runsState.runs : null;
  const { runId, selectRun, detail, checkpointId, selectCheckpoint } = useModelSelection(runs);

  // Cargar el modelo al cambiar la selección o al (re)conectar: el servidor empieza cada sesión sin modelo.
  // Después se repite la travesía desde la salida: si no, el modelo nuevo hereda el barco tal como lo dejó
  // el anterior (girando, junto a una roca...) y parece peor de lo que es. Así además cada checkpoint se
  // compara en el mismo escenario. El servidor procesa los comandos en orden: restart llega con el modelo ya cargado.
  useEffect(() => {
    if (connection === "open" && detail && checkpointId) {
      send({ type: "load_model", run_id: detail.id, checkpoint_id: checkpointId });
      send({ type: "restart" });
    }
  }, [connection, detail, checkpointId, send]);

  const stepCheckpoint = (delta: number) => {
    if (!detail) return;
    const timeline = chronologicalCheckpoints(detail);
    const index = timeline.findIndex((c) => c.id === checkpointId);
    const next = timeline[Math.min(Math.max((index < 0 ? timeline.length - 1 : index) + delta, 0), timeline.length - 1)];
    if (next) selectCheckpoint(next.id);
  };

  const playing = snapshot?.status.playing ?? false;
  const hotkeys = useMemo(
    () => ({
      " ": () => send({ type: playing ? "pause" : "play" }),
      ArrowRight: () => send({ type: "step" }),
      r: () => send({ type: "new_scenario" }),
      R: () => send({ type: "restart" }),
      "[": () => stepCheckpoint(-1),
      "]": () => stepCheckpoint(1),
      s: () => setShowRays((show) => !show),
      "?": () => setShortcutsOpen(true),
      c: () => onModeChange("compare"),
      ...Object.fromEntries(Object.entries(TOOL_KEYS).map(([key, value]) => [key, () => setTool(value)])),
    }),
    // stepCheckpoint cambia con detail/checkpointId, que ya están en las dependencias
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [send, playing, detail, checkpointId, onModeChange],
  );
  useHotkeys(hotkeys);

  const sim = snapshot?.sim ?? null;
  const connected = connection === "open";

  return (
    <div className="flex min-h-dvh flex-col gap-3 p-3 lg:h-dvh lg:p-4">
      <AppHeader
        mode={mode}
        onModeChange={onModeChange}
        connection={connection}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      {/*
        Escritorio: la página mide exactamente el alto de la ventana. La carta (cuadrada) ocupa todo el alto
        y su ancho sale de ahí, pero cede lo justo para dejar 640px a la derecha (2 columnas de paneles).
      */}
      <main className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[auto_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <SimStage
          className="lg:aspect-square lg:h-full lg:max-w-[calc(100vw_-_2.75rem_-_640px)]"
          world={world}
          frames={frames}
          snapshot={snapshot}
          connection={connection}
          tool={tool}
          showRays={showRays}
          modelLabel={modelLabel(detail, checkpointId)}
          lastEpisode={episodes[0]}
          send={send}
        />

        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          <SimToolbar
            status={snapshot?.status ?? null}
            sim={sim}
            world={world}
            enabled={connected}
            tool={tool}
            onToolChange={setTool}
            showRays={showRays}
            onShowRaysChange={setShowRays}
            send={send}
          />
          <section
            aria-label="Paneles de información"
            className="grid flex-1 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]"
          >
            <ModelPicker
              runs={runs}
              runsError={runsState.status === "error" ? runsState.message : null}
              onRetryRuns={retryRuns}
              runId={runId}
              onRunChange={selectRun}
              detail={detail}
              checkpointId={checkpointId}
              onCheckpointChange={selectCheckpoint}
            />
            <BrainPanel sim={sim} world={world} algo={snapshot?.status.model?.algo ?? null} />
            <VoyagePanel sim={sim} episodes={episodes} />
            <LearningCurve detail={detail} checkpointId={checkpointId} onSelectCheckpoint={selectCheckpoint} />
          </section>
        </div>
      </main>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} shortcuts={NAVIGATION_SHORTCUTS} />
    </div>
  );
}
