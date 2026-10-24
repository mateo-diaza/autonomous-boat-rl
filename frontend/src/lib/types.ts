/**
 * Contrato con el backend. Espejo de server/schemas.py: mismos nombres (snake_case).
 * Si cambia un esquema en Python, cambia aquí en el mismo commit.
 */

export type Algo = "dqn" | "ppo";
export type EpisodeEvent = "goal" | "crash" | "timeout";
/** 0 = babor (izquierda), 1 = avante (recto), 2 = estribor (derecha). */
export type Action = 0 | 1 | 2;

// ---------------------------------------------------------------------- REST
export type CheckpointInfo = {
  id: string; // "0", "5000"..., "final" o "best"
  label: string;
  steps: number | null;
};

export type CurvePoint = {
  steps: number;
  mean_reward: number;
  success_rate: number | null;
};

export type RunSummary = {
  id: string;
  algo: Algo;
  obstacles: string;
  total_steps: number;
  n_checkpoints: number;
  best_success_rate: number | null;
};

export type RunDetail = RunSummary & {
  checkpoints: CheckpointInfo[];
  curve: CurvePoint[];
};

// --------------------------------------------------------- Estado del mundo
export type WorldInfo = {
  size: number;
  ray_range: number;
  n_rays: number;
  dt: number;
  max_steps: number;
  obstacle_radius_limits: [number, number];
  speed_limits: [number, number];
  sim_hz: number;
};

export type Boat = {
  x: number;
  y: number;
  heading: number;
  omega: number;
  speed: number;
  radius: number;
};

export type Circle = { x: number; y: number; radius: number };

export type Ray = { angle: number; distance: number };

export type ModelRef = { run_id: string; checkpoint_id: string; algo: Algo };

export type SimState = {
  step: number;
  episode_return: number;
  event: EpisodeEvent | null;
  boat: Boat;
  goal: Circle;
  obstacles: Circle[];
  rays: Ray[];
  action: Action | null;
  /** PPO: probabilidades; DQN: softmax de los Q-values. */
  action_probs: [number, number, number] | null;
};

export type SessionStatus = {
  playing: boolean;
  speed: number;
  deterministic: boolean;
  auto_reset: boolean;
  scenario_seed: number;
  model: ModelRef | null;
};

// ------------------------------------------------ Mensajes servidor -> cliente
export type HelloMsg = { type: "hello"; world: WorldInfo };
export type StateMsg = { type: "state"; sim: SimState; status: SessionStatus };
export type EpisodeEndMsg = { type: "episode_end"; event: EpisodeEvent; steps: number; episode_return: number };
export type ErrorMsg = { type: "error"; message: string };

export type ServerMessage = HelloMsg | StateMsg | EpisodeEndMsg | ErrorMsg;

// ------------------------------------------------ Comandos cliente -> servidor
export type ClientCommand =
  | { type: "load_model"; run_id: string; checkpoint_id: string }
  | { type: "unload_model" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "step" }
  | { type: "set_speed"; speed: number }
  | { type: "set_deterministic"; deterministic: boolean }
  | { type: "set_auto_reset"; auto_reset: boolean }
  | { type: "new_scenario"; seed?: number | null; n_obstacles?: number | null }
  | { type: "restart" }
  | { type: "add_obstacle"; x: number; y: number; radius?: number }
  | { type: "remove_obstacle"; index: number }
  | { type: "move_obstacle"; index: number; x: number; y: number }
  | { type: "set_goal"; x: number; y: number };

const SERVER_MESSAGE_TYPES = new Set<ServerMessage["type"]>(["hello", "state", "episode_end", "error"]);

/** Comprobación ligera de lo que llega por el socket (el servidor valida con Pydantic). */
export function isServerMessage(value: unknown): value is ServerMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    SERVER_MESSAGE_TYPES.has((value as { type: ServerMessage["type"] }).type)
  );
}

export function assertNever(value: never): never {
  throw new Error(`Mensaje no soportado: ${JSON.stringify(value)}`);
}
