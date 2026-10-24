"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useServerSocket } from "@/hooks/useServerSocket";
import { SNAPSHOT_INTERVAL_MS } from "@/hooks/useSimulation";
import { WS_COMPARE_URL } from "@/lib/config";
import { FrameStore } from "@/lib/sim/frameStore";
import {
  assertNever,
  isCompareServerMessage,
  type CompareCommand,
  type CompareStateMsg,
  type LaneId,
  type RaceEndMsg,
  type TournamentResult,
  type WorldInfo,
} from "@/lib/types";

export type RaceLogEntry = RaceEndMsg & { id: number };

/** Comparativa en vivo (/ws/compare): dos barcos, un FrameStore por barco. */
export function useComparison(url: string = WS_COMPARE_URL) {
  const [frames] = useState<Record<LaneId, FrameStore>>(() => ({ A: new FrameStore(), B: new FrameStore() }));
  const [world, setWorld] = useState<WorldInfo | null>(null);
  const [snapshot, setSnapshot] = useState<CompareStateMsg | null>(null);
  const [lastRace, setLastRace] = useState<RaceLogEntry | null>(null);
  const [tournament, setTournament] = useState<TournamentResult | null>(null);
  const latestRef = useRef<CompareStateMsg | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const raceIdRef = useRef(0);

  useEffect(() => () => clearTimeout(flushTimerRef.current), []);

  const handleMessage = useCallback(
    (msg: unknown) => {
      if (!isCompareServerMessage(msg)) return;
      switch (msg.type) {
        case "hello":
          setWorld(msg.world);
          break;
        case "compare_state": {
          const now = performance.now();
          for (const lane of msg.lanes) frames[lane.id].push(lane.sim, now);
          latestRef.current = msg;
          flushTimerRef.current ??= setTimeout(() => {
            flushTimerRef.current = undefined;
            setSnapshot(latestRef.current);
          }, SNAPSHOT_INTERVAL_MS);
          break;
        }
        case "race_end":
          raceIdRef.current += 1;
          setLastRace({ ...msg, id: raceIdRef.current });
          break;
        case "tournament":
          setTournament(msg.result);
          break;
        case "error":
          toast.error(msg.message);
          break;
        default:
          assertNever(msg);
      }
    },
    [frames],
  );

  const { connection, send } = useServerSocket<CompareCommand>(url, handleMessage);
  return { connection, world, snapshot, lastRace, tournament, frames, send };
}
