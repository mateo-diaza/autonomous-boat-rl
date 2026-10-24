---
name: clean-code
description: Principios de código limpio, patrones de diseño y convenciones de commits para el proyecto autonomous-boat-rl (Python y TypeScript). Úsala SIEMPRE antes de escribir o refactorizar código en cualquier parte del repo (training/, backend/, frontend/), al diseñar módulos nuevos, al decidir dónde va una responsabilidad o al hacer commits.
---

# Clean code en autonomous-boat-rl

Contexto: hackathon de ~10 h. La regla de oro es **código simple, legible y que funcione en la demo**.
Calidad sí, sobreingeniería no.

## 1. Principios (en orden de prioridad)

1. **Legibilidad > ingenio.** Alguien que no ha visto el código debe entender una función en 30 s.
2. **YAGNI.** No añadas abstracciones, flags ni capas "por si acaso". Se añaden cuando hay un segundo caso real.
3. **Una responsabilidad por unidad.** Una función hace una cosa; un módulo agrupa una idea.
   Si para describir una función necesitas "y", probablemente son dos.
4. **DRY con criterio.** Duplicar dos veces es aceptable; a la tercera, extrae. Nunca extraigas
   código que se parece pero cambia por motivos distintos.
5. **Fronteras claras.** El RL (training/) no sabe nada de la web; el backend (backend/) no sabe nada de
   cómo se pinta; el frontend no sabe nada de SB3. Se comunican por contratos tipados.
6. **Falla pronto y con un mensaje útil.** Valida en los bordes (entrada HTTP, mensajes WS, CLI);
   dentro del núcleo confía en los tipos.

## 2. Nombres

- Nombres que revelan intención: `ray_distances`, `success_rate`, `selectCheckpoint`. Nada de `data`, `tmp`, `obj2`.
- Booleanos como pregunta: `is_success`, `hasObstacles`, `isPaused`.
- Funciones con verbo: `load_model`, `build_state`, `drawBoat`.
- Constantes físicas en MAYÚSCULAS y con unidad en el comentario (`SPEED = 10.0  # unidades / s`).
- **Idioma:** identificadores en inglés; comentarios, docstrings, textos de UI y mensajes de commit en español
  (es lo que ya usa el repo — mantenlo consistente).

## 3. Funciones

- Cortas (orientativo: < 30 líneas). Un nivel de abstracción por función.
- Pocos parámetros (≤ 3–4). Si hay más, agrúpalos en un dataclass / modelo Pydantic / objeto TS.
- Sin efectos secundarios ocultos. Si muta estado, que el nombre lo diga (`apply_command`, `resetEnv`).
- Retornos tempranos en lugar de `if` anidados.
- Sin números mágicos: constante con nombre o parámetro.

## 4. Comentarios

- Explican **por qué**, no **qué**. El qué lo dice el código.
- Docstring breve en funciones públicas y módulos. Sin repetir los tipos que ya están en la firma.
- Prohibido el código comentado "por si acaso": para eso está git.
- Iguala la densidad de comentarios del código que te rodea (training/boat_env.py es la referencia).

## 5. Errores

- Python: excepciones específicas (`ValueError`, `FileNotFoundError`, propias si aportan), nunca `except:` desnudo
  ni `except Exception: pass`.
- TypeScript: nunca tragarse errores. En la UI, todo error acaba en un estado visible (toast, banner) — ver skill `ui-design`.
- Los mensajes de error dicen qué pasó y qué hacer: `"Checkpoint no encontrado: training/models/x/y.zip. ¿Has entrenado el run 'x'?"`.

## 6. Patrones de diseño que SÍ aplican aquí

Usa el patrón cuando resuelve un problema real del proyecto, no para decorar.

| Patrón | Dónde | Por qué |
|---|---|---|
| **Registry** | `ALGOS = {"dqn": DQN, "ppo": PPO}`; registro de variantes del entorno | Añadir un algoritmo / problema = añadir una entrada, sin `if/elif` |
| **Strategy** | Variantes del entorno (corriente, obstáculos móviles) como componentes intercambiables | Combinar dificultades sin multiplicar subclases |
| **Factory** | `make_env(problem_id, **params)`, `build_model(algo, ...)` | Un único punto que sabe construir cosas a partir de config |
| **Cache / Flyweight** | Carga de modelos SB3 en el servidor (`functools.lru_cache` por ruta) | Cargar un .zip cuesta ~100 ms; se reutiliza entre sesiones |
| **Adapter** | Capa que traduce `BoatEnv` + modelo SB3 a `SimState` (JSON) | Aísla la web de los detalles internos de Gymnasium/SB3 |
| **Command** | Mensajes WS cliente→servidor (`{type: "pause"}`, `{type: "add_obstacle", ...}`) | Uniones discriminadas tipadas y un único despachador |
| **Observer / pub-sub** | El bucle de simulación publica estados; el canvas y los paneles se suscriben | Desacopla la frecuencia de simulación de la de pintado |
| **Custom hook** (React) | `useSimulation`, `useRuns` | Encapsula la lógica con estado y efectos; los componentes solo pintan |

Patrones a **evitar** aquí: herencias profundas, Singletons globales mutables, Service Locator,
capas Repository/UnitOfWork sobre ficheros (no hay base de datos).

## 7. SOLID pragmático

- **S**: ver punto 1.3.
- **O**: extender por registro (nuevo problema, nuevo algoritmo) sin tocar el código que lo consume.
- **L**: toda variante de `BoatEnv` debe seguir pasando `check_env` y respetar el mismo espacio de observación
  (o declarar el suyo propio de forma coherente).
- **I**: props de componentes mínimas; no pases el objeto entero si solo usas dos campos.
- **D**: el servidor depende de interfaces sencillas (`load_model(path)`, `make_env(...)`), inyectadas con
  `Depends` de FastAPI cuando tenga sentido.

## 8. Estructura y tamaño

- Ficheros < ~300 líneas. Si crece, divide por responsabilidad, no por tipo técnico arbitrario.
- Imports ordenados: stdlib, terceros, propios (ruff/isort lo hace solo en Python; ESLint en TS).
- Nada de imports circulares: `training/` nunca importa de `backend/` (el backend sí usa `training/`).

## 9. Herramientas de calidad

- Python: `ruff check` + `ruff format`; tipos con anotaciones completas en código nuevo.
- TypeScript: `strict: true`, ESLint de Next, Prettier. Cero `any` salvo justificación en comentario.
- Antes de cada commit: el código arranca, los tests/lint relevantes pasan.

## 10. Commits

- **Siempre en local. Nunca `git push`.**
- Autor: la identidad configurada en el repo (`git config user.name/user.email`). **Sin `Co-Authored-By`
  ni ninguna mención a Claude.**
- Mensaje en español, en imperativo, ≤ 72 caracteres en la primera línea: `Añade WebSocket de simulación`.
- Un commit por cambio coherente. Separa los cambios del usuario de los propios.
- No commitear `training/models/`, `training/logs/`, `node_modules/`, `.next/`, `.venv/` (ver `.gitignore`).
