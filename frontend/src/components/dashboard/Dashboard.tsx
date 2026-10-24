"use client";

import { Keyboard, LineChart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BrainPanel } from "@/components/brain/BrainPanel";
import { ConnectionBadge } from "@/components/dashboard/ConnectionBadge";
import { ShortcutsDialog } from "@/components/dashboard/ShortcutsDialog";
import { Widget } from "@/components/dashboard/Widget";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/runs/ModelPicker";
import { SimStage, type MapTool } from "@/components/simulation/SimStage";
import { SimToolbar } from "@/components/simulation/SimToolbar";
import { VoyagePanel } from "@/components/voyage/VoyagePanel";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useRunDetail } from "@/hooks/useRunDetail";
import { useRuns } from "@/hooks/useRuns";
import { useSimulation } from "@/hooks/useSimulation";
import { chronologicalCheckpoints, defaultCheckpointId, modelLabel } from "@/lib/checkpoints";

const TOOL_KEYS: Record<string, MapTool> = { "1": "move", "2": "add", "3": "erase" };

/** Pantalla principal: compone la carta, los controles y los paneles. Único dueño del estado de la UI. */
export function Dashboard() {
  const { connection, world, snapshot, episodes, frames, send } = useSimulation();
  const { state: runsState, retry: retryRuns } = useRuns();

  const [tool, setTool] = useState<MapTool>("move");
  const [showRays, setShowRays] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Selección de modelo: lo elegido por el usuario o, si no ha elegido, el valor por defecto
  const runs = runsState.status === "ready" ? runsState.runs : null;
  const [chosenRunId, setChosenRunId] = useState<string | null>(null);
  const runId = chosenRunId ?? runs?.[0]?.id ?? null;
  const { detail } = useRunDetail(runId);
  const [chosenCheckpoint, setChosenCheckpoint] = useState<{ runId: string; id: string } | null>(null);
  const checkpointId =
    chosenCheckpoint && chosenCheckpoint.runId === runId ? chosenCheckpoint.id : detail ? defaultCheckpointId(detail) : null;

  // Cargar el modelo al cambiar la selección o al (re)conectar: el servidor empieza cada sesión sin modelo
  useEffect(() => {
    if (connection === "open" && detail && checkpointId) {
      send({ type: "load_model", run_id: detail.id, checkpoint_id: checkpointId });
    }
  }, [connection, detail, checkpointId, send]);

  const selectCheckpoint = (id: string) => runId && setChosenCheckpoint({ runId, id });
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
      ...Object.fromEntries(Object.entries(TOOL_KEYS).map(([key, value]) => [key, () => setTool(value)])),
    }),
    // stepCheckpoint cambia con detail/checkpointId, que ya están en las dependencias
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [send, playing, detail, checkpointId],
  );
  useHotkeys(hotkeys);

  const sim = snapshot?.sim ?? null;
  const connected = connection === "open";

  return (
    <div className="flex min-h-dvh flex-col gap-3 p-3 lg:h-dvh lg:p-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-semibold italic xl:text-3xl">Bitácora del barco autónomo</h1>
          <p className="text-sm text-muted-foreground">
            Un agente que aprende a navegar entre rocas mediante aprendizaje por refuerzo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-9 rounded-full px-3" onClick={() => setShortcutsOpen(true)} aria-keyshortcuts="?">
            <Keyboard aria-hidden="true" />
            Atajos
          </Button>
          <ConnectionBadge connection={connection} />
        </div>
      </header>

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
              onRunChange={setChosenRunId}
              detail={detail}
              checkpointId={checkpointId}
              onCheckpointChange={selectCheckpoint}
            />
            <BrainPanel sim={sim} world={world} algo={snapshot?.status.model?.algo ?? null} />
            <VoyagePanel sim={sim} episodes={episodes} />
            <Widget title="Aprendizaje" icon={<LineChart />}>
              <p className="text-sm text-muted-foreground">La curva de aprendizaje llegará en la fase 5.</p>
            </Widget>
          </section>
        </div>
      </main>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
