import {
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_COLORS as C, CHART_TICK as TICK } from "@/lib/chart-theme";

const fmt = {
  dec: (value: number, digits = 1) =>
    Number(value).toLocaleString("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
};

export type LhPoint = {
  name: string;
  fleetLabel?: string;
  lph: number;
  hours: number;
  liters: number;
};

const RANGES = [
  { max: 7.5, color: C.ok, label: "Eficiente" },
  { max: 15, color: C.warn, label: "Medio" },
  { max: Infinity, color: C.danger, label: "Alto consumo" },
];

function tagFor(lph: number) {
  return RANGES.find((range) => lph <= range.max) ?? RANGES[RANGES.length - 1];
}

function medianOf(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}

export function ChartLhStripPlot({ data }: { data: LhPoint[] }) {
  const clean = data.filter((point) => Number.isFinite(point.lph) && point.lph > 0);
  const colored = clean.map((point) => ({
    ...point,
    _y: 0.5,
    _color: tagFor(point.lph).color,
  }));
  const maxLph = Math.max(...colored.map((point) => point.lph), 22);
  const axisMax = Math.ceil(maxLph + 2);
  const median = medianOf(colored.map((point) => point.lph));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 30, right: 30, left: 10, bottom: 36 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" horizontal={false} />
        <ReferenceArea x1={0} x2={7.5} y1={0} y2={1} fill={C.ok} fillOpacity={0.07} />
        <ReferenceArea x1={7.5} x2={15} y1={0} y2={1} fill={C.warn} fillOpacity={0.07} />
        <ReferenceArea x1={15} x2={axisMax} y1={0} y2={1} fill={C.danger} fillOpacity={0.07} />
        <XAxis
          type="number"
          dataKey="lph"
          domain={[0, axisMax]}
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          label={{
            value: "L/h",
            position: "bottom",
            offset: 14,
            style: { fontSize: 10, fill: "var(--fg-3)" },
          }}
        />
        <YAxis type="number" dataKey="_y" domain={[0, 1]} hide />
        {median > 0 && (
          <ReferenceLine
            x={median}
            stroke="var(--fg-2)"
            strokeDasharray="4 3"
            label={{
              value: `Mediana ${fmt.dec(median, 1)}`,
              position: "top",
              fill: "var(--fg-2)",
              fontSize: 10,
            }}
          />
        )}
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as LhPoint;
            const tag = tagFor(point.lph);
            return (
              <div
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 11,
                  minWidth: 180,
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--fg)" }}>
                  {point.name}
                  {point.fleetLabel && (
                    <span style={{ color: "var(--fg-3)", fontWeight: 400 }}>
                      {" "}
                      - {point.fleetLabel}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 6, display: "grid", gap: 2 }}>
                  <TooltipRow label="L/h" value={fmt.dec(point.lph, 2)} color={tag.color} strong />
                  <TooltipRow label="Horas" value={`${fmt.dec(point.hours, 1)} h`} />
                  <TooltipRow label="Litros" value={`${fmt.dec(point.liters, 1)} L`} />
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 10,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${tag.color}26`,
                    color: tag.color,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    display: "inline-block",
                  }}
                >
                  {tag.label}
                </div>
              </div>
            );
          }}
        />
        <Scatter data={colored}>
          {colored.map((point) => (
            <Cell
              key={point.name}
              fill={point._color}
              fillOpacity={0.85}
              stroke="var(--bg-0)"
              strokeWidth={1.5}
            />
          ))}
          <LabelList
            dataKey="name"
            position="top"
            offset={10}
            style={{ fontSize: 10, fill: "var(--fg-2)", fontWeight: 600 }}
          />
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function TooltipRow({
  label,
  value,
  color = "var(--fg)",
  strong = false,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--fg-3)" }}>{label}</span>
      <span
        style={{
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          color,
          fontWeight: strong ? 700 : 400,
        }}
      >
        {value}
      </span>
    </div>
  );
}
