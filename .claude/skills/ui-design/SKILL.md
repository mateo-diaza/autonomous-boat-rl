---
name: ui-design
description: Sistema de diseño visual "Carta náutica" y guía de diseño de páginas para la demo web de autonomous-boat-rl - layout del dashboard, tokens de color, tipografía, espaciado, jerarquía visual, cómo pintar el canvas como una carta náutica, visualización de datos, estados de carga/error/vacío, animación y microcopy. Úsala siempre que diseñes o maquetes una pantalla o componente, elijas colores o tipografías, pintes en el canvas de simulación, crees gráficas o escribas textos de la interfaz.
---

# Diseño de interfaz — estilo "Carta náutica"

Objetivo: que en 5 segundos el público entienda **qué ve** (un barco que aprende) y en 30 segundos
**cómo aprende**.

Estética elegida: **carta náutica / cuaderno de bitácora**. Papel crema, tinta azul marino, títulos con
serifa, detalles cartográficos (rosa de los vientos, retícula, sondas, cartelas). Editorial y con
identidad, pero **los datos se leen con la claridad de un dashboard moderno**: lo vintage está en la
piel, no en la usabilidad.

## 1. Principios

1. **La simulación es la protagonista.** Ocupa el mayor espacio y el centro visual. Todo lo demás la explica.
2. **Jerarquía clara**: 1 cosa principal (canvas), 2–3 secundarias (cerebro, curva, controles), el resto terciario.
3. **Ornamento con medida**: un detalle cartográfico por zona (rosa de los vientos en el canvas, doble
   filete en las cartelas). Si un adorno compite con un dato, se quita el adorno.
4. **Consistencia**: mismos tokens, radios, espaciados e iconos en toda la app.
5. **Legible a distancia**: es una demo proyectada. Texto mínimo 14px, métricas clave grandes (≥ 28px).
   El tema claro pierde saturación en proyector: por eso los colores de texto están oscurecidos (ver §3).

## 2. Layout (escritorio ≥ 1280px)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Cabecera: título (serif, cursiva) · selector problema/run · conexión │
├───────────────────────────────────────────────┬──────────────────────┤
│                                               │  Cartela "Cerebro"   │
│        CARTA (canvas cuadrado)                │  rayos + prob. acción│
│   rosa de los vientos · retícula · HUD        ├──────────────────────┤
│                                               │  Cartela "Episodio"  │
├───────────────────────────────────────────────┤  (pasos, retorno...) │
│ Barra: ▶ ⏸ ⏭  velocidad · herramientas mapa   ├──────────────────────┤
├───────────────────────────────────────────────┤  Cartela             │
│ Línea del tiempo de checkpoints (escala náutica)│  "Aprendizaje"      │
└───────────────────────────────────────────────┴──────────────────────┘
```

- Grid: canvas ~2/3, panel lateral ~1/3. Gutter 16–24px. Máx ancho 1600px centrado.
- < 1024px: una columna (canvas arriba, paneles debajo). Sin scroll horizontal nunca.
- La línea de checkpoints se dibuja como la **escala gráfica de una carta** (barra con tramos alternos
  tinta/papel y marcas "0k · 10k · 25k…"); la tasa de éxito puede teñir cada tramo.

## 3. Tokens de color (variables CSS en `globals.css`, tema claro por defecto)

Contrastes medidos contra `--background` (#f4ecd8). Los de texto cumplen AA (≥ 4.5:1).

| Token | Uso | Valor | Contraste |
|---|---|---|---|
| `--background` | papel (fondo app) | `#f4ecd8` | — |
| `--card` | cartelas / paneles | `#fbf6e9` | — |
| `--foreground` | tinta (texto principal, trazos) | `#1d2b45` | 12.0 |
| `--muted-foreground` | texto secundario, ejes | `#5e5844` | 6.0 |
| `--border` | filetes decorativos, separadores | `#c9b88f` | 1.7 (solo decorativo) |
| `--input` / `--border-strong` | bordes de controles (inputs, sliders) | `#8a7a55` | 3.6 (≥ 3:1 UI) |
| `--primary` | botón principal (fondo tinta, texto papel) | `#1d2b45` / `#f4ecd8` | 12.0 |
| `--vermilion` | **barco**, selección, checkpoint activo | bermellón `#b3412e` | 4.8 |
| `--vermilion-text` | texto en bermellón | `#9c3524` | 6.1 |
| `--accent` | (shadcn) fondo hover/selección suave — **no** es el color de marca | `#e6dcc0` | — |
| `--success` | meta / éxito | verde `#276b4d` | 5.4 |
| `--danger` | choque / peligro (magenta de carta: así se marcan los peligros) | `#8e1f4f` | > 7 |
| `--warning` | timeout / aviso | ocre `#8f5a14` | 4.9 |
| `--water` | agua del canvas | `#dfe9e4` | — |
| `--water-grid` | retícula / graticule | `#b8cbc4` | — |
| `--rock` / `--rock-stroke` | obstáculos | `#a8957a` / `#5c4a33` | 6.8 (trazo s/ agua) |

