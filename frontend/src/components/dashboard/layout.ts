/**
 * Reparto de los paneles de la columna derecha: filas flexibles en las que cada panel mide al menos 300px
 * y los de una misma fila se reparten TODO el ancho (un panel solo en su fila lo ocupa entero). Las filas
 * se estiran para llenar el alto disponible. Un panel que deba ir siempre solo en su fila: `!basis-full`.
 */
export const PANEL_FLOW = "flex flex-1 flex-wrap content-stretch gap-3 *:min-w-0 *:flex-[1_1_300px]";

/**
 * Rejilla principal. Móvil/tableta vertical: una columna que nunca supera el ancho de la pantalla.
 * ≥1024px: carta a la izquierda (todo el alto) y paneles a la derecha.
 */
export const MAIN_GRID =
  "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[auto_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]";

/**
 * La carta es cuadrada y ocupa todo el alto, pero cede ancho para dejar sitio a la derecha:
 * 400px en tableta horizontal / portátil pequeño (1 columna de paneles), 640px desde 1280px (2 columnas).
 */
export const STAGE_SIZE =
  "lg:aspect-square lg:h-full lg:max-w-[calc(100vw_-_2.75rem_-_400px)] xl:max-w-[calc(100vw_-_2.75rem_-_640px)]";
