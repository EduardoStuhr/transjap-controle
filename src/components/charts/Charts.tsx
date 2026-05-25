/**
 * VIZ-1 — Os 8 gráficos do template app_transjap, adaptados para TSX.
 * Copiados literalmente de charts.jsx (template). Não inventar variações.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import {
  CHART_COLORS as C,
  CHART_DONUT_COLORS,
  CHART_LEGEND_STYLE,
  CHART_TICK as TICK,
} from "@/lib/chart-theme";
import { RichTooltip } from "./RichTooltip";

const MONO = "JetBrains Mono, ui-monospace, monospace";

// ─── Formatters (porte do `fmt` global do template) ───────────────
const fmt = {
  brl: (v: number) =>
    Number(v).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }),
  brlK: (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
    return `R$ ${Math.round(v)}`;
  },
  int: (v: number) => Number(Math.round(v)).toLocaleString("pt-BR"),
  dec: (v: number, d = 1) =>
    Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }),
  k: (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return String(Math.round(v));
  },
};

// ═══════════════════════════════════════════════════════════════════
// 1. PRODUÇÃO × CONSUMO — composed (stacked bars + diesel line)
// ═══════════════════════════════════════════════════════════════════
export type ProdConsumoPoint = {
  d: string;
  compactada: number;
  solta: number;
  diesel: number;
};

export function ChartProdConsumo({ data }: { data: ProdConsumoPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="gComp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.yellow} stopOpacity={0.4} />
            <stop offset="100%" stopColor={C.yellow} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="d"
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          interval={data.length > 14 ? 2 : 0}
        />
        <YAxis
          yAxisId="m"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={42}
          label={{
            value: "m³",
            angle: -90,
            position: "insideLeft",
            offset: 14,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <YAxis
          yAxisId="l"
          orientation="right"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={42}
          label={{
            value: "L diesel",
            angle: 90,
            position: "insideRight",
            offset: 14,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <Tooltip content={<RichTooltip units={{ compactada: "m³", solta: "m³", diesel: "L" }} />} />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} iconType="square" />
        <Bar
          yAxisId="m"
          dataKey="compactada"
          name="Compactada"
          stackId="m"
          fill={C.yellow}
          radius={[2, 2, 0, 0]}
          barSize={10}
        />
        <Bar
          yAxisId="m"
          dataKey="solta"
          name="Solta"
          stackId="m"
          fill={C.sand}
          radius={[2, 2, 0, 0]}
          barSize={10}
        />
        <Line
          yAxisId="l"
          type="monotone"
          dataKey="diesel"
          name="Diesel (L)"
          stroke={C.steel}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 2. BUBBLE — horas × m³ × diesel por frota
// ═══════════════════════════════════════════════════════════════════
export type BubblePoint = {
  name: string;
  tipo?: string;
  horas: number;
  m3: number;
  diesel: number;
  lPorM3: number;
};

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "2px 0",
        color: highlight ? "var(--accent)" : "var(--fg-2)",
      }}
    >
      <span style={{ color: highlight ? "var(--accent)" : "var(--fg-3)" }}>{k}</span>
      <span style={{ fontFamily: MONO, fontWeight: 600 }}>{v}</span>
    </div>
  );
}

export function ChartBubble({ data }: { data: BubblePoint[] }) {
  if (!data.length) return null;
  const eff = data.map((d) => d.m3 / Math.max(d.diesel, 1));
  const sorted = [...eff].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.33)] ?? 0;
  const q2 = sorted[Math.floor(sorted.length * 0.66)] ?? 0;
  const colored = data.map((d, i) => {
    const e = eff[i];
    const color = e >= q2 ? C.ok : e >= q1 ? C.yellow : C.danger;
    return { ...d, eff: e, color };
  });
  const horasArr = data.map((d) => d.horas);
  const m3Arr = data.map((d) => d.m3);
  const xRef = (Math.max(...horasArr) + Math.min(...horasArr)) / 2;
  const yRef = (Math.max(...m3Arr) + Math.min(...m3Arr)) / 2;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 14, right: 18, left: 4, bottom: 20 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" />
        <XAxis
          type="number"
          dataKey="horas"
          name="Horas"
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          label={{
            value: "Horas trabalhadas (PDE) →",
            position: "insideBottom",
            offset: -10,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <YAxis
          type="number"
          dataKey="m3"
          name="m³"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={48}
          label={{
            value: "↑ m³ compactado",
            angle: -90,
            position: "insideLeft",
            offset: 14,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <ZAxis type="number" dataKey="diesel" range={[60, 800]} name="Litros" />
        <Tooltip
          cursor={{ strokeDasharray: "3 3", stroke: C.grid }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as BubblePoint;
            return (
              <div
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 11,
                  minWidth: 170,
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>
                  {p.name}{" "}
                  {p.tipo && (
                    <span style={{ color: "var(--fg-3)", fontWeight: 400, fontSize: 10 }}>
                      {p.tipo}
                    </span>
                  )}
                </div>
                <Row k="Horas" v={`${fmt.dec(p.horas, 1)} h`} />
                <Row k="Produção" v={`${fmt.int(p.m3)} m³`} />
                <Row k="Diesel" v={`${fmt.int(p.diesel)} L`} />
                <Row k="L/m³" v={`${fmt.dec(p.lPorM3, 2)} L/m³`} highlight />
              </div>
            );
          }}
        />
        <ReferenceLine x={xRef} stroke={C.grid} strokeDasharray="2 4" />
        <ReferenceLine y={yRef} stroke={C.grid} strokeDasharray="2 4" />
        <Scatter data={colored} fill={C.yellow}>
          {colored.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.color}
              fillOpacity={0.75}
              stroke={entry.color}
              strokeWidth={1}
            />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 3. FATURAMENTO × CUSTO × MARGEM
// ═══════════════════════════════════════════════════════════════════
export type FatCustoPoint = {
  d: string;
  faturamento: number;
  custoOperacional: number;
  margem: number;
};

export function ChartFatCusto({ data }: { data: FatCustoPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 18, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="d"
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          interval={data.length > 14 ? 3 : 0}
        />
        <YAxis
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v: number) => fmt.brlK(v).replace("R$ ", "")}
        />
        <Tooltip
          content={
            <RichTooltip
              format={{ faturamento: fmt.brl, custoOperacional: fmt.brl, margem: fmt.brl }}
            />
          }
        />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} iconType="square" />
        <Bar
          dataKey="faturamento"
          name="Faturamento"
          fill={C.steel}
          radius={[2, 2, 0, 0]}
          barSize={9}
        />
        <Bar
          dataKey="custoOperacional"
          name="Custo operacional"
          fill={C.terra}
          radius={[2, 2, 0, 0]}
          barSize={9}
        />
        <Line
          type="monotone"
          dataKey="margem"
          name="Margem"
          stroke={C.yellow}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 4. LINE/AREA — single series
// ═══════════════════════════════════════════════════════════════════
export function ChartLine({
  data,
  dataKey,
  name,
  unit,
  color = C.yellow,
  fillArea = true,
}: {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  name: string;
  unit: string;
  color?: string;
  fillArea?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="d"
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          interval={data.length > 14 ? 3 : 0}
        />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<RichTooltip units={{ [dataKey]: unit }} />} />
        <Area
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          fill={fillArea ? `url(#g-${dataKey})` : "transparent"}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 5. DIESEL POR M3 EMPOLADO — volume × consumo específico
// ═══════════════════════════════════════════════════════════════════
export type ChartSeriesConfig = {
  dataKey: string;
  name: string;
  color: string;
};

export function ChartMultiLine({
  data,
  series,
  unit,
  yLabel,
  precision = 1,
}: {
  data: Array<Record<string, unknown>>;
  series: ChartSeriesConfig[];
  unit: string;
  yLabel: string;
  precision?: number;
}) {
  const units = Object.fromEntries(series.map((s) => [s.dataKey, unit])) as Record<string, string>;
  const format = Object.fromEntries(
    series.map((s) => [s.dataKey, (v: number) => fmt.dec(v, precision)]),
  ) as Record<string, (v: number) => string>;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="d"
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          interval={data.length > 14 ? 3 : 0}
        />
        <YAxis
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v: number) => fmt.k(v)}
          label={{
            value: yLabel,
            angle: -90,
            position: "insideLeft",
            offset: 14,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <Tooltip content={<RichTooltip units={units} format={format} />} />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} iconType="line" />
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.color}
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export type VolumeLineObraSeries = {
  obra: string;
  color: string;
  volumeKey: string;
  lineKey: string;
};

export function ChartVolumeLinePorObra({
  data,
  series,
  volumeName,
  volumeUnit,
  lineName,
  lineUnit,
  volumeAxisLabel,
  lineAxisLabel,
  linePrecision = 1,
}: {
  data: Array<Record<string, unknown>>;
  series: VolumeLineObraSeries[];
  volumeName: string;
  volumeUnit: string;
  lineName: string;
  lineUnit: string;
  volumeAxisLabel: string;
  lineAxisLabel: string;
  linePrecision?: number;
}) {
  const units = Object.fromEntries(
    series.flatMap((s) => [
      [s.volumeKey, volumeUnit],
      [s.lineKey, lineUnit],
    ]),
  ) as Record<string, string>;
  const format = Object.fromEntries(
    series.flatMap((s) => [
      [s.volumeKey, (v: number) => fmt.dec(v, 1)],
      [s.lineKey, (v: number) => fmt.dec(v, linePrecision)],
    ]),
  ) as Record<string, (v: number) => string>;
  const barSize = Math.max(6, Math.min(12, 24 / Math.max(series.length, 1)));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="d"
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          interval={data.length > 14 ? 3 : 0}
        />
        <YAxis
          yAxisId="volume"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v: number) => fmt.k(v)}
          label={{
            value: volumeAxisLabel,
            angle: -90,
            position: "insideLeft",
            offset: 14,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <YAxis
          yAxisId="line"
          orientation="right"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v: number) => fmt.dec(v, linePrecision)}
          label={{
            value: lineAxisLabel,
            angle: 90,
            position: "insideRight",
            offset: 12,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <Tooltip content={<RichTooltip units={units} format={format} />} />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} iconType="square" />
        {series.map((s) => (
          <Bar
            key={s.volumeKey}
            yAxisId="volume"
            dataKey={s.volumeKey}
            name={`${s.obra} · ${volumeName}`}
            fill={s.color}
            fillOpacity={0.62}
            radius={[2, 2, 0, 0]}
            barSize={barSize}
          />
        ))}
        {series.map((s) => (
          <Line
            key={s.lineKey}
            yAxisId="line"
            type="monotone"
            dataKey={s.lineKey}
            name={`${s.obra} · ${lineName}`}
            stroke={s.color}
            strokeWidth={2.4}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export type DieselPorM3EmpoladoPoint = {
  d: string;
  m3Empolado: number;
  diesel: number;
  litrosPorM3Empolado: number;
};

export function ChartDieselPorM3Empolado({
  data,
  media,
}: {
  data: DieselPorM3EmpoladoPoint[];
  media: number;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="d"
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          interval={data.length > 14 ? 3 : 0}
        />
        <YAxis
          yAxisId="m3"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v: number) => fmt.k(v)}
          label={{
            value: "m³ empolado",
            angle: -90,
            position: "insideLeft",
            offset: 14,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <YAxis
          yAxisId="lpm3"
          orientation="right"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v: number) => fmt.dec(v, 1)}
          label={{
            value: "L/m³",
            angle: 90,
            position: "insideRight",
            offset: 12,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <Tooltip
          content={
            <RichTooltip
              units={{
                m3Empolado: "m³",
                diesel: "L",
                litrosPorM3Empolado: "L/m³",
              }}
              format={{
                m3Empolado: (v) => fmt.dec(v, 1),
                diesel: (v) => fmt.dec(v, 1),
                litrosPorM3Empolado: (v) => fmt.dec(v, 2),
              }}
            />
          }
        />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} iconType="square" />
        <Bar
          yAxisId="m3"
          dataKey="m3Empolado"
          name="m³ empolado"
          fill={C.sand}
          radius={[2, 2, 0, 0]}
          barSize={12}
        />
        <Line
          yAxisId="lpm3"
          type="monotone"
          dataKey="litrosPorM3Empolado"
          name="L/m³ empolado"
          stroke={C.yellow}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        {media > 0 && (
          <ReferenceLine
            yAxisId="lpm3"
            y={media}
            stroke={C.danger}
            strokeDasharray="3 4"
            ifOverflow="extendDomain"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// HORIZONTAL BARS — Top-N ranking
export function ChartHBars({
  data,
  dataKey,
  nameKey = "id",
  unit = "",
  color = C.yellow,
  accent2 = C.yellowD,
  topN = 8,
}: {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  nameKey?: string;
  unit?: string;
  color?: string;
  accent2?: string;
  topN?: number;
}) {
  const sorted = [...data]
    .sort((a, b) => Number(b[dataKey] ?? 0) - Number(a[dataKey] ?? 0))
    .slice(0, topN);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" horizontal={false} />
        <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey={nameKey}
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={92}
        />
        <Tooltip content={<RichTooltip units={{ [dataKey]: unit }} />} />
        <Bar dataKey={dataKey} radius={[0, 2, 2, 0]} barSize={12}>
          {sorted.map((_, i) => (
            <Cell
              key={i}
              fill={i === 0 ? color : i < 3 ? accent2 : "oklch(0.55 0.06 90)"}
            />
          ))}
          <LabelList
            dataKey={dataKey}
            position="right"
            formatter={(v) => (typeof v === "number" ? fmt.k(v) : String(v ?? ""))}
            style={{ fontSize: 10, fill: C.fg, fontFamily: MONO }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 6. VERTICAL BARS — categóricas (turnos/obras)
// ═══════════════════════════════════════════════════════════════════
export function ChartBars({
  data,
  dataKey,
  nameKey,
  unit,
  color = C.yellow,
}: {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  nameKey: string;
  unit: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 14, right: 14, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey={nameKey}
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          interval={0}
        />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<RichTooltip units={{ [dataKey]: unit }} />} />
        <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]} barSize={36}>
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={i === 0 ? color : i === 1 ? C.yellowD : "oklch(0.5 0.05 90)"}
            />
          ))}
          <LabelList
            dataKey={dataKey}
            position="top"
            formatter={(v) => (typeof v === "number" ? fmt.k(v) : String(v ?? ""))}
            style={{ fontSize: 10, fill: C.fg, fontFamily: MONO }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 7. STACKED AREA — produção compactada + solta
// ═══════════════════════════════════════════════════════════════════
export type ProdStackPoint = { d: string; compactada: number; solta: number };

export function ChartProdStack({ data }: { data: ProdStackPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="gComp2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.yellow} stopOpacity={0.6} />
            <stop offset="100%" stopColor={C.yellow} stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="gSolt2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.sand} stopOpacity={0.5} />
            <stop offset="100%" stopColor={C.sand} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="d"
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          interval={data.length > 14 ? 3 : 0}
        />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<RichTooltip units={{ compactada: "m³", solta: "m³" }} />} />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} iconType="square" />
        <Area
          type="monotone"
          dataKey="compactada"
          name="Compactada"
          stackId="1"
          stroke={C.yellow}
          strokeWidth={1.5}
          fill="url(#gComp2)"
        />
        <Area
          type="monotone"
          dataKey="solta"
          name="Solta"
          stackId="1"
          stroke={C.sand}
          strokeWidth={1.5}
          fill="url(#gSolt2)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 8. DONUT — com total ao centro
// ═══════════════════════════════════════════════════════════════════
export function ChartDonut({
  data,
  dataKey = "value",
  nameKey = "name",
  total,
  colors,
  unit = "",
}: {
  data: Array<Record<string, unknown>>;
  dataKey?: string;
  nameKey?: string;
  total: number;
  colors?: readonly string[];
  unit?: string;
}) {
  const palette = colors ?? CHART_DONUT_COLORS;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Tooltip content={<RichTooltip units={{ [dataKey]: unit }} />} />
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          innerRadius="58%"
          outerRadius="88%"
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Pie>
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={C.fg}
          fontSize={18}
          fontWeight={700}
          fontFamily={MONO}
        >
          {fmt.k(total)}
        </text>
        <text
          x="50%"
          y="58%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={C.fg3}
          fontSize={10}
          letterSpacing="0.1em"
        >
          {unit ? unit.toUpperCase() : "TOTAL"}
        </text>
        <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={8} iconType="square" />
      </PieChart>
    </ResponsiveContainer>
  );
}

export { fmt };