- Los tokens viven en `frontend/src/app/globals.css` (fuente única; el canvas los lee con `getComputedStyle`).
- Mapea a las variables de shadcn/ui (`--primary`, `--card`, `--ring`…) para que los componentes hereden el tema.
  Ojo: en shadcn `--accent` es el fondo de hover; el color de marca es `--vermilion` (clases `bg-vermilion`, `text-vermilion-text`).
- Cartelas: clase `.cartouche` (doble filete) y `.cartouche-title` (serif en versalitas).
- **Un color de marca** (bermellón, `--vermilion`) reservado al barco y a lo seleccionado. Los semánticos (verde, magenta, ocre)
  solo para su significado.
- Anillo de foco: `--ring: #1d2b45` con offset de 2px sobre papel.
- Tema oscuro ("carta nocturna", tinta clara sobre azul noche) **opcional y posterior**: solo si el
  proyector del evento apaga el tema claro. Si se hace, definir sus tokens y volver a medir contraste.

## 4. Tipografía (con `next/font/google`)

| Rol | Fuente | Uso |
|---|---|---|
| Títulos / cartelas | **Source Serif 4** (cursiva para el título principal) | h1–h3, títulos de panel, overlay de fin de episodio |
| Interfaz y texto | **IBM Plex Sans** | botones, etiquetas, párrafos, tooltips |
| Números y datos | **IBM Plex Mono** con `tabular-nums` | métricas, ejes, HUD, línea de checkpoints |

- La serifa da el carácter; la sans garantiza legibilidad en controles. **Nunca** serifa en textos < 14px.
- Escala: 12 (caption) · 14 (cuerpo) · 16 · 20 (títulos de cartela) · 28–36 (métricas clave) · 40 (h1).
- Pesos: 400 y 600. Títulos de cartela en versalitas (`font-variant: small-caps`) con tracking ligero.

## 5. Espaciado, forma y profundidad

- Escala de 4px: 4, 8, 12, 16, 24, 32, 48.
- **Radios pequeños**: 2–4px (papel impreso, no burbujas). Badges: 2px, no pastillas.
- **Sin sombras**. La profundidad se marca con:
  - Cartelas con **doble filete** (borde exterior 1px `--foreground` + interior 1px `--border` separados 3px).
  - Fondo `--card` ligeramente más claro que el papel.
- Textura de papel opcional y muy sutil (ruido < 3 % de opacidad); desactivable y nunca bajo texto pequeño.

## 6. Canvas = carta náutica

- **Agua**: `--water` plano. **Retícula** de latitud/longitud con `--water-grid` cada 10 unidades del mundo,
  con números pequeños en el margen (Plex Mono 10px, `--muted-foreground`) como una graticule.
- **Rosa de los vientos** en una esquina (trazo tinta, 1px), con la N marcada. Decorativa: `aria-hidden`.
- **Sondas** (opcional): números pequeños dispersos en el agua (profundidades), muy tenues, solo decoración.
- **Obstáculos**: rocas con relleno `--rock`, trazo `--rock-stroke` 2px y, opcionalmente, una cruz
  o punteado interior (símbolo cartográfico de roca/peligro).
