export const CHART_COLORS = {
  production: "#fbbf24",
  consumption: "#3b82f6",
  cost: "#ef4444",
  revenue: "#10b981",
  efficiency: "#a855f7",
  aggregate: "#06b6d4",
  neutral: "#6b7280",
  warning: "#f97316",
} as const;

export const CHART_SERIES_COLORS = [
  "#fbbf24",
  "#3b82f6",
  "#10b981",
  "#ef4444",
  "#a855f7",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#84cc16",
  "#14b8a6",
];

export const CHART_AXIS_PROPS = {
  tick: { fontSize: 11, fill: "rgba(255,255,255,0.65)" },
  axisLine: { stroke: "rgba(255,255,255,0.1)" },
  tickLine: { stroke: "rgba(255,255,255,0.1)" },
} as const;

export const CHART_GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: "rgba(255,255,255,0.05)",
  vertical: false,
} as const;

export const CHART_TOOLTIP_STYLE = {
  background: "rgba(15,15,15,0.96)",
  border: "0.5px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
} as const;

export const CHART_LEGEND_STYLE = {
  fontSize: 11,
  paddingTop: 12,
  color: "rgba(255,255,255,0.7)",
} as const;
