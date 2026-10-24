---
name: nextjs-frontend
description: Buenas prácticas para el frontend Next.js (App Router, TypeScript, Tailwind, shadcn/ui, Recharts) de autonomous-boat-rl en frontend/, que visualiza en vivo la simulación del barco vía WebSocket. Úsala siempre que crees o modifiques componentes, hooks, páginas, el canvas de simulación, la conexión WebSocket/REST con el backend, o la configuración del proyecto Next.js.
---

# Frontend Next.js (frontend/)

Lee también `clean-code`, `ui-design` y `web-accessibility`: las tres aplican a todo componente.

## 1. Stack y configuración

- Next.js **16.4** con **App Router**, React 19, TypeScript `strict`, Tailwind CSS 4, shadcn/ui 4 (base **Radix**,
  estilo `radix-nova`), Recharts 3, lucide-react (iconos).
- Gestor: **pnpm**. Comprueba versiones reales en `package.json` antes de asumir APIs.
- **Next 16 cambia APIs**: ante la duda, lee `frontend/node_modules/next/dist/docs/` (lo pide `frontend/AGENTS.md`).

### Particularidades de esta versión (verificadas en la documentación local)
- `cacheComponents: true` está activo:
  - **Prohibido** `Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()` en el cuerpo del render
    (rompe el build). Úsalos en efectos o manejadores de eventos.
  - **Prohibido** `export const dynamic`, `revalidate`, `fetchCache` o `runtime` en rutas.
  - Las rutas ocultas se mantienen montadas y sus efectos se limpian y re-ejecutan: todo `useEffect` con
    WebSocket/timers **debe** limpiar en el cleanup.
  - `useSearchParams()` necesita `<Suspense>`.
- `themeColor`/`colorScheme` van en `export const viewport`, no en `metadata`.
- `LayoutProps<"/">` / `PageProps<"/">` son globales generados: `pnpm typecheck` ejecuta `next typegen` antes de `tsc`.
- `next lint` ya no existe: `pnpm lint` ejecuta el CLI de ESLint (config plana `eslint.config.mjs`).
- `cn()` viene del paquete `cn` (de shadcn, sustituye a clsx + tailwind-merge): `import { cn } from "@/lib/utils"`.
- `<Toaster theme="light" />` fijo: no hay ThemeProvider de next-themes.
- Toda la app es una demo local: no hay auth, ni base de datos, ni SSR de datos del backend.
- URL del backend en `NEXT_PUBLIC_API_URL` (por defecto `http://localhost:8000`) leída en un único módulo `lib/config.ts`.

## 2. Estructura

```
frontend/src/
├── app/
│   ├── layout.tsx          # fuentes, tema, <html lang="es">
│   ├── page.tsx            # composición de la pantalla principal (server component fino)
│   └── globals.css         # tokens de diseño (ver ui-design)
├── components/
│   ├── ui/                 # shadcn/ui generados (no editar a mano salvo necesidad)
│   ├── simulation/         # SimCanvas, SimToolbar, SimHud
│   ├── brain/              # BrainPanel (rayos + probabilidades de acción)
│   ├── runs/               # RunSelector, CheckpointSlider
│   └── charts/             # LearningCurve
├── hooks/                  # useSimulation, useRuns, useRunCurve
└── lib/
    ├── config.ts
    ├── types.ts            # espejo de server/schemas.py
    ├── api.ts              # fetchers REST tipados
    └── draw/               # funciones puras de pintado en canvas (drawBoat, drawRays...)
```

- Un componente por fichero, `PascalCase.tsx`. Hooks `useXxx.ts`. Utilidades `camelCase.ts`.
- Exports con nombre (no `export default`) salvo en `page.tsx`/`layout.tsx`, que Next exige.

## 3. Server vs Client Components

- Por defecto, Server Components. Añade `"use client"` **solo** en hojas interactivas
  (canvas, controles, gráficas, hooks con estado/efectos).
