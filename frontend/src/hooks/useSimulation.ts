"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useServerSocket } from "@/hooks/useServerSocket";
import { WS_URL } from "@/lib/config";
import { FrameStore } from "@/lib/sim/frameStore";
import {
  assertNever,
  isServerMessage,
  type ClientCommand,
  type EpisodeEndMsg,
  type StateMsg,
  type WorldInfo,
} from "@/lib/types";

export type { Connection } from "@/hooks/useServerSocket";

export type EpisodeLogEntry = EpisodeEndMsg & { id: number };

/** Cada cuánto se refresca la UI de React (HUD, paneles). El canvas va aparte, a 60 fps. */
export const SNAPSHOT_INTERVAL_MS = 120;
const EPISODE_LOG_SIZE = 8;

/**
 * Navegación en vivo (/ws/sim).
 *
 * - `frames`: estados crudos fuera de React (los lee el canvas en su bucle de pintado).
 * - `snapshot`: último estado, muestreado cada ~120 ms para la interfaz.
 */
export function useSimulation(url: string = WS_URL) {
  const [frames] = useState(() => new FrameStore());
  const [world, setWorld] = useState<WorldInfo | null>(null);
  const [snapshot, setSnapshot] = useState<StateMsg | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeLogEntry[]>([]);
  const latestRef = useRef<StateMsg | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const episodeIdRef = useRef(0);

  useEffect(() => () => clearTimeout(flushTimerRef.current), []);

  const handleMessage = useCallback(
    (msg: unknown) => {
      if (!isServerMessage(msg)) return;
      switch (msg.type) {
        case "hello":
          setWorld(msg.world);
          break;
        case "state":
          frames.push(msg.sim, performance.now());
          latestRef.current = msg;
          flushTimerRef.current ??= setTimeout(() => {
            flushTimerRef.current = undefined;
            setSnapshot(latestRef.current);
          }, SNAPSHOT_INTERVAL_MS);
          break;
        case "episode_end":
          episodeIdRef.current += 1;
          setEpisodes((log) => [{ ...msg, id: episodeIdRef.current }, ...log].slice(0, EPISODE_LOG_SIZE));
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

  const { connection, send } = useServerSocket<ClientCommand>(url, handleMessage);
  return { connection, world, snapshot, episodes, frames, send };
}
