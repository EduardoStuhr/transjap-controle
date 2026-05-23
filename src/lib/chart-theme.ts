/**
 * VIZ-1 — Paleta OKLCH compartilhada (charts + tokens semânticos)
 *
 * As cores são resolvidas em OKLCH para uniformidade perceptual.
 * Usadas dentro de SVG/Recharts (não como CSS var) — Recharts não interpreta var().
 */

export const CHART_COLORS = {
  // Base do template
  axis: "oklch(0.50 0.008 90)",
  axisDim: "oklch(0.38 0.008 90)",
  grid: "oklch(0.27 0.008 70)",
  yellow: "oklch(0.86 0.18 92)",
  yellowD: "oklch(0.72 0.17 78)",
  steel: "oklch(0.74 0.13 220)",
  mint: "oklch(0.72 0.13 150)",
  terra: "oklch(0.74 0.16 30)",
  sand: "oklch(0.85 0.06 90)",
  violet: "oklch(0.68 0.10 300)",
  fg: "oklch(0.96 0.008 90)",
  fg3: "oklch(0.60 0.008 90)",
  danger: "oklch(0.70 0.20 25)",
  ok: "oklch(0.78 0.14 152)",
  warn: "oklch(0.82 0.16 70)",
  info: "oklch(0.75 0.13 230)",

  // Aliases semânticos (mantêm imports antigos funcionando)
  production: "oklch(0.86 0.18 92)",     // = yellow
  consumption: "oklch(0.74 0.13 220)",   // = steel
  cost: "oklch(0.74 0.16 30)",           // = terra
  revenue: "oklch(0.78 0.14 152)",       // = ok
  efficiency: "oklch(0.72 0.13 150)",    // = mint
  aggregate: "oklch(0.74 0.13 220)",     // = steel
  neutral: "oklch(0.60 0.008 90)",
  warning: "oklch(0.82 0.16 70)",
} as const;

export const CHART_SERIES_COLORS = [
  CHART_COLORS.yellow,
  CHART_COLORS.steel,
  CHART_COLORS.mint,
  CHART_COLORS.terra,
  CHART_COLORS.violet,
  CHART_COLORS.sand,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
];

export const CHART_DONUT_COLORS = [
  CHART_COLORS.yellow,
  CHART_COLORS.steel,
  CHART_COLORS.mint,
  CHART_COLORS.terra,
  CHART_COLORS.violet,
  CHART_COLORS.sand,
];

export const CHART_TICK = {
  fontSize: 10,
  fill: CHART_COLORS.axis,
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
} as const;

export const CHART_AXIS_PROPS = {
  tick: CHART_TICK,
  axisLine: { stroke: CHART_COLORS.grid },
  tickLine: false,
} as const;

export const CHART_GRID_PROPS = {
  strokeDasharray: "2 4",
  stroke: CHART_COLORS.grid,
  vertical: false,
} as const;

export const CHART_TOOLTIP_STYLE = {
  background: "var(--bg-2)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 11,
  boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
  minWidth: 140,
} as const;

export const CHART_LEGEND_STYLE = {
  fontSize: 11,
  color: "var(--fg-2)",
} as const;
