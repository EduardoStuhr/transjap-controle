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
const LABEL_LIST_LIMIT = 10;

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

function shouldRenderLabels(length: number) {
  return length > 0 && length <= LABEL_LIST_LIMIT;
}

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
        <Tooltip
          content={
            <RichTooltip
              units={{ compactada: "m³", solta: "m³", diesel: "L" }}
              format={{
                compactada: (value: number) => fmt.dec(value, 1),
                solta: (value: number) => fmt.dec(value, 1),
                diesel: (value: number) => fmt.dec(value, 2),
              }}
            />
          }
        />
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
          name="m³ solto"
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

export type HourlyProductionSeries = {
  obra: string;
  dataKey: string;
  color: string;
};

export function ChartHourlyProduction({
  data,
  series = [],
}: {
  data: Array<Record<string, unknown>>;
  series?: HourlyProductionSeries[];
}) {
  const multipleObras = series.length > 1;
  const units = Object.fromEntries([
    ["m3", "m³"],
    ["trips", ""],
    ...series.map((item) => [item.dataKey, "m³"]),
  ]) as Record<string, string>;
  const format = Object.fromEntries([
    ["m3", (value: number) => fmt.dec(value, 2)],
    ["trips", (value: number) => fmt.int(value)],
    ...series.map((item) => [item.dataKey, (value: number) => fmt.dec(value, 2)]),
  ]) as Record<string, (value: number) => string>;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="d" tick={TICK} axisLine={{ stroke: C.grid }} tickLine={false} />
        <YAxis
          yAxisId="m3"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={50}
          tickFormatter={(value: number) => fmt.k(value)}
          label={{
            value: "m³ solto",
            angle: -90,
            position: "insideLeft",
            offset: 14,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <YAxis
          yAxisId="trips"
          orientation="right"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={42}
          label={{
            value: "viagens",
            angle: 90,
            position: "insideRight",
            offset: 12,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <Tooltip content={<RichTooltip units={units} format={format} />} />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} iconType="square" />
        {multipleObras ? (
          series.map((item) => (
            <Bar
              key={item.dataKey}
              yAxisId="m3"
              dataKey={item.dataKey}
              name={`${item.obra} - m³ solto`}
              fill={item.color}
              radius={[2, 2, 0, 0]}
              barSize={10}
            />
          ))
        ) : (
          <Bar
            yAxisId="m3"
            dataKey="m3"
            name={series[0] ? `${series[0].obra} - m³ solto` : "m³ solto"}
            fill={series[0]?.color ?? C.yellow}
            radius={[2, 2, 0, 0]}
            barSize={18}
          />
        )}
        <Line
          yAxisId="trips"
          type="monotone"
          dataKey="trips"
          name="Viagens"
          stroke={C.steel}
          strokeWidth={2.3}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 2. AGREGADOS — ranking horizontal por produção e diesel
// ═══════════════════════════════════════════════════════════════════
export type AggregateRankingPoint = {
  name: string;
  obra?: string;
  liters: number;
  m3: number;
  trips: number;
};

function AggregateRankingRow({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "2px 0",
      }}
    >
      <span style={{ color: "var(--fg-3)" }}>{k}</span>
      <span style={{ fontFamily: MONO, fontWeight: 600, color: "var(--fg)" }}>
        {v}
      </span>
    </div>
  );
}

export function ChartAggregateRanking({
  data,
  topN = 15,
}: {
  data: AggregateRankingPoint[];
  topN?: number;
}) {
  if (!data.length) return null;
  const ranked = [...data]
    .sort((a, b) => b.m3 - a.m3 || b.trips - a.trips)
    .slice(0, topN);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={ranked} layout="vertical" margin={{ top: 4, right: 56, left: 18, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" horizontal={false} />
        <XAxis
          type="number"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => fmt.k(v)}
          label={{
            value: "m³ compactado",
            position: "insideBottomRight",
            offset: -2,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={132}
        />
        <Tooltip
          cursor={{ fill: "oklch(0.45 0.02 90 / 0.15)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as AggregateRankingPoint;
            return (
              <div
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 11,
                  minWidth: 190,
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>
                  {p.name}
                </div>
                {p.obra && p.obra !== p.name && (
                  <div style={{ color: "var(--fg-3)", fontSize: 10, marginBottom: 6 }}>
                    {p.obra}
                  </div>
                )}
                <AggregateRankingRow k="m³ compactado" v={`${fmt.dec(p.m3, 1)} m³`} />
                <AggregateRankingRow k="Diesel atribuído" v={`${fmt.dec(p.liters, 1)} L`} />
                <AggregateRankingRow k="Viagens" v={fmt.int(p.trips)} />
              </div>
            );
          }}
        />
        <Bar dataKey="m3" name="m³ compactado" radius={[0, 2, 2, 0]} barSize={16}>
          {ranked.map((_, index) => (
            <Cell
              key={index}
              fill={index === 0 ? C.yellow : index < 3 ? C.yellowD : "oklch(0.55 0.06 90)"}
            />
          ))}
          {shouldRenderLabels(ranked.length) && (
            <LabelList
            dataKey="m3"
            position="right"
            formatter={(value) =>
              typeof value === "number" ? `${fmt.k(value)} m³` : String(value ?? "")
            }
            style={{ fontSize: 10, fill: C.fg, fontFamily: MONO }}
            />
          )}
        </Bar>
      </BarChart>
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

export function ChartLineLpm3({
  data,
  color = C.mint,
}: {
  data: Array<Record<string, unknown>>;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 14, right: 18, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="g-lpm3-item" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="d" tick={TICK} axisLine={{ stroke: C.grid }} tickLine={false} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={48} />
        <Tooltip
          content={
            <RichTooltip
              units={{ lPorM3: "m³/L" }}
              format={{ lPorM3: (value: number) => fmt.dec(value, 3) }}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="lPorM3"
          name="m³/L"
          stroke={color}
          strokeWidth={2}
          fill="url(#g-lpm3-item)"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ChartM3Diesel({
  data,
  mColor = C.yellow,
  lColor = C.steel,
  mName = "m³",
  lName = "Diesel (L)",
}: {
  data: Array<Record<string, unknown>>;
  mColor?: string;
  lColor?: string;
  mName?: string;
  lName?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 14, right: 24, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="d" tick={TICK} axisLine={{ stroke: C.grid }} tickLine={false} />
        <YAxis
          yAxisId="m3"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(value: number) => fmt.k(value)}
        />
        <YAxis
          yAxisId="diesel"
          orientation="right"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(value: number) => fmt.k(value)}
        />
        <Tooltip
          content={
            <RichTooltip
              units={{ m3: "m³", diesel: "L" }}
              format={{ m3: (value: number) => fmt.dec(value, 1), diesel: (value: number) => fmt.dec(value, 2) }}
            />
          }
        />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} iconType="square" />
        <Bar yAxisId="m3" dataKey="m3" name={mName} fill={mColor} radius={[2, 2, 0, 0]} barSize={12} />
        <Line
          yAxisId="diesel"
          type="monotone"
          dataKey="diesel"
          name={lName}
          stroke={lColor}
          strokeWidth={2.4}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ChartLineRef({
  data,
  dataKey,
  refValue,
  refLabel = "Meta",
  color = C.yellow,
  unit = "",
}: {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  refValue?: number;
  refLabel?: string;
  color?: string;
  unit?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 14, right: 24, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="d" tick={TICK} axisLine={{ stroke: C.grid }} tickLine={false} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={48} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as Record<string, unknown>;
            const value = Number(payload[0].value ?? 0);
            const status = String(point.status ?? "OK");
            const isSuspect = status === "SUSPEITO";
            const row = (name: string, raw: unknown, suffix = "") => {
              const numeric = typeof raw === "number" ? raw : Number(raw);
              const valueText = Number.isFinite(numeric)
                ? fmt.dec(numeric, suffix ? 2 : 3)
                : String(raw ?? "-");
              return (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "2px 0" }}>
                  <span style={{ color: C.fg3 }}>{name}</span>
                  <span style={{ color: C.fg, fontFamily: MONO, fontWeight: 600 }}>
                    {valueText}
                    {suffix && <span style={{ color: C.fg3, marginLeft: 4 }}>{suffix}</span>}
                  </span>
                </div>
              );
            };

            return (
              <div
                style={{
                  background: "var(--bg-2)",
                  border: `1px solid ${isSuspect ? C.warn : "var(--line)"}`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  fontSize: 11,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
                  minWidth: 260,
                }}
              >
                <div
                  style={{
                    color: "var(--fg-3)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 6,
                  }}
                >
                  {String(label ?? "")}
                </div>
                {row(unit ? `${dataKey} (${unit})` : dataKey, value, unit)}
                {row("m3 usado", point.m3Usado ?? point.relatedM3 ?? point.m3, "m3")}
                {row("diesel usado", point.diesel, "L")}
                {row("horas", point.horas, "h")}
                {Boolean(point.formulaUsed) && (
                  <div style={{ marginTop: 6, color: C.fg3, lineHeight: 1.35 }}>
                    Formula: {String(point.formulaUsed)}
                  </div>
                )}
                <div
                  style={{
                    marginTop: 6,
                    color: isSuspect ? C.warn : C.ok,
                    fontWeight: 700,
                  }}
                >
                  Status: {status}
                </div>
                {isSuspect && (
                  <div style={{ marginTop: 4, color: C.warn, lineHeight: 1.35 }}>
                    Valor suspeito: producao alta com diesel baixo/ausente. Verificar rateio/PDE/CMB.
                  </div>
                )}
              </div>
            );
          }}
        />
        {typeof refValue === "number" && Number.isFinite(refValue) && (
          <ReferenceLine
            y={refValue}
            stroke={C.warn}
            strokeDasharray="4 4"
            label={{ value: refLabel, fill: C.fg3, fontSize: 10 }}
          />
        )}
        <Line
          type="monotone"
          dataKey={dataKey}
          name={unit ? `${dataKey} (${unit})` : dataKey}
          stroke={color}
          strokeWidth={2.4}
          dot={(props: { cx?: number; cy?: number; payload?: Record<string, unknown> }) =>
            props.payload?.status === "SUSPEITO" ? (
              <circle
                cx={Number(props.cx ?? 0)}
                cy={Number(props.cy ?? 0)}
                r={4}
                fill={C.warn}
                stroke="var(--bg-0)"
                strokeWidth={1.5}
              />
            ) : (
              <g />
            )
          }
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ChartHistogram({
  data,
  color = C.yellow,
  refIndex,
}: {
  data: Array<Record<string, unknown>>;
  color?: string;
  refIndex?: number;
}) {
  const visibleData = data.filter((row) => Number(row.count ?? 0) > 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={visibleData} margin={{ top: 14, right: 14, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="range" tick={TICK} axisLine={{ stroke: C.grid }} tickLine={false} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={42} />
        <Tooltip content={<RichTooltip units={{ count: "itens" }} />} />
        {typeof refIndex === "number" && refIndex >= 0 && (
          <ReferenceLine
            x={visibleData[refIndex]?.range as string}
            stroke={C.warn}
            strokeDasharray="4 4"
          />
        )}
        <Bar dataKey="count" name="Quantidade" radius={[3, 3, 0, 0]} barSize={28}>
          {visibleData.map((_, index) => (
            <Cell key={index} fill={index === refIndex ? C.warn : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export type StackedBarSeries = {
  dataKey: string;
  name: string;
  color: string;
};

export function ChartStackedBars({
  data,
  series,
  showTotalOnTop = true,
  showWeeklyAverage = true,
}: {
  data: Array<Record<string, unknown>>;
  series: StackedBarSeries[];
  showTotalOnTop?: boolean;
  showWeeklyAverage?: boolean;
}) {
  const enhanced = data.map((row) => {
    const total = series.reduce((sum, item) => sum + Number(row[item.dataKey] ?? 0), 0);
    return { ...row, _total: total };
  });
  const avgTotal =
    enhanced.reduce((sum, row) => sum + Number(row._total ?? 0), 0) / Math.max(1, enhanced.length);
  const showTotalLabels = showTotalOnTop && shouldRenderLabels(enhanced.length);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={enhanced} margin={{ top: 24, right: 18, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="d"
          tick={(props: { x?: number | string; y?: number | string; payload?: { value?: unknown } }) => {
            const x = Number(props.x ?? 0);
            const y = Number(props.y ?? 0);
            const label = String(props.payload?.value ?? "");
            const isWeekend = /sab|dom/i.test(label.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
            return (
              <text
                x={x}
                y={y + 12}
                textAnchor="middle"
                fontSize={10}
                fill={isWeekend ? "var(--fg-4)" : "var(--fg-3)"}
                style={{ fontFamily: MONO }}
              >
                {label}
              </text>
            );
          }}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
        />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={44} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const total = payload.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
            return (
              <div
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 11,
                  minWidth: 210,
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>
                  {label}{" "}
                  <span style={{ color: "var(--fg-3)", fontWeight: 400 }}>
                    - Total: {fmt.dec(total, 2)} L
                  </span>
                </div>
                {payload
                  .filter((item) => Number(item.value ?? 0) > 0)
                  .map((item) => {
                    const value = Number(item.value ?? 0);
                    const pct = total > 0 ? (value / total) * 100 : 0;
                    return (
                      <div
                        key={`${item.name}-${item.dataKey}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "2px 0",
                        }}
                      >
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            color: "var(--fg-2)",
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              background: item.color,
                              borderRadius: 2,
                            }}
                          />
                          {item.name}
                        </span>
                        <span style={{ fontFamily: MONO, color: "var(--fg)" }}>
                          {fmt.dec(value, 2)} L{" "}
                          <span style={{ color: "var(--fg-3)" }}>({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                    );
                  })}
              </div>
            );
          }}
        />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} iconType="square" />
        {series.map((item) => (
          <Bar
            key={item.dataKey}
            dataKey={item.dataKey}
            name={item.name}
            stackId="diesel"
            fill={item.color}
            radius={[2, 2, 0, 0]}
            barSize={22}
          >
            {showTotalLabels && item === series[series.length - 1] && (
              <LabelList
                dataKey="_total"
                position="top"
                formatter={(value) => (Number(value) > 0 ? fmt.dec(Number(value), 0) : "")}
                style={{ fontSize: 10, fill: "var(--fg-2)", fontWeight: 600 }}
              />
            )}
          </Bar>
        ))}
        {showWeeklyAverage && avgTotal > 0 && (
          <ReferenceLine
            y={avgTotal}
            stroke="var(--accent)"
            strokeDasharray="3 5"
            label={{
              value: `Media: ${fmt.dec(avgTotal, 0)} L`,
              position: "right",
              fill: "var(--accent)",
              fontSize: 10,
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export type BubblePoint = {
  name: string;
  diesel: number;
  m3: number;
  horas: number;
  lpm3?: number;
  tipo?: string;
};

export function ChartBubble({ data, avgLpm3 }: { data: BubblePoint[]; avgLpm3?: number }) {
  const colored = data.map((point) => {
    const lpm3 = point.lpm3 ?? (point.diesel > 0 ? point.m3 / point.diesel : 0);
    const color = lpm3 >= 16.7 ? C.ok : lpm3 >= 8.3 ? C.warn : C.danger;
    return { ...point, lpm3, color };
  });
  const validLpm3 = colored.filter((point) => point.lpm3 > 0);
  const avg =
    avgLpm3 ??
    validLpm3.reduce((sum, point) => sum + point.lpm3, 0) / Math.max(1, validLpm3.length);
  const maxDiesel = Math.max(...colored.map((point) => point.diesel), 1);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 28, right: 40, left: 8, bottom: 40 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" />
        <XAxis
          type="number"
          dataKey="diesel"
          name="Diesel"
          unit=" L"
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          label={{
            value: "Diesel (L)",
            position: "bottom",
            offset: 18,
            style: { fontSize: 10, fill: "var(--fg-3)" },
          }}
        />
        <YAxis
          type="number"
          dataKey="m3"
          name="m³"
          unit=" m³"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value: number) => fmt.k(value)}
          label={{
            value: "m3",
            angle: -90,
            position: "insideLeft",
            style: { fontSize: 10, fill: "var(--fg-3)" },
          }}
        />
        <ZAxis type="number" dataKey="horas" range={[140, 600]} />
        {avg > 0 && (
          <ReferenceLine
            segment={[
              { x: 0, y: 0 },
              { x: maxDiesel, y: maxDiesel * avg },
            ]}
            stroke="var(--fg-3)"
            strokeDasharray="4 4"
            label={{
              value: `Media: ${fmt.dec(avg, 3)} m3/L`,
              position: "insideTopRight",
              fill: "var(--fg-3)",
              fontSize: 10,
            }}
          />
        )}
        <text
          x="98%"
          y="22"
          textAnchor="end"
          fontSize={9}
          fill="var(--ok)"
          fontWeight={700}
          letterSpacing="0.1em"
        >
          MAIS EFICIENTE
        </text>
        <text
          x="98%"
          y="96%"
          textAnchor="end"
          fontSize={9}
          fill="var(--danger)"
          fontWeight={700}
          letterSpacing="0.1em"
        >
          MENOS EFICIENTE
        </text>
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as BubblePoint;
            return (
              <div
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 11,
                  minWidth: 190,
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>
                  {point.name}
                </div>
                {point.tipo && (
                  <div style={{ color: "var(--fg-3)", marginBottom: 6 }}>{point.tipo}</div>
                )}
                <AggregateRankingRow k="Diesel" v={`${fmt.dec(point.diesel, 1)} L`} />
                <AggregateRankingRow k="m³" v={`${fmt.dec(point.m3, 1)} m³`} />
                <AggregateRankingRow k="Horas" v={`${fmt.dec(point.horas, 1)} h`} />
                <AggregateRankingRow
                  k="m³/L"
                  v={point.lpm3 ? `${fmt.dec(point.lpm3, 3)} m³/L` : "sem diesel"}
                />
              </div>
            );
          }}
        />
        <Scatter data={colored} name="Equipamentos">
          {colored.map((point) => (
            <Cell
              key={point.name}
              fill={point.color}
              fillOpacity={0.85}
              stroke="var(--bg-0)"
              strokeWidth={1.5}
            />
          ))}
          {shouldRenderLabels(colored.length) && (
            <LabelList
              dataKey="name"
              position="top"
              offset={8}
              style={{ fontSize: 10, fill: "var(--fg)", fontWeight: 600 }}
            />
          )}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function ChartProductivity({
  data,
  color = C.mint,
}: {
  data: Array<Record<string, unknown>>;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 14, right: 18, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="g-productivity-item" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="d" tick={TICK} axisLine={{ stroke: C.grid }} tickLine={false} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<RichTooltip units={{ m3PorH: "m³/h" }} />} />
        <Area
          type="monotone"
          dataKey="m3PorH"
          name="m³/h"
          stroke={color}
          strokeWidth={2}
          fill="url(#g-productivity-item)"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export type EquipmentEfficiencyRankingPoint = {
  id: string;
  equipamento?: string;
  litros?: number;
  horas?: number;
  lph?: number;
  lpm3?: number;
  m3?: number;
  share?: number;
  dias?: number;
};

function lphTag(lph: number) {
  if (lph <= 7.5) return { label: "Eficiente", color: C.ok };
  if (lph <= 15) return { label: "Medio", color: C.warn };
  return { label: "Alto consumo", color: C.danger };
}

function productivityColor(index: number, total: number) {
  if (total <= 1) return C.ok;
  const ratio = index / Math.max(1, total - 1);
  if (ratio < 0.34) return C.ok;
  if (ratio < 0.67) return C.warn;
  return C.danger;
}

export function ChartLphRanking({
  data,
  topN = 10,
}: {
  data: EquipmentEfficiencyRankingPoint[];
  topN?: number;
}) {
  const rows = data
    .filter((row) => Number.isFinite(row.lph) && Number(row.lph) > 0)
    .sort((a, b) => Number(b.lph ?? 0) - Number(a.lph ?? 0))
    .slice(0, topN);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 12, right: 72, left: 14, bottom: 8 }}
        barCategoryGap={8}
      >
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" horizontal={false} />
        <XAxis
          type="number"
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          label={{
            value: "L/h",
            position: "insideBottomRight",
            offset: -4,
            fill: C.fg3,
            fontSize: 10,
          }}
        />
        <YAxis
          type="category"
          dataKey="id"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={118}
        />
        <ReferenceLine
          x={7.5}
          stroke={C.ok}
          strokeDasharray="3 4"
          label={{ value: "7,5", position: "top", fill: C.ok, fontSize: 10 }}
        />
        <ReferenceLine
          x={15}
          stroke={C.warn}
          strokeDasharray="3 4"
          label={{ value: "15", position: "top", fill: C.warn, fontSize: 10 }}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as EquipmentEfficiencyRankingPoint;
            const lph = Number(row.lph ?? 0);
            const tag = lphTag(lph);
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
                <div style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>
                  {row.id}
                </div>
                <AggregateRankingRow k="Litros" v={`${fmt.dec(Number(row.litros ?? 0), 1)} L`} />
                <AggregateRankingRow k="Horas" v={`${fmt.dec(Number(row.horas ?? 0), 1)} h`} />
                <AggregateRankingRow k="L/h" v={`${fmt.dec(lph, 2)} L/h`} />
                <AggregateRankingRow k="Classificacao" v={tag.label} />
              </div>
            );
          }}
        />
        <Bar dataKey="lph" name="L/h" radius={[0, 4, 4, 0]} barSize={18}>
          {rows.map((row) => (
            <Cell key={row.id} fill={lphTag(Number(row.lph ?? 0)).color} />
          ))}
          {shouldRenderLabels(rows.length) && (
            <LabelList
              dataKey="lph"
              position="right"
              formatter={(value) => `${fmt.dec(Number(value ?? 0), 2)} L/h`}
              style={{ fontSize: 10, fill: C.fg, fontFamily: MONO, fontWeight: 700 }}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChartM3PerLiterRanking({
  data,
  topN = 10,
}: {
  data: EquipmentEfficiencyRankingPoint[];
  topN?: number;
}) {
  const rows = data
    .filter((row) => Number.isFinite(row.lpm3) && Number(row.lpm3) > 0)
    .sort((a, b) => Number(b.lpm3 ?? 0) - Number(a.lpm3 ?? 0))
    .slice(0, topN);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 12, right: 82, left: 14, bottom: 8 }}
        barCategoryGap={8}
      >
        <CartesianGrid stroke={C.grid} strokeDasharray="2 4" horizontal={false} />
        <XAxis
          type="number"
          tick={TICK}
          axisLine={{ stroke: C.grid }}
          tickLine={false}
          label={{
            value: "m3/L",
            position: "insideBottomRight",
            offset: -4,
            fill: C.fg3,
            fontSize: 10,
          }}
        />
        <YAxis
          type="category"
          dataKey="id"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={118}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as EquipmentEfficiencyRankingPoint;
            const m3PerLiter = Number(row.lpm3 ?? 0);
            return (
              <div
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 11,
                  minWidth: 210,
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>
                  {row.id}
                </div>
                <AggregateRankingRow
                  k="m3 relacionado"
                  v={`${fmt.dec(Number(row.m3 ?? 0), 1)} m3`}
                />
                <AggregateRankingRow k="Diesel" v={`${fmt.dec(Number(row.litros ?? 0), 1)} L`} />
                <AggregateRankingRow k="Horas" v={`${fmt.dec(Number(row.horas ?? 0), 1)} h`} />
                <AggregateRankingRow
                  k="Share medio"
                  v={`${fmt.dec(Number(row.share ?? 0) * 100, 2)}%`}
                />
                <AggregateRankingRow k="Dias com share" v={fmt.int(Number(row.dias ?? 0))} />
                <AggregateRankingRow k="L/h" v={`${fmt.dec(Number(row.lph ?? 0), 2)} L/h`} />
                <AggregateRankingRow k="m3/L" v={`${fmt.dec(m3PerLiter, 3)} m3/L`} />
                <div style={{ marginTop: 6, color: C.fg3 }}>
                  m3 relacionado de {fmt.dec(m3PerLiter, 2)} por litro
                </div>
              </div>
            );
          }}
        />
        <Bar dataKey="lpm3" name="m3/L" radius={[0, 4, 4, 0]} barSize={18}>
          {rows.map((row, index) => (
            <Cell key={row.id} fill={productivityColor(index, rows.length)} />
          ))}
          {shouldRenderLabels(rows.length) && (
            <LabelList
              dataKey="lpm3"
              position="right"
              formatter={(value) => `${fmt.dec(Number(value ?? 0), 3)} m3/L`}
              style={{ fontSize: 10, fill: C.fg, fontFamily: MONO, fontWeight: 700 }}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChartCompareBars({
  data,
  dataKey,
  nameKey = "id",
  unit = "",
  color = C.yellow,
}: {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  nameKey?: string;
  unit?: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 14, right: 18, left: 0, bottom: 4 }}>
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
        <Bar dataKey={dataKey} radius={[3, 3, 0, 0]} barSize={26}>
          {data.map((_, index) => (
            <Cell
              key={index}
              fill={index === 0 ? color : index === 1 ? C.yellowD : "oklch(0.5 0.05 90)"}
            />
          ))}
          {shouldRenderLabels(data.length) && (
            <LabelList
              dataKey={dataKey}
              position="top"
              formatter={(value) =>
                typeof value === "number" ? `${fmt.dec(value, 2)}${unit ? ` ${unit}` : ""}` : ""
              }
              style={{ fontSize: 10, fill: C.fg, fontFamily: MONO }}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 5. PRODUÇÃO EMPOLADA X DIESEL — volume x diesel diário
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
            name={`${s.obra} - ${volumeName}`}
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
            name={`${s.obra} - ${lineName}`}
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

export type ProducaoEmpoladaDieselPoint = {
  d: string;
  m3Empolado: number;
  diesel: number;
};

export function ChartProducaoEmpoladaDiesel({
  data,
  seriesLabel,
}: {
  data: ProducaoEmpoladaDieselPoint[];
  seriesLabel?: string;
}) {
  const m3Name = seriesLabel ? `${seriesLabel} - m³ solto` : "m³ solto";
  const dieselName = seriesLabel ? `${seriesLabel} - diesel` : "diesel";

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
            value: "m³ solto",
            angle: -90,
            position: "insideLeft",
            offset: 14,
            style: { fontSize: 10, fill: C.fg3 },
          }}
        />
        <YAxis
          yAxisId="diesel"
          orientation="right"
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v: number) => fmt.k(v)}
          label={{
            value: "L diesel",
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
              }}
              format={{
                m3Empolado: (v) => fmt.dec(v, 1),
                diesel: (v) => fmt.dec(v, 1),
              }}
            />
          }
        />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} iconType="square" />
        <Bar
          yAxisId="m3"
          dataKey="m3Empolado"
          name={m3Name}
          fill={C.sand}
          radius={[2, 2, 0, 0]}
          barSize={12}
        />
        <Line
          yAxisId="diesel"
          type="monotone"
          dataKey="diesel"
          name={dieselName}
          stroke={C.yellow}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
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
          {shouldRenderLabels(sorted.length) && (
            <LabelList
              dataKey={dataKey}
              position="right"
              formatter={(v) => (typeof v === "number" ? fmt.k(v) : String(v ?? ""))}
              style={{ fontSize: 10, fill: C.fg, fontFamily: MONO }}
            />
          )}
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
          {shouldRenderLabels(data.length) && (
            <LabelList
              dataKey={dataKey}
              position="top"
              formatter={(v) => (typeof v === "number" ? fmt.k(v) : String(v ?? ""))}
              style={{ fontSize: 10, fill: C.fg, fontFamily: MONO }}
            />
          )}
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
          name="m³ solto"
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

