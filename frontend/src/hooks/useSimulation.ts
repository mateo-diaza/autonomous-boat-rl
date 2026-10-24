"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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

export type Connection = "connecting" | "open" | "closed";

export type EpisodeLogEntry = EpisodeEndMsg & { id: number };

/** Cada cuánto se refresca la UI de React (HUD, paneles). El canvas va aparte, a 60 fps. */
const SNAPSHOT_INTERVAL_MS = 120;
const MAX_RETRY_DELAY_MS = 10_000;
const EPISODE_LOG_SIZE = 8;

/**
 * Conexión con la simulación en vivo.
 *
 * - `frames`: estados crudos fuera de React (los lee el canvas en su bucle de pintado).
 * - `snapshot`: último estado, muestreado cada ~120 ms para la interfaz.
 * - Reconexión automática con backoff exponencial (1 s, 2 s, 4 s… máx. 10 s).
 */
export function useSimulation(url: string = WS_URL) {
  const [frames] = useState(() => new FrameStore());
  const [connection, setConnection] = useState<Connection>("connecting");
  const [world, setWorld] = useState<WorldInfo | null>(null);
  const [snapshot, setSnapshot] = useState<StateMsg | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeLogEntry[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let latest: StateMsg | null = null;
    let episodeId = 0;

    const flushSnapshot = () => {
      flushTimer = undefined;
      setSnapshot(latest);
    };

    const handleMessage = (event: MessageEvent<string>) => {
      const msg: unknown = JSON.parse(event.data);
      if (!isServerMessage(msg)) return;
      switch (msg.type) {
        case "hello":
          setWorld(msg.world);
          break;
        case "state":
          frames.push(msg.sim, performance.now());
          latest = msg;
          flushTimer ??= setTimeout(flushSnapshot, SNAPSHOT_INTERVAL_MS);
          break;
        case "episode_end":
          episodeId += 1;
          setEpisodes((log) => [{ ...msg, id: episodeId }, ...log].slice(0, EPISODE_LOG_SIZE));
          break;
        case "error":
          toast.error(msg.message);
          break;
        default:
          assertNever(msg);
      }
    };

    const connect = () => {
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
        setConnection("open");
      };
      socket.onmessage = handleMessage;
      socket.onclose = () => {
        if (disposed) return;
        socketRef.current = null;
        setConnection("closed");
        const delay = Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
        attempt += 1;
        retryTimer = setTimeout(() => {
          setConnection("connecting");
          connect();
        }, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearTimeout(flushTimer);
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket?.readyState === WebSocket.CONNECTING) {
        // Cerrar un socket que aún conecta provoca un aviso en consola (pasa con el doble montaje de StrictMode)
        socket.onopen = () => socket.close();
        socket.onmessage = null;
      } else {
        socket?.close();
      }
    };
  }, [url, frames]);

  const send = useCallback((command: ClientCommand) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
  }, []);

  return { connection, world, snapshot, episodes, frames, send };
}
