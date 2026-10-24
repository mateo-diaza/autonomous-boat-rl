"use client";

import { Radar } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CompareStage } from "@/components/compare/CompareStage";
import { LANE_STYLE, type RaysTarget } from "@/components/compare/lanes";
import { Scoreboard, TOURNAMENT_SIZES } from "@/components/compare/Scoreboard";
import { AppHeader, type AppMode } from "@/components/dashboard/AppHeader";
import { COMPARE_SHORTCUTS, ShortcutsDialog } from "@/components/dashboard/ShortcutsDialog";
import { ModelPicker } from "@/components/runs/ModelPicker";
import { DETERMINISTIC_HINT, LabeledSwitch, PlaybackControls, SELECTED } from "@/components/simulation/controls";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useComparison } from "@/hooks/useComparison";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useModelSelection } from "@/hooks/useModelSelection";
import { useRuns } from "@/hooks/useRuns";
import { cn } from "@/lib/utils";
import type { LaneId, RunDetail } from "@/lib/types";

const RAYS_CYCLE: RaysTarget[] = ["A", "B", "none"];

type CompareDashboardProps = { mode: AppMode; onModeChange: (mode: AppMode) => void };

/** Modo comparativa: dos modelos en el mismo escenario, marcador y torneo. */
export function CompareDashboard({ mode, onModeChange }: CompareDashboardProps) {
  const { connection, world, snapshot, lastRace, tournament, frames, send } = useComparison();
  const { state: runsState, retry: retryRuns } = useRuns();
  const runs = runsState.status === "ready" ? runsState.runs : null;
  const runsError = runsState.status === "error" ? runsState.message : null;

  // Por defecto: A = 1er run (mejor evaluación) contra B = 2º run. Con un solo run, B = ese run sin entrenar.
  const onlyOneRun = (runs?.length ?? 0) < 2;
  const laneA = useModelSelection(runs, { preferredRunIndex: 0 });
  const laneB = useModelSelection(runs, {
    preferredRunIndex: 1,
    pickDefault: onlyOneRun ? (detail: RunDetail) => detail.checkpoints[0]?.id ?? null : undefined,
  });
  const selections: Record<LaneId, ReturnType<typeof useModelSelection>> = { A: laneA, B: laneB };

  const [rays, setRays] = useState<RaysTarget>("A");
  const [tournamentSize, setTournamentSize] = useState(TOURNAMENT_SIZES[1]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const connected = connection === "open";

  // Cargar cada modelo al elegirlo o al (re)conectar, y repetir la regata desde la salida (ver Dashboard)
  useLoadLane("A", laneA.detail, laneA.checkpointId, connected, send);
  useLoadLane("B", laneB.detail, laneB.checkpointId, connected, send);

  const status = snapshot?.status;
  const playing = status?.playing ?? false;
  const tournamentRunning = status?.tournament_running ?? false;
  const hotkeys = useMemo(
    () => ({
      " ": () => send({ type: playing ? "pause" : "play" }),
      ArrowRight: () => send({ type: "step" }),
      r: () => send({ type: "new_scenario" }),
      R: () => send({ type: "restart" }),
      s: () => setRays((current) => RAYS_CYCLE[(RAYS_CYCLE.indexOf(current) + 1) % RAYS_CYCLE.length]),
      t: () => !tournamentRunning && send({ type: "run_tournament", episodes: tournamentSize }),
      n: () => onModeChange("navigate"),
      "?": () => setShortcutsOpen(true),
    }),
    [send, playing, tournamentRunning, tournamentSize, onModeChange],
  );
  useHotkeys(hotkeys);

  return (
    <div className="flex min-h-dvh flex-col gap-3 p-3 lg:h-dvh lg:p-4">
      <AppHeader
        mode={mode}
        onModeChange={onModeChange}
        connection={connection}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <main className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[auto_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <CompareStage
          className="lg:aspect-square lg:h-full lg:max-w-[calc(100vw_-_2.75rem_-_640px)]"
          world={world}
          frames={frames}
          snapshot={snapshot}
          connection={connection}
          rays={rays}
          lastRace={lastRace}
        />

        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          <div className="widget flex flex-col gap-4 p-4 sm:p-5">
            <PlaybackControls
              playing={playing}
              speed={status?.speed ?? 30}
              autoReset={status?.auto_reset ?? true}
              enabled={connected}
              send={send}
            >
              <RaysSelector value={rays} onChange={setRays} />
            </PlaybackControls>
          </div>

          <section
            aria-label="Barcos y marcador"
            className="grid flex-1 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]"
          >
            {(["A", "B"] as const).map((id) => {
              const selection = selections[id];
              const lane = snapshot?.lanes.find((l) => l.id === id);
              return (
                <ModelPicker
                  key={id}
                  title={LANE_STYLE[id].name}
                  icon={<span className={cn("font-mono text-sm font-semibold", LANE_STYLE[id].text)}>{id}</span>}
                  actions={
                    <LabeledSwitch
                      label="Sin azar"
                      hint={DETERMINISTIC_HINT}
                      checked={lane?.deterministic ?? true}
                      disabled={!connected}
                      onChange={(deterministic) => send({ type: "set_deterministic", lane: id, deterministic })}
                    />
                  }
                  className={cn("border-t-4", id === "A" ? "border-t-vermilion" : "border-t-boat-b")}
                  runs={runs}
                  runsError={runsError}
                  onRetryRuns={retryRuns}
                  runId={selection.runId}
                  onRunChange={selection.selectRun}
                  detail={selection.detail}
                  checkpointId={selection.checkpointId}
                  onCheckpointChange={selection.selectCheckpoint}
                />
              );
            })}
            <Scoreboard
              scores={snapshot?.scores ?? null}
              models={snapshot?.lanes.map((l) => l.model) ?? []}
              tournament={tournament}
              tournamentRunning={tournamentRunning}
              tournamentSize={tournamentSize}
              onTournamentSizeChange={setTournamentSize}
              enabled={connected}
              send={send}
            />
          </section>
        </div>
      </main>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} shortcuts={COMPARE_SHORTCUTS} />
    </div>
  );
}

function useLoadLane(
  lane: LaneId,
  detail: RunDetail | null,
  checkpointId: string | null,
  connected: boolean,
  send: ReturnType<typeof useComparison>["send"],
) {
  useEffect(() => {
    if (connected && detail && checkpointId) {
      send({ type: "load_model", lane, run_id: detail.id, checkpoint_id: checkpointId });
      send({ type: "restart" });
    }
  }, [lane, connected, detail, checkpointId, send]);
}

function RaysSelector({ value, onChange }: { value: RaysTarget; onChange: (value: RaysTarget) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        <Radar aria-hidden="true" className="size-4" />
        Rayos
      </span>
      <ToggleGroup
        type="single"
        aria-label="Rayos del sensor de"
        value={value}
        onValueChange={(next) => next && onChange(next as RaysTarget)}
        className="rounded-xl bg-secondary p-1"
        size="sm"
      >
        <ToggleGroupItem value="A" className={`rounded-lg px-2.5 ${SELECTED}`}>
          A
        </ToggleGroupItem>
        <ToggleGroupItem value="B" className={`rounded-lg px-2.5 ${SELECTED}`}>
          B
        </ToggleGroupItem>
        <ToggleGroupItem value="none" className={`rounded-lg px-2.5 ${SELECTED}`}>
          Ninguno
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
