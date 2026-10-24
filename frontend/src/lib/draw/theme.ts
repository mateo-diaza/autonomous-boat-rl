/** Colores y fuentes del canvas, leídos de los tokens CSS (globals.css es la única fuente). */
export type ChartTheme = {
  water: string;
  grid: string;
  ink: string;
  muted: string;
  rock: string;
  rockStroke: string;
  boat: string;
  goal: string;
  danger: string;
  monoFont: string;
};

export function readChartTheme(element: Element = document.documentElement): ChartTheme {
  const css = getComputedStyle(element);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    water: token("--water"),
    grid: token("--water-grid"),
    ink: token("--foreground"),
    muted: token("--muted-foreground"),
    rock: token("--rock"),
    rockStroke: token("--rock-stroke"),
    boat: token("--vermilion"),
    goal: token("--success"),
    danger: token("--danger"),
    monoFont: token("--font-plex-mono") || "monospace",
  };
}
