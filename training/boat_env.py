"""Entorno Gymnasium: un barco 2D que debe llegar a una meta esquivando obstáculos.

Unidades del mundo: un mapa cuadrado de WORLD_SIZE x WORLD_SIZE (unidades arbitrarias).
El render escala el mundo a píxeles con RENDER_SCALE.
"""

from __future__ import annotations

import math

import gymnasium as gym
import numpy as np
from gymnasium import spaces

# --- Parámetros del mundo y la física ---------------------------------------
WORLD_SIZE = 100.0
DT = 0.1                 # segundos por paso
SPEED = 10.0             # unidades / s (constante)
TURN_ACCEL = 5.0         # rad/s² aplicada por la acción de girar
TURN_DRAG = 3.0          # rozamiento angular (1/s): da inercia al giro
MAX_OMEGA = 2.5          # rad/s
BOAT_RADIUS = 1.5
GOAL_RADIUS = 3.0

# --- Sensores ----------------------------------------------------------------
N_RAYS = 12
RAY_FOV = math.pi        # 180° delante del barco
RAY_RANGE = 30.0

# --- Recompensa --------------------------------------------------------------
PROGRESS_K = 1.0         # por unidad de distancia ganada hacia la meta
STEP_PENALTY = 0.01
REWARD_MODES = ("shaped", "sparse", "path")
PATH_GRID = 1.0          # resolución (unidades) de la cuadrícula para la distancia por ruta navegable

# --- Trampa en U ----------------------------------------------------------------
U_ROCK_RADIUS = 2.5      # rocas pequeñas y solapadas: forman una pared sin huecos
U_SPACING = 3.5          # < 2 * radio, así se solapan
U_WIDTH = 32.0           # anchura del fondo de la U
U_ARM = 18.0             # largo máximo de los brazos (hacia la salida)
U_POSITION = 0.6         # el fondo está al 60 % del camino salida -> boya

# --- Corrientes -----------------------------------------------------------------
CURRENT_NORM = SPEED     # el sensor mide la corriente en "velocidades del barco": cabe en [-1, 1] sin recortes
CRASH_REWARD = -100.0
GOAL_REWARD = 100.0
MAX_STEPS = 1000

# --- Generación de escenarios -------------------------------------------------
OBSTACLE_RADIUS = (3.0, 8.0)
MIN_START_GOAL_DIST = 50.0
SPAWN_MARGIN = 10.0
EDIT_RADIUS_LIMITS = (1.0, 15.0)   # radios permitidos al editar obstáculos desde fuera

# --- Render ------------------------------------------------------------------
RENDER_SCALE = 7         # píxeles por unidad -> ventana de 700x700
HUD_HEIGHT = 40


def _parse_point(value, name: str) -> np.ndarray:
    """[x, y] -> array dentro del mundo; error claro si el formato no es válido."""
    arr = np.asarray(value, dtype=np.float64)
    if arr.shape != (2,) or not np.all(np.isfinite(arr)):
        raise ValueError(f"'{name}' debe ser [x, y] con números finitos, recibido: {value!r}")
    return np.clip(arr, 0.0, WORLD_SIZE)


def _parse_vector(value, name: str) -> np.ndarray:
    """[vx, vy] -> array; a diferencia de _parse_point no se recorta a los límites del mundo."""
    arr = np.asarray(value, dtype=np.float64)
    if arr.shape != (2,) or not np.all(np.isfinite(arr)):
        raise ValueError(f"'{name}' debe ser [x, y] con números finitos, recibido: {value!r}")
    return arr