- **Meta**: boya — círculo `--success` con anillo exterior fino y pulso lento (sin pulso con reduced motion).
- **Barco**: casco puntiagudo en `--vermilion` con contorno tinta 1.5px. Es el único elemento
  bermellón del canvas, así el ojo lo encuentra al instante.
- **Estela**: línea discontinua (3–3) en tinta al 60 %, como un rumbo trazado a lápiz; se desvanece con la edad.
- **Rayos lidar**: líneas de tinta finas (0.8px, 70 %); los cercanos (< 40 % del alcance) pasan a
  `--danger` y más gruesos (1.5px), con punto de impacto. Toggle para ocultarlos.
- **HUD** sobre el canvas: cartela pequeña de papel (`--card` al 92 %) con doble filete, esquina superior.
- **Fin de episodio**: cartela centrada ≤ 1 s, serifa cursiva + icono: "✓ Arribada en 67 pasos",
  "✕ Encallado", "⏱ Sin rumbo (tiempo agotado)".

## 7. Visualización de datos

- Curva de aprendizaje: eje X = pasos de entrenamiento ("25k"), eje Y = tasa de éxito (0–100 %).
  Línea tinta 2px; área bajo la curva con trama de líneas finas o `--vermilion` al 10 %. Nunca mezclar escalas sin aviso.
- Marcador vertical discontinuo (tinta) en el checkpoint seleccionado, sincronizado con la línea de tiempo.
- Ejes y rejilla con `--border`, etiquetas en Plex Mono `--muted-foreground`. Sin 3D ni sombras.
- Panel cerebro: barras horizontales para P(babor/izq), P(avante/recto), P(estribor/der); la elegida en
  `--vermilion`, el resto en tinta al 35 %. Rayos como abanico en miniatura.
- Números siempre con unidad y formato español: "67 pasos", "95 %", "+163,3".

## 8. Estados (todo componente con datos los tiene)

| Estado | Diseño |
|---|---|
| Cargando | Skeleton color `--border` al 40 % con la forma del contenido |
| Vacío | Cartela + acción: "Aún no hay travesías registradas. Entrena un modelo con `python -m scripts.train`" |
| Error | Banda `--danger` (borde izquierdo 3px, radio 0) con causa y acción ("Reintentar") |
| Desconectado | Badge en cabecera + carta atenuada (velo papel 50 %) + "Reconectando con el servidor…" |

## 9. Movimiento

- Transiciones de UI 150–250 ms, `ease-out`. Nada de rebotes.
- La animación tiene un propósito (feedback, continuidad); el pulso de la boya es el único adorno animado.
- Respeta `prefers-reduced-motion` (sin pulso, sin desvanecimientos).

## 10. Microcopy (español, guiño náutico sin perder claridad)

- Vocabulario náutico **solo donde se entiende sin glosario**: "Arribada" (meta), "Encallado" (choque),
  "Travesía" (episodio), "Bitácora" (registro de episodios). Para acciones, verbos llanos:
  "Reproducir", "Nuevo escenario", "Añadir roca".
- La primera vez que aparece un término de RL, se explica con tooltip:
  "Checkpoint: el modelo guardado tras N pasos de entrenamiento".
- Títulos de cartela cortos: "Cerebro del agente", "Travesía", "Aprendizaje".

## 11. Checklist visual

- [ ] La carta domina la pantalla y se entiende sin explicación.
- [ ] El barco es lo único en bermellón dentro del canvas.
- [ ] Serifa solo en títulos (≥ 16px); datos en Plex Mono tabular con unidad.
- [ ] Ningún adorno compite con un dato.
- [ ] Estados de carga, vacío, error y desconexión diseñados.
- [ ] Se ve bien en 1920×1080 (proyector) y en 1366×768; contraste revisado tras cualquier cambio de color.
