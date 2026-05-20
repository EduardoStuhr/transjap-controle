import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/auth-store";
import {
  listAnalyses,
  listDailyParts,
  listFueling,
  listTrips,
} from "@/lib/api/production-consumption";
import { normalizeDateKey, normalizeFleet } from "@/lib/carcara-parser";
import {
  AGGREGATE_TRIP_PRICE,
  buildProductionAnalytics,
  normalizeAggregatePrefix,
  safeDivide,
  type OperationalBubble,
} from "@/lib/production-analytics";
import type { DbEquipmentDailyPart, DbFueling, DbProductionAnalysis, DbTrip } from "@/db/schema";

const CarcaraImportDialog = lazy(() =>
  import("@/components/CarcaraImportDialog").then((m) => ({ default: m.CarcaraImportDialog })),
);

export const Route = createFileRoute("/producao-consumo")({ component: ProducaoConsumo });

type TabId =
  | "overview"
  | "daily"
  | "accumulated"
  | "efficiency"
  | "financial"
  | "comparison"
  | "history"
  | "production"
  | "consumption"
  | "equipment"
  | "trucks"
  | "audit"
  | "crossAudit"
  | "data";

const PAGE_SIZE = 12;
const CHART_YELLOW = "#f4c430";
const CHART_BLUE = "#38bdf8";
const CHART_GREEN = "#22c55e";
const CHART_RED = "#ef4444";
const CHART_ORANGE = "#fb923c";
const CHART_GRID = "rgba(255,255,255,0.12)";
const CHART_TEXT = "#c9c1a8";

type DailyPoint = {
  date: string;
  label: string;
  m3: number;
  loose: number;
  liters: number;
  cost: number;
  trips: number;
  revenue: number;
  margin: number;
  litersPerM3: number;
  costPerM3: number;
};

type TooltipPayload = {
  name?: string;
  value?: unknown;
  color?: string;
  payload?: Record<string, unknown>;
};

function formatNumber(v: number, digits = 1) {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatBRL(v: number) {
  return `R$ ${formatNumber(v, 2)}`;
}

function formatLiters(v: number) {
  return `${formatNumber(v, 0)} L`;
}

function formatM3(v: number) {
  return `${formatNumber(v, 1)} m³`;
}

function fmtBRL(v: number) {
  return formatNumber(v, 2);
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function vehicleKey(row: { prefix: string; vehicleId: string; plate: string }) {
  return row.prefix || row.vehicleId || row.plate || "Sem identificação";
}

function aggregateKey(row: DbTrip) {
  return normalizeAggregatePrefix(row.prefix || row.vehicleId || row.plate);
}

function ownEquipmentKey(row: { prefix: string; vehicleId: string; plate: string }) {
  return normalizeFleet(row.prefix || row.vehicleId || row.plate) || vehicleKey(row);
}

function uniq(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

function dateKey(value: unknown) {
  return normalizeDateKey(value) || String(value ?? "").slice(0, 10);
}

function shortDate(key: string) {
  if (!key || key.length < 10) return "—";
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

function compacted(row: DbTrip) {
  return row.cubicMCompacted || row.cubicMLoose / (1 + row.swellFactorApplied);
}

function KpiCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
}) {
  return (
    <div
      className="rounded border border-border-low bg-surface-container p-3 min-h-[104px]"
      title={sub}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          {label}
        </p>
        <Icon name={icon} className="text-lg text-primary" />
      </div>
      <p className="mt-2 text-xl font-black leading-none">{value}</p>
      {sub && <p className="mt-2 text-xs text-on-surface-variant">{sub}</p>}
    </div>
  );
}

function ChartCard({
  title,
  description,
  hasData,
  children,
}: {
  title: string;
  description: string;
  hasData: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded border border-border-low bg-surface-container p-4">
      <div className="mb-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest">{title}</h3>
        <p className="mt-1 text-xs text-on-surface-variant">{description}</p>
      </div>
      <div className="h-[320px]">
        {hasData ? (
          children
        ) : (
          <div className="flex h-full items-center justify-center rounded border border-border-low/60 bg-surface-low text-xs text-on-surface-variant">
            Sem dados suficientes para este gráfico.
          </div>
        )}
      </div>
    </div>
  );
}

function TooltipShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded border border-border-low bg-surface-highest p-3 text-xs shadow-xl">
      <p className="mb-2 font-black text-on-surface">{label}</p>
      <div className="space-y-1 text-on-surface-variant">{children}</div>
    </div>
  );
}

function TooltipLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <p className="flex min-w-48 items-center justify-between gap-4">
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <strong className="text-on-surface">{value}</strong>
    </p>
  );
}

function DailyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as DailyPoint;
  return (
    <TooltipShell label={label ? fmtDate(String(row.date || label)) : "Dia"}>
      <TooltipLine label="m³ solto" value={formatM3(row.loose)} color={CHART_ORANGE} />
      <TooltipLine label="m³ compactado" value={formatM3(row.m3)} color={CHART_YELLOW} />
      <TooltipLine label="Litros" value={formatLiters(row.liters)} color={CHART_BLUE} />
      <TooltipLine label="Viagens" value={formatNumber(row.trips, 0)} color={CHART_TEXT} />
      <TooltipLine label="Custo diesel" value={formatBRL(row.cost)} color={CHART_RED} />
      <TooltipLine label="Margem" value={formatBRL(row.margin)} color={CHART_GREEN} />
    </TooltipShell>
  );
}

function GenericTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipShell label={label ?? "Dados"}>
      {payload.map((item) => (
        <TooltipLine
          key={`${item.name}-${String(item.value)}`}
          label={item.name ?? "Valor"}
          value={typeof item.value === "number" ? formatNumber(item.value, 2) : String(item.value)}
          color={item.color ?? CHART_YELLOW}
        />
      ))}
    </TooltipShell>
  );
}

