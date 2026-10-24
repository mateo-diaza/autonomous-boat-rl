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
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold italic lg:text-4xl">Bitácora del barco autónomo</h1>
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

      <main className="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        {/* La carta es cuadrada: se limita por la altura de la ventana para que quepa con sus controles */}
        <div className="mx-auto flex w-full flex-col gap-4 lg:max-w-[max(36rem,calc(100dvh-17rem))]">
          <SimStage
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
        </div>

        <aside className="flex flex-col gap-4" aria-label="Paneles de información">
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
        </aside>
      </main>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
