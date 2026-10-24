---
name: ui-design
description: Sistema de diseño visual y guía de diseño de páginas para la demo web de autonomous-boat-rl - layout del dashboard, tokens de color, tipografía, espaciado, jerarquía visual, visualización de datos, estados de carga/error/vacío, animación y microcopy. Úsala siempre que diseñes o maquetes una pantalla o componente, elijas colores o tipografías, pintes en el canvas de simulación, crees gráficas o escribas textos de la interfaz.
---

# Diseño de interfaz — demo del barco autónomo

Objetivo: que en 5 segundos el público entienda **qué ve** (un barco que aprende) y en 30 segundos
**cómo aprende**. Estética: panel técnico moderno, oscuro, "centro de control marítimo". Sobrio, no recargado.

## 1. Principios

1. **La simulación es la protagonista.** Ocupa el mayor espacio y el centro visual. Todo lo demás la explica.
2. **Jerarquía clara**: 1 cosa principal (canvas), 2–3 secundarias (cerebro, curva, controles), el resto terciario.
3. **Menos, pero mejor**: cada elemento en pantalla responde a una pregunta del público. Si no, fuera.
4. **Consistencia**: mismos tokens, radios, espaciados e iconos en toda la app.
5. **Legible a distancia**: es una demo proyectada. Texto mínimo 14px, métricas clave grandes (≥ 28px).

## 2. Layout (escritorio ≥ 1280px)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Header: título · selector de problema/run · estado conexión          │
├───────────────────────────────────────────────┬──────────────────────┤
│                                               │  Panel "Cerebro"     │
│              CANVAS (cuadrado)                │  rayos + prob. acción│
│            con HUD superpuesto                ├──────────────────────┤
│                                               │  Métricas episodio   │
├───────────────────────────────────────────────┤  (pasos, retorno...) │
│ Toolbar: ▶ ⏸ ⏭  velocidad · herramientas mapa ├──────────────────────┤
├───────────────────────────────────────────────┤  Curva aprendizaje   │
│ Slider de checkpoint (línea temporal)          │  + marcador          │
└───────────────────────────────────────────────┴──────────────────────┘
```

- Grid: canvas ~2/3, panel lateral ~1/3. Gutter 16–24px. Máx ancho 1600px centrado.
- < 1024px: una columna (canvas arriba, paneles debajo). Sin scroll horizontal nunca.
- El slider de checkpoint es la "línea del tiempo del aprendizaje": ancho completo, con marcas en cada checkpoint
  y la tasa de éxito coloreando la pista si es posible.

## 3. Tokens de color (definidos como variables CSS en globals.css, tema oscuro por defecto)

| Token | Uso | Valor orientativo |
|---|---|---|
| `--background` | fondo app | slate muy oscuro `#0b1220` |
| `--card` | paneles | `#111a2e` |
| `--border` | bordes sutiles | `#1f2a44` |
| `--foreground` | texto principal | `#e6edf7` |
| `--muted-foreground` | texto secundario | `#93a4c3` |
| `--primary` | acción principal, barco | cian `#22d3ee` |
| `--water` | agua del canvas | azul `#0e3a5c` → `#145a86` (gradiente sutil) |
| `--success` | meta / éxito | verde `#34d399` |
| `--danger` | choque / peligro | coral `#f87171` |
| `--warning` | timeout / aviso | ámbar `#fbbf24` |
| `--rock` | obstáculos | `#6b5e50` con borde `#3f362d` |

- Mapea a las variables que usa shadcn/ui (`--primary`, `--card`...) para que los componentes hereden el tema.
- Un acento principal (cian). Los colores semánticos solo para su significado, nunca decorativos.
- Verifica contraste (ver `web-accessibility`); si se ofrece tema claro, define sus tokens también.

## 4. Tipografía

- Sans: **Inter** o **Geist** (vía `next/font`). Mono para números: **Geist Mono / JetBrains Mono**.
- Cifras con `font-variant-numeric: tabular-nums` (`tabular-nums` en Tailwind) para que no "bailen".
- Escala: 12 (caption) · 14 (cuerpo) · 16 · 20 (títulos de panel) · 28–36 (métricas clave) · 40 (h1).
- Máx 2 pesos por pantalla (400 y 600). Títulos de panel en mayúsculas pequeñas con tracking opcional.

## 5. Espaciado, forma y profundidad

- Escala de 4px: 4, 8, 12, 16, 24, 32, 48.
- Radio: 12px paneles, 8px controles, completo en badges.
- Profundidad con bordes sutiles y un ligero cambio de fondo; sombras mínimas. Glassmorphism solo en el HUD sobre el canvas.

## 6. Canvas de simulación

- Agua: gradiente + textura/olas muy sutil (desactivar con reduced motion).
- Barco: forma reconocible (casco puntiagudo), color `--primary`, con borde oscuro para destacar.
- Estela: línea degradada que se desvanece con la edad.
- Rayos lidar: finos, semitransparentes; color de seguro (cian/verde) a peligro (ámbar/coral) según cercanía,
  con punto de impacto. Toggle para ocultarlos.
- Meta: círculo verde con pulso suave. Obstáculos: rocas con relleno y borde, ligera sombra.
- Fin de episodio: overlay breve (≤ 1 s) con icono + texto ("✓ Meta en 67 pasos").
- Rejilla tenue opcional para dar sensación de escala.

## 7. Visualización de datos

- Curva de aprendizaje: eje X = pasos de entrenamiento (formato "25k"), eje Y = tasa de éxito (0–100 %).
  Línea principal sólida; recompensa media en un segundo eje o gráfica aparte, nunca mezclar escalas sin aviso.
- Marcador vertical en el checkpoint seleccionado, sincronizado con el slider.
- Ejes y rejilla discretos (`--border`), etiquetas en `--muted-foreground`. Sin efectos 3D ni sombras.
- Panel cerebro: barras horizontales para P(izq), P(recto), P(der) con la elegida resaltada; rayos como
  un abanico en miniatura o barras radiales.
- Números siempre con unidad y formato legible: "67 pasos", "95 %", "+163,3".

## 8. Estados (todo componente con datos los tiene)

| Estado | Diseño |
|---|---|
| Cargando | Skeleton con la forma del contenido (no spinners a pantalla completa) |
| Vacío | Mensaje + acción: "No hay runs entrenados. Ejecuta `python -m scripts.train`" |
| Error | Banner `--danger` con causa y acción ("Reintentar") |
| Desconectado | Badge en el header + canvas atenuado + "Reconectando…" |

## 9. Movimiento

- Transiciones de UI 150–250 ms, `ease-out`. Nada de rebotes.
- La animación tiene un propósito (feedback, continuidad), nunca decoración que distraiga del canvas.
- Respeta `prefers-reduced-motion`.

## 10. Microcopy (español)

- Tono directo y didáctico. Verbos en botones: "Reproducir", "Nuevo escenario", "Añadir roca".
- Explica el RL en lenguaje llano con tooltips: "Checkpoint: el modelo guardado tras N pasos de entrenamiento".
- Títulos de panel cortos: "Cerebro del agente", "Aprendizaje", "Episodio".

## 11. Checklist visual

- [ ] El canvas domina la pantalla y se entiende sin explicación.
- [ ] Un solo color de acento; colores semánticos coherentes en toda la app.
- [ ] Números tabulares y con unidad.
- [ ] Estados de carga, vacío, error y desconexión diseñados.
- [ ] Se ve bien en 1920×1080 (proyector) y en 1366×768.