function ProductionConsumptionChart({ data }: { data: DailyPoint[] }) {
  return (
    <ChartCard
      title="Produção × Consumo por dia"
      description="Barras de m³ compactado e linha de litros consumidos, agrupados por data."
      hasData={data.some((row) => row.m3 > 0 || row.liters > 0 || row.trips > 0)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis
            yAxisId="m3"
            tick={{ fill: CHART_TEXT, fontSize: 11 }}
            tickFormatter={(value) => formatNumber(Number(value), 0)}
            label={{ value: "m³", angle: -90, position: "insideLeft", fill: CHART_TEXT }}
          />
          <YAxis
            yAxisId="liters"
            orientation="right"
            tick={{ fill: CHART_TEXT, fontSize: 11 }}
            tickFormatter={(value) => formatNumber(Number(value), 0)}
            label={{ value: "litros", angle: 90, position: "insideRight", fill: CHART_TEXT }}
          />
          <Tooltip content={<DailyTooltip />} />
          <Legend wrapperStyle={{ color: CHART_TEXT, fontSize: 12 }} />
          <Bar
            yAxisId="m3"
            dataKey="m3"
            name="m³ compactado"
            fill={CHART_YELLOW}
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="liters"
            type="monotone"
            dataKey="liters"
            name="litros diesel"
            stroke={CHART_BLUE}
            strokeWidth={3}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DailyProductionChart({ data }: { data: DailyPoint[] }) {
  return (
    <ChartCard
      title="Produção diária"
      description="m³ compactado por dia, com volume solto no tooltip."
      hasData={data.some((row) => row.m3 > 0 || row.trips > 0)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <Tooltip content={<DailyTooltip />} />
          <Legend wrapperStyle={{ color: CHART_TEXT, fontSize: 12 }} />
          <Bar dataKey="m3" name="m³ compactado" fill={CHART_YELLOW} radius={[4, 4, 0, 0]} />
          <Bar dataKey="loose" name="m³ solto" fill={CHART_ORANGE} radius={[4, 4, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DailyFuelChart({ data }: { data: DailyPoint[] }) {
  return (
    <ChartCard
      title="Consumo diário"
      description="Litros consumidos por dia pelos equipamentos próprios."
      hasData={data.some((row) => row.liters > 0)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <Tooltip content={<DailyTooltip />} />
          <Legend wrapperStyle={{ color: CHART_TEXT, fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="liters"
            name="litros diesel"
            stroke={CHART_BLUE}
            strokeWidth={3}
            dot={{ r: 3 }}
          />
        </RechartsLineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function AverageConsumptionChart({ data }: { data: DailyPoint[] }) {
  return (
    <ChartCard
      title="Consumo médio L/m³ por dia"
      description="Litros ÷ m³ compactado. Dias sem produção aparecem como zero."
      hasData={data.some((row) => row.liters > 0 || row.m3 > 0)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as DailyPoint;
              return (
                <TooltipShell label={label ? fmtDate(row.date) : "Dia"}>
                  <TooltipLine
                    label="Consumo operacional"
                    value={`${formatNumber(row.litersPerM3, 2)} L/m³`}
                    color={CHART_BLUE}
                  />
                  <TooltipLine
                    label="Produção"
                    value={row.m3 > 0 ? formatM3(row.m3) : "sem produção"}
                    color={CHART_YELLOW}
                  />
                  <TooltipLine label="Litros" value={formatLiters(row.liters)} color={CHART_BLUE} />
                </TooltipShell>
              );
            }}
          />
          <Legend wrapperStyle={{ color: CHART_TEXT, fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="litersPerM3"
            name="L/m³"
            stroke={CHART_GREEN}
            strokeWidth={3}
            dot={{ r: 3 }}
          />
        </RechartsLineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DailyFuelCostChart({ data }: { data: DailyPoint[] }) {
  return (
    <ChartCard
      title="Custo combustível por dia"
      description="Custo de diesel da CMB por data."
      hasData={data.some((row) => row.cost > 0)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis
            yAxisId="cost"
            tick={{ fill: CHART_TEXT, fontSize: 11 }}
            tickFormatter={(value) => `R$ ${formatNumber(Number(value), 0)}`}
          />
          <YAxis
            yAxisId="m3"
            orientation="right"
            tick={{ fill: CHART_TEXT, fontSize: 11 }}
            tickFormatter={(value) => `R$ ${formatNumber(Number(value), 2)}`}
          />
          <Tooltip content={<DailyTooltip />} />
          <Legend wrapperStyle={{ color: CHART_TEXT, fontSize: 12 }} />
          <Bar
            yAxisId="cost"
            dataKey="cost"
            name="custo diesel"
            fill={CHART_RED}
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="m3"
            type="monotone"
            dataKey="costPerM3"
            name="R$/m³"
            stroke={CHART_YELLOW}
            strokeWidth={3}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function TopAggregatesChart({
  rows,
}: {
  rows: Array<{
    aggregate: string;
    trips: number;
    loose: number;
    m3: number;
    participation: number;
  }>;
}) {
  const data = rows.slice(0, 10);
  return (
    <ChartCard
      title="Top caminhões por produção"
      description="Agregados do RCO por m³ compactado, viagens e participação."
      hasData={data.some((row) => row.trips > 0)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 18, bottom: 4 }}
        >
          <CartesianGrid stroke={CHART_GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis
            dataKey="aggregate"
            type="category"
            width={92}
            tick={{ fill: CHART_TEXT, fontSize: 11 }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return (
                <TooltipShell label={row.aggregate}>
                  <TooltipLine
                    label="Viagens"
                    value={formatNumber(row.trips, 0)}
                    color={CHART_TEXT}
                  />
                  <TooltipLine label="m³ solto" value={formatM3(row.loose)} color={CHART_ORANGE} />
                  <TooltipLine
                    label="m³ compactado"
                    value={formatM3(row.m3)}
                    color={CHART_YELLOW}
                  />
                  <TooltipLine
                    label="Participação"
                    value={`${formatNumber(row.participation, 1)}%`}
                    color={CHART_GREEN}
                  />
                </TooltipShell>
              );
            }}
          />
          <Bar dataKey="m3" name="m³ compactado" fill={CHART_YELLOW} radius={[0, 4, 4, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function TopEquipmentChart({
  rows,
}: {
  rows: Array<{
    equipment: string;
    liters: number;
    cost: number;
    hours: number;
    lh: number;
  }>;
}) {
  const data = rows.slice(0, 10);
  return (
    <ChartCard
      title="Top equipamentos por consumo"
      description="Equipamentos próprios da CMB/PDE por litros, custo e L/h."
      hasData={data.some((row) => row.liters > 0)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 18, bottom: 4 }}
        >
          <CartesianGrid stroke={CHART_GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis
            dataKey="equipment"
            type="category"
            width={92}
            tick={{ fill: CHART_TEXT, fontSize: 11 }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return (
                <TooltipShell label={row.equipment}>
                  <TooltipLine label="Litros" value={formatLiters(row.liters)} color={CHART_BLUE} />
                  <TooltipLine label="Custo" value={formatBRL(row.cost)} color={CHART_RED} />
                  <TooltipLine
                    label="Horas PDE"
                    value={`${formatNumber(row.hours, 1)} h`}
                    color={CHART_GREEN}
                  />
                  <TooltipLine label="L/h" value={formatNumber(row.lh, 2)} color={CHART_YELLOW} />
                </TooltipShell>
              );
            }}
          />
          <Bar dataKey="liters" name="litros" fill={CHART_BLUE} radius={[0, 4, 4, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function FinancialChart({
  kpis,
}: {
  kpis: {
    revenue: number;
    fuelCost: number;
    aggregateCost: number;
    operationalMargin: number;
  };
}) {
  const data = [
    {
      label: "Análise",
      faturamento: kpis.revenue,
      combustivel: kpis.fuelCost,
      agregados: kpis.aggregateCost,
      margem: kpis.operationalMargin,
    },
  ];
  return (
    <ChartCard
      title="Faturamento × Custo × Margem"
      description="Receita da RCO comparada a combustível, agregados e margem operacional."
      hasData={kpis.revenue > 0 || kpis.fuelCost > 0 || kpis.aggregateCost > 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis
            tick={{ fill: CHART_TEXT, fontSize: 11 }}
            tickFormatter={(v) => `R$ ${formatNumber(Number(v), 0)}`}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              return (
                <TooltipShell label="Resultado financeiro">
                  {payload.map((item) => (
                    <TooltipLine
                      key={String(item.name)}
                      label={String(item.name ?? "Valor")}
                      value={formatBRL(Number(item.value ?? 0))}
                      color={item.color ?? CHART_YELLOW}
                    />
                  ))}
                </TooltipShell>
              );
            }}
          />
          <Legend wrapperStyle={{ color: CHART_TEXT, fontSize: 12 }} />
          <Bar dataKey="faturamento" name="Faturamento" fill={CHART_YELLOW} radius={[4, 4, 0, 0]} />
          <Bar
            dataKey="combustivel"
            name="Custo combustível"
            fill={CHART_RED}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="agregados"
            name="Custo agregados"
            fill={CHART_ORANGE}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="margem"
            name="Margem operacional"
            fill={kpis.operationalMargin >= 0 ? CHART_GREEN : CHART_RED}
            radius={[4, 4, 0, 0]}
          />
        </RechartsBarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DistributionChart({
  title,
  description,
  data,
  color = CHART_GREEN,
}: {
  title: string;
  description: string;
  data: { label: string; value: number }[];
  color?: string;
}) {
  const hasMultiple = data.length > 1;
  if (!hasMultiple && data.length === 1) {
    return (
      <div className="rounded border border-border-low bg-surface-container p-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest">{title}</h3>
        <p className="mt-1 text-xs text-on-surface-variant">{description}</p>
        <div className="mt-6 rounded border border-border-low bg-surface-highest p-4">
          <p className="text-xs text-on-surface-variant">Único grupo encontrado</p>
          <p className="mt-2 text-xl font-black">{data[0].label}</p>
          <p className="mt-1 text-sm text-primary">{formatM3(data[0].value)}</p>
        </div>
      </div>
    );
  }
  return (
    <ChartCard title={title} description={description} hasData={data.length > 0}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 18, bottom: 4 }}
        >
          <CartesianGrid stroke={CHART_GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis
            dataKey="label"
            type="category"
            width={110}
            tick={{ fill: CHART_TEXT, fontSize: 11 }}
          />
          <Tooltip content={<GenericTooltip />} />
          <Bar dataKey="value" name="m³ compactado" fill={color} radius={[0, 4, 4, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ObraComparisonChart({
  rows,
}: {
  rows: Array<{
    obra: string;
    m3: number;
    liters: number;
    cost: number;
    revenue: number;
    costPerM3: number;
  }>;
}) {
  if (rows.length <= 1) {
    const row = rows[0];
    return (
      <div className="rounded border border-border-low bg-surface-container p-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest">Distribuição por obra</h3>
        <p className="mt-1 text-xs text-on-surface-variant">Há apenas uma obra nesta análise.</p>
        <div className="mt-6 rounded border border-border-low bg-surface-highest p-4">
          <p className="text-xl font-black">{row?.obra ?? "Sem obra"}</p>
          <p className="mt-1 text-sm text-primary">{formatM3(row?.m3 ?? 0)}</p>
        </div>
      </div>
    );
  }
  return (
    <ChartCard
      title="Comparativo por obra"
      description="Produção, litros, custo por m³ e faturamento por obra."
      hasData={rows.length > 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="obra" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis yAxisId="m3" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis yAxisId="liters" orientation="right" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              return (
                <TooltipShell label={row.obra}>
                  <TooltipLine label="Produção" value={formatM3(row.m3)} color={CHART_YELLOW} />
                  <TooltipLine label="Litros" value={formatLiters(row.liters)} color={CHART_BLUE} />
                  <TooltipLine label="R$/m³" value={formatBRL(row.costPerM3)} color={CHART_RED} />
                  <TooltipLine
                    label="Faturamento"
                    value={formatBRL(row.revenue)}
                    color={CHART_GREEN}
                  />
                </TooltipShell>
              );
            }}
          />
          <Legend wrapperStyle={{ color: CHART_TEXT, fontSize: 12 }} />
          <Bar
            yAxisId="m3"
            dataKey="m3"
            name="m³ compactado"
            fill={CHART_YELLOW}
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="liters"
            type="monotone"
            dataKey="liters"
            name="litros"
            stroke={CHART_BLUE}
            strokeWidth={3}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DieselHoursProductionChart({
  data,
  mode,
  onMode,
}: {
  data: OperationalBubble[];
  mode: "obra" | "equipment" | "analysis" | "period";
  onMode: (mode: "obra" | "equipment" | "analysis" | "period") => void;
}) {
  return (
    <div className="rounded border border-primary/40 bg-surface-container p-4 shadow-industrial">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">
            Indicador operacional central
          </span>
          <h3 className="mt-1 text-base font-black uppercase tracking-tight">
            Diesel × Horas × Produção
          </h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            Eixo X horas trabalhadas, eixo Y m³ compactado, bolha litros consumidos.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded border border-border-low bg-surface-highest p-1">
          {[
            ["obra", "Obra"],
            ["equipment", "Equip."],
            ["analysis", "Análise"],
            ["period", "Período"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onMode(id as "obra" | "equipment" | "analysis" | "period")}
              className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                mode === id ? "bg-primary text-on-primary" : "text-on-surface-variant"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[420px]">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 18, left: 0, bottom: 10 }}>
              <CartesianGrid stroke={CHART_GRID} />
              <XAxis
                type="number"
                dataKey="hours"
                name="horas"
                tick={{ fill: CHART_TEXT, fontSize: 11 }}
                tickFormatter={(value) => `${formatNumber(Number(value), 0)}h`}
              />
              <YAxis
                type="number"
                dataKey="compactedM3"
                name="m³ compactado"
                tick={{ fill: CHART_TEXT, fontSize: 11 }}
                tickFormatter={(value) => formatNumber(Number(value), 0)}
              />
              <ZAxis type="number" dataKey="z" range={[90, 900]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3", stroke: CHART_TEXT }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as OperationalBubble;
                  return (
                    <TooltipShell label={row.label}>
                      <TooltipLine label="Obra" value={row.obra || "—"} color={row.color} />
                      <TooltipLine
                        label="Equipamento"
                        value={row.equipment || "—"}
                        color={CHART_TEXT}
                      />
                      <TooltipLine
                        label="Horas"
                        value={`${formatNumber(row.hours, 1)} h`}
                        color={CHART_GREEN}
                      />
                      <TooltipLine
                        label="Litros"
                        value={formatLiters(row.liters)}
                        color={CHART_BLUE}
                      />
                      <TooltipLine
                        label="m³ compactado"
                        value={formatM3(row.compactedM3)}
                        color={CHART_YELLOW}
                      />
                      <TooltipLine
                        label="L/h"
                        value={formatNumber(row.fuelPerHour, 2)}
                        color={CHART_BLUE}
                      />
                      <TooltipLine
                        label="m³/h"
                        value={formatNumber(row.productionPerHour, 2)}
                        color={CHART_GREEN}
                      />
                      <TooltipLine
                        label="L/m³"
                        value={formatNumber(row.fuelPerM3, 2)}
                        color={CHART_ORANGE}
                      />
                      <TooltipLine
                        label="Custo/m³"
                        value={formatBRL(row.costPerM3)}
                        color={CHART_RED}
                      />
                      <TooltipLine
                        label="Eficiência"
                        value={`${formatNumber(row.efficiencyPercent, 0)}%`}
                        color={row.color}
                      />
                    </TooltipShell>
                  );
                }}
              />
              <Scatter data={data} name="Eficiência operacional">
                {data.map((entry) => (
                  <Cell key={entry.id} fill={entry.color} fillOpacity={0.82} stroke={entry.color} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded border border-border-low/60 bg-surface-low text-xs text-on-surface-variant">
            Sem dados suficientes para cruzar diesel, horas e produção.
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
          eficiente
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f4c430]" />
          atenção
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
          alto consumo / baixa produção
        </span>
      </div>
    </div>
  );
}

function OperationalAlertCard({ alerts }: { alerts: string[] }) {
  return (
    <div className="rounded border border-status-warning/50 bg-status-warning/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-status-warning text-background">
          <Icon name="warning" className="text-xl" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-status-warning">
            Alerta operacional
          </p>
          <div className="mt-2 grid gap-1 text-sm">
            {alerts.map((alert) => (
              <p key={alert} className="font-semibold text-on-surface">
                {alert}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ObraRankingTable({
  rows,
}: {
  rows: Array<{
    obra: string;
    compactedM3: number;
    liters: number;
    hours: number;
    fuelPerM3: number;
    productionPerHour: number;
    operationalCostPerM3: number;
    efficiencyPercent: number;
  }>;
}) {
  return (
    <Ranking
      title="Ranking de obras"
      rows={rows.map((row) => ({
        obra: row.obra,
        m3: formatNumber(row.compactedM3, 1),
        diesel: formatNumber(row.liters, 0),
        horas: formatNumber(row.hours, 1),
        lm3: formatNumber(row.fuelPerM3, 2),
        m3h: formatNumber(row.productionPerHour, 2),
        custoM3: formatBRL(row.operationalCostPerM3),
        eficiencia: `${formatNumber(row.efficiencyPercent, 0)}%`,
      }))}
      columns={[
        { key: "obra", label: "Obra" },
        { key: "m3", label: "m³ comp.", align: "right" },
        { key: "diesel", label: "Diesel L", align: "right" },
        { key: "horas", label: "Horas", align: "right" },
        { key: "lm3", label: "L/m³", align: "right" },
        { key: "m3h", label: "m³/h", align: "right" },
        { key: "custoM3", label: "Custo/m³", align: "right" },
        { key: "eficiencia", label: "Eficiência", align: "right" },
      ]}
    />
  );
}

function AnalysisHistoryPanel({
  analyses,
  selectedIds,
  onSelect,
}: {
  analyses: DbProductionAnalysis[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
}) {
  return (
    <div className="rounded border border-border-low bg-surface-container p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-widest">Histórico acumulado</h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            Cada análise permanece disponível para acumulado, comparação e auditoria.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => onSelect(analyses.map((analysis) => analysis.id))}
          disabled={analyses.length === 0}
        >
          Todas
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-low text-on-surface-variant">
              {["", "Análise", "Obra", "Material", "Período", "Criada em"].map((header) => (
                <th key={header} className="py-2 text-left font-black uppercase tracking-widest">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analyses.map((analysis) => {
              const selected = selectedIds.includes(analysis.id);
              return (
                <tr key={analysis.id} className="border-b border-border-low/40">
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        onSelect(
                          selected
                            ? selectedIds.filter((id) => id !== analysis.id)
                            : [...selectedIds, analysis.id],
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-4 font-semibold">{analysis.name}</td>
                  <td className="py-2 pr-4">{analysis.obra || "—"}</td>
                  <td className="py-2 pr-4">{analysis.material || "—"}</td>
                  <td className="py-2 pr-4">
                    {fmtDate(analysis.dateStart)} a {fmtDate(analysis.dateEnd)}
                  </td>
                  <td className="py-2 pr-4">{fmtDate(analysis.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EquipmentHoursChart({
  rows,
}: {
  rows: Array<{ equipment: string; hours: number; liters: number; lh: number }>;
}) {
  const data = rows.filter((row) => row.hours > 0).slice(0, 10);
  return (
    <ChartCard
      title="Horas PDE por frota"
      description="Horas trabalhadas na Parte Diária por equipamento próprio."
      hasData={data.length > 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 18, bottom: 4 }}
        >
          <CartesianGrid stroke={CHART_GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis
            dataKey="equipment"
            type="category"
            width={92}
            tick={{ fill: CHART_TEXT, fontSize: 11 }}
          />
          <Tooltip content={<GenericTooltip />} />
          <Bar dataKey="hours" name="horas PDE" fill={CHART_GREEN} radius={[0, 4, 4, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function EquipmentLhChart({
  rows,
}: {
  rows: Array<{ equipment: string; hours: number; liters: number; lh: number }>;
}) {
  const data = rows.filter((row) => row.hours > 0 && row.liters > 0).slice(0, 10);
  return (
    <ChartCard
      title="L/h por equipamento"
      description="Eficiência operacional com base em CMB e PDE cruzadas."
      hasData={data.length > 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 18, bottom: 4 }}
        >
          <CartesianGrid stroke={CHART_GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: CHART_TEXT, fontSize: 11 }} />
          <YAxis
            dataKey="equipment"
            type="category"
            width={92}
            tick={{ fill: CHART_TEXT, fontSize: 11 }}
          />
          <Tooltip content={<GenericTooltip />} />
          <Bar dataKey="lh" name="L/h" fill={CHART_BLUE} radius={[0, 4, 4, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function Ranking({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: Array<Record<string, string | number>>;
  columns: { key: string; label: string; align?: "right" }[];
}) {
  return (
    <div className="rounded border border-border-low bg-surface-container p-4">
      <h3 className="text-[10px] font-black uppercase tracking-widest mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-low text-on-surface-variant">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-2 font-black ${col.align === "right" ? "text-right" : "text-left"}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-4 text-on-surface-variant" colSpan={columns.length}>
                  Sem dados
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-border-low/40">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-2 ${col.align === "right" ? "text-right" : "text-left"}`}
                    >
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalysesDialog({
  analyses,
  selectedIds,
  onSelect,
  onClose,
}: {
  analyses: DbProductionAnalysis[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [obra, setObra] = useState("");
  const [material, setMaterial] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const obras = uniq(analyses.map((a) => a.obra));
  const materials = uniq(analyses.map((a) => a.material));
  const filtered = analyses.filter((analysis) => {
    if (obra && analysis.obra !== obra) return false;
    if (material && analysis.material !== material) return false;
    if (dateFrom && analysis.dateEnd < dateFrom) return false;
    if (dateTo && analysis.dateStart > dateTo) return false;
    return true;
  });
  const toggle = (id: string) => {
    setDraftIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Minhas análises</DialogTitle>
          <DialogDescription>
            Selecione uma ou várias análises para histórico acumulado e comparativos.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select
            value={obra}
            onChange={(e) => setObra(e.target.value)}
            className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
          >
            <option value="">Todas as obras</option>
            {obras.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
          >
            <option value="">Todos materiais</option>
            {materials.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setDraftIds(filtered.map((analysis) => analysis.id))}
            disabled={filtered.length === 0}
          >
            Selecionar filtradas
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setDraftIds([])}
            disabled={draftIds.length === 0}
          >
            Limpar
          </Button>
          <span className="self-center text-xs text-on-surface-variant">
            {draftIds.length} selecionada(s)
          </span>
        </div>
        <div className="max-h-96 overflow-y-auto space-y-2">
          {filtered.map((analysis) => (
            <div
              key={analysis.id}
              className={`w-full rounded border p-3 text-left transition-colors ${
                draftIds.includes(analysis.id)
                  ? "border-primary bg-primary/10"
                  : "border-border-low hover:bg-surface-highest"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={draftIds.includes(analysis.id)}
                    onChange={() => toggle(analysis.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-black">{analysis.name}</span>
                    <span className="mt-1 block text-xs text-on-surface-variant">
                      {analysis.obra} · {analysis.material} · {fmtDate(analysis.dateStart)} a{" "}
                      {fmtDate(analysis.dateEnd)}
                    </span>
                  </span>
                </label>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                    {fmtDate(analysis.createdAt)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      onSelect([analysis.id]);
                      onClose();
                    }}
                  >
                    Abrir
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-on-surface-variant">
              Nenhuma análise encontrada.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border-low pt-3">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSelect(draftIds);
              onClose();
            }}
            disabled={draftIds.length === 0}
          >
            Aplicar acumulado
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProducaoConsumo() {
  const user = useAuthStore((s) => s.user);
  const canCreate = user?.role === "administrador" || user?.role === "gestor";

  const [analyses, setAnalyses] = useState<DbProductionAnalysis[]>([]);
  const [selectedAnalysisIds, setSelectedAnalysisIds] = useState<string[]>([]);
  const [tripRows, setTripRows] = useState<DbTrip[]>([]);
  const [fuelRows, setFuelRows] = useState<DbFueling[]>([]);
  const [dailyPartRows, setDailyPartRows] = useState<DbEquipmentDailyPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAnalyses, setShowAnalyses] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [obraFilter, setObraFilter] = useState("all");
  const [materialFilter, setMaterialFilter] = useState("all");
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [truckFilter, setTruckFilter] = useState("all");
  const [analysisType, setAnalysisType] = useState("all");
  const [search, setSearch] = useState("");
  const [tripPage, setTripPage] = useState(0);
  const [fuelPage, setFuelPage] = useState(0);
  const [bubbleMode, setBubbleMode] = useState<"obra" | "equipment" | "analysis" | "period">(
    "obra",
  );

  const selectedAnalyses = analyses.filter((analysis) => selectedAnalysisIds.includes(analysis.id));
  const selectedAnalysis = selectedAnalyses[0] ?? null;
  const selectedAnalysisLabel =
    selectedAnalyses.length > 1
      ? `${selectedAnalyses.length} análises acumuladas`
      : selectedAnalysis
        ? `${selectedAnalysis.name} · ${selectedAnalysis.obra}`
        : "Crie uma análise para começar";

  const loadAnalyses = useCallback(async (nextSelected?: string | string[]) => {
    const rows = (await listAnalyses({ data: {} })) as DbProductionAnalysis[];
    setAnalyses(rows);
    setSelectedAnalysisIds((current) => {
      if (Array.isArray(nextSelected))
        return nextSelected.filter((id) => rows.some((a) => a.id === id));
      if (nextSelected) return [nextSelected];
      const kept = current.filter((id) => rows.some((analysis) => analysis.id === id));
      return kept.length ? kept : rows[0]?.id ? [rows[0].id] : [];
    });
  }, []);

  const loadData = useCallback(async () => {
    if (selectedAnalysisIds.length === 0) {
      setTripRows([]);
      setFuelRows([]);
      setDailyPartRows([]);
      return;
    }
    setLoading(true);
    try {
      const [tripsResult, fuelResult, dailyPartResult] = await Promise.all([
        listTrips({ data: { analysisIds: selectedAnalysisIds } }),
        listFueling({ data: { analysisIds: selectedAnalysisIds } }),
        listDailyParts({ data: { analysisIds: selectedAnalysisIds } }),
      ]);
      setTripRows(tripsResult as DbTrip[]);
      setFuelRows(fuelResult as DbFueling[]);
      setDailyPartRows(dailyPartResult as DbEquipmentDailyPart[]);
      setTripPage(0);
      setFuelPage(0);
    } finally {
      setLoading(false);
    }
  }, [selectedAnalysisIds]);

  useEffect(() => {
    loadAnalyses();
  }, [loadAnalyses]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const distinctObras = useMemo(
    () => uniq([...tripRows.map((t) => t.obra), ...fuelRows.map((f) => f.obra)]),
    [fuelRows, tripRows],
  );
  const distinctMaterials = useMemo(() => uniq(tripRows.map((t) => t.material)), [tripRows]);
  const distinctEquipment = useMemo(
    () => uniq([...fuelRows.map(ownEquipmentKey), ...dailyPartRows.map((row) => row.fleet)]),
    [dailyPartRows, fuelRows],
  );
  const distinctTrucks = useMemo(() => uniq(tripRows.map(aggregateKey)), [tripRows]);

  const filteredTrips = useMemo(() => {
    return tripRows.filter((row) => {
      if (dateFrom && dateKey(row.datetime) < dateFrom) return false;
      if (dateTo && dateKey(row.datetime) > dateTo) return false;
      if (obraFilter !== "all" && row.obra !== obraFilter) return false;
      if (materialFilter !== "all" && row.material !== materialFilter) return false;
      if (truckFilter !== "all" && aggregateKey(row) !== truckFilter) return false;
      if (analysisType === "production-only" && row.cubicMLoose <= 0) return false;
      return true;
    });
  }, [analysisType, dateFrom, dateTo, materialFilter, obraFilter, tripRows, truckFilter]);

  const filteredFueling = useMemo(() => {
    return fuelRows.filter((row) => {
      if (dateFrom && dateKey(row.datetime) < dateFrom) return false;
      if (dateTo && dateKey(row.datetime) > dateTo) return false;
      if (obraFilter !== "all" && row.obra !== obraFilter) return false;
      if (equipmentFilter !== "all" && ownEquipmentKey(row) !== equipmentFilter) return false;
      if (analysisType === "consumption-only" && row.liters <= 0) return false;
      return true;
    });
  }, [analysisType, dateFrom, dateTo, equipmentFilter, fuelRows, obraFilter]);

  const kpis = useMemo(() => {
    const looseM3 = filteredTrips.reduce((sum, row) => sum + row.cubicMLoose, 0);
    const compactedM3 = filteredTrips.reduce((sum, row) => sum + compacted(row), 0);
    const liters = filteredFueling.reduce((sum, row) => sum + row.liters, 0);
    const fuelCost = filteredFueling.reduce((sum, row) => sum + row.total, 0);
    const revenue = filteredTrips.reduce((sum, row) => sum + row.total, 0);
    const aggregateCost = filteredTrips.length * AGGREGATE_TRIP_PRICE;
    return {
      looseM3,
      compactedM3,
      liters,
      fuelCost,
      costPerM3: safeDivide(fuelCost, compactedM3),
      trips: filteredTrips.length,
      aggregateCost,
      revenue,
      operationalMargin: revenue - fuelCost - aggregateCost,
      litersPerM3: safeDivide(liters, compactedM3),
      avgCostPerLiter: safeDivide(fuelCost, liters),
    };
  }, [filteredFueling, filteredTrips]);

  const daily = useMemo<DailyPoint[]>(() => {
    const map = new Map<string, DailyPoint>();
    filteredTrips.forEach((row) => {
      const date = dateKey(row.datetime);
      if (!date) return;
      const curr = map.get(date) ?? {
        date,
        label: shortDate(date),
        m3: 0,
        loose: 0,
        liters: 0,
        cost: 0,
        trips: 0,
        revenue: 0,
        margin: 0,
        litersPerM3: 0,
        costPerM3: 0,
      };
      curr.m3 += compacted(row);
      curr.loose += row.cubicMLoose;
      curr.trips++;
      curr.revenue += row.total;
      map.set(date, curr);
    });
    filteredFueling.forEach((row) => {
      const date = dateKey(row.datetime);
      if (!date) return;
      const curr = map.get(date) ?? {
        date,
        label: shortDate(date),
        m3: 0,
        loose: 0,
        liters: 0,
        cost: 0,
        trips: 0,
        revenue: 0,
        margin: 0,
        litersPerM3: 0,
        costPerM3: 0,
      };
      curr.liters += row.liters;
      curr.cost += row.total;
      map.set(date, curr);
    });
    return [...map.values()]
      .map((row) => ({
        ...row,
        margin: row.revenue - row.cost - row.trips * AGGREGATE_TRIP_PRICE,
        litersPerM3: safeDivide(row.liters, row.m3),
        costPerM3: safeDivide(row.cost, row.m3),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredFueling, filteredTrips]);

  const aggregateProduction = useMemo(() => {
    const map = new Map<
      string,
      {
        aggregate: string;
        trips: number;
        loose: number;
        m3: number;
        avg: number;
        tripPrice: number;
        totalPay: number;
        participation: number;
      }
    >();
    filteredTrips.forEach((row) => {
      const key = aggregateKey(row);
      const curr = map.get(key) ?? {
        aggregate: key,
        trips: 0,
        loose: 0,
        m3: 0,
        avg: 0,
        tripPrice: AGGREGATE_TRIP_PRICE,
        totalPay: 0,
        participation: 0,
      };
      curr.trips++;
      curr.loose += row.cubicMLoose;
      curr.m3 += compacted(row);
      curr.avg = curr.trips > 0 ? curr.m3 / curr.trips : 0;
      curr.totalPay = curr.trips * AGGREGATE_TRIP_PRICE;
      map.set(key, curr);
    });
    const rows = [...map.values()];
    const totalM3 = rows.reduce((sum, row) => sum + row.m3, 0);
    const totalTrips = rows.reduce((sum, row) => sum + row.trips, 0);
    return rows
      .map((row) => ({
        ...row,
        participation:
          totalM3 > 0
            ? (row.m3 / totalM3) * 100
            : totalTrips > 0
              ? (row.trips / totalTrips) * 100
              : 0,
      }))
      .sort((a, b) => b.trips - a.trips || b.m3 - a.m3);
  }, [filteredTrips]);

  const materialDistribution = useMemo(() => {
    const map = new Map<string, number>();
    filteredTrips.forEach((row) =>
      map.set(
        row.material || "Sem material",
        (map.get(row.material || "Sem material") ?? 0) + compacted(row),
      ),
    );
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTrips]);

  const obraCompare = useMemo(() => {
    const map = new Map<
      string,
      { obra: string; m3: number; liters: number; cost: number; revenue: number; costPerM3: number }
    >();
    filteredTrips.forEach((row) => {
      const key = row.obra || "Sem obra";
      const curr = map.get(key) ?? {
        obra: key,
        m3: 0,
        liters: 0,
        cost: 0,
        revenue: 0,
        costPerM3: 0,
      };
      curr.m3 += compacted(row);
      curr.revenue += row.total;
      map.set(key, curr);
    });
    filteredFueling.forEach((row) => {
      const key = row.obra || "Sem obra";
      const curr = map.get(key) ?? {
        obra: key,
        m3: 0,
        liters: 0,
        cost: 0,
        revenue: 0,
        costPerM3: 0,
      };
      curr.liters += row.liters;
      curr.cost += row.total;
      curr.costPerM3 = curr.m3 > 0 ? curr.cost / curr.m3 : 0;
      map.set(key, curr);
    });
    return [...map.values()].map((row) => ({
      ...row,
      costPerM3: row.m3 > 0 ? row.cost / row.m3 : 0,
    }));
  }, [filteredFueling, filteredTrips]);

  const filteredDailyParts = useMemo(() => {
    return dailyPartRows.filter((row) => {
      if (dateFrom && row.date < dateFrom) return false;
      if (dateTo && row.date > dateTo) return false;
      if (obraFilter !== "all" && row.obra && row.obra !== obraFilter) return false;
      if (equipmentFilter !== "all" && row.fleet !== normalizeFleet(equipmentFilter)) return false;
      return true;
    });
  }, [dailyPartRows, dateFrom, dateTo, equipmentFilter, obraFilter]);

  const equipmentConsumption = useMemo(() => {
    const map = new Map<
      string,
      {
        equipment: string;
        liters: number;
        cost: number;
        hours: number;
        statuses: Set<string>;
      }
    >();
    const ensure = (equipment: string) => {
      const key = equipment || "SEM_EQUIPAMENTO";
      const current = map.get(key) ?? {
        equipment: key,
        liters: 0,
        cost: 0,
        hours: 0,
        statuses: new Set<string>(),
      };
      map.set(key, current);
      return current;
    };
    filteredFueling.forEach((row) => {
      const item = ensure(ownEquipmentKey(row));
      item.liters += row.liters;
      item.cost += row.total;
    });
    filteredDailyParts.forEach((row) => {
      const item = ensure(row.fleet);
      item.hours += row.hours;
      if (row.status) item.statuses.add(row.status);
    });
    return [...map.values()]
      .map((row) => ({
        ...row,
        lh: row.hours > 0 ? row.liters / row.hours : 0,
        costH: row.hours > 0 ? row.cost / row.hours : 0,
        status:
          row.liters > 0 && row.hours <= 0
            ? "CMB sem PDE"
            : row.hours > 0 && row.liters <= 0
              ? "PDE sem CMB"
              : row.statuses.size
                ? [...row.statuses].join(", ")
                : "OK",
      }))
      .sort((a, b) => b.liters - a.liters);
  }, [filteredDailyParts, filteredFueling]);

  const operationalAnalytics = useMemo(
    () =>
      buildProductionAnalytics({
        analyses: selectedAnalyses,
        trips: filteredTrips,
        fueling: filteredFueling,
        dailyParts: filteredDailyParts,
      }),
    [filteredDailyParts, filteredFueling, filteredTrips, selectedAnalyses],
  );
  const operationalMetrics = operationalAnalytics.accumulatedMetrics;
  const bubbleData = operationalAnalytics.operationalBubbles[bubbleMode];

  const auditAlerts = useMemo(() => {
    const aggregateNoVolume = aggregateProduction
      .filter((row) => row.trips > 0 && row.loose <= 0 && row.m3 <= 0)
      .map((row) => `Agregado ${row.aggregate} sem produção/volume m³ identificado`);
    const cmbNoPde = equipmentConsumption
      .filter((row) => row.liters > 0 && row.hours <= 0)
      .map((row) => `CMB sem PDE para equipamento próprio ${row.equipment}`);
    const pdeNoCmb = equipmentConsumption
      .filter((row) => row.hours > 0 && row.liters <= 0)
      .map((row) => `PDE sem CMB para equipamento próprio ${row.equipment}`);
    return [
      ...cmbNoPde,
      ...pdeNoCmb,
      ...aggregateNoVolume,
      "Caminhões agregados do RCO não são comparados com PDE.",
    ];
  }, [aggregateProduction, equipmentConsumption]);

  const crossAudit = useMemo(() => {
    return {
      frotasCmb: uniq(filteredFueling.map(ownEquipmentKey)),
      frotasPde: uniq(
        filteredDailyParts
          .filter((row) => row.status !== "Sem horas na PDE")
          .map((row) => row.fleet),
      ),
      crossed: uniq(filteredDailyParts.filter((row) => row.usedInAnalysis).map((row) => row.fleet)),
      withFuelNoPde: uniq(
        filteredDailyParts
          .filter((row) => row.status === "Sem horas na PDE")
          .map((row) => row.fleet),
      ),
      withPdeNoFuel: uniq(
        filteredDailyParts
          .filter((row) => row.status === "Sem abastecimento")
          .map((row) => row.fleet),
      ),
      datesOk: uniq(filteredDailyParts.filter((row) => row.usedInAnalysis).map((row) => row.date)),
      missingDates: uniq(
        filteredDailyParts
          .filter((row) => row.status === "Sem horas na PDE")
          .map((row) => row.date),
      ),
    };
  }, [filteredDailyParts, filteredFueling]);

  const searchedTrips = filteredTrips.filter((row) =>
    [row.prefix, row.plate, row.obra, row.material, row.driver]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const searchedFueling = filteredFueling.filter((row) =>
    [row.prefix, row.plate, row.obra, row.vehicleType, row.operator]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const pagedTrips = searchedTrips.slice(tripPage * PAGE_SIZE, (tripPage + 1) * PAGE_SIZE);
  const pagedFueling = searchedFueling.slice(fuelPage * PAGE_SIZE, (fuelPage + 1) * PAGE_SIZE);

  async function handleCreated(analysisId: string) {
    setDateFrom("");
    setDateTo("");
    setObraFilter("all");
    setMaterialFilter("all");
    setEquipmentFilter("all");
    setTruckFilter("all");
    setAnalysisType("all");
    setSearch("");
    await loadAnalyses(analysisId);
    setSelectedAnalysisIds([analysisId]);
    setTab("overview");
  }

  function exportXlsx() {
    import("xlsx").then((XLSX) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([kpis]), "KPIs");
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([operationalAnalytics.accumulatedMetrics]),
        "Acumulado",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(operationalAnalytics.obraRanking),
        "Ranking obras",
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredTrips), "Viagens");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredFueling), "Abastecimentos");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredDailyParts), "PDE");
      const filename =
        selectedAnalyses.length > 1
          ? "acumulado-producao-consumo.xlsx"
          : `${selectedAnalysis?.name ?? "analise"}-producao-consumo.xlsx`;
      XLSX.writeFile(wb, filename);
    });
  }

  function exportPdf() {
    window.print();
  }

  const empty = analyses.length === 0;

  return (
    <AppLayout>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
            Análises operacionais
          </span>
          <h1 className="text-3xl font-black uppercase tracking-tighter">Produção × Consumo</h1>
          <p className="text-xs text-on-surface-variant mt-1">{selectedAnalysisLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setSelectedAnalysisIds(analyses.map((analysis) => analysis.id))}
            disabled={empty}
          >
            <Icon name="stacked_line_chart" className="text-base mr-1" />
            Acumulado geral
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setShowAnalyses(true)}
            disabled={empty}
          >
            <Icon name="folder_open" className="text-base mr-1" />
            Minhas análises
          </Button>
          {selectedAnalysis && (
            <>
              <Button variant="outline" size="sm" className="text-xs" onClick={exportPdf}>
                <Icon name="picture_as_pdf" className="text-base mr-1" />
                Exportar PDF
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={exportXlsx}>
                <Icon name="download" className="text-base mr-1" />
                Exportar relatório
              </Button>
            </>
          )}
          {canCreate && (
            <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}>
              <Icon name="add_chart" className="text-base mr-1" />
              Criar Análise
            </Button>
          )}
        </div>
      </div>

      {empty ? (
        <div className="rounded border border-border-low bg-surface-container p-10 text-center">
          <Icon name="analytics" className="text-5xl text-on-surface-variant/30" />
          <p className="mt-4 text-lg font-black">Nenhuma análise criada ainda</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Crie a primeira análise com planilhas RCO, CMB e PDE.
          </p>
          {canCreate && (
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              Criar Análise
            </Button>
          )}
        </div>
      ) : selectedAnalysis ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2 items-center">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            />
            <select
              value={obraFilter}
              onChange={(e) => setObraFilter(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            >
              <option value="all">Todas as obras</option>
              {distinctObras.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              value={materialFilter}
              onChange={(e) => setMaterialFilter(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            >
              <option value="all">Todos materiais</option>
              {distinctMaterials.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              value={equipmentFilter}
              onChange={(e) => setEquipmentFilter(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            >
              <option value="all">Todos equipamentos</option>
              {distinctEquipment.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              value={truckFilter}
              onChange={(e) => setTruckFilter(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            >
              <option value="all">Todos agregados</option>
              {distinctTrucks.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              value={analysisType}
              onChange={(e) => setAnalysisType(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            >
              <option value="all">Tipo: completa</option>
              <option value="production-only">Com produção</option>
              <option value="consumption-only">Com consumo</option>
            </select>
            {loading && (
              <span className="text-xs text-on-surface-variant animate-pulse">Carregando...</span>
            )}
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto border-b border-border-low">
            {[
              ["overview", "Visão geral"],
              ["daily", "Diário"],
              ["accumulated", "Acumulado"],
              ["efficiency", "Eficiência"],
              ["financial", "Financeiro"],
              ["comparison", "Comparativo"],
              ["history", "Histórico"],
              ["production", "Produção"],
              ["consumption", "Consumo"],
              ["equipment", "Equipamentos"],
              ["trucks", "Caminhões agregados"],
              ["audit", "Auditoria"],
              ["crossAudit", "Auditoria de Cruzamento"],
              ["data", "Dados importados"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id as TabId)}
                className={`px-3 py-2 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-2 ${
                  tab === id
                    ? "border-primary text-primary"
                    : "border-transparent text-on-surface-variant"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
            <DieselHoursProductionChart
              data={bubbleData}
              mode={bubbleMode}
              onMode={setBubbleMode}
            />
            <div className="space-y-4">
              <OperationalAlertCard alerts={operationalAnalytics.alerts} />
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label="Eficiência operacional"
                  value={`${formatNumber(operationalMetrics.efficiencyPercent, 0)}%`}
                  sub="Índice ponderando m³/h, L/m³ e L/h"
                  icon="query_stats"
                />
                <KpiCard
                  label="Índice produtividade obra"
                  value={`${formatNumber(operationalMetrics.productivityIndex, 0)}%`}
                  icon="speed"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <KpiCard
              label="Produção solta na caçamba"
              value={formatM3(kpis.looseM3)}
              icon="inventory_2"
            />
            <KpiCard
              label="Produção compactada"
              value={formatM3(kpis.compactedM3)}
              icon="compress"
            />
            <KpiCard
              label="Diesel consumido"
              value={formatLiters(kpis.liters)}
              icon="local_gas_station"
            />
            <KpiCard
              label="Custo total combustível"
              value={formatBRL(kpis.fuelCost)}
              icon="payments"
            />
            <KpiCard
              label="Combustível R$/m³ compactado"
              value={formatBRL(kpis.costPerM3)}
              icon="monitoring"
            />
            <KpiCard label="Viagens agregados" value={String(kpis.trips)} icon="local_shipping" />
            <KpiCard
              label="Custo com agregados"
              value={formatBRL(kpis.aggregateCost)}
              sub={`${kpis.trips} viagens × ${formatBRL(AGGREGATE_TRIP_PRICE)}`}
              icon="local_shipping"
            />
            <KpiCard
              label="Faturamento/Receita"
              value={formatBRL(kpis.revenue)}
              icon="trending_up"
            />
            <KpiCard
              label="Margem operacional"
              value={formatBRL(kpis.operationalMargin)}
              icon="account_balance"
            />
            <KpiCard
              label="Consumo operacional L/m³"
              value={formatNumber(kpis.litersPerM3, 2)}
              sub="Diesel dos equipamentos próprios ÷ volume compactado dos agregados"
              icon="speed"
            />
            <KpiCard
              label="Diesel por hora"
              value={`${formatNumber(operationalMetrics.fuelPerHour, 2)} L/h`}
              icon="local_gas_station"
            />
            <KpiCard
              label="m³ por hora"
              value={`${formatNumber(operationalMetrics.productionPerHour, 2)} m³/h`}
              icon="precision_manufacturing"
            />
            <KpiCard
              label="Viagens por hora"
              value={formatNumber(operationalMetrics.tripsPerHour, 2)}
              icon="route"
            />
            <KpiCard
              label="Custo operacional/h"
              value={formatBRL(operationalMetrics.operationalCostPerHour)}
              icon="payments"
            />
            <KpiCard
              label="Custo operacional/m³"
              value={formatBRL(operationalMetrics.operationalCostPerM3)}
              icon="monitoring"
            />
            <KpiCard
              label="Custo médio R$/L"
              value={formatBRL(kpis.avgCostPerLiter)}
              icon="local_atm"
            />
          </div>

          {tab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <ProductionConsumptionChart data={daily} />
              </div>
              <TopAggregatesChart rows={aggregateProduction} />
              <TopEquipmentChart rows={equipmentConsumption} />
              <FinancialChart kpis={kpis} />
              <AverageConsumptionChart data={daily} />
              <div className="lg:col-span-3">
                <ObraRankingTable rows={operationalAnalytics.obraRanking} />
              </div>
            </div>
          )}

          {tab === "daily" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ProductionConsumptionChart data={daily} />
              <DailyProductionChart data={daily} />
              <DailyFuelChart data={daily} />
              <AverageConsumptionChart data={daily} />
              <TopAggregatesChart rows={aggregateProduction} />
              <TopEquipmentChart rows={equipmentConsumption} />
            </div>
          )}

          {tab === "accumulated" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded border border-border-low bg-surface-container p-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest">
                  Painel acumulado
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <KpiCard
                    label="Análises"
                    value={String(operationalMetrics.analysisCount)}
                    icon="folder_open"
                  />
                  <KpiCard
                    label="Obras"
                    value={String(operationalMetrics.obraCount)}
                    icon="location_city"
                  />
                  <KpiCard
                    label="Materiais"
                    value={String(operationalMetrics.materialCount)}
                    icon="category"
                  />
                  <KpiCard
                    label="Custo operacional"
                    value={formatBRL(operationalMetrics.operationalCost)}
                    icon="payments"
                  />
                </div>
              </div>
              <FinancialChart kpis={kpis} />
              <div className="lg:col-span-2">
                <ProductionConsumptionChart data={daily} />
              </div>
              <div className="lg:col-span-2">
                <ObraRankingTable rows={operationalAnalytics.obraRanking} />
              </div>
            </div>
          )}

          {tab === "efficiency" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <EquipmentHoursChart rows={equipmentConsumption} />
              <EquipmentLhChart rows={equipmentConsumption} />
              <AverageConsumptionChart data={daily} />
              <TopAggregatesChart rows={aggregateProduction} />
              <div className="lg:col-span-2">
                <Ranking
                  title="Eficiência das máquinas próprias"
                  rows={operationalAnalytics.machineMetrics.map((row) => ({
                    equipamento: row.equipment,
                    horas: formatNumber(row.hours, 1),
                    litros: formatNumber(row.liters, 0),
                    lh: formatNumber(row.fuelPerHour, 2),
                    m3h: formatNumber(row.productionPerHour, 2),
                    viagensH: formatNumber(row.tripsPerHour, 2),
                    custoM3: formatBRL(row.costPerM3),
                    eficiencia: `${formatNumber(row.efficiencyPercent, 0)}%`,
                    status: row.status,
                  }))}
                  columns={[
                    { key: "equipamento", label: "Equipamento" },
                    { key: "horas", label: "Horas PDE", align: "right" },
                    { key: "litros", label: "Litros", align: "right" },
                    { key: "lh", label: "L/h", align: "right" },
                    { key: "m3h", label: "m³/h", align: "right" },
                    { key: "viagensH", label: "Viagens/h", align: "right" },
                    { key: "custoM3", label: "Custo/m³", align: "right" },
                    { key: "eficiencia", label: "Eficiência", align: "right" },
                    { key: "status", label: "Status" },
                  ]}
                />
              </div>
              <div className="lg:col-span-2">
                <Ranking
                  title="Produtividade dos agregados"
                  rows={operationalAnalytics.aggregateMetrics.map((row) => ({
                    agregado: row.aggregate,
                    viagens: row.trips,
                    manha: formatNumber(row.hoursMorning, 1),
                    tarde: formatNumber(row.hoursAfternoon, 1),
                    horas: formatNumber(row.hoursTotal, 1),
                    viagensH: formatNumber(row.tripsPerHour, 2),
                    m3H: formatNumber(row.m3PerHour, 2),
                    custoM3: formatBRL(row.aggregateCostPerM3),
                    participacao: `${formatNumber(row.participation, 1)}%`,
                  }))}
                  columns={[
                    { key: "agregado", label: "Agregado CB" },
                    { key: "viagens", label: "Viagens", align: "right" },
                    { key: "manha", label: "H manhã", align: "right" },
                    { key: "tarde", label: "H tarde", align: "right" },
                    { key: "horas", label: "H total", align: "right" },
                    { key: "viagensH", label: "Viagens/h", align: "right" },
                    { key: "m3H", label: "m³/h", align: "right" },
                    { key: "custoM3", label: "Custo/m³", align: "right" },
                    { key: "participacao", label: "%", align: "right" },
                  ]}
                />
              </div>
            </div>
          )}

          {tab === "financial" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <FinancialChart kpis={kpis} />
              <DailyFuelCostChart data={daily} />
              <div className="lg:col-span-2">
                <Ranking
                  title="Custo operacional por obra"
                  rows={operationalAnalytics.obraRanking.map((row) => ({
                    obra: row.obra,
                    diesel: formatBRL(row.fuelCost),
                    agregados: formatBRL(row.aggregateCost),
                    operacional: formatBRL(row.operationalCost),
                    margem: formatBRL(row.margin),
                    custoM3: formatBRL(row.operationalCostPerM3),
                    eficiencia: `${formatNumber(row.efficiencyPercent, 0)}%`,
                  }))}
                  columns={[
                    { key: "obra", label: "Obra" },
                    { key: "diesel", label: "Custo diesel", align: "right" },
                    { key: "agregados", label: "Custo agregados", align: "right" },
                    { key: "operacional", label: "Custo operacional", align: "right" },
                    { key: "margem", label: "Margem", align: "right" },
                    { key: "custoM3", label: "Custo/m³", align: "right" },
                    { key: "eficiencia", label: "Eficiência", align: "right" },
                  ]}
                />
              </div>
            </div>
          )}

          {tab === "comparison" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ObraComparisonChart rows={obraCompare} />
              <DistributionChart
                title="Produção por obra"
                data={operationalAnalytics.obraRanking.map((row) => ({
                  label: row.obra,
                  value: row.compactedM3,
                }))}
                description="m³ compactado por obra no filtro atual."
                color={CHART_YELLOW}
              />
              <div className="lg:col-span-2">
                <ObraRankingTable rows={operationalAnalytics.obraRanking} />
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-4">
              <AnalysisHistoryPanel
                analyses={analyses}
                selectedIds={selectedAnalysisIds}
                onSelect={setSelectedAnalysisIds}
              />
              <ProductionConsumptionChart data={daily} />
            </div>
          )}

          {tab === "production" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DailyProductionChart data={daily} />
              <TopAggregatesChart rows={aggregateProduction} />
              <DistributionChart
                title="Distribuição por material"
                data={materialDistribution}
                description="Volume compactado agrupado por material da RCO."
                color={CHART_GREEN}
              />
              <ObraComparisonChart rows={obraCompare} />
              <div className="lg:col-span-2">
                <Ranking
                  title="Produção por agregado"
                  rows={aggregateProduction.map((r) => ({
                    agregado: r.aggregate,
                    viagens: r.trips,
                    solto: formatNumber(r.loose, 1),
                    compactado: formatNumber(r.m3, 1),
                    valor: formatBRL(r.tripPrice),
                    total: formatBRL(r.totalPay),
                    participacao: `${formatNumber(r.participation, 1)}%`,
                  }))}
                  columns={[
                    { key: "agregado", label: "Agregado / Prefixo" },
                    { key: "viagens", label: "Viagens", align: "right" },
                    { key: "solto", label: "m³ solto", align: "right" },
                    { key: "compactado", label: "m³ comp.", align: "right" },
                    { key: "valor", label: "R$/viagem", align: "right" },
                    { key: "total", label: "Total a pagar", align: "right" },
                    { key: "participacao", label: "%", align: "right" },
                  ]}
                />
              </div>
              <div className="lg:col-span-2">
                <DataTable
                  title={`Viagens importadas · ${searchedTrips.length}`}
                  headers={[
                    "Data",
                    "Prefixo agregado",
                    "Obra",
                    "Material",
                    "m³ solto",
                    "m³ comp.",
                    "R$",
                  ]}
                  rows={pagedTrips.map((row) => [
                    fmtDate(row.datetime),
                    aggregateKey(row),
                    row.obra,
                    row.material,
                    formatNumber(row.cubicMLoose, 2),
                    formatNumber(compacted(row), 2),
                    fmtBRL(row.total),
                  ])}
                  page={tripPage}
                  total={searchedTrips.length}
                  onPage={setTripPage}
                />
              </div>
            </div>
          )}

          {tab === "consumption" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DailyFuelChart data={daily} />
              <AverageConsumptionChart data={daily} />
              <TopEquipmentChart rows={equipmentConsumption} />
              <DailyFuelCostChart data={daily} />
              <div className="lg:col-span-2">
                <DataTable
                  title={`Abastecimentos importados · ${searchedFueling.length}`}
                  headers={["Data", "Equipamento", "Obra", "Litros", "R$/L", "Total"]}
                  rows={pagedFueling.map((row) => [
                    fmtDate(row.datetime),
                    ownEquipmentKey(row),
                    row.obra,
                    formatNumber(row.liters, 0),
                    formatNumber(row.unitPrice, 2),
                    fmtBRL(row.total),
                  ])}
                  page={fuelPage}
                  total={searchedFueling.length}
                  onPage={setFuelPage}
                />
              </div>
            </div>
          )}

          {tab === "equipment" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <EquipmentHoursChart rows={equipmentConsumption} />
              <EquipmentLhChart rows={equipmentConsumption} />
              <div className="lg:col-span-2">
                <Ranking
                  title="Consumo por equipamento próprio"
                  rows={equipmentConsumption.map((r) => ({
                    equipamento: r.equipment,
                    litros: formatNumber(r.liters, 0),
                    custo: formatBRL(r.cost),
                    horas: formatNumber(r.hours, 1),
                    lh: formatNumber(r.lh, 2),
                    custoH: formatBRL(r.costH),
                    status: r.status,
                  }))}
                  columns={[
                    { key: "equipamento", label: "Frota equipamento" },
                    { key: "litros", label: "Litros", align: "right" },
                    { key: "custo", label: "Custo combustível", align: "right" },
                    { key: "horas", label: "Horas PDE", align: "right" },
                    { key: "lh", label: "L/h", align: "right" },
                    { key: "custoH", label: "R$/h", align: "right" },
                    { key: "status", label: "Status PDE" },
                  ]}
                />
              </div>
              <div className="lg:col-span-2">
                <Ranking
                  title="Pendências PDE"
                  rows={equipmentConsumption
                    .filter((row) => row.status !== "OK")
                    .map((row) => ({
                      equipamento: row.equipment,
                      status: row.status,
                      litros: formatLiters(row.liters),
                      horas: `${formatNumber(row.hours, 1)} h`,
                    }))}
                  columns={[
                    { key: "equipamento", label: "Equipamento" },
                    { key: "status", label: "Pendência" },
                    { key: "litros", label: "Litros", align: "right" },
                    { key: "horas", label: "Horas", align: "right" },
                  ]}
                />
              </div>
            </div>
          )}

          {tab === "trucks" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TopAggregatesChart rows={aggregateProduction} />
              <FinancialChart kpis={kpis} />
              <div className="lg:col-span-2">
                <Ranking
                  title="Produção por agregado"
                  rows={aggregateProduction.map((r) => ({
                    agregado: r.aggregate,
                    viagens: r.trips,
                    solto: formatNumber(r.loose, 1),
                    compactado: formatNumber(r.m3, 1),
                    valor: formatBRL(r.tripPrice),
                    total: formatBRL(r.totalPay),
                    participacao: `${formatNumber(r.participation, 1)}%`,
                  }))}
                  columns={[
                    { key: "agregado", label: "Agregado / Prefixo" },
                    { key: "viagens", label: "Viagens", align: "right" },
                    { key: "solto", label: "m³ solto", align: "right" },
                    { key: "compactado", label: "m³ comp.", align: "right" },
                    { key: "valor", label: "R$/viagem", align: "right" },
                    { key: "total", label: "Total a pagar", align: "right" },
                    { key: "participacao", label: "%", align: "right" },
                  ]}
                />
              </div>
            </div>
          )}

          {tab === "audit" && (
            <div className="rounded border border-border-low bg-surface-container p-5 text-sm space-y-3">
              <h3 className="font-black uppercase tracking-widest text-xs">Auditoria da análise</h3>
              <p>
                <strong>volume_compactado</strong> = volume_caçamba ÷ (1 + fator_empolamento)
              </p>
              <p>
                <strong>custo_combustivel</strong> = litros × preço médio diesel
              </p>
              <p>
                <strong>custo_agregado</strong> = viagens RCO × R$ {AGGREGATE_TRIP_PRICE.toFixed(2)}
              </p>
              <p>
                <strong>custo_por_m3</strong> = custo_combustivel ÷ volume_compactado
              </p>
              <p>
                <strong>faturamento</strong> = receita informada na RCO, quando existir
              </p>
              <p>
                <strong>margem_operacional</strong> = faturamento - custo_combustivel -
                custo_agregado
              </p>
              <div className="rounded border border-border-low bg-surface-highest p-3 text-xs">
                <p className="font-black uppercase tracking-widest text-on-surface-variant">
                  Alertas operacionais
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-on-surface-variant">
                  {auditAlerts.map((alert) => (
                    <li key={alert}>{alert}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded bg-surface-highest p-3 text-xs text-on-surface-variant">
                Escopo: {selectedAnalysisLabel}
                {selectedAnalyses.length === 1 && selectedAnalysis
                  ? ` · Fator aplicado na importação: ${selectedAnalysis.swellFactor.toFixed(2)} · ID: ${selectedAnalysis.id}`
                  : ` · ${selectedAnalyses.length} análises selecionadas`}
              </div>
            </div>
          )}

          {tab === "crossAudit" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label="Frotas encontradas na CMB"
                  value={String(crossAudit.frotasCmb.length)}
                  icon="local_gas_station"
                />
                <KpiCard
                  label="Frotas encontradas na PDE"
                  value={String(crossAudit.frotasPde.length)}
                  icon="assignment"
                />
                <KpiCard
                  label="Frotas cruzadas com sucesso"
                  value={String(crossAudit.crossed.length)}
                  icon="check_circle"
                />
                <KpiCard
                  label="Datas faltantes"
                  value={String(crossAudit.missingDates.length)}
                  icon="event_busy"
                />
              </div>
              <div className="rounded border border-border-low bg-surface-container p-4 text-xs text-on-surface-variant">
                <p>
                  Frotas com abastecimento e sem Parte Diária:{" "}
                  {crossAudit.withFuelNoPde.join(", ") || "Nenhuma"}
                </p>
                <p className="mt-1">
                  Frotas com Parte Diária e sem abastecimento:{" "}
                  {crossAudit.withPdeNoFuel.join(", ") || "Nenhuma"}
                </p>
                <p className="mt-1">
                  Datas cruzadas com sucesso: {crossAudit.datesOk.join(", ") || "Nenhuma"}
                </p>
                <p className="mt-1">
                  Datas faltantes: {crossAudit.missingDates.join(", ") || "Nenhuma"}
                </p>
              </div>
              <DataTable
                title={`Auditoria de cruzamento · ${filteredDailyParts.length}`}
                headers={[
                  "Frota equipamento",
                  "Data",
                  "Litros CMB",
                  "Horas PDE",
                  "Obra PDE",
                  "Status",
                ]}
                rows={filteredDailyParts.map((row) => {
                  const liters = filteredFueling
                    .filter(
                      (fuel) =>
                        ownEquipmentKey(fuel) === row.fleet && dateKey(fuel.datetime) === row.date,
                    )
                    .reduce((sum, fuel) => sum + fuel.liters, 0);
                  return [
                    row.fleet,
                    fmtDate(row.date),
                    liters.toFixed(0),
                    row.hours.toFixed(1),
                    row.obra || "—",
                    row.status,
                  ];
                })}
                page={0}
                total={filteredDailyParts.length}
                onPage={() => undefined}
              />
            </div>
          )}

          {tab === "data" && (
            <div className="space-y-4">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setTripPage(0);
                  setFuelPage(0);
                }}
                placeholder="Buscar por agregado, equipamento, obra, material..."
                className="w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-sm"
              />
              <DataTable
                title={`Viagens importadas · ${searchedTrips.length}`}
                headers={[
                  "Data",
                  "Prefixo agregado",
                  "Obra",
                  "Material",
                  "m³ solto",
                  "m³ comp.",
                  "R$",
                ]}
                rows={pagedTrips.map((row) => [
                  fmtDate(row.datetime),
                  aggregateKey(row),
                  row.obra,
                  row.material,
                  row.cubicMLoose.toFixed(2),
                  compacted(row).toFixed(2),
                  fmtBRL(row.total),
                ])}
                page={tripPage}
                total={searchedTrips.length}
                onPage={setTripPage}
              />
              <DataTable
                title={`Abastecimentos importados · ${searchedFueling.length}`}
                headers={["Data", "Equipamento", "Obra", "Litros", "R$/L", "Total"]}
                rows={pagedFueling.map((row) => [
                  fmtDate(row.datetime),
                  ownEquipmentKey(row),
                  row.obra,
                  row.liters.toFixed(0),
                  row.unitPrice.toFixed(2),
                  fmtBRL(row.total),
                ])}
                page={fuelPage}
                total={searchedFueling.length}
                onPage={setFuelPage}
              />
            </div>
          )}
        </>
      ) : null}

      {showCreate && (
        <Suspense fallback={null}>
          <CarcaraImportDialog
            onClose={() => setShowCreate(false)}
            onSuccess={handleCreated}
            userName={user?.name ?? ""}
          />
        </Suspense>
      )}

      {showAnalyses && (
        <AnalysesDialog
          analyses={analyses}
          selectedIds={selectedAnalysisIds}
          onClose={() => setShowAnalyses(false)}
          onSelect={(ids) => {
            setSelectedAnalysisIds(ids);
            setTab("overview");
          }}
        />
      )}
    </AppLayout>
  );
}

function DataTable({
  title,
  headers,
  rows,
  page,
  total,
  onPage,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="rounded border border-border-low bg-surface-container overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border-low p-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest">{title}</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
            className="text-xs"
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages - 1}
            onClick={() => onPage(page + 1)}
            className="text-xs"
          >
            Próxima
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-low bg-surface-low text-on-surface-variant">
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-3 py-2 text-left font-black uppercase tracking-widest"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-3 py-8 text-center text-on-surface-variant"
                >
                  Sem registros
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-border-low/40">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 whitespace-nowrap">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