class BoatEnv(gym.Env):
    """Barco con velocidad constante que decide girar a la izquierda, seguir recto o girar a la derecha.

    Observación (17 dims, en [-1, 1]):
        [0:12]  distancia normalizada de cada rayo (1 = libre hasta RAY_RANGE)
        [12:14] sin, cos del ángulo relativo a la meta (0 rad = la meta está justo delante)
        [14]    distancia a la meta / diagonal del mapa
        [15]    velocidad angular / MAX_OMEGA
        [16]    velocidad lineal / SPEED (constante = 1; se deja para cuando haya acelerar/frenar)
    """

    metadata = {"render_modes": ["human", "rgb_array"], "render_fps": 30}

    ACTIONS = {0: -1.0, 1: 0.0, 2: +1.0}  # izq / recto / der (signo del giro)

    def __init__(
        self,
        n_obstacles: int | tuple[int, int] = 6,
        render_mode: str | None = None,
        reward_mode: str = "shaped",
        current_speed: tuple[float, float] = (0.0, 0.0),
        observe_current: bool = False,
        u_trap: bool = False,
        observe_route: bool = False,
        obstacle_speed: tuple[float, float] = (0.0, 0.0),
        frame_stack: int = 1,
    ):
        """
        `reward_mode`: "shaped" (progreso hacia la meta en línea recta), "sparse" (solo ±100 al terminar) o
            "path" (progreso por el camino navegable más corto, que rodea los obstáculos).
        `current_speed`: rango (u/s) de la fuerza de la corriente; en cada episodio se sortea fuerza y dirección.
            (0, 0) = sin corriente.
        `observe_current`: el barco tiene un sensor de corriente (+2 dimensiones de observación). Cambia la forma
            de la observación: un modelo solo funciona con el mismo valor con el que se entrenó.
        `u_trap`: entre la salida y la meta hay una barrera en U abierta hacia el barco. Ir en línea recta
            lleva al fondo de la U: un mínimo local de la recompensa por progreso.
        `observe_route`: sensor de ruta, como un GPS náutico: dirección del camino navegable más corto hacia
            la meta (+2 dimensiones). Igual que el sensor de corriente, cambia la forma de la observación.
        `obstacle_speed`: rango (u/s) de velocidad de las rocas aleatorias; se mueven en línea recta y rebotan
            en los bordes. (0, 0) = rocas quietas. Las rocas de la U nunca se mueven.
        `frame_stack`: memoria del agente: observa los últimos N instantes apilados (frame stacking), de los
            que puede deducir velocidades. Multiplica por N la forma de la observación.
        """
        super().__init__()
        assert render_mode is None or render_mode in self.metadata["render_modes"]
        if reward_mode not in REWARD_MODES:
            raise ValueError(f"reward_mode debe ser uno de {REWARD_MODES}, recibido: {reward_mode!r}")
        self.n_obstacles = n_obstacles
        self.reward_mode = reward_mode
        self.current_speed = (float(current_speed[0]), float(current_speed[1]))
        self.observe_current = observe_current
        self.u_trap = u_trap
        self.observe_route = observe_route
        self.obstacle_speed = (float(obstacle_speed[0]), float(obstacle_speed[1]))
        if frame_stack < 1:
            raise ValueError(f"frame_stack debe ser >= 1, recibido: {frame_stack}")
        self.frame_stack = int(frame_stack)
        self._frames: list[np.ndarray] = []
        self.obs_velocities = np.zeros((0, 2))
        self._n_fixed_obstacles = 0
        self.render_mode = render_mode
        self.current = np.zeros(2)

        self.action_space = spaces.Discrete(3)
        n_obs = N_RAYS + 5 + (2 if observe_current else 0) + (2 if observe_route else 0)
        self.observation_space = spaces.Box(low=-1.0, high=1.0, shape=(n_obs * self.frame_stack,), dtype=np.float32)

        # Ángulos de los rayos relativos al rumbo del barco: de -90° (izq) a +90° (der)
        self._ray_offsets = np.linspace(-RAY_FOV / 2, RAY_FOV / 2, N_RAYS)
        self._diag = WORLD_SIZE * math.sqrt(2)

        # Texto extra que pueden mostrar scripts externos (p. ej. replay.py) en el HUD
        self.overlay_text = ""

        self._screen = None
        self._clock = None
        self._font = None

    # ------------------------------------------------------------------ API Gym
    def reset(self, *, seed: int | None = None, options: dict | None = None):
        """Nuevo episodio. Sin `options`, el escenario es aleatorio (reproducible con `seed`).

        `options` permite fijar parte o todo el escenario (lo usa el servidor web);
        lo que no se indique se genera al azar:
            start:     [x, y]             posición inicial del barco
            goal:      [x, y]             posición de la meta
            heading:   float              rumbo inicial en radianes
            obstacles: [[x, y, r], ...]   lista completa de obstáculos ([] = ninguno)
            current:   [vx, vy]           corriente del episodio en u/s (solo si se quiere fijar)
        """
        super().reset(seed=seed)
        options = options or {}
        rng = self.np_random

        if isinstance(self.n_obstacles, tuple):
            n_obs = int(rng.integers(self.n_obstacles[0], self.n_obstacles[1] + 1))
        else:
            n_obs = int(self.n_obstacles)

        lo, hi = SPAWN_MARGIN, WORLD_SIZE - SPAWN_MARGIN
        self.pos = _parse_point(options["start"], "start") if "start" in options else rng.uniform(lo, hi, size=2)
        if "goal" in options:
            self.goal = _parse_point(options["goal"], "goal")
        else:
            while True:
                self.goal = rng.uniform(lo, hi, size=2)
                if np.linalg.norm(self.goal - self.pos) >= MIN_START_GOAL_DIST:
                    break

        if "obstacles" in options:
            self._assign_obstacles(options["obstacles"])
        else:
            # La U no consume azar (se deduce de salida y meta): sin ella, el mar es el de siempre
            self._random_obstacles(n_obs, fixed=self._u_trap_rocks() if self.u_trap else [])

        to_goal = self.goal - self.pos
        if "heading" in options:
            self.heading = float(options["heading"])
        else:
            # Rumbo inicial: hacia la meta ± 90°, para que no empiece mirando a una pared
            self.heading = math.atan2(to_goal[1], to_goal[0]) + rng.uniform(-math.pi / 2, math.pi / 2)
        self.omega = 0.0
        self.speed = SPEED
        self.current = self._episode_current(options)
        self.obs_velocities = self._episode_obstacle_velocities(options)
        self._obstacles_origin = (self.obs_centers.copy(), self.obs_velocities.copy())

        self.steps = 0
        self.prev_dist = float(np.linalg.norm(to_goal))
        self._refresh_path()
        self.episode_return = 0.0
        self.last_event = None
        self.trail = [self.pos.copy()]

        obs = self._stacked(self._get_obs(), "reset")
        if self.render_mode == "human":
            self.render()
        return obs, {}

    def _random_obstacles(self, n_obs: int, fixed: list[tuple[np.ndarray, float]] = ()) -> None:
        """`fixed` + `n_obs` obstáculos aleatorios que no se solapan ni tapan la salida o la meta (rechazo)."""
        rng = self.np_random
        centers = [c for c, _ in fixed]
        radii = [r for _, r in fixed]
        target = len(fixed) + n_obs
        self._n_fixed_obstacles = len(fixed)
        attempts = 0
        while len(centers) < target and attempts < 1000:
            attempts += 1
            r = rng.uniform(*OBSTACLE_RADIUS)
            c = rng.uniform(r, WORLD_SIZE - r, size=2)
            if np.linalg.norm(c - self.pos) < r + 8.0:
                continue
            if np.linalg.norm(c - self.goal) < r + GOAL_RADIUS + 3.0:
                continue
            if any(np.linalg.norm(c - c2) < r + r2 + 2.0 for c2, r2 in zip(centers, radii, strict=True)):
                continue
            centers.append(c)
            radii.append(r)
        self.obs_centers = np.array(centers, dtype=np.float64).reshape(-1, 2)
        self.obs_radii = np.array(radii, dtype=np.float64)

    def _u_trap_rocks(self) -> list[tuple[np.ndarray, float]]:
        """Barrera en U entre salida y meta, abierta hacia la salida (geometría determinista)."""
        to_goal = self.goal - self.pos
        dist = float(np.linalg.norm(to_goal))
        d = to_goal / dist                    # hacia la meta
        n = np.array([-d[1], d[0]])           # perpendicular
        bottom = self.pos + d * dist * U_POSITION
        arm = min(U_ARM, dist * U_POSITION - 12.0)  # la punta de los brazos queda lejos de la salida
        half = U_WIDTH / 2
        points = [bottom + n * t for t in np.arange(-half, half + 1e-6, U_SPACING)]
        for side in (-1.0, 1.0):
            points += [bottom + n * side * half - d * s for s in np.arange(U_SPACING, arm + 1e-6, U_SPACING)]
        # Fuera del mapa sobran: el borde ya es una pared
        return [(p, U_ROCK_RADIUS) for p in points if np.all((p >= 0) & (p <= WORLD_SIZE))]

    # ------------------------------------------------- Edición del escenario en vivo
    def set_obstacles(self, obstacles) -> None:
        """Edición en vivo: sustituye los obstáculos por `[[x, y, r], ...]` (recortados a los límites del mundo)."""
        self._assign_obstacles(obstacles)
        self._refresh_path()

    def _assign_obstacles(self, obstacles) -> None:
        """Valida y guarda los obstáculos, sin efectos secundarios (lo usa reset antes de tener el episodio listo)."""
        arr = np.asarray(obstacles, dtype=np.float64) if len(obstacles) else np.empty((0, 3))
        if arr.ndim != 2 or arr.shape[1] != 3 or not np.all(np.isfinite(arr)):
            raise ValueError(
                f"'obstacles' debe ser una lista de [x, y, r] con números finitos, recibido: {obstacles!r}"
            )
        self.obs_radii = np.clip(arr[:, 2], *EDIT_RADIUS_LIMITS)
        self.obs_centers = np.clip(arr[:, :2], 0.0, WORLD_SIZE)
        # Las velocidades siguen a los obstáculos por posición en la lista; los nuevos empiezan quietos
        velocities = np.zeros((len(arr), 2))
        keep = min(len(arr), len(self.obs_velocities))
        velocities[:keep] = self.obs_velocities[:keep]
        self.obs_velocities = velocities
        self._n_fixed_obstacles = min(self._n_fixed_obstacles, len(arr))
        # Editar redefine el escenario: "repetir travesía" parte de aquí
        self._obstacles_origin = (self.obs_centers.copy(), self.obs_velocities.copy())

    def set_goal(self, goal) -> None:
        """Mueve la meta durante el episodio sin romper la recompensa por progreso."""
        self.goal = _parse_point(goal, "goal")
        self.prev_dist = float(np.linalg.norm(self.goal - self.pos))
        self._refresh_path()

    def observe(self) -> np.ndarray:
        """Observación del estado actual (útil tras editar el escenario sin dar un paso)."""
        return self._stacked(self._get_obs(), "replace")

    def initial_obstacles(self) -> tuple[list[list[float]], list[list[float]]]:
        """Obstáculos [[x, y, r]] y velocidades [[vx, vy]] del inicio del episodio (o de la última edición)."""
        centers, velocities = self._obstacles_origin
        obstacles = [[*c, r] for c, r in zip(centers.tolist(), self.obs_radii.tolist(), strict=True)]
        return obstacles, velocities.tolist()

    def get_state(self) -> dict:
        """Estado completo para pintar fuera de pygame (frontend web). Solo tipos JSON.

        La estela no se incluye: crecería con cada paso; el cliente la acumula con `boat`.
        """
        angles = self.heading + self._ray_offsets
        return {
            "step": self.steps,
            "episode_return": round(self.episode_return, 3),
            "event": self.last_event,
            "boat": {
                "x": round(float(self.pos[0]), 3),
                "y": round(float(self.pos[1]), 3),
                "heading": round(self.heading, 4),
                "omega": round(self.omega, 4),
                "speed": round(self.speed, 3),
                "radius": BOAT_RADIUS,
            },
            "goal": {"x": round(float(self.goal[0]), 3), "y": round(float(self.goal[1]), 3), "radius": GOAL_RADIUS},
            "current": {"x": round(float(self.current[0]), 3), "y": round(float(self.current[1]), 3)},
            "obstacles": [
                {"x": round(float(c[0]), 3), "y": round(float(c[1]), 3), "radius": round(float(r), 3),
                 "vx": round(float(v[0]), 3), "vy": round(float(v[1]), 3)}
                for c, r, v in zip(self.obs_centers, self.obs_radii, self.obs_velocities, strict=True)
            ],
            "rays": [
                {"angle": round(float(a), 4), "distance": round(float(d), 3)}
                for a, d in zip(angles, self._ray_distances(), strict=True)
            ],
        }

    def step(self, action):
        turn = self.ACTIONS[int(action)]

        # Física: la acción acelera el giro; el rozamiento lo frena -> inercia
        self.omega += (turn * TURN_ACCEL - TURN_DRAG * self.omega) * DT
        self.omega = float(np.clip(self.omega, -MAX_OMEGA, MAX_OMEGA))
        self.heading = (self.heading + self.omega * DT + math.pi) % (2 * math.pi) - math.pi
        # Mismo orden de operaciones que sin corriente (sumar una corriente nula es exacto): el mar en calma
        # reproduce bit a bit los escenarios de siempre
        self.pos = self.pos + self.speed * DT * np.array([math.cos(self.heading), math.sin(self.heading)])
        self.pos = self.pos + self.current * DT
        if np.any(self.obs_velocities):
            self._move_obstacles()
        self.steps += 1
        self.trail.append(self.pos.copy())

        dist = float(np.linalg.norm(self.goal - self.pos))
        # "Distancia" que mide el progreso: en línea recta, o por ruta navegable en reward_mode="path"
        progress_dist = dist if self.reward_mode != "path" else self._path_distance(self.pos, fallback=self.prev_dist)
        reward = self._step_reward(progress_dist)
        self.prev_dist = progress_dist

        terminated = False
        event = None
        if self._collided():
            reward += CRASH_REWARD
            terminated, event = True, "crash"
        elif dist < GOAL_RADIUS:
            reward += GOAL_REWARD
            terminated, event = True, "goal"
        truncated = not terminated and self.steps >= MAX_STEPS
        if truncated:
            event = "timeout"

        self.episode_return += reward
        self.last_event = event
        info = {"is_success": event == "goal", "event": event}

        obs = self._stacked(self._get_obs(), "push")
        if self.render_mode == "human":
            self.render()
        return obs, float(reward), terminated, truncated, info

    def _step_reward(self, dist: float) -> float:
        """Recompensa de un paso sin contar el final del episodio (±100 se suma aparte)."""
        if self.reward_mode == "sparse":
            # Sin pistas: el agente solo sabe que lo ha hecho bien cuando llega (o mal cuando choca)
            return 0.0
        # Shaping basado en potencial (Φ = -distancia): no cambia la política óptima, pero da señal en cada paso.
        # Con "path" la distancia es por ruta navegable: rodear un obstáculo ya no se castiga
        return PROGRESS_K * (self.prev_dist - dist) - STEP_PENALTY

    # ------------------------------------------------ Distancia por ruta navegable
    def _refresh_path(self) -> None:
        """Recalcula el campo de distancias si algo lo usa (recompensa por ruta o sensor de ruta)."""
        if self.reward_mode != "path" and not self.observe_route:
            return
        self._compute_path_field()
        if self.reward_mode == "path":
            self.prev_dist = self._path_distance(self.pos, fallback=self.prev_dist)

    def _route_sensor(self) -> list[float]:
        """[sin, cos] del ángulo, relativo al rumbo, de la dirección en la que más baja la distancia por ruta."""
        h = 0.5 * PATH_GRID
        here = self._path_distance(self.pos, fallback=math.inf)
        samples = [self._path_distance(self.pos + d, fallback=here) for d in ([h, 0], [-h, 0], [0, h], [0, -h])]
        gradient = np.array([samples[0] - samples[1], samples[2] - samples[3]])
        if not np.all(np.isfinite(gradient)) or np.linalg.norm(gradient) < 1e-9:
            direction = self.goal - self.pos  # sin dato (p. ej. junto a una roca): la meta en línea recta
        else:
            direction = -gradient
        rel = math.atan2(direction[1], direction[0]) - self.heading
        return [math.sin(rel), math.cos(rel)]
    def _compute_path_field(self) -> None:
        """Distancia desde cada celda hasta la meta esquivando obstáculos y paredes (8 vecinos).

        Relajación iterativa vectorizada (Bellman-Ford sobre la cuadrícula): unas decenas de pasadas
        de NumPy, ~10-30 ms por episodio. Los obstáculos se agrandan con el radio del barco.
        """
        n = int(round(WORLD_SIZE / PATH_GRID)) + 1
        coords = np.arange(n) * PATH_GRID
        gx, gy = np.meshgrid(coords, coords, indexing="ij")
        margin_lo, margin_hi = BOAT_RADIUS, WORLD_SIZE - BOAT_RADIUS
        free = (gx >= margin_lo) & (gx <= margin_hi) & (gy >= margin_lo) & (gy <= margin_hi)
        for (cx, cy), r in zip(self.obs_centers, self.obs_radii, strict=True):
            free &= (gx - cx) ** 2 + (gy - cy) ** 2 >= (r + BOAT_RADIUS) ** 2

        field = np.full((n, n), np.inf)
        gi, gj = np.clip(np.round(self.goal / PATH_GRID).astype(int), 0, n - 1)
        field[gi, gj] = 0.0
        steps = [(di, dj, PATH_GRID * math.hypot(di, dj)) for di in (-1, 0, 1) for dj in (-1, 0, 1) if di or dj]
        for _ in range(4 * n):  # cota de seguridad; converge mucho antes
            best = field.copy()
            for di, dj, cost in steps:
                shifted = np.full_like(field, np.inf)
                src_i = slice(max(-di, 0), n - max(di, 0))
                dst_i = slice(max(di, 0), n - max(-di, 0))
                src_j = slice(max(-dj, 0), n - max(dj, 0))
                dst_j = slice(max(dj, 0), n - max(-dj, 0))
                shifted[dst_i, dst_j] = field[src_i, src_j] + cost
                np.minimum(best, shifted, out=best)
            best[~free] = np.inf
            best[gi, gj] = 0.0
            if np.array_equal(best, field):
                break
            field = best
        self._path_field = field

    def _path_distance(self, point: np.ndarray, fallback: float) -> float:
        """Distancia por ruta en un punto (interpolación bilineal entre las celdas alcanzables)."""
        field = self._path_field
        n = field.shape[0]
        x, y = np.clip(point / PATH_GRID, 0, n - 1 - 1e-9)
        i, j = int(x), int(y)
        fx, fy = x - i, y - j
        values = field[i : i + 2, j : j + 2]
        weights = np.array([[(1 - fx) * (1 - fy), (1 - fx) * fy], [fx * (1 - fy), fx * fy]])
        reachable = np.isfinite(values)
        if not reachable.any():
            return fallback  # pegado a una roca: sin dato, sin progreso
        return float((values[reachable] * weights[reachable]).sum() / weights[reachable].sum())

    # ----------------------------------------------------------------- Sensores
    def _ray_distances(self) -> np.ndarray:
        """Distancia (sin normalizar) a la primera pared u obstáculo de cada rayo."""
        angles = self.heading + self._ray_offsets
        dirs = np.stack([np.cos(angles), np.sin(angles)], axis=1)  # (R, 2)
        p = self.pos

        # Paredes: distancia hasta x=0, x=W, y=0, y=W en la dirección del rayo
        with np.errstate(divide="ignore", invalid="ignore"):
            tx = np.where(dirs[:, 0] > 0, (WORLD_SIZE - p[0]) / dirs[:, 0],
                          np.where(dirs[:, 0] < 0, -p[0] / dirs[:, 0], np.inf))
            ty = np.where(dirs[:, 1] > 0, (WORLD_SIZE - p[1]) / dirs[:, 1],
                          np.where(dirs[:, 1] < 0, -p[1] / dirs[:, 1], np.inf))
        t = np.minimum(np.minimum(tx, ty), RAY_RANGE)
        t = np.maximum(t, 0.0)

        # Obstáculos: intersección rayo-círculo |p + t·d - c|² = r²
        if len(self.obs_radii):
            f = p[None, :] - self.obs_centers                  # (N, 2)
            b = dirs @ f.T                                     # (R, N)
            c = np.sum(f * f, axis=1) - self.obs_radii ** 2    # (N,)
            disc = b * b - c[None, :]
            sq = np.sqrt(np.maximum(disc, 0.0))
            t_hit = -b - sq
            t_hit = np.where(t_hit < 0, -b + sq, t_hit)        # por si el origen está dentro
            t_hit = np.where((disc >= 0) & (t_hit >= 0), t_hit, np.inf)
            t = np.minimum(t, t_hit.min(axis=1))
        return t

    def _get_obs(self) -> np.ndarray:
        rays = self._ray_distances() / RAY_RANGE
        to_goal = self.goal - self.pos
        rel = math.atan2(to_goal[1], to_goal[0]) - self.heading
        obs = np.concatenate([
            rays,
            [math.sin(rel), math.cos(rel)],
            [min(np.linalg.norm(to_goal) / self._diag, 1.0)],
            [self.omega / MAX_OMEGA],
            [self.speed / SPEED],
            self._current_sensor() if self.observe_current else [],
            self._route_sensor() if self.observe_route else [],
        ])
        return np.clip(obs, -1.0, 1.0).astype(np.float32)

    def _current_sensor(self) -> list[float]:
        """Corriente en el marco del barco: [a favor del rumbo, de costado hacia estribor] / CURRENT_NORM."""
        forward = np.array([math.cos(self.heading), math.sin(self.heading)])
        starboard = np.array([-forward[1], forward[0]])  # 90° a la derecha (eje y hacia abajo)
        return [float(self.current @ forward) / CURRENT_NORM, float(self.current @ starboard) / CURRENT_NORM]

    def _episode_obstacle_velocities(self, options: dict) -> np.ndarray:
        """Velocidad de cada roca durante el episodio. Sin movimiento no se consume azar."""
        n = len(self.obs_radii)
        if "obstacle_velocities" in options:
            velocities = np.asarray(options["obstacle_velocities"], dtype=np.float64).reshape(-1, 2)
            if len(velocities) != n or not np.all(np.isfinite(velocities)):
                raise ValueError(f"'obstacle_velocities' debe tener {n} pares [vx, vy] finitos")
            return velocities
        velocities = np.zeros((n, 2))
        lo, hi = self.obstacle_speed
        if hi <= 0 or "obstacles" in options:
            return velocities
        for i in range(self._n_fixed_obstacles, n):  # las rocas de la U no se mueven
            speed = self.np_random.uniform(lo, hi)
            angle = self.np_random.uniform(-math.pi, math.pi)
            velocities[i] = speed * np.array([math.cos(angle), math.sin(angle)])
        return velocities

    def _move_obstacles(self) -> None:
        """Movimiento rectilíneo con rebote elástico en los bordes del mapa."""
        self.obs_centers = self.obs_centers + self.obs_velocities * DT
        for axis in (0, 1):
            low = self.obs_centers[:, axis] < self.obs_radii
            high = self.obs_centers[:, axis] > WORLD_SIZE - self.obs_radii
            self.obs_velocities[low | high, axis] *= -1
            self.obs_centers[:, axis] = np.clip(self.obs_centers[:, axis], self.obs_radii, WORLD_SIZE - self.obs_radii)

    def _stacked(self, frame: np.ndarray, how: str) -> np.ndarray:
        """Frame stacking: "reset" llena la memoria con el primer instante, "push" añade uno nuevo y
        "replace" corrige el último (tras editar el escenario). Sin memoria (N=1) devuelve el instante tal cual."""
        if self.frame_stack == 1:
            return frame
        if how == "reset" or not self._frames:
            self._frames = [frame] * self.frame_stack
        elif how == "push":
            self._frames = [*self._frames[1:], frame]
        else:
            self._frames = [*self._frames[:-1], frame]
        return np.concatenate(self._frames)

    def _episode_current(self, options: dict) -> np.ndarray:
        """Corriente fija durante el episodio. Sin corriente no se consume azar: el mar en calma no cambia."""
        if "current" in options:
            return _parse_vector(options["current"], "current")
        lo, hi = self.current_speed
        if hi <= 0:
            return np.zeros(2)
        speed = self.np_random.uniform(lo, hi)
        angle = self.np_random.uniform(-math.pi, math.pi)
        return speed * np.array([math.cos(angle), math.sin(angle)])

    def _collided(self) -> bool:
        x, y = self.pos
        if x < BOAT_RADIUS or y < BOAT_RADIUS or x > WORLD_SIZE - BOAT_RADIUS or y > WORLD_SIZE - BOAT_RADIUS:
            return True
        if len(self.obs_radii):
            d = np.linalg.norm(self.obs_centers - self.pos, axis=1)
            return bool(np.any(d < self.obs_radii + BOAT_RADIUS))
        return False

    # ------------------------------------------------------------------- Render
    def render(self):
        if self.render_mode is None:
            return None
        import pygame

        size = int(WORLD_SIZE * RENDER_SCALE)
        if self._screen is None:
            pygame.init()
            if self.render_mode == "human":
                pygame.display.set_caption("Barco autónomo - RL")
                self._screen = pygame.display.set_mode((size, size + HUD_HEIGHT))
            else:
                self._screen = pygame.Surface((size, size + HUD_HEIGHT))
            self._clock = pygame.time.Clock()
            self._font = pygame.font.SysFont("monospace", 16, bold=True)

        def px(v):
            # Mundo -> pantalla (y hacia abajo, el HUD ocupa la franja superior)
            return int(v[0] * RENDER_SCALE), int(v[1] * RENDER_SCALE) + HUD_HEIGHT

        s = self._screen
        s.fill((18, 30, 48))
        pygame.draw.rect(s, (28, 92, 140), (0, HUD_HEIGHT, size, size))

        # Meta
        pygame.draw.circle(s, (60, 200, 90), px(self.goal), int(GOAL_RADIUS * RENDER_SCALE))
        pygame.draw.circle(s, (220, 255, 220), px(self.goal), int(GOAL_RADIUS * RENDER_SCALE), 2)

        # Obstáculos (rocas)
        for c, r in zip(self.obs_centers, self.obs_radii, strict=True):
            pygame.draw.circle(s, (110, 98, 84), px(c), int(r * RENDER_SCALE))
            pygame.draw.circle(s, (70, 60, 50), px(c), int(r * RENDER_SCALE), 3)

        # Corriente: flechas tenues sobre el agua
        if np.any(self.current):
            direction = self.current / np.linalg.norm(self.current)
            for gx in range(10, int(WORLD_SIZE), 20):
                for gy in range(10, int(WORLD_SIZE), 20):
                    start = np.array([gx, gy], dtype=float)
                    end = start + direction * 4.0
                    pygame.draw.line(s, (70, 130, 170), px(start), px(end), 2)
                    pygame.draw.circle(s, (70, 130, 170), px(end), 3)

        # Estela
        if len(self.trail) > 1:
            pygame.draw.lines(s, (200, 230, 255), False, [px(p) for p in self.trail], 2)

        # Rayos: verde = libre, rojo = obstáculo cerca
        dists = self._ray_distances()
        for off, d in zip(self._ray_offsets, dists, strict=True):
            a = self.heading + off
            end = self.pos + d * np.array([math.cos(a), math.sin(a)])
            k = d / RAY_RANGE
            color = (int(255 * (1 - k)), int(200 * k), 60)
            pygame.draw.line(s, color, px(self.pos), px(end), 1)
            if k < 1.0:
                pygame.draw.circle(s, color, px(end), 3)

        # Barco: triángulo orientado según el rumbo
        h = self.heading
        L = BOAT_RADIUS * 2.0
        pts = [
            self.pos + L * np.array([math.cos(h), math.sin(h)]),
            self.pos + L * 0.8 * np.array([math.cos(h + 2.5), math.sin(h + 2.5)]),
            self.pos + L * 0.8 * np.array([math.cos(h - 2.5), math.sin(h - 2.5)]),
        ]
        pygame.draw.polygon(s, (250, 250, 250), [px(p) for p in pts])
        pygame.draw.polygon(s, (20, 20, 20), [px(p) for p in pts], 2)

        # HUD
        hud = f"paso {self.steps:4d}  retorno {self.episode_return:8.1f}"
        if np.any(self.current):
            hud += f"  corriente {np.linalg.norm(self.current):.1f} u/s"
        
        assert self._font is not None
        assert self._clock is not None
        
        s.blit(self._font.render(hud, True, (230, 230, 230)), (10, 10))
        if self.overlay_text:
            txt = self._font.render(self.overlay_text, True, (255, 210, 90))
            s.blit(txt, (size - txt.get_width() - 10, 10))

        if self.render_mode == "human":
            pygame.event.pump()
            pygame.display.flip()
            self._clock.tick(self.metadata["render_fps"])
            return None
        return np.transpose(pygame.surfarray.array3d(s), (1, 0, 2))

    def close(self):
        if self._screen is not None:
            import pygame
            pygame.display.quit()
            pygame.quit()
            self._screen = None
