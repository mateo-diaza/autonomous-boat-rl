"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Connection = "connecting" | "open" | "closed";

const MAX_RETRY_DELAY_MS = 10_000;

/**
 * WebSocket con reconexión automática (backoff 1 s, 2 s, 4 s… máx. 10 s) y cierre limpio.
 * `onMessage` recibe el JSON ya parseado; se lee de una ref, así que puede cambiar sin reconectar.
 */
export function useServerSocket<TCommand>(url: string, onMessage: (data: unknown) => void) {
  const [connection, setConnection] = useState<Connection>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
        setConnection("open");
      };
      socket.onmessage = (event: MessageEvent<string>) => onMessageRef.current(JSON.parse(event.data));
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
  }, [url]);

  const send = useCallback((command: TCommand) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
  }, []);

  return { connection, send };
}
