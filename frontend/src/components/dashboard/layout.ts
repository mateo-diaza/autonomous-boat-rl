/**
 * Reparto de los paneles de la columna derecha: filas flexibles en las que cada panel mide al menos 300px
 * y los de una misma fila se reparten TODO el ancho (un panel solo en su fila lo ocupa entero). Las filas
 * se estiran para llenar el alto disponible. Un panel que deba ir siempre solo en su fila: `!basis-full`.
 */
export const PANEL_FLOW = "flex flex-1 flex-wrap content-stretch gap-3 *:min-w-0 *:flex-[1_1_300px]";