- `page.tsx` compone; los datos en vivo llegan por WebSocket en el cliente.

## 4. Contrato con el backend

- `lib/types.ts` replica `server/schemas.py` con **los mismos nombres de campo (snake_case)**.
- Mensajes como uniones discriminadas por `type`, con `switch` exhaustivo:

```ts
type ServerMessage = StateMsg | EpisodeEndMsg | ErrorMsg;

function assertNever(x: never): never { throw new Error(`Mensaje no soportado: ${JSON.stringify(x)}`); }

switch (msg.type) {
  case "state": ...; break;
  case "episode_end": ...; break;
  case "error": ...; break;
  default: assertNever(msg);
}
```

- Valida lo que llega con un type guard ligero (o zod si ya está instalado); nunca `as any`.

## 5. Rendimiento del canvas (crítico)

El servidor manda estados a 30–60 Hz. **No pongas cada frame en estado de React.**

- `useSimulation` guarda el último estado en un `useRef` y expone:
  - `stateRef` → lo lee el bucle de pintado del canvas.
  - Un estado de React **muestreado** (p. ej. cada 100–200 ms) para HUD, panel cerebro y métricas.
- `SimCanvas` pinta con `requestAnimationFrame` leyendo `stateRef.current`; cancela el rAF en el cleanup.
- Funciones de pintado **puras** en `lib/draw/` (`drawBoat(ctx, boat, scale)`), testeables y reutilizables.
- Soporte HiDPI: escala el canvas por `window.devicePixelRatio`.
- Redimensiona con `ResizeObserver`; el mundo (100×100) se mapea al tamaño disponible manteniendo proporción.
- Interpolación opcional entre los dos últimos estados para suavizar si el tick es < 60 Hz.

## 6. WebSocket

- Un único hook `useSimulation(url)` encapsula conexión, reconexión con backoff (1s, 2s, 4s… máx 10s),
  envío tipado (`send(cmd: ClientCommand)`) y estado de conexión (`"connecting" | "open" | "closed"`).
- Cerrar el socket en el cleanup del efecto (cuidado con el doble montaje de StrictMode en dev).
- El estado de conexión se muestra siempre en la UI (badge) — nunca falles en silencio.

## 7. Estado y datos

- Estado local con `useState`/`useReducer`; si varios componentes lejanos lo necesitan, un Context
  pequeño (`SimulationProvider`). No añadir Redux/Zustand salvo necesidad demostrada.
- REST: `fetch` tipado en `lib/api.ts`; en componentes cliente, un hook (`useRuns`) con estados
  `loading | error | data`. (SWR/React Query solo si ya están instalados.)
- Derivar en vez de duplicar estado: si se puede calcular a partir de otro, calcúlalo.

## 8. Interacción con el mapa

- Convertir coordenadas de puntero a mundo en una función pura `screenToWorld(evt, canvasRect, scale)`.
- Usar Pointer Events (`onPointerDown/Move/Up`) para ratón y táctil a la vez.
- Herramienta activa explícita (`"select" | "add_obstacle" | "move_goal" | "erase"`) y visible en la toolbar.
- Todas las acciones del mapa tienen alternativa por teclado / botón (ver `web-accessibility`).

## 9. Calidad

- `pnpm lint`, `pnpm typecheck` y `pnpm build` sin errores antes de commitear.
- Sin `any`, sin `// @ts-ignore` (si es inevitable, `@ts-expect-error` con motivo).
- Componentes < ~150 líneas; si crecen, extrae subcomponentes o hooks.
- Props tipadas con `type XxxProps = {...}`; nada de props que no se usan.
- Textos de UI en español, centralizados si se repiten.

## 10. Ejecución

```bash
cd frontend && pnpm dev          # solo frontend (localhost:3000)
pnpm dev                         # desde la raíz: backend + frontend con concurrently
```
