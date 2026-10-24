---
name: web-accessibility
description: Requisitos de accesibilidad (WCAG 2.2 nivel AA) para el frontend de autonomous-boat-rl, incluida una simulación en canvas, controles de reproducción, sliders, gráficas y edición del mapa con el ratón. Úsala siempre que crees o revises componentes de UI, formularios, controles, gráficas, el canvas, colores, animaciones o navegación por teclado.
---

# Accesibilidad (WCAG 2.2 AA)

La demo debe poder usarse con teclado y lector de pantalla, y ser legible con baja visión o daltonismo.
Si un componente no cumple esto, no está terminado.

## 1. HTML semántico primero

- `<html lang="es">`. Un único `<h1>`; jerarquía de encabezados sin saltos.
- Landmarks: `<header>`, `<main>`, `<aside>` (panel lateral), `<nav>` si hay navegación.
- Acciones = `<button>`; navegación = `<a href>`. Nunca `<div onClick>`.
- Usa los componentes de shadcn/ui (basados en Radix): ya traen roles, foco y teclado correctos.
  No rompas eso sobreescribiendo `role` o quitando `aria-*`.

## 2. Teclado

- Todo lo interactivo se alcanza con Tab en orden lógico y se activa con Enter/Espacio.
- **Foco siempre visible**: anillo de foco con contraste ≥ 3:1 (`focus-visible:ring-2 ...`). Nunca `outline: none` sin sustituto.
- Atajos para la simulación (documentados en la UI, p. ej. en un tooltip o un diálogo "Atajos"):
  `Espacio` play/pausa, `→` paso a paso, `R` nuevo escenario, `[`/`]` checkpoint anterior/siguiente.
  - Los atajos de una sola tecla no deben dispararse cuando el foco está en un input/slider (WCAG 2.1.4).
- Sin trampas de foco salvo en diálogos modales (que devuelven el foco al cerrarse; Radix lo hace).

## 3. El canvas de simulación

Un `<canvas>` es invisible para un lector de pantalla. Por eso:

- `role="img"` y `aria-label` descriptivo y breve: "Simulación: barco navegando hacia la meta entre 6 obstáculos".
- Una **región de estado en texto** cerca del canvas con `aria-live="polite"` que anuncie solo eventos
  relevantes (no cada frame): "Episodio terminado: meta alcanzada en 67 pasos", "Choque con obstáculo".
- La información clave del canvas también existe en texto: paso, retorno, distancia a la meta, acción actual.
- **Edición del mapa sin ratón**: toda acción de arrastrar/clicar tiene alternativa (WCAG 2.5.7):
  botón "Añadir obstáculo" que lo coloca en una posición libre, botón "Meta aleatoria", lista de obstáculos
  con botón eliminar, o inputs numéricos de posición.

## 4. Controles

- Todo control tiene **nombre accesible**: `<label>` visible o `aria-label` en botones de solo icono
  (`<Button aria-label="Pausar simulación"><Pause /></Button>`).
- Botones toggle con `aria-pressed` (play/pausa, herramienta activa).
- Sliders: etiqueta visible + valor legible (`aria-valuetext="Checkpoint de 25 mil pasos"`).
- Estados deshabilitados con `disabled`, no solo con estilo; explica por qué si no es obvio.
- Tamaño mínimo de diana: 24×24 px (WCAG 2.5.8); preferible 32–40 px en controles principales.

## 5. Color y contraste

- Texto normal ≥ 4.5:1; texto grande (≥ 24px o 19px bold) ≥ 3:1; componentes UI y gráficos ≥ 3:1.
- **Nunca el color como único portador de información**:
  - Resultado del episodio: icono + texto ("✓ Meta", "✕ Choque", "⏱ Tiempo"), no solo verde/rojo.
  - Rayos lidar: además del color, el grosor o el punto de impacto indican la cercanía.
  - Varias series en una gráfica: distinto estilo de línea / marcador y leyenda con texto.
- Paletas aptas para daltonismo (evitar pares rojo/verde puros como única diferencia).
- Comprueba contraste de los tokens del tema en claro y oscuro (ver `ui-design`).

## 6. Movimiento

- Respeta `prefers-reduced-motion`: desactiva animaciones decorativas (agua animada, transiciones)
  y empieza con la simulación **en pausa** o a velocidad reducida en ese caso.
- Lo que se mueve más de 5 s debe poder pausarse (WCAG 2.2.2): el botón de pausa siempre visible.
- Nada que parpadee más de 3 veces por segundo.

## 7. Gráficas (Recharts)

- Cada gráfica con título visible y una descripción corta en texto ("La tasa de éxito pasa del 0 % al 95 % en 25 mil pasos").
- Contenedor con `role="img"` + `aria-label`, o una tabla de datos alternativa (oculta visualmente con
  `sr-only` o desplegable "Ver datos").
- Tooltips accesibles por teclado si contienen información que no está en otro sitio.

## 8. Contenido

- Textos claros y cortos en español; evita jerga sin explicar ("checkpoint" → "instantánea del modelo (checkpoint)" la primera vez).
- Mensajes de error que dicen qué pasó y cómo resolverlo, anunciados con `role="alert"`.
- Zoom al 200 % sin pérdida de contenido ni scroll horizontal (diseño responsive, unidades relativas).

## 9. Checklist antes de dar por terminado un componente

- [ ] Se usa entero solo con teclado y el foco se ve.
- [ ] Todo control tiene nombre accesible.
- [ ] Contraste verificado en tema claro y oscuro.
- [ ] Ninguna información depende solo del color.
- [ ] Respeta `prefers-reduced-motion`.
- [ ] Eventos importantes anunciados en una región `aria-live`.
- [ ] Revisión rápida con Lighthouse / axe DevTools sin errores críticos.
