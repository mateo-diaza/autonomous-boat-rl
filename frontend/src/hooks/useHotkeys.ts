"use client";

import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, () => void>;

/** Roles que ya usan el teclado: si tienen el foco, los atajos de una tecla no deben saltar (WCAG 2.1.4). */
const INTERACTIVE_ROLES = new Set(["slider", "switch", "radio", "button", "combobox", "listbox", "option", "menuitem", "checkbox"]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return true;
  const role = target.getAttribute("role");
  return role !== null && INTERACTIVE_ROLES.has(role);
}

/**
 * Atajos globales. Las claves son `event.key` (p. ej. " ", "ArrowRight", "r", "R", "[", "?").
 * Se ignoran con modificadores Ctrl/Alt/Meta y cuando el foco está en un control.
 */
export function useHotkeys(map: HotkeyMap) {
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      if (isTypingTarget(event.target)) return;
      const action = mapRef.current[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
