/**
 * Dashboard Produção × Consumo (VIZ-1)
 * Template app_transjap aplicado — paleta OKLCH + 8 gráficos do template
 * em 8 abas dedicadas.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import {
  deleteAnalysis,
  listAnalyses,
  listDailyParts,
  listFueling,
  listTrips,
} from "@/lib/api/production-consumption";
import { listFuelAttributionFn, recalculateFuelFn } from "@/lib/api/fuel-attribution";
import {
  listFuelAllocationsSupportFn,
  recalculateFuelAllocationsSupportFn,
  type FuelAllocationSupportRow,
} from "@/lib/api/fuel-allocation-support";

import { ChartCard } from "@/components/charts/ChartCard";
import {
  ChartAggregateRanking,
  ChartBars,
  ChartCompareBars,
  ChartDonut,
  ChartHBars,
  ChartHistogram,
  ChartHourlyProduction,
  ChartLine,
  ChartLineLpm3,
  ChartLineRef,
  ChartLphRanking,
  ChartM3Diesel,
  ChartM3PerLiterRanking,
  ChartMultiLine,
  ChartProductivity,
  ChartProducaoEmpoladaDiesel,
  ChartProdConsumo,
  ChartProdStack,
  ChartStackedBars,
  ChartVolumeLinePorObra,
  type AggregateRankingPoint,
  type StackedBarSeries,
} from "@/components/charts/Charts";
import { EmptyChartState } from "@/components/charts/ProductionConsumptionCharts";
import { LegendDot } from "@/components/charts/LegendDot";
import { CHART_SERIES_COLORS } from "@/lib/chart-theme";
import { normalizeFleet } from "@/lib/carcara-parser";
import {
  displayEquipmentLabel,
  equipmentMatches,
  isAggregateEquipment,
  normalizeEquipmentKey,
  sortEquipmentLabels,
  type EquipmentContext,
  type EquipmentKind,
} from "@/lib/equipment-normalization";
import {
  OPERATIONAL_ITEM_ORDER,
  operationalItemLabel,
  operationalItemRank,
  resolveEquipmentOperationalClass,
  type OperationalItem,
} from "@/lib/production-consumption-items";

import {
  DashboardFilters,
  DashboardTabs,
  KpiCardCompact,
} from "@/components/charts/DashboardFilters";
import { AnalysesDialog, AnalysisHistoryPanel } from "@/components/charts/AnalysisSelector";
import {
  useDashboardFilters,
  useAnalysisSelection,
  useFilteredData,
  useDashboardTabs,
  useAnalysesModal,
  usePagination,
} from "@/hooks/useProductionConsumption";
import {
  calculateDailyMetrics,
  calculateCompactedVolume,
  calculateOperationalKPIs,
  calculateAggregateMetrics,
  calculateEquipmentMetrics,
  calculateObraDistribution,
  detectOperationalAlerts,
} from "@/lib/production-consumption-calculations";
import { AGGREGATE_TRIP_PRICE } from "@/lib/production-analytics";
import {
  formatDate,
  formatBRL,
  formatHours,
  formatM3,
  formatLiters,
  formatNumber,
  displayObraName,
  extractDateKey,
  normalizeObraName,
  normalizeObraKey,
  obraMatches,
  uniqueNormalizedObras,
  uniqueValues,
} from "@/lib/production-consumption-utils";
import {
  buildWorksiteTimeSummaries,
  buildWorksiteTimeSummary,
  parseRcoOperationalDateTime,
  type ShiftProductionSummary,
} from "@/lib/production-time-analysis";
import type {
  DbProductionAnalysis,
  DbTrip,
  DbFueling,
  DbEquipmentDailyPart,
  DbFuelAttribution,
} from "@/db/schema";

const CarcaraImportDialog = lazy(() =>
  import("@/components/CarcaraImportDialog").then((m) => ({ default: m.CarcaraImportDialog })),
);

export const Route = createFileRoute("/producao-consumo")({
  component: ProducaoConsumo,
});

function ProducaoConsumo() {
  return <ProducaoConsumoRefactored />;
}

const PAGE_SIZE = 12;
const COMPARISON_TOP_PER_OBRA = 5;

type ComparisonSeries = {
  obra: string;
  obraKey: string;
  key: string;
  color: string;
  compactedKey: string;
  looseKey: string;
  dieselKey: string;
  fuelPerM3Key: string;
};

type EquipmentOperationalShare = {
  date: string;
  item: OperationalItem;
  equipmentKey: string;
  equipmentLabel: string;
  equipmentHours: number;
  itemTotalHours: number;
  share: number;
  compactedM3Day: number;
  relatedM3: number;
  diesel: number;
  m3PerLiter: number;
  m3PerHour: number;
};

function equipmentRaw(row: {
  prefix?: string | null;
  vehicleId?: string | null;
  plate?: string | null;
}) {
  return row.prefix || row.vehicleId || row.plate || "";
}

function equipmentLabel(
  row: {
    prefix?: string | null;
    vehicleId?: string | null;
    plate?: string | null;
  },
  context?: EquipmentContext,
) {
  return displayEquipmentLabel(equipmentRaw(row), context);
}

function normalizedFleetNumber(value: string | null | undefined) {
  const fleet = normalizeFleet(value);
  return /^[0-9]+$/.test(fleet) ? fleet : "";
}

function hasRealPdeEvidence(
  part: Pick<
    DbEquipmentDailyPart,
    "fleet" | "fleetLabel" | "hours" | "horimInicial" | "horimFinal" | "sourceSheet"
  >,
) {
  const text = `${part.fleet} ${part.fleetLabel}`.toUpperCase();
  if (/\bC\s*B\b|\bCB\b/.test(text)) return false;
  return Boolean(
    part.sourceSheet?.trim() ||
      (part.hours || 0) > 0 ||
      (part.horimInicial || 0) > 0 ||
      (part.horimFinal || 0) > 0,
  );
}

function buildPdeFleetKeys(dailyParts: DbEquipmentDailyPart[]) {
  return new Set(
    dailyParts
      .filter(hasRealPdeEvidence)
      .map((part) => normalizedFleetNumber(part.fleet || part.fleetLabel))
      .filter(Boolean)
      .map((fleet) => `FROTA:${fleet}`),
  );
}

function equipmentKeyByPdeRule(
  value: string | null | undefined,
  pdeFleetKeys: ReadonlySet<string>,
  fallbackContext?: EquipmentContext,
) {
  const text = String(value ?? "").toUpperCase();
  const fleet = normalizedFleetNumber(value);
  if (fleet) {
    if (/\bC\s*B\b|\bCB\b/.test(text)) return `CB:${fleet}`;
    const ownKey = `FROTA:${fleet}`;
    return pdeFleetKeys.has(ownKey) ? ownKey : `CB:${fleet}`;
  }
  return normalizeEquipmentKey(value, fallbackContext) || "";
}

function equipmentLabelFromKey(key: string, fallback = "") {
  if (key.startsWith("CB:")) return `CB ${key.slice(3)}`;
  if (key.startsWith("FROTA:")) return `FROTA ${key.slice(6)}`;
  return fallback || key || "SEM EQUIPAMENTO";
}

function fuelingEquipmentContext(
  row: {
    analysisId?: string | null;
    vehicleType?: string | null;
    owner?: string | null;
    operator?: string | null;
  },
): EquipmentContext {
  if (row.analysisId === "allocated") return "fuelAllocation";
  if (row.analysisId === "attributed") return "fuelAttribution";
  return {
    source: "fueling",
    description: [row.vehicleType, row.owner, row.operator].filter(Boolean).join(" "),
  };
}

function isRcoProductiveTrip(row: DbTrip) {
  return (
    row.operation
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase() === "DESCARGA"
  );
}

function formatHourlyM3(value: number) {
  return `${formatNumber(value, 2)} m³`;
}

function withObraLabel(label: string, obra: string) {
  return `${label} · ${obra}`;
}

function scopeRowsToSelectedObras<T extends { obra: string }>(
  rows: T[],
  selectedObraLabels: ReadonlyMap<string, string>,
) {
  const singleSelectedObra =
    selectedObraLabels.size === 1 ? selectedObraLabels.values().next().value : undefined;
  return rows.flatMap((row) => {
    const obra =
      selectedObraLabels.get(normalizeObraKey(row.obra)) ||
      (!row.obra.trim() ? singleSelectedObra : undefined);
    return obra ? [{ ...row, obra }] : [];
  });
}

function topPerObra<T extends { obra: string }>(
  rows: T[],
  metric: (row: T) => number,
  limit = COMPARISON_TOP_PER_OBRA,
) {
  const grouped = new Map<string, T[]>();
  rows.forEach((row) => {
    const current = grouped.get(row.obra) ?? [];
    current.push(row);
    grouped.set(row.obra, current);
  });

  return Array.from(grouped.values()).flatMap((group) =>
    [...group].sort((a, b) => metric(b) - metric(a)).slice(0, limit),
  );
}

type ItemEquipmentMetric = {
  equipment: string;
  label: string;
  item: OperationalItem;
  kind: EquipmentKind;
  sources: Set<AuditSource>;
  dieselSources: Set<AuditSource>;
  m3Sources: Set<AuditSource>;
  auditReasons: Set<string>;
  classificationReason: string;
  includedInEquipmentCount: boolean;
  equipmentCountReason: string;
  duplicateAcrossItems: boolean;
  relatedCompactedM3: number;
  m3FromTrips: number;
  m3AllocatedByHours: number;
  productionShares: EquipmentOperationalShare[];
  m3AllocationRule: string;
  m3TotalHours: number;
  m3EquipmentHours: number;
  m3Share: number;
  hours: number;
  liters: number;
  cost: number;
  m3: number;
  trips: number;
  fuelPerHour: number;
  fuelPerM3: number;
  fuelPerTrip: number;
  productionPerHour: number;
};

type ItemSummary = {
  item: OperationalItem;
  label: string;
  compactedM3: number;
  looseM3: number;
  diesel: number;
  cost: number;
  hours: number;
  trips: number;
  revenue: number;
  fuelPerM3: number;
  fuelPerHour: number;
  fuelPerTrip: number;
  costPerM3: number;
  margin: number;
  baseCompactedM3: number;
  equipment: ItemEquipmentMetric[];
  daily: Array<{
    date: string;
    d: string;
    m3: number;
    looseM3: number;
    diesel: number;
    cost: number;
    hours: number;
    trips: number;
    baseM3: number;
    lPorM3: number;
    m3PorH: number;
  }>;
};

type AuditSource = "dailyPart" | "fueling" | "fuelAllocation" | "fuelAttribution" | "trip" | "catalog";

type TechnicalAuditRow = {
  item: OperationalItem;
  itemLabel: string;
  equipmentKey: string;
  equipmentLabel: string;
  kind: EquipmentKind;
  source: string;
  hours: number;
  diesel: number;
  m3: number;
  m3Relacionado: number;
  trips: number;
  m3PerLiter: number;
  litersPerHour: number;
  dieselSource: string;
  m3Source: string;
  includedInEquipmentCount: boolean;
  status: string;
  reason: string;
  classificationReason: string;
  duplicateAcrossItems: boolean;
  m3FromTrips: number;
  m3AllocatedByHours: number;
  m3AllocationRule: string;
  totalHours: number;
  equipmentHours: number;
  share: number;
};

type DieselFlowAuditRow = {
  equipmentKey: string;
  equipmentLabel: string;
  fuelingLiters: number;
  allocatedLiters: number;
  attributedLiters: number;
  itemSummaryLiters: number;
  stackedChartLiters: number;
  diffFuelingToAllocation: number;
  diffAllocationToDashboard: number;
  auditTypes: string;
};

function shortDateLabel(date: string) {
  return date && date.length >= 10 ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : date;
}

function emptyItemSummary(item: OperationalItem): ItemSummary {
  return {
    item,
    label: operationalItemLabel(item),
    compactedM3: 0,
    looseM3: 0,
    diesel: 0,
    cost: 0,
    hours: 0,
    trips: 0,
    revenue: 0,
    fuelPerM3: 0,
    fuelPerHour: 0,
    fuelPerTrip: 0,
    costPerM3: 0,
    margin: 0,
    baseCompactedM3: 0,
    equipment: [],
    daily: [],
  };
}

function divide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function buildEquipmentOperationalShare({
  dailyParts,
  compactedM3ByDate,
}: {
  dailyParts: DbEquipmentDailyPart[];
  compactedM3ByDate: ReadonlyMap<string, number>;
}): EquipmentOperationalShare[] {
  const itemTotalHoursByDate = new Map<string, number>();
  dailyParts.forEach((part) => {
    if (!part.usedInAnalysis || part.hours <= 0) return;
    const operationalClass = resolveEquipmentOperationalClass({
      fleet: part.fleet,
      equipment: part.fleetLabel || part.fleet,
      description: `${part.sourceSheet} ${part.status}`,
    });
    const key = `${part.date}|${operationalClass.item}`;
    itemTotalHoursByDate.set(key, (itemTotalHoursByDate.get(key) ?? 0) + part.hours);
  });

  const sharesByEquipmentDay = new Map<string, EquipmentOperationalShare>();
  dailyParts.forEach((part) => {
    if (!part.usedInAnalysis || part.hours <= 0) return;
    const operationalClass = resolveEquipmentOperationalClass({
      fleet: part.fleet,
      equipment: part.fleetLabel || part.fleet,
      description: `${part.sourceSheet} ${part.status}`,
    });
    const item = operationalClass.item;
    const itemTotalHours = itemTotalHoursByDate.get(`${part.date}|${item}`) ?? 0;
    const compactedM3Day = compactedM3ByDate.get(part.date) ?? 0;
    if (itemTotalHours <= 0 || compactedM3Day <= 0) return;

    const equipmentKey = normalizeEquipmentKey(part.fleet || part.fleetLabel, "dailyPart");
    const share = part.hours / itemTotalHours;
    const relatedM3 = compactedM3Day * share;
    const key = `${part.date}|${item}|${equipmentKey || part.fleet || part.fleetLabel || "SEM_EQUIPAMENTO"}`;
    const current =
      sharesByEquipmentDay.get(key) ??
      ({
        date: part.date,
        item,
        equipmentKey: equipmentKey || part.fleet || part.fleetLabel || "SEM_EQUIPAMENTO",
        equipmentLabel: displayEquipmentLabel(part.fleet || part.fleetLabel, "dailyPart"),
        equipmentHours: part.hours,
        itemTotalHours,
        share,
        compactedM3Day,
        relatedM3,
        diesel: 0,
        m3PerLiter: 0,
        m3PerHour: 0,
      } satisfies EquipmentOperationalShare);
    current.equipmentHours += part.hours;
    current.share += share;
    current.relatedM3 += relatedM3;
    current.m3PerHour = divide(current.relatedM3, current.equipmentHours);
    sharesByEquipmentDay.set(key, current);
  });
  return [...sharesByEquipmentDay.values()];
}

function validEquipmentLabel(label: string) {
  const trimmed = label.trim();
  return Boolean(trimmed && trimmed !== "SEM EQUIPAMENTO");
}

function activityReason(row: Pick<ItemEquipmentMetric, "hours" | "liters" | "m3" | "trips">) {
  const reasons: string[] = [];
  if (row.hours > 0) reasons.push("horas > 0");
  if (row.liters > 0) reasons.push("diesel > 0");
  if (row.m3 > 0) reasons.push("m3 > 0");
  if (row.trips > 0) reasons.push("viagens > 0");
  return reasons.join(", ");
}

function equipmentCountReason(row: ItemEquipmentMetric) {
  if (row.item === "outros") return "fora dos itens operacionais contaveis";
  if (!validEquipmentLabel(row.label)) return "label vazio ou SEM EQUIPAMENTO";
  if (row.duplicateAcrossItems) return "duplicado em outro item operacional";
  if (row.item !== "transporte" && row.liters <= 0) {
    return "sem diesel alocado; aparece na auditoria, mas nao entra no KPI";
  }
  const activity = activityReason(row);
  if (!activity) return "sem horas, diesel, m3 ou viagens";
  return `atividade real: ${activity}; ${row.classificationReason}`;
}

function isCountableEquipment(row: ItemEquipmentMetric) {
  return (
    row.item !== "outros" &&
    validEquipmentLabel(row.label) &&
    !row.duplicateAcrossItems &&
    (row.item === "transporte" || row.liters > 0) &&
    Boolean(activityReason(row))
  );
}

type ItemStackView = {
  data: Array<Record<string, unknown>>;
  series: StackedBarSeries[];
};

const EMPTY_ITEM_STACK: ItemStackView = { data: [], series: [] };

function fixedNumber(value: number, decimals = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : 0;
}

function itemDailyChartRows(summary: ItemSummary) {
  return summary.daily.map((day) => ({
    ...day,
    diesel: fixedNumber(day.diesel, 2),
    m3: fixedNumber(day.baseM3, 2),
    lPorM3: fixedNumber(day.lPorM3, 3),
    m3PorH: fixedNumber(day.m3PorH, 2),
  }));
}

function itemEquipmentChartRows(summary: ItemSummary) {
  return summary.equipment
    .filter((row) => row.liters > 0 || row.hours > 0 || row.m3 > 0 || row.trips > 0)
    .map((row) => {
      const shareDays = row.productionShares.filter((share) => share.itemTotalHours > 0);
      const averageShare = divide(
        shareDays.reduce((sum, share) => sum + share.share, 0),
        shareDays.length,
      );
      return {
        id: row.label,
        equipamento: row.label,
        litros: fixedNumber(row.liters, 2),
        horas: fixedNumber(row.hours, 2),
        lph: fixedNumber(row.fuelPerHour, 2),
        lpm3: fixedNumber(row.fuelPerM3, 3),
        m3: fixedNumber(row.m3, 2),
        share: fixedNumber(averageShare, 4),
        dias: shareDays.length,
        viagens: fixedNumber(row.trips, 0),
        lViagem: fixedNumber(row.fuelPerTrip, 2),
        m3PorH: fixedNumber(row.productionPerHour, 2),
      };
    });
}

function histogramRows(values: number[], unit: string) {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0);
  if (clean.length === 0) return [];
  const max = Math.max(...clean);
  const bins = Math.min(5, Math.max(3, Math.ceil(Math.sqrt(clean.length))));
  const step = max / bins || 1;

  return Array.from({ length: bins }, (_, index) => {
    const from = index * step;
    const to = index === bins - 1 ? max : (index + 1) * step;
    const count = clean.filter((value) =>
      index === bins - 1 ? value >= from && value <= to : value >= from && value < to,
    ).length;
    return {
      range: `${formatNumber(from, 1)}-${formatNumber(to, 1)} ${unit}`,
      count,
    };
  });
}

function sumByKey<T>(
  rows: T[],
  keyOf: (row: T) => string,
  valueOf: (row: T) => number,
) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyOf(row);
    if (!key) return;
    totals.set(key, (totals.get(key) ?? 0) + valueOf(row));
  });
  return [...totals.entries()]
    .map(([key, value]) => ({ key, value: fixedNumber(value, 2) }))
    .sort((a, b) => b.value - a.value);
}

function ItemKpiGrid({ summary, mode }: { summary: ItemSummary; mode: OperationalItem }) {
  const equipmentCount = summary.equipment.filter(isCountableEquipment).length;

  if (mode === "transporte") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCardCompact label="Viagens" value={formatNumber(summary.trips, 0)} icon="local_shipping" />
        <KpiCardCompact label="m3 compactado base" value={formatM3(summary.baseCompactedM3)} icon="compress" />
        <KpiCardCompact label="Diesel dos agregados" value={formatLiters(summary.diesel)} icon="local_gas_station" />
        <KpiCardCompact label="Custo logistico" value={formatBRL(summary.cost)} icon="payments" />
        <KpiCardCompact label="m3/L" value={formatNumber(summary.fuelPerM3, 3)} icon="speed" />
        <KpiCardCompact label="L/viagem" value={formatNumber(summary.fuelPerTrip, 2)} icon="route" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <KpiCardCompact label="Diesel" value={formatLiters(summary.diesel)} icon="local_gas_station" />
      <KpiCardCompact label="Horas trabalhadas" value={formatHours(summary.hours)} icon="schedule" />
      <KpiCardCompact label="L/h" value={formatNumber(summary.fuelPerHour, 2)} icon="speed" />
      <KpiCardCompact label="m3/L" value={formatNumber(summary.fuelPerM3, 3)} icon="query_stats" />
      <KpiCardCompact label="m3 compactado base" value={formatM3(summary.baseCompactedM3)} icon="compress" />
      <KpiCardCompact label="Equipamentos" value={String(equipmentCount)} icon="precision_manufacturing" />
    </div>
  );
}

function ItemEquipmentTable({
  rows,
  mode,
}: {
  rows: ReturnType<typeof itemEquipmentChartRows>;
  mode: OperationalItem;
}) {
  if (rows.length === 0) return null;

  const headings =
    mode === "transporte"
      ? ["Equipamento", "Viagens", "m3 relacionado", "Diesel", "L/viagem", "m3/L"]
      : ["Equipamento", "Horas", "Diesel", "L/h", "m3 relacionado", "m3/L"];

  return (
    <div className="rounded border border-border-low bg-surface-container p-4">
      <h3 className="text-xs font-black uppercase tracking-widest mb-3">
        Ranking operacional por equipamento
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-low text-on-surface-variant">
              {headings.map((heading) => (
                <th key={heading} className="py-2 pr-4 text-left font-black uppercase">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((row) => (
              <tr key={row.id} className="border-b border-border-low/40">
                <td className="py-2 pr-4 font-semibold">{row.equipamento}</td>
                {mode === "transporte" ? (
                  <>
                    <td className="py-2 pr-4 tnum">{formatNumber(row.viagens, 0)}</td>
                    <td className="py-2 pr-4 tnum">{formatM3(row.m3)}</td>
                    <td className="py-2 pr-4 tnum">{formatLiters(row.litros)}</td>
                    <td className="py-2 pr-4 tnum">{formatNumber(row.lViagem, 2)}</td>
                    <td className="py-2 pr-4 tnum">{formatNumber(row.lpm3, 3)}</td>
                  </>
                ) : (
                  <>
                    <td className="py-2 pr-4 tnum">{formatHours(row.horas)}</td>
                    <td className="py-2 pr-4 tnum">{formatLiters(row.litros)}</td>
                    <td className="py-2 pr-4 tnum">{formatNumber(row.lph, 2)}</td>
                    <td className="py-2 pr-4 tnum">{formatM3(row.m3)}</td>
                    <td className="py-2 pr-4 tnum">{formatNumber(row.lpm3, 3)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OperationalItemPanel({
  summary,
  stack,
}: {
  summary: ItemSummary;
  stack: ItemStackView;
}) {
  const dailyRows = itemDailyChartRows(summary);
  const equipmentRows = itemEquipmentChartRows(summary);
  const histogramMetric =
    summary.item === "transporte"
      ? equipmentRows.map((row) => row.lViagem)
      : equipmentRows.map((row) => row.lph);
  const histogramUnit = summary.item === "transporte" ? "L/viagem" : "L/h";
  const lpm3Target = summary.fuelPerM3 > 0 ? summary.fuelPerM3 : 16.7;

  return (
    <div className="space-y-4">
      <ItemKpiGrid summary={summary} mode={summary.item} />

      {summary.item === "escavacao" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Escavacao - eficiencia diaria"
              description="m3 compactado total do dia dividido pelo diesel do item"
              height={320}
              hasData={dailyRows.length > 0}
            >
              <ChartLineLpm3 data={dailyRows} />
            </ChartCard>
            <ChartCard
              title="Escavacao - m3 base x diesel"
              description="m3 compactado total do dia e diesel alocado do item"
              height={320}
              hasData={dailyRows.length > 0}
            >
              <ChartM3Diesel data={dailyRows} />
            </ChartCard>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Ranking de escavacao"
              description="Litros por frota/equipamento"
              height={340}
              hasData={equipmentRows.length > 0}
            >
              <ChartHBars data={equipmentRows} dataKey="litros" nameKey="id" unit="L" topN={10} />
            </ChartCard>
            <ChartCard
              title="Ranking de produtividade m3/L"
              description="m3 relacionado por horas/dia dividido pelo diesel do equipamento"
              height={340}
              hasData={equipmentRows.some((row) => row.lpm3 > 0)}
            >
              <ChartM3PerLiterRanking data={equipmentRows} topN={10} />
            </ChartCard>
          </div>
        </>
      )}

      {summary.item === "transporte" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Transporte - m3 base x diesel"
              description="m3 compactado total do dia e diesel dos caminhoes/agregados"
              height={330}
              hasData={dailyRows.length > 0}
            >
              <ChartM3Diesel data={dailyRows} />
            </ChartCard>
            <ChartCard
              title="Ranking por agregado"
              description="Viagens por caminhao/agregado"
              height={330}
              hasData={equipmentRows.length > 0}
            >
              <ChartHBars
                data={equipmentRows}
                dataKey="viagens"
                nameKey="id"
                unit=""
                topN={10}
                color="oklch(0.74 0.13 220)"
              />
            </ChartCard>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Distribuicao L/viagem"
              description="Faixas de consumo logistico"
              height={320}
              hasData={histogramMetric.length > 0}
            >
              <ChartHistogram data={histogramRows(histogramMetric, histogramUnit)} />
            </ChartCard>
            <ChartCard
              title="Ranking de produtividade m3/L"
              description="m3 produtivo do agregado dividido pelo diesel bruto"
              height={320}
              hasData={equipmentRows.some((row) => row.lpm3 > 0)}
            >
              <ChartM3PerLiterRanking data={equipmentRows} topN={8} />
            </ChartCard>
          </div>
        </>
      )}

      {summary.item === "tratamento" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Tratamento - eficiencia diaria"
              description="m3 compactado total do dia dividido pelo diesel do item"
              height={320}
              hasData={dailyRows.length > 0}
            >
              <ChartLineLpm3 data={dailyRows} />
            </ChartCard>
            <ChartCard
              title="Tratamento - diesel empilhado"
              description="Barras empilhadas por equipamento"
              height={320}
              hasData={stack.data.length > 0 && stack.series.length > 0}
            >
              <ChartStackedBars data={stack.data} series={stack.series} />
            </ChartCard>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Ranking de tratamento"
              description="Litros por frota/equipamento"
              height={340}
              hasData={equipmentRows.length > 0}
            >
              <ChartHBars data={equipmentRows} dataKey="litros" nameKey="id" unit="L" topN={10} />
            </ChartCard>
            <ChartCard
              title="Ranking de produtividade m3/L"
              description="m3 relacionado por horas/dia dividido pelo diesel do equipamento"
              height={340}
              hasData={equipmentRows.some((row) => row.lpm3 > 0)}
            >
              <ChartM3PerLiterRanking data={equipmentRows} topN={10} />
            </ChartCard>
          </div>
        </>
      )}

      {summary.item === "compactacao" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Compactacao - produtividade"
              description="m3 por hora dos rolos/compactadores"
              height={320}
              hasData={dailyRows.length > 0}
            >
              <ChartProductivity data={dailyRows} />
            </ChartCard>
            <ChartCard
              title="Compactacao - m3/L com referencia"
              description="Produtividade por litro comparada com referencia do periodo"
              height={320}
              hasData={dailyRows.length > 0}
            >
              <ChartLineRef
                data={dailyRows}
                dataKey="lPorM3"
                refValue={lpm3Target}
                refLabel="Ref."
                unit="m3/L"
              />
            </ChartCard>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Produtividade por equipamento"
              description="m3/h por rolo ou compactador"
              height={330}
              hasData={equipmentRows.some((row) => row.m3PorH > 0)}
            >
              <ChartCompareBars
                data={equipmentRows.filter((row) => row.m3PorH > 0).slice(0, 8)}
                dataKey="m3PorH"
                nameKey="id"
                unit="m3/h"
              />
            </ChartCard>
            <ChartCard
              title="Ranking L/h por equipamento"
              description="Maior L/h primeiro; vermelho indica alto consumo"
              height={330}
              hasData={equipmentRows.some((row) => row.lph > 0)}
            >
              <ChartLphRanking data={equipmentRows} topN={10} />
            </ChartCard>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {summary.item === "transporte" ? (
          <ChartCard
            title={`Distribuicao ${histogramUnit}`}
            description="Faixas por equipamento"
            height={300}
            hasData={histogramMetric.length > 0}
          >
            <ChartHistogram data={histogramRows(histogramMetric, histogramUnit)} />
          </ChartCard>
        ) : (
          <ChartCard
            title="Ranking L/h por equipamento"
            description="Maior L/h primeiro; metas em 7,5 e 15 L/h"
            height={300}
            hasData={equipmentRows.some((row) => row.lph > 0)}
            footer={
              <div className="flex flex-wrap items-center justify-center gap-4 border-t border-border-low pt-3 text-[11px]">
                <LegendDot color="var(--ok)" label="0-7,5 L/h - Eficiente" />
                <LegendDot color="var(--warn)" label="7,5-15 L/h - Medio" />
                <LegendDot color="var(--danger)" label="> 15 L/h - Alto consumo" />
              </div>
            }
          >
            <ChartLphRanking data={equipmentRows} topN={10} />
          </ChartCard>
        )}
        <ChartCard
          title="Ranking de produtividade m3/L"
          description="Maior m3/L usando m3 relacionado por horas/dia"
          height={300}
          hasData={equipmentRows.some((row) => row.lpm3 > 0)}
        >
          <ChartM3PerLiterRanking data={equipmentRows} topN={8} />
        </ChartCard>
      </div>

      <ItemEquipmentTable rows={equipmentRows} mode={summary.item} />
    </div>
  );
}

function ShiftProductionCard({ shift }: { shift: ShiftProductionSummary }) {
  const noTrips = shift.trips === 0;
  return (
    <div className="rounded border border-border-low bg-surface-low p-3">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">
        {shift.label}
      </h4>
      {noTrips ? (
        <p className="mt-3 text-xs text-on-surface-variant">Sem viagens registradas no turno.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <span className="text-on-surface-variant">Primeira viagem</span>
            <span className="text-right tnum font-semibold">{shift.firstTrip}</span>
            <span className="text-on-surface-variant">Última viagem</span>
            <span className="text-right tnum font-semibold">{shift.lastTrip}</span>
            <span className="text-on-surface-variant">Horas produtivas</span>
            <span className="text-right tnum font-semibold">
              {formatHours(shift.productiveHours)}
            </span>
            <span className="text-on-surface-variant">Viagens</span>
            <span className="text-right tnum font-semibold">{shift.trips}</span>
            <span className="text-on-surface-variant">Produção</span>
            <span className="text-right tnum font-semibold">{formatHourlyM3(shift.m3)}</span>
            <span className="text-on-surface-variant">Produção/hora</span>
            <span className="text-right tnum font-semibold">
              {shift.productiveHours > 0
                ? `${formatNumber(shift.productionPerHour, 2)} m³/h`
                : "Dados insuficientes"}
            </span>
          </div>
          {shift.hasSingleTrip && (
            <p className="mt-3 text-[11px] text-status-warning">
              Turno com apenas uma viagem registrada.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const productionQueryKeys = {
  all: ["production-consumption"] as const,
  analyses: () => [...productionQueryKeys.all, "analyses"] as const,
  dashboardRoot: () => [...productionQueryKeys.all, "dashboard"] as const,
  dashboard: (analysisIdsKey: string) =>
    [...productionQueryKeys.all, "dashboard", analysisIdsKey] as const,
};

type DashboardRows = {
  analysisIds: string[];
  analysisIdsKey: string;
  trips: DbTrip[];
  fueling: DbFueling[];
  dailyParts: DbEquipmentDailyPart[];
  fuelAllocations: FuelAllocationSupportRow[];
  fuelAttributions: DbFuelAttribution[];
};

type DashboardLoadingState = {
  isCreatingAnalysis: boolean;
  isHydratingAnalysis: boolean;
  isReloadingDashboard: boolean;
};

const DASHBOARD_LOADING_IDLE: DashboardLoadingState = {
  isCreatingAnalysis: false,
  isHydratingAnalysis: false,
  isReloadingDashboard: false,
};
const EMPTY_TRIP_ROWS: DbTrip[] = [];
const EMPTY_FUEL_ROWS: DbFueling[] = [];
const EMPTY_DAILY_PART_ROWS: DbEquipmentDailyPart[] = [];
const EMPTY_FUEL_ALLOCATION_ROWS: FuelAllocationSupportRow[] = [];
const EMPTY_FUEL_ATTR_ROWS: DbFuelAttribution[] = [];

function normalizeAnalysisIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean))).sort();
}

function analysisIdsKey(ids: string[]) {
  return normalizeAnalysisIds(ids).join("|");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Requisicao cancelada", "AbortError");
  }
}

function sourceBelongsToAnalyses(sourceFuelingId: string | null, ids: Set<string>) {
  if (!sourceFuelingId) return false;
  for (const id of ids) {
    if (sourceFuelingId === id || sourceFuelingId.startsWith(`${id}:`)) return true;
  }
  return false;
}

async function fetchAnalyses(signal?: AbortSignal) {
  throwIfAborted(signal);
  const rows = (await listAnalyses({ data: {} })) as DbProductionAnalysis[];
  throwIfAborted(signal);
  return rows;
}

async function fetchDashboardRows(ids: string[], signal?: AbortSignal): Promise<DashboardRows> {
  const normalizedIds = normalizeAnalysisIds(ids);
  const key = analysisIdsKey(normalizedIds);
  const allowedIds = new Set(normalizedIds);

  if (normalizedIds.length === 0) {
    return {
      analysisIds: [],
      analysisIdsKey: "",
      trips: [],
      fueling: [],
      dailyParts: [],
      fuelAllocations: [],
      fuelAttributions: [],
    };
  }

  throwIfAborted(signal);
  const [tripsResult, fuelResult, dailyPartResult, allocationResult, attrResult] =
    await Promise.all([
      listTrips({ data: { analysisIds: normalizedIds } }),
      listFueling({ data: { analysisIds: normalizedIds } }),
      listDailyParts({ data: { analysisIds: normalizedIds } }),
      listFuelAllocationsSupportFn({ data: { analysisIds: normalizedIds } }).catch(
        () => [] as FuelAllocationSupportRow[],
      ),
      listFuelAttributionFn({ data: { analysisIds: normalizedIds } }).catch(
        () => [] as DbFuelAttribution[],
      ),
    ]);
  throwIfAborted(signal);

  return {
    analysisIds: normalizedIds,
    analysisIdsKey: key,
    trips: (tripsResult as DbTrip[]).filter((row) => allowedIds.has(row.analysisId)),
    fueling: (fuelResult as DbFueling[]).filter((row) => allowedIds.has(row.analysisId)),
    dailyParts: (dailyPartResult as DbEquipmentDailyPart[]).filter((row) =>
      allowedIds.has(row.analysisId),
    ),
    fuelAllocations: (allocationResult as FuelAllocationSupportRow[]).filter((row) =>
      sourceBelongsToAnalyses(row.sourceFuelingId, allowedIds),
    ),
    fuelAttributions: (attrResult as DbFuelAttribution[]).filter((row) =>
      sourceBelongsToAnalyses(row.sourceFuelingId, allowedIds),
    ),
  };
}

const TAB_IDS_VISIBLE = [
  "overview",
  "escavacao",
  "transporte",
  "tratamento",
  "compactacao",
  "hours",
] as const;

const ITEM_DASHBOARD_TABS = [
  { id: "overview", label: "Visão Geral" },
  { id: "escavacao", label: "Escavação" },
  { id: "transporte", label: "Transporte" },
  { id: "tratamento", label: "Tratamento" },
  { id: "compactacao", label: "Compactação" },
  { id: "hours", label: "Produção por Hora" },
];

function ProducaoConsumoRefactored() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canCreate = Boolean(user);
  const isAdmin = Boolean(user);

  const [dashboardLoading, setDashboardLoading] =
    useState<DashboardLoadingState>(DASHBOARD_LOADING_IDLE);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showTechnicalAudit, setShowTechnicalAudit] = useState(false);
  const [productionDate, setProductionDate] = useState("");
  const [hoursObraFilter, setHoursObraFilter] = useState<string>("all");

  const analysesQuery = useQuery({
    queryKey: productionQueryKeys.analyses(),
    queryFn: ({ signal }) => fetchAnalyses(signal),
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });
  const analyses = analysesQuery.data ?? [];
  const analysisSelection = useAnalysisSelection(analyses);
  const selectedIdsKey = useMemo(
    () => analysisIdsKey(analysisSelection.selectedIds),
    [analysisSelection.selectedIds],
  );
  const selectedAnalysisIds = useMemo(
    () => normalizeAnalysisIds(analysisSelection.selectedIds),
    [analysisSelection.selectedIds],
  );
  const { filters, updateFilters, clearFilters } = useDashboardFilters();
  const { activeTab, setActiveTab } = useDashboardTabs();
  const analysesModal = useAnalysesModal();

  const dashboardQuery = useQuery({
    queryKey: productionQueryKeys.dashboard(selectedIdsKey),
    queryFn: ({ signal }) => fetchDashboardRows(selectedAnalysisIds, signal),
    enabled: selectedAnalysisIds.length > 0,
    staleTime: 5_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const dashboardRows =
    dashboardQuery.data?.analysisIdsKey === selectedIdsKey && selectedIdsKey.length > 0
      ? dashboardQuery.data
      : null;
  const dashboardDataMatchesSelection = Boolean(dashboardRows);
  const tripRows = dashboardRows?.trips ?? EMPTY_TRIP_ROWS;
  const fuelRows = dashboardRows?.fueling ?? EMPTY_FUEL_ROWS;
  const dailyPartRows = dashboardRows?.dailyParts ?? EMPTY_DAILY_PART_ROWS;
  const fuelAllocationRows = dashboardRows?.fuelAllocations ?? EMPTY_FUEL_ALLOCATION_ROWS;
  const fuelAttrRows = dashboardRows?.fuelAttributions ?? EMPTY_FUEL_ATTR_ROWS;
  const isDashboardHydrating =
    dashboardLoading.isHydratingAnalysis ||
    dashboardLoading.isReloadingDashboard ||
    (selectedAnalysisIds.length > 0 && !dashboardDataMatchesSelection);
  const loading =
    analysesQuery.isFetching ||
    dashboardQuery.isFetching ||
    dashboardLoading.isCreatingAnalysis ||
    dashboardLoading.isHydratingAnalysis ||
    dashboardLoading.isReloadingDashboard;

  const selectedObras = useMemo(
    () =>
      uniqueNormalizedObras(analysisSelection.selectedAnalyses.map((analysis) => analysis.obra)),
    [analysisSelection.selectedAnalyses],
  );
  const selectedObraLabels = useMemo(
    () => new Map(selectedObras.map((obra) => [normalizeObraKey(obra), obra])),
    [selectedObras],
  );
  const obraScopedTripRows = useMemo(
    () => scopeRowsToSelectedObras(tripRows, selectedObraLabels),
    [selectedObraLabels, tripRows],
  );
  const obraScopedFuelRows = useMemo(
    () => scopeRowsToSelectedObras(fuelRows, selectedObraLabels),
    [fuelRows, selectedObraLabels],
  );
  const obraScopedDailyPartRows = useMemo(
    () => scopeRowsToSelectedObras(dailyPartRows, selectedObraLabels),
    [dailyPartRows, selectedObraLabels],
  );
  const obraScopedFuelAllocationRows = useMemo(
    () => scopeRowsToSelectedObras(fuelAllocationRows, selectedObraLabels),
    [fuelAllocationRows, selectedObraLabels],
  );
  const obraScopedFuelAttrRows = useMemo(
    () => scopeRowsToSelectedObras(fuelAttrRows, selectedObraLabels),
    [fuelAttrRows, selectedObraLabels],
  );

  const {
    page: tripPage,
    nextPage: tripNextPage,
    prevPage: tripPrevPage,
  } = usePagination(obraScopedTripRows.length, PAGE_SIZE);

  const visibleTabs = useMemo(() => ITEM_DASHBOARD_TABS, []);

  useEffect(() => {
    if (!TAB_IDS_VISIBLE.includes(activeTab as (typeof TAB_IDS_VISIBLE)[number])) {
      setActiveTab("overview");
    }
  }, [activeTab, setActiveTab]);

  const { filteredTrips, filteredFueling, filteredDailyParts } = useFilteredData(
    obraScopedTripRows,
    obraScopedFuelRows,
    obraScopedDailyPartRows,
    filters,
  );
  const productiveTrips = useMemo(
    () => filteredTrips.filter((trip) => isRcoProductiveTrip(trip)),
    [filteredTrips],
  );

  const visibleObras = useMemo(
    () =>
      filters.obra === "all"
        ? selectedObras
        : selectedObras.filter((obra) => obraMatches(obra, filters.obra)),
    [filters.obra, selectedObras],
  );
  const compareByObra = filters.obra === "all" && visibleObras.length > 1;
  const comparisonSeries = useMemo<ComparisonSeries[]>(
    () =>
      compareByObra
        ? visibleObras.map((obra, index) => ({
            obra,
            obraKey: normalizeObraKey(obra),
            key: `obra${index}`,
            color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
            compactedKey: `obra${index}CompactedM3`,
            looseKey: `obra${index}LooseM3`,
            dieselKey: `obra${index}Diesel`,
            fuelPerM3Key: `obra${index}FuelPerM3`,
          }))
        : [],
    [compareByObra, visibleObras],
  );
  const distinctMaterials = useMemo(
    () => uniqueValues(productiveTrips.map((t) => t.material)),
    [productiveTrips],
  );
  const distinctEquipment = useMemo(
    () => {
      const labels = new Map<string, string>();
      const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
      filteredFueling.forEach((fuel) => {
        const context = fuelingEquipmentContext(fuel);
        const key = equipmentKeyByPdeRule(equipmentRaw(fuel), pdeFleetKeys, context);
        if (key && key.startsWith("FROTA:")) labels.set(key, equipmentLabelFromKey(key));
      });
      filteredDailyParts.forEach((part) => {
        if (!hasRealPdeEvidence(part)) return;
        const key = equipmentKeyByPdeRule(part.fleet || part.fleetLabel, pdeFleetKeys, "dailyPart");
        if (key && key.startsWith("FROTA:")) {
          labels.set(key, equipmentLabelFromKey(key));
        }
      });
      return sortEquipmentLabels([...labels.values()]);
    },
    [filteredDailyParts, filteredFueling, productiveTrips],
  );
  const distinctAggregates = useMemo(
    () => {
      const labels = new Map<string, string>();
      const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
      productiveTrips.forEach((trip) => {
        const key = normalizeEquipmentKey(equipmentRaw(trip), "aggregate");
        if (key && isAggregateEquipment(key)) labels.set(key, equipmentLabelFromKey(key));
      });
      filteredFueling.forEach((fuel) => {
        const key = equipmentKeyByPdeRule(
          equipmentRaw(fuel),
          pdeFleetKeys,
          fuelingEquipmentContext(fuel),
        );
        if (key && key.startsWith("CB:")) labels.set(key, equipmentLabelFromKey(key));
      });
      return sortEquipmentLabels([...labels.values()]);
    },
    [filteredDailyParts, filteredFueling, productiveTrips],
  );

  const filteredFuelAllocations = useMemo(() => {
    return obraScopedFuelAllocationRows.filter((row) => {
      if (filters.dateFrom && row.pdeDate < filters.dateFrom) return false;
      if (filters.dateTo && row.pdeDate > filters.dateTo) return false;
      if (filters.obra !== "all" && !obraMatches(row.obra, filters.obra)) return false;
      if (
        filters.equipment !== "all" &&
        !equipmentMatches(row.fleet, filters.equipment, "fuelAllocation") &&
        !equipmentMatches(row.equipmentId, filters.equipment, "fuelAllocation")
      ) {
        return false;
      }
      if (filters.analysisType === "consumption-only" && row.litersAllocated <= 0) return false;
      return true;
    });
  }, [
    filters.analysisType,
    filters.dateFrom,
    filters.dateTo,
    filters.equipment,
    filters.obra,
    obraScopedFuelAllocationRows,
  ]);

  const filteredAttributions = useMemo(() => {
    return obraScopedFuelAttrRows.filter((row) => {
      if (filters.dateFrom && row.date < filters.dateFrom) return false;
      if (filters.dateTo && row.date > filters.dateTo) return false;
      if (filters.obra !== "all" && !obraMatches(row.obra, filters.obra)) return false;
      if (
        filters.equipment !== "all" &&
        !equipmentMatches(row.fleet, filters.equipment, "fuelAttribution") &&
        !equipmentMatches(row.fleetLabel, filters.equipment, "fuelAttribution")
      ) {
        return false;
      }
      if (filters.analysisType === "consumption-only" && row.litersAttributed <= 0) return false;
      return true;
    });
  }, [
    filters.analysisType,
    filters.dateFrom,
    filters.dateTo,
    filters.equipment,
    filters.obra,
    obraScopedFuelAttrRows,
  ]);

  const hasOfficialFuelAllocations = fuelAllocationRows.length > 0;
  const hasLegacyFuelAttributions = fuelAttrRows.length > 0;
  const dieselSource = hasOfficialFuelAllocations
    ? "fuel_allocations"
    : hasLegacyFuelAttributions
      ? "fuel_attribution"
      : "fueling";
  const dieselSourceNotice =
    dieselSource === "fuel_attribution"
      ? "Rateio oficial por horimetro indisponivel nesta selecao; usando fuel_attribution como fallback."
      : dieselSource === "fueling"
        ? "Sem rateio em cache nesta selecao; indicadores de diesel usam CMB bruto."
        : "";

  const attributedFueling = useMemo<DbFueling[]>(() => {
    if (hasOfficialFuelAllocations) {
      const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
      const aggregateKeys = new Set(
        productiveTrips
          .map((trip) => normalizeEquipmentKey(equipmentRaw(trip), "aggregate"))
          .filter((key) => isAggregateEquipment(key)),
      );
      const allocatedFueling = filteredFuelAllocations.map((a) => ({
        id: a.id,
        analysisId: "allocated",
        datetime: `${a.pdeDate}T12:00:00.000Z`,
        owner: "",
        plate: "",
        vehicleId: "",
        prefix: a.fleet,
        vehicleType: "",
        kmPrevious: a.hourmeterStart,
        kmCurrent: a.hourmeterEnd,
        liters: a.litersAllocated || 0,
        unitPrice: 0,
        total: a.costAllocated || 0,
        consumption: 0,
        standardConsumption: 0,
        operator: "",
        obra: a.obra || "",
        status: null,
        importBatchId: a.sourceFuelingId,
        importedAt: a.createdAt ?? "",
      }));
      const aggregateRawFueling = filteredFueling.filter((fuel) => {
        const aggregateCandidateKey = equipmentKeyByPdeRule(
          equipmentRaw(fuel),
          pdeFleetKeys,
          fuelingEquipmentContext(fuel),
        );
        return (
          aggregateKeys.has(aggregateCandidateKey) ||
          aggregateCandidateKey.startsWith("CB:")
        );
      });
      return [...allocatedFueling, ...aggregateRawFueling];
    }
    if (!hasLegacyFuelAttributions) return filteredFueling;
    return filteredAttributions.map((a) => ({
      id: a.id,
      analysisId: "attributed",
      datetime: `${a.date}T12:00:00.000Z`,
      owner: "",
      plate: "",
      vehicleId: "",
      prefix: a.fleetLabel || a.fleet,
      vehicleType: "",
      kmPrevious: 0,
      kmCurrent: 0,
      liters: a.litersAttributed || 0,
      unitPrice: 0,
      total: a.costAttributed || 0,
      consumption: 0,
      standardConsumption: 0,
      operator: "",
      obra: a.obra || "",
      status: null,
      importBatchId: a.sourceFuelingId ?? "",
      importedAt: a.calculatedAt,
    }));
  }, [
    filteredAttributions,
    filteredFuelAllocations,
    filteredFueling,
    filteredDailyParts,
    hasLegacyFuelAttributions,
    hasOfficialFuelAllocations,
    productiveTrips,
  ]);

  const dailyMetricsMap = useMemo(
    () => calculateDailyMetrics(productiveTrips, attributedFueling),
    [attributedFueling, productiveTrips],
  );
  const dailyData = useMemo(
    () => Array.from(dailyMetricsMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    [dailyMetricsMap],
  );

  const kpis = useMemo(
    () => calculateOperationalKPIs(productiveTrips, attributedFueling, filteredDailyParts),
    [attributedFueling, filteredDailyParts, productiveTrips],
  );

  const hourlyAnalysisTrips = useMemo(() => {
    const allowedIds = new Set(selectedAnalysisIds);
    return tripRows.filter((trip) => allowedIds.has(trip.analysisId));
  }, [selectedAnalysisIds, tripRows]);

  const hourlyTripsWithActiveFilters = useMemo(
    () =>
      hourlyAnalysisTrips.filter((trip) => {
        const date = parseRcoOperationalDateTime(trip.datetime)?.date ?? "";
        if (filters.dateFrom && date < filters.dateFrom) return false;
        if (filters.dateTo && date > filters.dateTo) return false;
        if (!isRcoProductiveTrip(trip)) return false;
        if (filters.material !== "all" && trip.material !== filters.material) return false;
        if (
          filters.aggregate !== "all" &&
          !equipmentMatches(equipmentRaw(trip), filters.aggregate, "trip")
        ) {
          return false;
        }
        return true;
      }),
    [filters.aggregate, filters.dateFrom, filters.dateTo, filters.material, hourlyAnalysisTrips],
  );

  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      activeTab !== "hours" ||
      hourlyTripsWithActiveFilters.length === 0
    ) {
      return;
    }
    console.table(
      uniqueValues(hourlyTripsWithActiveFilters.map((trip) => trip.obra)).map((obra) => ({
        obraOriginal: obra,
        obraNormalizada: normalizeObraName(obra),
      })),
    );
  }, [activeTab, hourlyTripsWithActiveFilters]);

  const productionDateOptions = useMemo(
    () =>
      uniqueValues(
        hourlyTripsWithActiveFilters.map(
          (trip) => parseRcoOperationalDateTime(trip.datetime)?.date ?? "",
        ),
      )
        .filter(Boolean)
        .sort((left, right) => right.localeCompare(left)),
    [hourlyTripsWithActiveFilters],
  );

  useEffect(() => {
    setProductionDate((current) =>
      current && productionDateOptions.includes(current)
        ? current
        : (productionDateOptions[0] ?? ""),
    );
  }, [productionDateOptions]);

  const hoursObrasAvailable = useMemo(() => {
    if (!productionDate) return [];
    const obras = new Map<string, string>();
    hourlyTripsWithActiveFilters
      .filter((trip) => parseRcoOperationalDateTime(trip.datetime)?.date === productionDate)
      .forEach((trip) => {
        const label = displayObraName(trip.obra);
        const key = normalizeObraName(label);
        if (!obras.has(key)) obras.set(key, label);
      });
    return Array.from(obras.values()).sort((left, right) => left.localeCompare(right, "pt-BR"));
  }, [hourlyTripsWithActiveFilters, productionDate]);

  useEffect(() => {
    if (hoursObraFilter === "all") return;
    if (
      !hoursObrasAvailable.some(
        (obra) => normalizeObraName(obra) === normalizeObraName(hoursObraFilter),
      )
    ) {
      setHoursObraFilter("all");
    }
  }, [hoursObraFilter, hoursObrasAvailable]);

  const hoursFilteredTrips = useMemo(
    () =>
      hourlyAnalysisTrips.filter((trip) => {
        const date = parseRcoOperationalDateTime(trip.datetime)?.date ?? "";
        if (date !== productionDate) return false;
        if (
          hoursObraFilter !== "all" &&
          normalizeObraName(trip.obra) !== normalizeObraName(hoursObraFilter)
        ) {
          return false;
        }
        if (!isRcoProductiveTrip(trip)) return false;
        if (filters.material !== "all" && trip.material !== filters.material) return false;
        if (
          filters.aggregate !== "all" &&
          !equipmentMatches(equipmentRaw(trip), filters.aggregate, "trip")
        ) {
          return false;
        }
        if (filters.dateFrom && date < filters.dateFrom) return false;
        if (filters.dateTo && date > filters.dateTo) return false;
        return true;
      }),
    [
      filters.aggregate,
      filters.dateFrom,
      filters.dateTo,
      filters.material,
      hourlyAnalysisTrips,
      hoursObraFilter,
      productionDate,
    ],
  );

  const timeSummaries = useMemo(
    () => (productionDate ? buildWorksiteTimeSummaries(hoursFilteredTrips, productionDate) : []),
    [hoursFilteredTrips, productionDate],
  );
  const totalTimeSummary = useMemo(
    () =>
      productionDate
        ? buildWorksiteTimeSummary(hoursFilteredTrips, productionDate, "Total filtrado", {
            debug: activeTab === "hours",
          })
        : null,
    [activeTab, hoursFilteredTrips, productionDate],
  );
  const dailyDieselByObra = useMemo(() => {
    const liters = new Map<string, number>();
    if (filters.material !== "all" || filters.aggregate !== "all") return liters;
    attributedFueling
      .filter((fuel) => extractDateKey(fuel.datetime) === productionDate)
      .forEach((fuel) => {
        const key = normalizeObraName(fuel.obra);
        liters.set(key, (liters.get(key) ?? 0) + (fuel.liters || 0));
      });
    return liters;
  }, [attributedFueling, filters.aggregate, filters.material, productionDate]);
  const hourlyProductionSeries = useMemo(
    () =>
      timeSummaries.map((summary, index) => ({
        obra: summary.obra,
        dataKey: `obra${index}M3`,
        color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
      })),
    [timeSummaries],
  );
  const hourlyProductionData = useMemo(() => {
    if (!totalTimeSummary) return [];
    return totalTimeSummary.hourly.map((hour) => {
      const row: Record<string, unknown> = {
        d: `${String(hour.hour).padStart(2, "0")}h`,
        m3: hour.m3,
        trips: hour.trips,
      };
      timeSummaries.forEach((summary, index) => {
        row[`obra${index}M3`] = summary.hourly.find((item) => item.hour === hour.hour)?.m3 ?? 0;
      });
      return row;
    });
  }, [timeSummaries, totalTimeSummary]);

  const aggregateMetrics = useMemo(
    () => calculateAggregateMetrics(productiveTrips, kpis.compactedM3),
    [productiveTrips, kpis.compactedM3],
  );

  const equipmentMetrics = useMemo(
    () => calculateEquipmentMetrics(attributedFueling, filteredDailyParts),
    [filteredDailyParts, attributedFueling],
  );

  const itemSummaries = useMemo(() => {
    const summaries = new Map<OperationalItem, ItemSummary>(
      OPERATIONAL_ITEM_ORDER.map((item) => [item, emptyItemSummary(item)]),
    );
    const equipmentByKey = new Map<string, ItemEquipmentMetric>();
    const dailyByItem = new Map<OperationalItem, Map<string, ItemSummary["daily"][number]>>();
    const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
    const aggregateKeys = new Set(
      productiveTrips
        .map((trip) => normalizeEquipmentKey(equipmentRaw(trip), "aggregate"))
        .filter((key) => isAggregateEquipment(key)),
    );

    const ensureSummary = (item: OperationalItem) => {
      const current = summaries.get(item) ?? emptyItemSummary(item);
      summaries.set(item, current);
      return current;
    };
    const ensureDaily = (item: OperationalItem, date: string) => {
      const byDate = dailyByItem.get(item) ?? new Map<string, ItemSummary["daily"][number]>();
      dailyByItem.set(item, byDate);
      const current =
        byDate.get(date) ??
        ({
          date,
          d: shortDateLabel(date),
          m3: 0,
          looseM3: 0,
          diesel: 0,
          cost: 0,
          hours: 0,
          trips: 0,
          baseM3: 0,
          lPorM3: 0,
          m3PorH: 0,
        } satisfies ItemSummary["daily"][number]);
      byDate.set(date, current);
      return current;
    };
    const ensureEquipment = (
      equipment: string,
      item: OperationalItem,
      label = equipment,
      kind: EquipmentKind = "ownFleet",
      source: AuditSource,
      classificationReason: string,
    ): ItemEquipmentMetric => {
      const key = `${item}:${equipment || label || "SEM_EQUIPAMENTO"}`;
      const current =
        equipmentByKey.get(key) ??
        ({
          equipment: equipment || label || "SEM_EQUIPAMENTO",
          label: label || equipment || "SEM_EQUIPAMENTO",
          item,
          kind,
          sources: new Set<AuditSource>(),
          dieselSources: new Set<AuditSource>(),
          m3Sources: new Set<AuditSource>(),
          auditReasons: new Set<string>(),
          classificationReason,
          includedInEquipmentCount: false,
          equipmentCountReason: "",
          duplicateAcrossItems: false,
          relatedCompactedM3: 0,
          m3FromTrips: 0,
          m3AllocatedByHours: 0,
          productionShares: [],
          m3AllocationRule: "",
          m3TotalHours: 0,
          m3EquipmentHours: 0,
          m3Share: 0,
          hours: 0,
          liters: 0,
          cost: 0,
          m3: 0,
          trips: 0,
          fuelPerHour: 0,
          fuelPerM3: 0,
          fuelPerTrip: 0,
          productionPerHour: 0,
        } satisfies ItemEquipmentMetric);
      current.sources.add(source);
      current.auditReasons.add(classificationReason);
      if (label && label !== current.label && current.label === "SEM_EQUIPAMENTO") {
        current.label = label;
      }
      if (!current.classificationReason) current.classificationReason = classificationReason;
      equipmentByKey.set(key, current);
      return current;
    };
    const addProductionShare = (
      row: ItemEquipmentMetric,
      share: Omit<EquipmentOperationalShare, "m3PerLiter" | "m3PerHour">,
    ) => {
      const current = row.productionShares.find(
        (item) => item.date === share.date && item.item === share.item,
      );
      if (current) {
        current.equipmentHours += share.equipmentHours;
        current.relatedM3 += share.relatedM3;
        current.diesel += share.diesel;
        current.share += share.share;
        current.compactedM3Day = share.compactedM3Day;
        current.itemTotalHours = share.itemTotalHours;
        current.m3PerLiter = divide(current.relatedM3, current.diesel);
        current.m3PerHour = divide(current.relatedM3, current.equipmentHours);
        return;
      }
      row.productionShares.push({
        ...share,
        m3PerLiter: divide(share.relatedM3, share.diesel),
        m3PerHour: divide(share.relatedM3, share.equipmentHours),
      });
    };
    const addDailyDieselToProductionShare = (
      row: ItemEquipmentMetric,
      date: string,
      liters: number,
    ) => {
      const shares = row.productionShares.filter((share) => share.date === date);
      if (shares.length === 0) return;
      const relatedM3 = shares.reduce((sum, share) => sum + share.relatedM3, 0);
      shares.forEach((share) => {
        const dieselShare = relatedM3 > 0 ? share.relatedM3 / relatedM3 : 1 / shares.length;
        share.diesel += liters * dieselShare;
        share.m3PerLiter = divide(share.relatedM3, share.diesel);
        share.m3PerHour = divide(share.relatedM3, share.equipmentHours);
      });
    };

    const productionByDate = new Map<
      string,
      { compactedM3: number; looseM3: number; trips: number; revenue: number }
    >();
    productiveTrips.forEach((trip) => {
      const date = extractDateKey(trip.datetime);
      const currentDate = productionByDate.get(date) ?? {
        compactedM3: 0,
        looseM3: 0,
        trips: 0,
        revenue: 0,
      };
      currentDate.compactedM3 += calculateCompactedVolume(
        trip.cubicMLoose || 0,
        trip.swellFactorApplied,
      );
      currentDate.looseM3 += trip.cubicMLoose || 0;
      currentDate.trips += 1;
      currentDate.revenue += trip.total || 0;
      productionByDate.set(date, currentDate);
    });
    const periodBaseCompactedM3 = [...productionByDate.values()].reduce(
      (sum, row) => sum + row.compactedM3,
      0,
    );
    const compactedM3ByDate = new Map(
      [...productionByDate.entries()].map(([date, production]) => [date, production.compactedM3]),
    );
    const operationalShares = buildEquipmentOperationalShare({
      dailyParts: filteredDailyParts,
      compactedM3ByDate,
    });
    const operationalShareByEquipmentDay = new Map(
      operationalShares.map((share) => [
        `${share.date}|${share.item}|${share.equipmentKey}`,
        share,
      ]),
    );
    const appliedOperationalShareKeys = new Set<string>();

    productiveTrips.forEach((trip) => {
      const item = "transporte";
      const summary = ensureSummary(item);
      const date = extractDateKey(trip.datetime);
      const compactedM3 = calculateCompactedVolume(trip.cubicMLoose || 0, trip.swellFactorApplied);
      const looseM3 = trip.cubicMLoose || 0;
      const cost = AGGREGATE_TRIP_PRICE;
      const key = normalizeEquipmentKey(equipmentRaw(trip), "aggregate");
      const equipment = ensureEquipment(
        key,
        item,
        equipmentLabelFromKey(key, equipmentLabel(trip, "trip")),
        "aggregate",
        "trip",
        "viagem RCO produtiva classificada como transporte",
      );
      const day = ensureDaily(item, date);

      summary.compactedM3 += compactedM3;
      summary.looseM3 += looseM3;
      summary.trips += 1;
      summary.revenue += trip.total || 0;
      summary.cost += cost;
      equipment.m3 += compactedM3;
      equipment.m3FromTrips += compactedM3;
      equipment.m3Sources.add("trip");
      equipment.trips += 1;
      addProductionShare(equipment, {
        date,
        item,
        equipmentKey: equipment.equipment,
        equipmentLabel: equipment.label,
        equipmentHours: 0,
        itemTotalHours: 0,
        compactedM3Day: productionByDate.get(date)?.compactedM3 ?? compactedM3,
        share: 0,
        relatedM3: compactedM3,
        diesel: 0,
      });
      day.m3 += compactedM3;
      day.looseM3 += looseM3;
      day.trips += 1;
    });

    filteredDailyParts.forEach((part) => {
      const operationalClass = resolveEquipmentOperationalClass({
        fleet: part.fleet,
        equipment: part.fleetLabel || part.fleet,
        description: `${part.sourceSheet} ${part.status}`,
      });
      const item = operationalClass.item;
      const summary = ensureSummary(item);
      const key = normalizeEquipmentKey(part.fleet || part.fleetLabel, "dailyPart");
      const equipment = ensureEquipment(
        key || part.fleet,
        item,
        displayEquipmentLabel(part.fleet || part.fleetLabel, "dailyPart"),
        operationalClass.isAggregate ? "aggregate" : "ownFleet",
        "dailyPart",
        operationalClass.reason,
      );
      const day = ensureDaily(item, part.date);

      summary.hours += part.hours || 0;
      equipment.hours += part.hours || 0;
      equipment.m3EquipmentHours += part.usedInAnalysis && part.hours > 0 ? part.hours : 0;
      day.hours += part.hours || 0;

      if (!part.usedInAnalysis || part.hours <= 0) return;
      const shareKey = `${part.date}|${item}|${key || part.fleet || part.fleetLabel || "SEM_EQUIPAMENTO"}`;
      if (appliedOperationalShareKeys.has(shareKey)) return;
      appliedOperationalShareKeys.add(shareKey);
      const production = productionByDate.get(part.date);
      const productionShare = operationalShareByEquipmentDay.get(shareKey);
      if (!production || !productionShare || productionShare.itemTotalHours <= 0) return;

      const share = productionShare.share;
      const compactedM3 = productionShare.relatedM3;
      const looseM3 = production.looseM3 * share;
      const trips = production.trips * share;
      const revenue = production.revenue * share;

      summary.compactedM3 += compactedM3;
      summary.looseM3 += looseM3;
      summary.trips += trips;
      summary.revenue += revenue;
      equipment.m3 += compactedM3;
      equipment.m3AllocatedByHours += compactedM3;
      equipment.m3Sources.add("dailyPart");
      equipment.m3AllocationRule =
        "m3 compactado do dia x horas do equipamento / horas totais do item no dia";
      equipment.m3TotalHours += productionShare.itemTotalHours;
      equipment.m3Share += share;
      equipment.trips += trips;
      addProductionShare(equipment, { ...productionShare, equipmentLabel: equipment.label });
      day.m3 += compactedM3;
      day.looseM3 += looseM3;
      day.trips += trips;
    });

    attributedFueling.forEach((fuel) => {
      const context = fuelingEquipmentContext(fuel);
      const equipment = equipmentKeyByPdeRule(equipmentRaw(fuel), pdeFleetKeys, context);
      const isAggregateByPdeRule = equipment.startsWith("CB:") || aggregateKeys.has(equipment);
      const resolvedLabel = equipmentLabelFromKey(equipment, equipmentLabel(fuel, context));
      const operationalClass = resolveEquipmentOperationalClass({
        fleet: equipment,
        equipment: resolvedLabel,
        type: fuel.vehicleType,
        description: `${fuel.owner} ${fuel.operator}`,
      });
      const item = isAggregateByPdeRule || operationalClass.isAggregate
        ? "transporte"
        : operationalClass.item;
      const summary = ensureSummary(item);
      const dieselAuditSource: AuditSource =
        fuel.analysisId === "allocated"
          ? "fuelAllocation"
          : fuel.analysisId === "attributed"
            ? "fuelAttribution"
            : "fueling";
      const row = ensureEquipment(
        equipment,
        item,
        resolvedLabel,
        operationalClass.isAggregate || isAggregateByPdeRule ? "aggregate" : "ownFleet",
        dieselAuditSource,
        isAggregateByPdeRule
          ? "nao consta em PDE real; tratado como CB/agregado"
          : operationalClass.reason,
      );
      const date = extractDateKey(fuel.datetime);
      const day = ensureDaily(item, date);
      const liters = fuel.liters || 0;
      const cost = fuel.total || 0;

      summary.diesel += liters;
      summary.cost += cost;
      row.liters += liters;
      row.cost += cost;
      row.dieselSources.add(dieselAuditSource);
      addDailyDieselToProductionShare(row, date, liters);
      day.diesel += liters;
      day.cost += cost;
    });

    const itemKeysByEquipment = new Map<string, Set<OperationalItem>>();
    equipmentByKey.forEach((row) => {
      const items = itemKeysByEquipment.get(row.equipment) ?? new Set<OperationalItem>();
      items.add(row.item);
      itemKeysByEquipment.set(row.equipment, items);
    });

    equipmentByKey.forEach((row) => {
      row.duplicateAcrossItems = (itemKeysByEquipment.get(row.equipment)?.size ?? 0) > 1;
      row.relatedCompactedM3 = row.m3;
      row.fuelPerHour = divide(row.liters, row.hours);
      row.fuelPerM3 = divide(row.m3, row.liters);
      row.fuelPerTrip = divide(row.liters, row.trips);
      row.productionPerHour = divide(row.m3, row.hours);
      row.includedInEquipmentCount = isCountableEquipment(row);
      row.equipmentCountReason = equipmentCountReason(row);
    });

    summaries.forEach((summary) => {
      summary.baseCompactedM3 =
        summary.item !== "outros" && (summary.diesel > 0 || summary.hours > 0 || summary.trips > 0)
          ? periodBaseCompactedM3
          : 0;
      summary.compactedM3 = summary.baseCompactedM3;
      summary.fuelPerM3 = divide(summary.baseCompactedM3, summary.diesel);
      summary.fuelPerHour = divide(summary.diesel, summary.hours);
      summary.fuelPerTrip = divide(summary.diesel, summary.trips);
      summary.costPerM3 = divide(summary.cost, summary.baseCompactedM3);
      summary.margin = summary.revenue - summary.cost;
      summary.equipment = [...equipmentByKey.values()]
        .filter((row) => row.item === summary.item)
        .sort((a, b) => b.liters - a.liters || b.hours - a.hours || b.m3 - a.m3);

      const dailyMap = dailyByItem.get(summary.item) ?? new Map();
      summary.daily = [...dailyMap.values()]
        .map((day) => ({
          ...day,
          baseM3: productionByDate.get(day.date)?.compactedM3 ?? 0,
          m3: productionByDate.get(day.date)?.compactedM3 ?? 0,
          lPorM3: divide(productionByDate.get(day.date)?.compactedM3 ?? 0, day.diesel),
          m3PorH: divide(day.m3, day.hours),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    });

    return OPERATIONAL_ITEM_ORDER.map((item) => ensureSummary(item));
  }, [attributedFueling, filteredDailyParts, productiveTrips]);

  const itemSummaryById = useMemo(
    () => new Map(itemSummaries.map((summary) => [summary.item, summary])),
    [itemSummaries],
  );

  const itemDonutData = useMemo(
    () =>
      itemSummaries
        .filter((summary) => summary.diesel > 0)
        .map((summary) => ({ name: summary.label, value: summary.diesel })),
    [itemSummaries],
  );

  const itemRankingData = useMemo(
    () =>
      itemSummaries
        .filter((summary) => summary.diesel > 0 || summary.compactedM3 > 0 || summary.trips > 0)
        .map((summary) => ({
          id: summary.label,
          item: summary.item,
          diesel: summary.diesel,
          m3: summary.compactedM3,
          lpm3: summary.fuelPerM3,
          horas: summary.hours,
          viagens: summary.trips,
        }))
        .sort((a, b) => operationalItemRank(a.item) - operationalItemRank(b.item)),
    [itemSummaries],
  );

  const itemStackSeries = useMemo<StackedBarSeries[]>(
    () =>
      itemSummaries
        .filter((summary) => summary.item !== "outros" && summary.diesel > 0)
        .map((summary, index) => ({
          dataKey: summary.item,
          name: summary.label,
          color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
        })),
    [itemSummaries],
  );

  const itemStackedDaily = useMemo(() => {
    const rows = new Map<string, Record<string, unknown>>();
    itemSummaries.forEach((summary) => {
      summary.daily.forEach((day) => {
        const row = rows.get(day.date) ?? { date: day.date, d: day.d };
        row[summary.item] = day.diesel;
        rows.set(day.date, row);
      });
    });
    return [...rows.values()].sort((a, b) =>
      String(a.date ?? "").localeCompare(String(b.date ?? "")),
    );
  }, [itemSummaries]);

  const itemEquipmentStacks = useMemo(() => {
    const raw = new Map<
      OperationalItem,
      {
        totals: Map<string, { equipment: string; label: string; liters: number }>;
        daily: Map<string, Map<string, number>>;
      }
    >();
    const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
    const aggregateKeys = new Set(
      productiveTrips
        .map((trip) => normalizeEquipmentKey(equipmentRaw(trip), "aggregate"))
        .filter((key) => isAggregateEquipment(key)),
    );

    const ensureRaw = (item: OperationalItem) => {
      const current =
        raw.get(item) ??
        ({
          totals: new Map<string, { equipment: string; label: string; liters: number }>(),
          daily: new Map<string, Map<string, number>>(),
        } satisfies {
          totals: Map<string, { equipment: string; label: string; liters: number }>;
          daily: Map<string, Map<string, number>>;
        });
      raw.set(item, current);
      return current;
    };

    attributedFueling.forEach((fuel) => {
      const context = fuelingEquipmentContext(fuel);
      const equipment = equipmentKeyByPdeRule(equipmentRaw(fuel), pdeFleetKeys, context);
      const isAggregateByPdeRule = equipment.startsWith("CB:") || aggregateKeys.has(equipment);
      const resolvedLabel = equipmentLabelFromKey(equipment, equipmentLabel(fuel, context));
      const operationalClass = resolveEquipmentOperationalClass({
        fleet: equipment,
        equipment: resolvedLabel,
        type: fuel.vehicleType,
        description: `${fuel.owner} ${fuel.operator}`,
      });
      const item = isAggregateByPdeRule || operationalClass.isAggregate
        ? "transporte"
        : operationalClass.item;
      const date = extractDateKey(fuel.datetime);
      const liters = fuel.liters || 0;
      if (liters <= 0) return;

      const group = ensureRaw(item);
      const total = group.totals.get(equipment) ?? {
        equipment,
        label: resolvedLabel,
        liters: 0,
      };
      total.liters += liters;
      group.totals.set(equipment, total);

      const day = group.daily.get(date) ?? new Map<string, number>();
      day.set(equipment, (day.get(equipment) ?? 0) + liters);
      group.daily.set(date, day);
    });

    const result = new Map<OperationalItem, ItemStackView>();
    OPERATIONAL_ITEM_ORDER.forEach((item) => {
      const group = raw.get(item);
      if (!group) {
        result.set(item, EMPTY_ITEM_STACK);
        return;
      }

      const topEquipment = [...group.totals.values()]
        .sort((a, b) => b.liters - a.liters)
        .slice(0, 6);
      const series = topEquipment.map((row, index) => ({
        dataKey: `eq${index}`,
        name: row.label,
        equipmentKey: row.equipment,
        color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
      }));
      const data = [...group.daily.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, litersByEquipment]) => {
          const row: Record<string, unknown> = { date, d: shortDateLabel(date) };
          topEquipment.forEach((equipment, index) => {
            row[`eq${index}`] = fixedNumber(litersByEquipment.get(equipment.equipment) ?? 0, 2);
          });
          return row;
        });

      result.set(item, { data, series });
    });

    return result;
  }, [attributedFueling, filteredDailyParts, productiveTrips]);

  const escavacaoSummary = itemSummaryById.get("escavacao") ?? emptyItemSummary("escavacao");
  const transporteSummary = itemSummaryById.get("transporte") ?? emptyItemSummary("transporte");
  const tratamentoSummary = itemSummaryById.get("tratamento") ?? emptyItemSummary("tratamento");
  const compactacaoSummary = itemSummaryById.get("compactacao") ?? emptyItemSummary("compactacao");

  const technicalAuditRows = useMemo<TechnicalAuditRow[]>(
    () =>
      itemSummaries.flatMap((summary) =>
        summary.equipment.map((row) => {
          const statuses: string[] = [];
          if (row.liters <= 0) statuses.push("Sem diesel");
          if (summary.item !== "transporte" && row.hours <= 0) statuses.push("Sem horas");
          if (row.m3 <= 0) statuses.push("Sem m3");
          if (row.item === "outros") statuses.push("Fora do item esperado");
          if (row.duplicateAcrossItems) statuses.push("Duplicado");
          if (!row.includedInEquipmentCount) statuses.push("Nao contado");
          if (row.classificationReason.includes("sem correspondencia")) {
            statuses.push("Classificacao suspeita");
          }

          return {
            item: summary.item,
            itemLabel: summary.label,
            equipmentKey: row.equipment,
            equipmentLabel: row.label,
            kind: row.kind,
            source: [...row.sources].join(", "),
            hours: row.hours,
            diesel: row.liters,
            m3: row.m3,
            m3Relacionado: row.m3,
            trips: row.trips,
            m3PerLiter: row.fuelPerM3,
            litersPerHour: row.fuelPerHour,
            dieselSource: [...row.dieselSources].join(", ") || "sem diesel",
            m3Source:
              row.m3 > 0
                ? row.kind === "aggregate"
                  ? "RCO produtivo do agregado"
                  : "rateio por horas do item no dia"
                : "sem m3",
            includedInEquipmentCount: row.includedInEquipmentCount,
            status: statuses.length ? statuses.join(", ") : "OK",
            reason: row.equipmentCountReason,
            classificationReason: row.classificationReason,
            duplicateAcrossItems: row.duplicateAcrossItems,
            m3FromTrips: row.m3FromTrips,
            m3AllocatedByHours: row.m3AllocatedByHours,
            m3AllocationRule: row.m3AllocationRule || "sem rateio de m3",
            totalHours: row.m3TotalHours,
            equipmentHours: row.m3EquipmentHours,
            share: row.m3Share,
          };
        }),
      ),
    [itemSummaries],
  );

  const dieselFlowAuditRows = useMemo<DieselFlowAuditRow[]>(() => {
    const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
    const labels = new Map<string, string>();
    const add = (map: Map<string, number>, key: string, label: string, value: number) => {
      if (!key) return;
      labels.set(key, label || key);
      map.set(key, (map.get(key) ?? 0) + value);
    };
    const rawFueling = new Map<string, number>();
    const allocated = new Map<string, number>();
    const attributed = new Map<string, number>();
    const dashboard = new Map<string, number>();
    const stacked = new Map<string, number>();

    filteredFueling.forEach((fuel) => {
      const context = fuelingEquipmentContext(fuel);
      const key = equipmentKeyByPdeRule(equipmentRaw(fuel), pdeFleetKeys, context);
      add(rawFueling, key, equipmentLabelFromKey(key, equipmentLabel(fuel, context)), fuel.liters || 0);
    });
    filteredFuelAllocations.forEach((allocation) => {
      const key = normalizeEquipmentKey(allocation.fleet, "fuelAllocation");
      add(allocated, key, displayEquipmentLabel(allocation.fleet, "fuelAllocation"), allocation.litersAllocated || 0);
    });
    attributedFueling.forEach((fuel) => {
      const context = fuelingEquipmentContext(fuel);
      const key = equipmentKeyByPdeRule(equipmentRaw(fuel), pdeFleetKeys, context);
      add(attributed, key, equipmentLabelFromKey(key, equipmentLabel(fuel, context)), fuel.liters || 0);
    });
    itemSummaries.forEach((summary) => {
      summary.equipment.forEach((equipment) => {
        add(dashboard, equipment.equipment, equipment.label, equipment.liters);
      });
    });
    itemEquipmentStacks.forEach((stack) => {
      stack.data.forEach((row) => {
        stack.series.forEach((series) => {
          const key = (series as StackedBarSeries & { equipmentKey?: string }).equipmentKey ?? series.name;
          labels.set(key, series.name);
          stacked.set(key, (stacked.get(key) ?? 0) + Number(row[series.dataKey] ?? 0));
        });
      });
    });

    const keys = new Set([
      ...rawFueling.keys(),
      ...allocated.keys(),
      ...attributed.keys(),
      ...dashboard.keys(),
      ...stacked.keys(),
    ]);
    return [...keys]
      .map((key) => {
        const fuelingLiters = rawFueling.get(key) ?? 0;
        const allocatedLiters = allocated.get(key) ?? 0;
        const attributedLiters = attributed.get(key) ?? 0;
        const itemSummaryLiters = dashboard.get(key) ?? 0;
        const stackedChartLiters = stacked.get(key) ?? 0;
        const auditTypes: string[] = [];
        if (fuelingLiters > 0 && allocatedLiters <= 0 && hasOfficialFuelAllocations) {
          auditTypes.push("Sem allocation");
        }
        if (Math.abs((hasOfficialFuelAllocations ? allocatedLiters : attributedLiters) - itemSummaryLiters) > 0.01) {
          auditTypes.push("Divergencia de soma");
        }
        if (itemSummaryLiters > 0 && stackedChartLiters <= 0) auditTypes.push("Fora do stack top 6");
        return {
          equipmentKey: key,
          equipmentLabel: labels.get(key) ?? key,
          fuelingLiters,
          allocatedLiters,
          attributedLiters,
          itemSummaryLiters,
          stackedChartLiters,
          diffFuelingToAllocation: fuelingLiters - allocatedLiters,
          diffAllocationToDashboard:
            (hasOfficialFuelAllocations ? allocatedLiters : attributedLiters) - itemSummaryLiters,
          auditTypes: auditTypes.join(", ") || "OK",
        };
      })
      .sort((a, b) => b.itemSummaryLiters - a.itemSummaryLiters || a.equipmentLabel.localeCompare(b.equipmentLabel));
  }, [
    attributedFueling,
    filteredFuelAllocations,
    filteredFueling,
    filteredDailyParts,
    hasOfficialFuelAllocations,
    itemEquipmentStacks,
    itemSummaries,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    if (window.localStorage.getItem("debugFuelAllocation") !== "1") return;

    const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
    const fuelingKey = (fuel: DbFueling) =>
      equipmentKeyByPdeRule(equipmentRaw(fuel), pdeFleetKeys, fuelingEquipmentContext(fuel));
    const sourceFuelingDateById = new Map(
      fuelRows.map((fuel) => [fuel.id, extractDateKey(fuel.datetime)]),
    );
    const allocations = fuelAllocationRows.map((row) => ({
        sourceFuelingId: row.sourceFuelingId,
        sourceFuelingDate: sourceFuelingDateById.get(row.sourceFuelingId) ?? "",
        fleet: normalizeEquipmentKey(row.fleet, "fuelAllocation"),
        pdeId: row.pdeId,
        pdeDate: row.pdeDate,
        obra: row.obra,
        hourmeterStart: row.hourmeterStart,
        hourmeterEnd: row.hourmeterEnd,
        allocatedHours: row.allocatedHours,
        litersAllocated: row.litersAllocated,
        costAllocated: row.costAllocated,
        createdAt: row.createdAt,
      }));
    const attributed = attributedFueling.map((fuel) => ({
        graphDate: extractDateKey(fuel.datetime),
        fleet: fuelingKey(fuel),
        liters: fuel.liters,
        total: fuel.total,
        obra: fuel.obra,
        sourceFuelingId: fuel.importBatchId,
      }));
    const treatmentStack = itemEquipmentStacks.get("tratamento")?.data ?? [];

    console.groupCollapsed("[fuel-allocation-debug] Producao x Consumo");
    console.table(
      sumByKey(fuelRows, fuelingKey, (fuel) => fuel.liters || 0),
    );
    console.table(
      sumByKey(
        fuelAllocationRows,
        (allocation) => normalizeEquipmentKey(allocation.fleet, "fuelAllocation"),
        (allocation) => allocation.litersAllocated || 0,
      ),
    );
    console.table(
      sumByKey(attributedFueling, fuelingKey, (fuel) => fuel.liters || 0),
    );
    console.table(
      itemSummaries.flatMap((summary) =>
        summary.equipment.map((equipment) => ({
          item: summary.item,
          equipment: equipment.label,
          liters: fixedNumber(equipment.liters, 2),
          hours: fixedNumber(equipment.hours, 2),
          m3Relacionado: fixedNumber(equipment.m3, 2),
        })),
      ),
    );
    console.table(allocations);
    console.table(attributed);
    console.table(treatmentStack);
    console.groupEnd();
  }, [attributedFueling, filteredDailyParts, fuelAllocationRows, fuelRows, itemEquipmentStacks, itemSummaries]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem("debugProductionAudit") !== "1") return;

    const compactacaoRows = technicalAuditRows.filter((row) => row.item === "compactacao");
    const toConsoleRow = (row: TechnicalAuditRow) => ({
      item: row.item,
      equipmentKey: row.equipmentKey,
      equipmentLabel: row.equipmentLabel,
      kind: row.kind,
      source: row.source,
      hours: fixedNumber(row.hours, 2),
      diesel: fixedNumber(row.diesel, 2),
      m3: fixedNumber(row.m3, 2),
      trips: fixedNumber(row.trips, 2),
      m3PerLiter: fixedNumber(row.m3PerLiter, 3),
      litersPerHour: fixedNumber(row.litersPerHour, 2),
      includedInEquipmentCount: row.includedInEquipmentCount,
      reason: row.reason,
    });

    console.groupCollapsed("[production-audit] Producao x Consumo");
    console.table(technicalAuditRows.map(toConsoleRow));
    console.table(compactacaoRows.map(toConsoleRow));
    console.table(
      dieselFlowAuditRows.map((row) => ({
        ...row,
        fuelingLiters: fixedNumber(row.fuelingLiters, 2),
        allocatedLiters: fixedNumber(row.allocatedLiters, 2),
        attributedLiters: fixedNumber(row.attributedLiters, 2),
        itemSummaryLiters: fixedNumber(row.itemSummaryLiters, 2),
        stackedChartLiters: fixedNumber(row.stackedChartLiters, 2),
        diffFuelingToAllocation: fixedNumber(row.diffFuelingToAllocation, 2),
        diffAllocationToDashboard: fixedNumber(row.diffAllocationToDashboard, 2),
      })),
    );
    console.table(
      technicalAuditRows.map((row) => ({
        equipmentKey: row.equipmentKey,
        equipmentLabel: row.equipmentLabel,
        item: row.item,
        m3FromTrips: fixedNumber(row.m3FromTrips, 2),
        m3AllocatedByHours: fixedNumber(row.m3AllocatedByHours, 2),
        m3Final: fixedNumber(row.m3Relacionado, 2),
        m3Relacionado: fixedNumber(row.m3, 2),
        rule: row.m3AllocationRule,
        totalHours: fixedNumber(row.totalHours, 2),
        equipmentHours: fixedNumber(row.equipmentHours, 2),
        share: fixedNumber(row.share, 4),
      })),
    );
    console.table(
      itemSummaries.flatMap((summary) =>
        summary.equipment.flatMap((equipment) =>
          equipment.productionShares.map((share) => ({
            date: share.date,
            item: share.item,
            equipmentKey: share.equipmentKey,
            equipmentLabel: share.equipmentLabel,
            equipmentHours: fixedNumber(share.equipmentHours, 2),
            itemTotalHours: fixedNumber(share.itemTotalHours, 2),
            share: fixedNumber(share.share, 4),
            dailyCompactedM3: fixedNumber(share.compactedM3Day, 2),
            relatedM3: fixedNumber(share.relatedM3, 2),
            diesel: fixedNumber(share.diesel, 2),
            m3PerLiter: fixedNumber(share.m3PerLiter, 3),
            m3PerHour: fixedNumber(share.m3PerHour, 2),
          })),
        ),
      ),
    );
    console.table(
      technicalAuditRows.map((row) => ({
        input: row.equipmentLabel,
        normalizedKey: row.equipmentKey,
        displayLabel: row.equipmentLabel,
        kind: row.kind,
        operationalItem: row.item,
        reason: row.classificationReason,
      })),
    );
    console.groupEnd();
  }, [dieselFlowAuditRows, itemSummaries, technicalAuditRows]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem("debugProductionMath") !== "1") return;

    const equipmentDailyRows = itemSummaries.flatMap((summary) =>
      summary.equipment.flatMap((equipment) =>
        equipment.productionShares.map((share) => ({
          date: share.date,
          item: share.item,
          equipment: share.equipmentLabel,
          equipmentKey: share.equipmentKey,
          equipmentHours: fixedNumber(share.equipmentHours, 2),
          itemTotalHours: fixedNumber(share.itemTotalHours, 2),
          share: fixedNumber(share.share, 6),
          dailyCompactedM3: fixedNumber(share.compactedM3Day, 2),
          relatedM3: fixedNumber(share.relatedM3, 2),
          diesel: fixedNumber(share.diesel, 2),
          m3PerLiter: fixedNumber(share.m3PerLiter, 3),
          m3PerHour: fixedNumber(share.m3PerHour, 2),
        })),
      ),
    );
    const formulaRows = itemSummaries.flatMap((summary) =>
      summary.equipment.map((equipment) => {
        const relatedM3Used = equipment.m3;
        const suspectedIssue =
          equipment.fuelPerM3 > 50
            ? "m3/L > 50; revisar horas/diesel/share"
            : equipment.m3 > summary.baseCompactedM3 + 0.01
              ? "m3 relacionado maior que base do item"
              : equipment.liters > 0 && equipment.m3 <= 0
                ? "diesel sem m3 relacionado"
                : "OK";
        return {
          item: summary.item,
          equipment: equipment.label,
          equipmentKey: equipment.equipment,
          periodCompactedM3Used: "nao usado",
          relatedM3Used: fixedNumber(relatedM3Used, 2),
          diesel: fixedNumber(equipment.liters, 2),
          hours: fixedNumber(equipment.hours, 2),
          m3PerLiter: fixedNumber(equipment.fuelPerM3, 3),
          m3PerHour: fixedNumber(equipment.productionPerHour, 2),
          formula: "equipment.relatedM3 / equipmentDiesel; equipment.relatedM3 / equipmentHours",
          suspectedIssue,
        };
      }),
    );
    const componentFormulaRows = [
      {
        component: "KPI m3/L do item",
        m3Source: "summary.baseCompactedM3",
        dieselSource: "summary.diesel",
        formula: "summary.baseCompactedM3 / summary.diesel",
        scope: "item/periodo",
        status: "OK para item, nao usado para equipamento",
      },
      {
        component: "Grafico eficiencia diaria do item",
        m3Source: "productionByDate[date].compactedM3",
        dieselSource: "day.diesel do item",
        formula: "dailyCompactedM3 / itemDieselDay",
        scope: "item/dia",
        status: "OK para item",
      },
      {
        component: "Ranking m3/L por equipamento",
        m3Source: "equipment.m3 relacionado por share diario",
        dieselSource: "equipment.liters",
        formula: "equipment.relatedM3 / equipment.liters",
        scope: "equipamento/periodo",
        status: "OK",
      },
      {
        component: "Tabela operacional por equipamento",
        m3Source: "equipment.m3 relacionado por share diario",
        dieselSource: "equipment.liters",
        formula: "equipment.relatedM3 / equipment.liters",
        scope: "equipamento/periodo",
        status: "OK",
      },
      {
        component: "Produtividade m3/h por equipamento",
        m3Source: "equipment.m3 relacionado por share diario",
        dieselSource: "n/a",
        formula: "equipment.relatedM3 / equipment.hours",
        scope: "equipamento/periodo",
        status: "OK",
      },
    ];

    console.groupCollapsed("[production-math] Producao x Consumo");
    console.table(equipmentDailyRows);
    console.table(formulaRows);
    console.table(formulaRows.filter((row) => row.suspectedIssue !== "OK"));
    console.table(componentFormulaRows);
    console.groupEnd();
  }, [itemSummaries]);

  const obraComparison = useMemo(
    () =>
      comparisonSeries.map((series) => {
        const trips = productiveTrips.filter(
          (trip) => normalizeObraKey(trip.obra) === series.obraKey,
        );
        const fueling = attributedFueling.filter(
          (fuel) => normalizeObraKey(fuel.obra) === series.obraKey,
        );
        const dailyParts = filteredDailyParts.filter(
          (part) => normalizeObraKey(part.obra) === series.obraKey,
        );
        const obraKpis = calculateOperationalKPIs(trips, fueling, dailyParts);
        const daily = Array.from(calculateDailyMetrics(trips, fueling).values()).sort((a, b) =>
          a.date.localeCompare(b.date),
        );

        return {
          ...series,
          trips,
          fueling,
          dailyParts,
          daily,
          kpis: obraKpis,
          aggregateMetrics: calculateAggregateMetrics(trips, obraKpis.compactedM3),
          equipmentMetrics: calculateEquipmentMetrics(fueling, dailyParts),
        };
      }),
    [attributedFueling, comparisonSeries, filteredDailyParts, productiveTrips],
  );

  const dailyObraComparisonData = useMemo(() => {
    const rows = new Map<string, Record<string, unknown>>();

    obraComparison.forEach((obra) => {
      obra.daily.forEach((day) => {
        const row = rows.get(day.date) ?? { date: day.date, d: day.label };
        row[obra.compactedKey] = day.compactedM3;
        row[obra.looseKey] = day.looseM3;
        row[obra.dieselKey] = day.diesel;
        if (day.diesel > 0) row[obra.fuelPerM3Key] = day.compactedM3 / day.diesel;
        rows.set(day.date, row);
      });
    });

    return Array.from(rows.values()).sort((a, b) =>
      String(a.date ?? "").localeCompare(String(b.date ?? "")),
    );
  }, [obraComparison]);

  const obraVolumeDieselSeries = useMemo(
    () =>
      obraComparison.map((obra) => ({
        obra: obra.obra,
        color: obra.color,
        volumeKey: obra.looseKey,
        lineKey: obra.dieselKey,
      })),
    [obraComparison],
  );

  const obraCompactedM3Series = useMemo(
    () =>
      obraComparison.map((obra) => ({
        dataKey: obra.compactedKey,
        name: obra.obra,
        color: obra.color,
      })),
    [obraComparison],
  );

  const obraDieselSeries = useMemo(
    () =>
      obraComparison.map((obra) => ({
        dataKey: obra.dieselKey,
        name: obra.obra,
        color: obra.color,
      })),
    [obraComparison],
  );

  const obraFuelPerM3Series = useMemo(
    () =>
      obraComparison.map((obra) => ({
        dataKey: obra.fuelPerM3Key,
        name: obra.obra,
        color: obra.color,
      })),
    [obraComparison],
  );

  const obraDistribution = useMemo(
    () => calculateObraDistribution(productiveTrips),
    [productiveTrips],
  );

  const operationalAlerts = useMemo(
    () =>
      detectOperationalAlerts(
        productiveTrips,
        filteredFueling,
        equipmentMetrics.map((e) => ({
          equipment: e.equipment,
          hours: e.hours,
          liters: e.liters,
        })),
      ),
    [equipmentMetrics, filteredFueling, productiveTrips],
  );

  const prefetchDashboardForIds = useCallback(
    async (ids: string[]) => {
      const normalizedIds = normalizeAnalysisIds(ids);
      const key = analysisIdsKey(normalizedIds);
      if (normalizedIds.length === 0) return null;
      return queryClient.fetchQuery({
        queryKey: productionQueryKeys.dashboard(key),
        queryFn: ({ signal }) => fetchDashboardRows(normalizedIds, signal),
        staleTime: 5_000,
      });
    },
    [queryClient],
  );

  const handleSelectAnalysisIds = useCallback(
    (ids: string[]) => {
      const normalizedIds = normalizeAnalysisIds(ids);
      void queryClient.cancelQueries({
        queryKey: productionQueryKeys.dashboardRoot(),
        exact: false,
      });
      clearFilters();
      analysisSelection.setSelectedIds(normalizedIds);
      setActiveTab("overview");
    },
    [analysisSelection, clearFilters, queryClient, setActiveTab],
  );

  // ─── Adaptações de shape para o template ─────────────────────────
  const prodConsumoData = useMemo(
    () =>
      dailyData.map((d) => ({
        d: d.label,
        compactada: d.compactedM3,
        solta: d.looseM3,
        diesel: d.diesel,
      })),
    [dailyData],
  );

  const dieselLineData = useMemo(
    () => dailyData.map((d) => ({ d: d.label, diesel: d.diesel })),
    [dailyData],
  );

  const fuelPerM3LineData = useMemo(
    () =>
      dailyData.map((d) => ({
        d: d.label,
        lpm3: Number((d.fuelPerM3 || 0).toFixed(2)),
      })),
    [dailyData],
  );

  const producaoEmpoladaDieselData = useMemo(
    () =>
      dailyData.map((d) => ({
        d: d.label,
        m3Empolado: d.looseM3,
        diesel: d.diesel,
      })),
    [dailyData],
  );

  const obraEfficiency = useMemo(() => {
    const tripsByKey = new Map<string, { obra: string; compactedM3: number; trips: number }>();
    productiveTrips.forEach((trip) => {
      const key = normalizeObraKey(trip.obra);
      const cur = tripsByKey.get(key) ?? {
        obra: trip.obra || "Sem obra",
        compactedM3: 0,
        trips: 0,
      };
      cur.compactedM3 += calculateCompactedVolume(trip.cubicMLoose || 0, trip.swellFactorApplied);
      cur.trips += 1;
      tripsByKey.set(key, cur);
    });

    const litersByKey = new Map<string, number>();
    attributedFueling.forEach((fuel) => {
      const key = normalizeObraKey(fuel.obra);
      litersByKey.set(key, (litersByKey.get(key) ?? 0) + (fuel.liters || 0));
    });

    const totalM3 = [...tripsByKey.values()].reduce((s, o) => s + o.compactedM3, 0);
    const totalLiters = [...litersByKey.values()].reduce((s, v) => s + v, 0);
    const avgLpm3 = totalLiters > 0 ? totalM3 / totalLiters : 0;

    return [...tripsByKey.entries()]
      .map(([key, data]) => {
        const liters = litersByKey.get(key) ?? 0;
        const lpm3 = liters > 0 ? data.compactedM3 / liters : 0;
        const delta = avgLpm3 > 0 ? ((lpm3 - avgLpm3) / avgLpm3) * 100 : 0;
        const score: "ótima" | "média" | "ruim" =
          delta > 10 ? "ótima" : delta > -10 ? "média" : "ruim";
        return {
          obra: data.obra,
          compactedM3: data.compactedM3,
          liters,
          lpm3,
          avgLpm3,
          delta,
          score,
        };
      })
      .filter((o) => o.compactedM3 > 0)
      .sort((a, b) => b.lpm3 - a.lpm3);
  }, [productiveTrips, attributedFueling]);

  const obraBarsData = useMemo(
    () => obraDistribution.map((o) => ({ obra: o.name, m3: o.value })),
    [obraDistribution],
  );

  const aggregatesTop = useMemo(() => {
    if (!compareByObra) {
      return aggregateMetrics.map((a) => ({
        id: a.aggregate,
        obra: "",
        m3: a.compactedM3,
        viagens: a.trips,
      }));
    }

    const rows = obraComparison.flatMap((obra) =>
      obra.aggregateMetrics.map((a) => ({
        id: withObraLabel(a.aggregate, obra.obra),
        obra: obra.obra,
        m3: a.compactedM3,
        viagens: a.trips,
      })),
    );
    return topPerObra(rows, (row) => row.m3);
  }, [aggregateMetrics, compareByObra, obraComparison]);

  const equipmentHoursData = useMemo(() => {
    if (!compareByObra) {
      return equipmentMetrics.map((e) => ({ id: e.equipment, obra: "", horas: e.hours }));
    }

    const rows = obraComparison.flatMap((obra) =>
      obra.equipmentMetrics.map((e) => ({
        id: withObraLabel(e.equipment, obra.obra),
        obra: obra.obra,
        horas: e.hours,
      })),
    );
    return topPerObra(rows, (row) => row.horas);
  }, [compareByObra, equipmentMetrics, obraComparison]);

  const equipmentLitersData = useMemo(() => {
    if (!compareByObra) {
      return equipmentMetrics.map((e) => ({ id: e.equipment, obra: "", litros: e.liters }));
    }

    const rows = obraComparison.flatMap((obra) =>
      obra.equipmentMetrics.map((e) => ({
        id: withObraLabel(e.equipment, obra.obra),
        obra: obra.obra,
        litros: e.liters,
      })),
    );
    return topPerObra(rows, (row) => row.litros);
  }, [compareByObra, equipmentMetrics, obraComparison]);

  const equipmentLPerHourData = useMemo(() => {
    if (!compareByObra) {
      return equipmentMetrics
        .filter((e) => e.hours > 0)
        .map((e) => ({
          equipamento: e.equipment,
          obra: "",
          lph: Number(e.fuelPerHour.toFixed(2)),
        }));
    }

    const rows = obraComparison.flatMap((obra) =>
      obra.equipmentMetrics
        .filter((e) => e.hours > 0)
        .map((e) => ({
          equipamento: withObraLabel(e.equipment, obra.obra),
          obra: obra.obra,
          lph: Number(e.fuelPerHour.toFixed(2)),
        })),
    );
    return topPerObra(rows, (row) => row.lph);
  }, [compareByObra, equipmentMetrics, obraComparison]);

  const aggregateRankingData: AggregateRankingPoint[] = useMemo(() => {
    if (compareByObra) {
      return obraComparison.flatMap((obra) =>
        obra.aggregateMetrics
          .filter((a) => a.compactedM3 > 0)
          .map((a) => {
            const proxyDiesel = (obra.kpis.diesel * a.participation) / 100;
            return {
              name: withObraLabel(a.aggregate, obra.obra),
              obra: obra.obra,
              liters: proxyDiesel,
              m3: a.compactedM3,
              trips: a.trips,
            };
          }),
      );
    }

    return aggregateMetrics
      .filter((a) => a.compactedM3 > 0)
      .map((a) => {
        const proxyDiesel = (kpis.diesel * a.participation) / 100;
        return {
          name: a.aggregate,
          obra: visibleObras[0],
          liters: proxyDiesel,
          m3: a.compactedM3,
          trips: a.trips,
        };
      });
  }, [aggregateMetrics, compareByObra, kpis.diesel, obraComparison, visibleObras]);

  // Status dos equipamentos para o donut de auditoria
  const auditDonutData = useMemo(() => {
    const tally = new Map<string, number>();
    const groups = compareByObra
      ? obraComparison.flatMap((obra) =>
          obra.equipmentMetrics.map((equipment) => ({ ...equipment, obra: obra.obra })),
        )
      : equipmentMetrics.map((equipment) => ({ ...equipment, obra: "" }));

    groups.forEach((e) => {
      const status = e.status || "OK";
      const key = compareByObra ? withObraLabel(status, e.obra) : status;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    });
    return Array.from(tally.entries()).map(([name, value]) => ({ name, value }));
  }, [compareByObra, equipmentMetrics, obraComparison]);

  const auditDonutTotal = useMemo(
    () => auditDonutData.reduce((s, x) => s + x.value, 0),
    [auditDonutData],
  );

  async function handleCreated(analysisId: string) {
    setDashboardLoading({
      isCreatingAnalysis: false,
      isHydratingAnalysis: true,
      isReloadingDashboard: false,
    });

    try {
      await queryClient.cancelQueries({ queryKey: productionQueryKeys.all });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productionQueryKeys.analyses() }),
        queryClient.invalidateQueries({
          queryKey: productionQueryKeys.dashboardRoot(),
          exact: false,
        }),
      ]);

      const nextAnalyses = await queryClient.fetchQuery({
        queryKey: productionQueryKeys.analyses(),
        queryFn: ({ signal }) => fetchAnalyses(signal),
        staleTime: 0,
      });
      if (!nextAnalyses.some((analysis) => analysis.id === analysisId)) {
        throw new Error("A analise foi criada, mas ainda nao ficou disponivel para leitura.");
      }
      await recalculateFuelAllocationsSupportFn({ data: { analysisIds: [analysisId] } }).catch(
        (err) => {
          console.error("[fuel-allocation] recalc on createAnalysis failed", err);
        },
      );
      const nextIds = nextAnalyses.map((analysis) => analysis.id);
      const nextKey = analysisIdsKey(nextIds);

      clearFilters();
      setActiveTab("overview");
      analysisSelection.setSelectedIds(nextIds);
      queryClient.removeQueries({
        queryKey: productionQueryKeys.dashboardRoot(),
        exact: false,
      });

      setDashboardLoading({
        isCreatingAnalysis: false,
        isHydratingAnalysis: false,
        isReloadingDashboard: true,
      });

      await queryClient.fetchQuery({
        queryKey: productionQueryKeys.dashboard(nextKey),
        queryFn: ({ signal }) => fetchDashboardRows(nextIds, signal),
        staleTime: 5_000,
      });
    } finally {
      setDashboardLoading(DASHBOARD_LOADING_IDLE);
    }
  }

  async function handleDeleteAnalysis(analysisId: string) {
    setDashboardLoading({
      isCreatingAnalysis: false,
      isHydratingAnalysis: false,
      isReloadingDashboard: true,
    });
    try {
      await deleteAnalysis({ data: { analysisId } });
      toast.success("Analise excluida");
      await queryClient.cancelQueries({ queryKey: productionQueryKeys.all });
      queryClient.removeQueries({
        queryKey: productionQueryKeys.dashboardRoot(),
        exact: false,
      });

      const nextAnalyses = await queryClient.fetchQuery({
        queryKey: productionQueryKeys.analyses(),
        queryFn: ({ signal }) => fetchAnalyses(signal),
        staleTime: 0,
      });
      const availableIds = new Set(nextAnalyses.map((analysis) => analysis.id));
      const keptIds = analysisSelection.selectedIds.filter(
        (id) => id !== analysisId && availableIds.has(id),
      );
      const nextIds = keptIds.length ? keptIds : nextAnalyses[0]?.id ? [nextAnalyses[0].id] : [];

      clearFilters();
      analysisSelection.setSelectedIds(nextIds);
      setActiveTab("overview");
      await prefetchDashboardForIds(nextIds);
    } catch (err) {
      toast.error("Erro ao excluir analise", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
      throw err;
    } finally {
      setDashboardLoading(DASHBOARD_LOADING_IDLE);
    }
  }

  async function handleRecalculateFuel() {
    setRecalcLoading(true);
    setDashboardLoading({
      isCreatingAnalysis: false,
      isHydratingAnalysis: false,
      isReloadingDashboard: true,
    });
    try {
      const official = await recalculateFuelAllocationsSupportFn({
        data: { analysisIds: selectedAnalysisIds },
      });
      if ("skipped" in official) {
        const legacy = await recalculateFuelFn({ data: {} });
        toast.success(
          `Rateio legado recalculado: ${legacy.totalAttributions} atribuicoes, ${legacy.fleetsProcessed} frotas`,
        );
      } else {
        toast.success(
          `Rateio oficial recalculado: ${official.totalAllocations} alocacoes, ${official.totalAudits} auditorias`,
        );
      }
      await queryClient.cancelQueries({
        queryKey: productionQueryKeys.dashboardRoot(),
        exact: false,
      });
      queryClient.removeQueries({
        queryKey: productionQueryKeys.dashboardRoot(),
        exact: false,
      });
      await prefetchDashboardForIds(selectedAnalysisIds);
    } catch (err) {
      toast.error(`Falha ao recalcular: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRecalcLoading(false);
      setDashboardLoading(DASHBOARD_LOADING_IDLE);
    }
  }

  const empty = !analysesQuery.isPending && analyses.length === 0;
  const dashboardError = analysesQuery.error ?? dashboardQuery.error;
  const showDashboardError =
    Boolean(dashboardError) && !analysesQuery.isFetching && !dashboardQuery.isFetching;
  const dashboardBusyLabel = dashboardLoading.isHydratingAnalysis
    ? "Sincronizando analise..."
    : dashboardLoading.isReloadingDashboard
      ? "Recarregando dashboard..."
      : dashboardQuery.isFetching || analysesQuery.isFetching
        ? "Carregando dados..."
        : "Preparando dashboard...";
  const globalBusy =
    dashboardLoading.isCreatingAnalysis ||
    dashboardLoading.isHydratingAnalysis ||
    dashboardLoading.isReloadingDashboard;

  return (
    <AppLayout>
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
            Análises operacionais
          </span>
          <h1 className="text-3xl font-black uppercase tracking-tighter">Produção × Consumo</h1>
          <p className="text-xs text-on-surface-variant mt-1">{analysisSelection.label}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => handleSelectAnalysisIds(analyses.map((analysis) => analysis.id))}
            disabled={empty || globalBusy}
          >
            <Icon name="stacked_line_chart" className="text-base mr-1" />
            Acumulado Geral
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={analysesModal.open}
            disabled={empty || globalBusy}
          >
            <Icon name="folder_open" className="text-base mr-1" />
            Análises Disponíveis
          </Button>
          {canCreate && (
            <Button
              size="sm"
              className="text-xs"
              onClick={() => setShowCreate(true)}
              disabled={globalBusy}
            >
              <Icon name="add_chart" className="text-base mr-1" />
              Criar Análise
            </Button>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              disabled={recalcLoading || globalBusy || selectedAnalysisIds.length === 0}
              onClick={handleRecalculateFuel}
            >
              <Icon name="autorenew" className="text-base mr-1" />
              {recalcLoading ? "Recalculando…" : "Recalcular rateio"}
            </Button>
          )}
        </div>
      </div>

      {showDashboardError ? (
        <DashboardErrorPanel error={dashboardError} />
      ) : analysesQuery.isPending ? (
        <DashboardLoadingPanel label="Carregando analises..." />
      ) : empty ? (
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
      ) : isDashboardHydrating ? (
        <DashboardLoadingPanel label={dashboardBusyLabel} />
      ) : analysisSelection.primaryAnalysis ? (
        <>
          <DashboardFilters
            state={filters}
            onChange={updateFilters}
            obras={selectedObras}
            materials={distinctMaterials}
            equipment={distinctEquipment}
            aggregates={distinctAggregates}
            loading={loading}
          />

          <DashboardTabs tabs={visibleTabs} activeTab={activeTab} onChange={setActiveTab} />
          {dieselSourceNotice && (
            <div className="mb-3 rounded border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-on-surface-variant">
              {dieselSourceNotice}
            </div>
          )}
          <div className="mb-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setShowTechnicalAudit((visible) => !visible)}
            >
              <Icon name="fact_check" className="text-base mr-1" />
              {showTechnicalAudit ? "Ocultar auditoria técnica" : "Ver auditoria técnica"}
            </Button>
          </div>

          {/* KPI strip */}
          <div className="mb-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KpiCardCompact
              label="Produção m³ compactado"
              value={formatM3(kpis.compactedM3)}
              icon="compress"
            />
            <KpiCardCompact
              label="Diesel L"
              value={formatLiters(kpis.diesel)}
              icon="local_gas_station"
            />
            <KpiCardCompact label="Viagens" value={String(kpis.trips)} icon="local_shipping" />
            {activeTab === "efficiency" ? (
              <KpiCardCompact label="m³/L" value={formatNumber(kpis.fuelPerM3, 2)} icon="speed" />
            ) : (
              <KpiCardCompact
                label="Produção m³ solto"
                value={formatM3(kpis.looseM3)}
                icon="compress"
              />
            )}
            <KpiCardCompact
              label="Eficiência"
              value={`${formatNumber(kpis.efficiencyPercent, 0)}%`}
              tone="success"
              icon="query_stats"
            />
          </div>

          {/* ───────────────────────── TABS ────────────────────────── */}

          {activeTab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                <KpiCardCompact
                  label="m3 compactado"
                  value={formatM3(kpis.compactedM3)}
                  icon="compress"
                />
                <KpiCardCompact
                  label="m3 solto"
                  value={formatM3(kpis.looseM3)}
                  icon="compress"
                />
                <KpiCardCompact
                  label="Diesel total"
                  value={formatLiters(kpis.diesel)}
                  icon="local_gas_station"
                />
                <KpiCardCompact label="m3/L" value={formatNumber(kpis.fuelPerM3, 3)} icon="speed" />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2">
                  <ChartCard
                    title="Producao x Consumo diario"
                    description="m3 compactado, m3 solto e diesel alocado na data da PDE"
                    height={340}
                    hasData={prodConsumoData.length > 0}
                  >
                    <ChartProdConsumo data={prodConsumoData} />
                  </ChartCard>
                </div>
                <ChartCard
                  title="Diesel por item"
                  description="Distribuicao operacional do diesel alocado"
                  height={340}
                  hasData={itemDonutData.length > 0}
                >
                  <ChartDonut data={itemDonutData} total={kpis.diesel} unit="L" />
                </ChartCard>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <ChartCard
                  title="Diesel diario por item"
                  description="Barras empilhadas por escavacao, transporte, tratamento e compactacao"
                  height={320}
                  hasData={itemStackedDaily.length > 0 && itemStackSeries.length > 0}
                >
                  <ChartStackedBars data={itemStackedDaily} series={itemStackSeries} />
                </ChartCard>
                <ChartCard
                  title="Ranking de itens por consumo"
                  description="Litros totais por item operacional"
                  height={320}
                  hasData={itemRankingData.length > 0}
                >
                  <ChartHBars
                    data={itemRankingData}
                    dataKey="diesel"
                    nameKey="id"
                    unit="L"
                    topN={itemRankingData.length}
                  />
                </ChartCard>
                <ChartCard
                  title="Ranking de itens por eficiencia"
                  description="m3 compactado base do periodo dividido pelo diesel de cada item"
                  height={320}
                  hasData={itemRankingData.some((row) => row.lpm3 > 0)}
                >
                  <ChartCompareBars
                    data={[...itemRankingData]
                      .filter((row) => row.lpm3 > 0)
                      .sort((a, b) => b.lpm3 - a.lpm3)}
                    dataKey="lpm3"
                    nameKey="id"
                    unit="m3/L"
                  />
                </ChartCard>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {itemSummaries
                  .filter((summary) => summary.item !== "outros")
                  .map((summary) => (
                    <button
                      key={summary.item}
                      type="button"
                      onClick={() => setActiveTab(summary.item)}
                      className="rounded border border-border-low bg-surface-container p-4 text-left transition-colors hover:border-primary/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-xs font-black uppercase tracking-widest">
                          {summary.label}
                        </h3>
                        <span className="rounded bg-surface-highest px-2 py-1 text-[10px] font-bold text-on-surface-variant">
                          Abrir
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-on-surface-variant">Diesel</p>
                          <p className="tnum font-black">{formatLiters(summary.diesel)}</p>
                        </div>
                        <div>
                          <p className="text-on-surface-variant">m3/L</p>
                          <p className="tnum font-black">{formatNumber(summary.fuelPerM3, 3)}</p>
                        </div>
                        <div>
                          <p className="text-on-surface-variant">Horas</p>
                          <p className="tnum font-black">{formatHours(summary.hours)}</p>
                        </div>
                        <div>
                          <p className="text-on-surface-variant">m3 base</p>
                          <p className="tnum font-black">{formatM3(summary.baseCompactedM3)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
              </div>

              <div className="rounded border border-border-low bg-surface-container p-4">
                <AnalysisHistoryPanel
                  analyses={analyses}
                  selectedIds={analysisSelection.selectedIds}
                  onSelect={handleSelectAnalysisIds}
                />
              </div>
            </div>
          )}

          {activeTab === "escavacao" && (
            <OperationalItemPanel
              summary={escavacaoSummary}
              stack={itemEquipmentStacks.get("escavacao") ?? EMPTY_ITEM_STACK}
            />
          )}

          {activeTab === "transporte" && (
            <OperationalItemPanel
              summary={transporteSummary}
              stack={itemEquipmentStacks.get("transporte") ?? EMPTY_ITEM_STACK}
            />
          )}

          {activeTab === "tratamento" && (
            <OperationalItemPanel
              summary={tratamentoSummary}
              stack={itemEquipmentStacks.get("tratamento") ?? EMPTY_ITEM_STACK}
            />
          )}

          {activeTab === "compactacao" && (
            <OperationalItemPanel
              summary={compactacaoSummary}
              stack={itemEquipmentStacks.get("compactacao") ?? EMPTY_ITEM_STACK}
            />
          )}

          {false && activeTab === "overview" && (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2">
                  <ChartCard
                    title="Produção × Consumo · diário"
                    description="m³ compactado, m³ solto e litros de diesel por dia"
                    height={340}
                    hasData={prodConsumoData.length > 0}
                  >
                    <ChartProdConsumo data={prodConsumoData} />
                  </ChartCard>
                </div>
                <ChartCard
                  title="Distribuição por obra"
                  description="Participação no volume compactado"
                  height={340}
                  hasData={obraDistribution.length > 0}
                >
                  <ChartDonut data={obraDistribution} total={kpis.compactedM3} unit="m³" />
                </ChartCard>
              </div>

              <div className="mt-4">
                <ChartCard
                  title="Top agregados por volume"
                  description="Ranking — m³ compactado por prefixo"
                  height={320}
                  hasData={aggregatesTop.length > 0}
                >
                  <ChartHBars
                    data={aggregatesTop}
                    dataKey="m3"
                    nameKey="id"
                    unit="m³"
                    topN={compareByObra ? aggregatesTop.length : 8}
                  />
                </ChartCard>
              </div>

              <div className="mt-5 rounded border border-border-low bg-surface-container p-4">
                <AnalysisHistoryPanel
                  analyses={analyses}
                  selectedIds={analysisSelection.selectedIds}
                  onSelect={handleSelectAnalysisIds}
                />
              </div>
            </>
          )}

          {activeTab === "production" && (
            <div className="space-y-4">
              <ChartCard
                title="Produção m³ solto × diesel"
                description="Barras: m³ solto por dia · linha: diesel total diário"
                height={360}
                hasData={
                  compareByObra
                    ? dailyObraComparisonData.length > 0
                    : producaoEmpoladaDieselData.length > 0
                }
              >
                {compareByObra ? (
                  <ChartVolumeLinePorObra
                    data={dailyObraComparisonData}
                    series={obraVolumeDieselSeries}
                    volumeName="m³ solto"
                    volumeUnit="m³"
                    lineName="diesel"
                    lineUnit="L"
                    volumeAxisLabel="m³ solto"
                    lineAxisLabel="L diesel"
                    linePrecision={0}
                  />
                ) : (
                  <ChartProducaoEmpoladaDiesel
                    data={producaoEmpoladaDieselData}
                    seriesLabel={visibleObras[0]}
                  />
                )}
              </ChartCard>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <ChartCard
                  title="Produção empilhada · m³ compactado × m³ solto"
                  description="Área stack — volume por dia"
                  height={320}
                  hasData={
                    compareByObra ? dailyObraComparisonData.length > 0 : prodConsumoData.length > 0
                  }
                >
                  {compareByObra ? (
                    <ChartMultiLine
                      data={dailyObraComparisonData}
                      series={obraCompactedM3Series}
                      unit="m³"
                      yLabel="m³ compactado"
                      precision={1}
                    />
                  ) : (
                    <ChartProdStack
                      data={prodConsumoData.map((d) => ({
                        d: d.d,
                        compactada: d.compactada,
                        solta: d.solta,
                      }))}
                    />
                  )}
                </ChartCard>
                <ChartCard
                  title="Volume por obra"
                  description="m³ compactado total"
                  height={320}
                  hasData={obraBarsData.length > 0}
                >
                  <ChartBars data={obraBarsData} dataKey="m3" nameKey="obra" unit="m³" />
                </ChartCard>
              </div>
            </div>
          )}

          {activeTab === "consumption" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ChartCard
                title="Diesel consumido por dia"
                description="Total de litros — série temporal"
                height={320}
                hasData={
                  compareByObra ? dailyObraComparisonData.length > 0 : dieselLineData.length > 0
                }
              >
                {compareByObra ? (
                  <ChartMultiLine
                    data={dailyObraComparisonData}
                    series={obraDieselSeries}
                    unit="L"
                    yLabel="L diesel"
                    precision={0}
                  />
                ) : (
                  <ChartLine
                    data={dieselLineData}
                    dataKey="diesel"
                    name="Diesel"
                    unit="L"
                    fillArea
                  />
                )}
              </ChartCard>
              <ChartCard
                title="Top equipamentos por consumo"
                description="Litros totais por equipamento"
                height={320}
                hasData={equipmentLitersData.length > 0}
              >
                <ChartHBars
                  data={equipmentLitersData}
                  dataKey="litros"
                  nameKey="id"
                  unit="L"
                  topN={compareByObra ? equipmentLitersData.length : 8}
                />
              </ChartCard>
            </div>
          )}

          {activeTab === "trucks" && (
            <>
              <ChartCard
                title="Agregados — produção e diesel"
                description="Ranking por m³ compactado com diesel total atribuído · Top 15"
                height={480}
                hasData={aggregateRankingData.length > 0}
              >
                <ChartAggregateRanking data={aggregateRankingData} topN={15} />
              </ChartCard>
              <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                <ChartCard
                  title="Ranking de viagens"
                  description="Total de viagens por agregado"
                  height={320}
                  hasData={aggregatesTop.length > 0}
                >
                  <ChartHBars
                    data={aggregatesTop}
                    dataKey="viagens"
                    nameKey="id"
                    unit=""
                    color="oklch(0.74 0.13 220)"
                    topN={compareByObra ? aggregatesTop.length : 8}
                  />
                </ChartCard>
                <ChartCard
                  title="Volume por agregado"
                  description="m³ compactado por prefixo"
                  height={320}
                  hasData={aggregatesTop.length > 0}
                >
                  <ChartHBars
                    data={aggregatesTop}
                    dataKey="m3"
                    nameKey="id"
                    unit="m³"
                    topN={compareByObra ? aggregatesTop.length : 8}
                  />
                </ChartCard>
              </div>
            </>
          )}

          {activeTab === "equipment" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ChartCard
                title="Horas trabalhadas · frota própria"
                description="Top 8 — PDE em horas"
                height={360}
                hasData={equipmentHoursData.length > 0}
              >
                <ChartHBars
                  data={equipmentHoursData}
                  dataKey="horas"
                  nameKey="id"
                  unit="h"
                  topN={compareByObra ? equipmentHoursData.length : 8}
                />
              </ChartCard>
              <ChartCard
                title="Diesel consumido · frota própria"
                description="Top 8 — litros por equipamento"
                height={360}
                hasData={equipmentLitersData.length > 0}
              >
                <ChartHBars
                  data={equipmentLitersData}
                  dataKey="litros"
                  nameKey="id"
                  unit="L"
                  color="oklch(0.74 0.13 220)"
                  topN={compareByObra ? equipmentLitersData.length : 8}
                />
              </ChartCard>
            </div>
          )}

          {activeTab === "efficiency" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <ChartCard
                  title="Eficiência diária · m³/L"
                  description="Produtividade por litro - maior e melhor"
                  height={320}
                  hasData={
                    compareByObra
                      ? dailyObraComparisonData.length > 0
                      : fuelPerM3LineData.length > 0
                  }
                >
                  {compareByObra ? (
                    <ChartMultiLine
                      data={dailyObraComparisonData}
                      series={obraFuelPerM3Series}
                      unit="m³/L"
                      yLabel="m³/L"
                      precision={2}
                    />
                  ) : (
                    <ChartLine
                      data={fuelPerM3LineData}
                      dataKey="lpm3"
                      name="m³/L"
                      unit="m³/L"
                      color="oklch(0.72 0.13 150)"
                      fillArea
                    />
                  )}
                </ChartCard>
                <ChartCard
                  title="Consumo por hora · L/h por equipamento"
                  description="Top 10 da frota própria"
                  height={320}
                  hasData={equipmentLPerHourData.length > 0}
                >
                  <ChartHBars
                    data={
                      compareByObra ? equipmentLPerHourData : equipmentLPerHourData.slice(0, 10)
                    }
                    dataKey="lph"
                    nameKey="equipamento"
                    unit="L/h"
                    color="oklch(0.72 0.13 150)"
                    topN={compareByObra ? equipmentLPerHourData.length : 10}
                  />
                </ChartCard>
              </div>

              {obraEfficiency.length > 1 && (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest mb-3">
                    Eficiência por Obra
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {obraEfficiency.map((o) => (
                      <div
                        key={o.obra}
                        className="rounded-lg border border-border-low bg-surface-container p-4"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-xs font-black uppercase tracking-widest truncate">
                            {o.obra}
                          </span>
                          <span
                            className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              o.score === "ótima"
                                ? "bg-status-success/15 text-status-success"
                                : o.score === "ruim"
                                  ? "bg-status-error/15 text-status-error"
                                  : "bg-status-warning/15 text-status-warning"
                            }`}
                          >
                            {o.score}
                          </span>
                        </div>
                        <div className="text-xs text-on-surface-variant space-y-0.5">
                          <div className="flex justify-between">
                            <span>m³ compactado</span>
                            <span className="tnum font-medium">{formatM3(o.compactedM3)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Diesel</span>
                            <span className="tnum font-medium">{formatLiters(o.liters)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>m³/L</span>
                            <span className="tnum font-medium">{formatNumber(o.lpm3, 3)} m³/L</span>
                          </div>
                          {o.avgLpm3 > 0 && (
                            <div className="flex justify-between pt-1 border-t border-border-low/60">
                              <span>vs média</span>
                              <span
                                className={`tnum font-bold ${
                                  o.delta > 0
                                    ? "text-status-success"
                                    : o.delta < 0
                                      ? "text-status-error"
                                      : "text-on-surface-variant"
                                }`}
                              >
                                {o.delta > 0 ? "+" : ""}
                                {formatNumber(o.delta, 1)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "hours" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3 rounded border border-border-low bg-surface-container p-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest">
                    Produção por hora e turno
                  </h3>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Registros brutos de DESCARGA do RCO por obra e data, em m³ solto.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    Data operacional
                    <select
                      value={productionDate}
                      onChange={(event) => setProductionDate(event.target.value)}
                      className="mt-1 block min-w-40 rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                    >
                      {productionDateOptions.map((date) => (
                        <option key={date} value={date}>
                          {formatDate(date)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {hoursObrasAvailable.length > 0 && (
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Obra
                      <select
                        value={hoursObraFilter}
                        onChange={(event) => setHoursObraFilter(event.target.value)}
                        className="mt-1 block min-w-48 rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                      >
                        <option value="all">Todas as obras da análise</option>
                        {hoursObrasAvailable.map((obra) => (
                          <option key={obra} value={obra}>
                            {obra}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>

              {!totalTimeSummary ? (
                <EmptyChartState
                  title="Sem viagens no período"
                  message="Não há horários de viagens disponíveis para os filtros selecionados."
                />
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                    <KpiCardCompact
                      label="Produção m³ solto do dia"
                      value={formatHourlyM3(totalTimeSummary.m3)}
                      icon="compress"
                    />
                    <KpiCardCompact
                      label="Viagens do dia"
                      value={String(totalTimeSummary.trips)}
                      icon="local_shipping"
                    />
                    <KpiCardCompact
                      label="Horas produtivas"
                      value={formatHours(totalTimeSummary.productiveHours)}
                      sub={`${totalTimeSummary.firstTrip} a ${totalTimeSummary.lastTrip}`}
                      icon="schedule"
                    />
                    <KpiCardCompact
                      label="Produção média/h"
                      value={
                        totalTimeSummary.productiveHours > 0
                          ? `${formatNumber(totalTimeSummary.productionPerHour, 2)} m³/h`
                          : "Dados insuficientes"
                      }
                      icon="query_stats"
                    />
                    <KpiCardCompact
                      label="Melhor hora"
                      value={totalTimeSummary.bestHour?.label ?? "—"}
                      sub={
                        totalTimeSummary.bestHour
                          ? `${formatHourlyM3(totalTimeSummary.bestHour.m3)} · ${totalTimeSummary.bestHour.trips} viagens`
                          : undefined
                      }
                      icon="schedule"
                    />
                    <KpiCardCompact
                      label="Melhor turno"
                      value={totalTimeSummary.bestShift?.label ?? "—"}
                      sub={
                        totalTimeSummary.bestShift
                          ? `${formatHourlyM3(totalTimeSummary.bestShift.m3)} · ${totalTimeSummary.bestShift.trips} viagens`
                          : undefined
                      }
                      icon="insights"
                    />
                    <KpiCardCompact
                      label="Pico de viagens"
                      value={totalTimeSummary.bestTripHour?.label ?? "—"}
                      sub={
                        totalTimeSummary.bestTripHour
                          ? `${totalTimeSummary.bestTripHour.trips} viagens · ${formatHourlyM3(totalTimeSummary.bestTripHour.m3)}`
                          : undefined
                      }
                      icon="local_shipping"
                    />
                    <KpiCardCompact
                      label="Obra destaque"
                      value={timeSummaries[0]?.obra ?? "—"}
                      sub={
                        timeSummaries[0]
                          ? `${formatHourlyM3(timeSummaries[0].m3)} · ${timeSummaries[0].trips} viagens`
                          : undefined
                      }
                      icon="leaderboard"
                    />
                  </div>

                  <ChartCard
                    title="Produção por hora"
                    description="m³ solto e viagens por faixa horária de descarga"
                    height={380}
                    hasData={hourlyProductionData.length > 0}
                  >
                    <ChartHourlyProduction
                      data={hourlyProductionData}
                      series={hourlyProductionSeries}
                    />
                  </ChartCard>

                  {timeSummaries.length > 1 && (
                    <div className="rounded border border-border-low bg-surface-container p-4">
                      <h3 className="text-xs font-black uppercase tracking-widest mb-3">
                        Comparação entre obras · {formatDate(productionDate)}
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border-low text-on-surface-variant">
                              <th className="py-2 pr-4 text-left font-black uppercase">Hora</th>
                              {timeSummaries.map((summary) => (
                                <th
                                  key={summary.obra}
                                  className="py-2 pr-4 text-right font-black uppercase"
                                >
                                  {summary.obra}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {totalTimeSummary.hourly.map((hour) => (
                              <tr key={hour.hour} className="border-b border-border-low/40">
                                <td className="py-2 pr-4 tnum">{hour.label}</td>
                                {timeSummaries.map((summary) => {
                                  const item = summary.hourly.find((row) => row.hour === hour.hour);
                                  return (
                                    <td key={summary.obra} className="py-2 pr-4 text-right tnum">
                                      {item
                                        ? `${formatHourlyM3(item.m3)} · ${item.trips} viag.`
                                        : "—"}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {timeSummaries.map((summary) => {
                      const diesel = dailyDieselByObra.get(normalizeObraName(summary.obra));
                      return (
                        <div
                          key={summary.obra}
                          className="rounded border border-border-low bg-surface-container p-4"
                        >
                          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-black uppercase tracking-widest">
                                {summary.obra}
                              </h3>
                              <p className="mt-1 text-xs text-on-surface-variant">
                                Produção: {formatHourlyM3(summary.m3)} · Viagens: {summary.trips} ·{" "}
                                {summary.firstTrip} a {summary.lastTrip}
                              </p>
                            </div>
                            <div className="text-right text-xs text-on-surface-variant">
                              <p>
                                {summary.productiveHours > 0
                                  ? `${formatNumber(summary.productionPerHour, 2)} m³/h`
                                  : "Dados insuficientes"}
                              </p>
                              {diesel !== undefined && <p>{formatLiters(diesel)} diesel</p>}
                              <p>{summary.aggregates.length} agregado(s)</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <ShiftProductionCard shift={summary.shifts.matutino} />
                            <ShiftProductionCard shift={summary.shifts.vespertino} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded border border-border-low bg-surface-container p-4">
                    <h3 className="text-xs font-black uppercase tracking-widest mb-3">
                      Detalhamento por faixa horária
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border-low text-on-surface-variant">
                            {[
                              "Hora",
                              "Obra",
                              "Material",
                              "Viagens",
                              "m³ solto",
                              "m³/h estimado",
                            ].map((label) => (
                              <th key={label} className="py-2 pr-4 text-left font-black uppercase">
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {timeSummaries.flatMap((summary) =>
                            summary.hourly.map((hour) => (
                              <tr
                                key={`${summary.obra}:${hour.hour}`}
                                className="border-b border-border-low/40"
                              >
                                <td className="py-2 pr-4 tnum">{hour.label}</td>
                                <td className="py-2 pr-4">{summary.obra}</td>
                                <td className="py-2 pr-4">{hour.materials.join(", ") || "—"}</td>
                                <td className="py-2 pr-4 tnum">{hour.trips}</td>
                                <td className="py-2 pr-4 tnum">{formatHourlyM3(hour.m3)}</td>
                                <td className="py-2 pr-4 tnum">{formatNumber(hour.m3, 2)} m³/h</td>
                              </tr>
                            )),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {showTechnicalAudit && (
            <>
              <div className="mt-6 mb-4 flex items-center gap-2 border-t border-border-low pt-5">
                <Icon name="fact_check" className="text-on-surface-variant" />
                <h2 className="text-sm font-black uppercase tracking-widest">Auditoria técnica</h2>
              </div>
              <div className="rounded border border-border-low bg-surface-container overflow-hidden">
                <div className="p-3 border-b border-border-low">
                  <h3 className="text-xs font-black uppercase tracking-widest">
                    Origem dos numeros por item ({technicalAuditRows.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border-low bg-surface-low">
                        <th className="px-3 py-2 text-left font-black uppercase">Item</th>
                        <th className="px-3 py-2 text-left font-black uppercase">Equipamento</th>
                        <th className="px-3 py-2 text-left font-black uppercase">Tipo</th>
                        <th className="px-3 py-2 text-right font-black uppercase">Horas</th>
                        <th className="px-3 py-2 text-right font-black uppercase">Diesel</th>
                        <th className="px-3 py-2 text-right font-black uppercase">m3 relacionado</th>
                        <th className="px-3 py-2 text-right font-black uppercase">m3 rateado</th>
                        <th className="px-3 py-2 text-right font-black uppercase">m3/L</th>
                        <th className="px-3 py-2 text-left font-black uppercase">Origem diesel</th>
                        <th className="px-3 py-2 text-left font-black uppercase">Origem m3</th>
                        <th className="px-3 py-2 text-left font-black uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {technicalAuditRows.slice(0, 80).map((row) => (
                        <tr
                          key={`${row.item}:${row.equipmentKey}`}
                          className="border-b border-border-low/40"
                          title={`${row.reason} | ${row.classificationReason}`}
                        >
                          <td className="px-3 py-2">{row.itemLabel}</td>
                          <td className="px-3 py-2 font-semibold">{row.equipmentLabel}</td>
                          <td className="px-3 py-2">{row.kind === "aggregate" ? "Agregado" : "Frota"}</td>
                          <td className="px-3 py-2 text-right tnum">{formatNumber(row.hours, 2)}</td>
                          <td className="px-3 py-2 text-right tnum">{formatNumber(row.diesel, 2)} L</td>
                          <td className="px-3 py-2 text-right tnum">{formatNumber(row.m3, 2)}</td>
                          <td className="px-3 py-2 text-right tnum">{formatNumber(row.m3Relacionado, 2)}</td>
                          <td className="px-3 py-2 text-right tnum">{formatNumber(row.m3PerLiter, 3)}</td>
                          <td className="px-3 py-2">{row.dieselSource}</td>
                          <td className="px-3 py-2">{row.m3Source}</td>
                          <td className="px-3 py-2">{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-5 rounded border border-border-low bg-surface-container overflow-hidden">
                <div className="p-3 border-b border-border-low">
                  <h3 className="text-xs font-black uppercase tracking-widest">
                    Fluxo de diesel por equipamento
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border-low bg-surface-low">
                        <th className="px-3 py-2 text-left font-black uppercase">Equipamento</th>
                        <th className="px-3 py-2 text-right font-black uppercase">CMB bruto</th>
                        <th className="px-3 py-2 text-right font-black uppercase">Allocation</th>
                        <th className="px-3 py-2 text-right font-black uppercase">Attributed</th>
                        <th className="px-3 py-2 text-right font-black uppercase">Dashboard</th>
                        <th className="px-3 py-2 text-right font-black uppercase">Grafico</th>
                        <th className="px-3 py-2 text-right font-black uppercase">Dif. alloc/dash</th>
                        <th className="px-3 py-2 text-left font-black uppercase">Auditoria</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dieselFlowAuditRows.slice(0, 80).map((row) => (
                        <tr key={row.equipmentKey} className="border-b border-border-low/40">
                          <td className="px-3 py-2 font-semibold">{row.equipmentLabel}</td>
                          <td className="px-3 py-2 text-right tnum">{formatNumber(row.fuelingLiters, 2)} L</td>
                          <td className="px-3 py-2 text-right tnum">{formatNumber(row.allocatedLiters, 2)} L</td>
                          <td className="px-3 py-2 text-right tnum">{formatNumber(row.attributedLiters, 2)} L</td>
                          <td className="px-3 py-2 text-right tnum">{formatNumber(row.itemSummaryLiters, 2)} L</td>
                          <td className="px-3 py-2 text-right tnum">{formatNumber(row.stackedChartLiters, 2)} L</td>
                          <td className="px-3 py-2 text-right tnum">
                            {formatNumber(row.diffAllocationToDashboard, 2)} L
                          </td>
                          <td className="px-3 py-2">{row.auditTypes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {operationalAlerts.length === 0 ? (
                <EmptyChartState
                  title="Sem alertas"
                  message="Nenhuma inconsistência detectada nos dados atuais."
                />
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="xl:col-span-2 rounded-lg border border-status-warning/40 bg-surface-container p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Icon name="warning" className="text-status-warning" />
                      <h3 className="text-sm font-black uppercase tracking-widest">
                        Alertas operacionais ({operationalAlerts.length})
                      </h3>
                    </div>
                    <ul className="space-y-2 text-sm text-on-surface-variant">
                      {operationalAlerts.map((a) => (
                        <li
                          key={a}
                          className="rounded border border-border-low bg-surface-low p-2 leading-relaxed"
                        >
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <ChartCard
                    title="Status da frota"
                    description="Equipamentos por estado de auditoria"
                    height={360}
                    hasData={auditDonutData.length > 0}
                  >
                    <ChartDonut data={auditDonutData} total={auditDonutTotal} unit="equipamentos" />
                  </ChartCard>
                </div>
              )}

              {obraScopedTripRows.length > 0 && (
                <div className="mt-5 rounded border border-border-low bg-surface-container overflow-hidden">
                  <div className="p-3 border-b border-border-low">
                    <h3 className="text-xs font-black uppercase tracking-widest">
                      Viagens importadas ({obraScopedTripRows.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border-low bg-surface-low">
                          <th className="px-3 py-2 text-left font-black uppercase">Data</th>
                          <th className="px-3 py-2 text-left font-black uppercase">Agregado</th>
                          <th className="px-3 py-2 text-left font-black uppercase">Obra</th>
                          <th className="px-3 py-2 text-right font-black uppercase">
                            m³ compactado
                          </th>
                          <th className="px-3 py-2 text-right font-black uppercase">R$</th>
                        </tr>
                      </thead>
                      <tbody>
                        {obraScopedTripRows
                          .slice(tripPage * PAGE_SIZE, (tripPage + 1) * PAGE_SIZE)
                          .map((trip) => (
                            <tr key={trip.id} className="border-b border-border-low/40">
                              <td className="px-3 py-2">{formatDate(trip.datetime)}</td>
                              <td className="px-3 py-2 tnum">
                                {trip.prefix || trip.vehicleId || trip.plate}
                              </td>
                              <td className="px-3 py-2">{trip.obra}</td>
                              <td className="px-3 py-2 text-right tnum">
                                {formatNumber(
                                  calculateCompactedVolume(
                                    trip.cubicMLoose || 0,
                                    trip.swellFactorApplied,
                                  ),
                                  1,
                                )}
                              </td>
                              <td className="px-3 py-2 text-right tnum">{formatBRL(trip.total)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center p-3 border-t border-border-low">
                    <span className="text-xs text-on-surface-variant">
                      Página {tripPage + 1} de {Math.ceil(obraScopedTripRows.length / PAGE_SIZE)}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={tripPage === 0}
                        onClick={tripPrevPage}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={tripPage >= Math.ceil(obraScopedTripRows.length / PAGE_SIZE) - 1}
                        onClick={tripNextPage}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : null}

      {showCreate && (
        <Suspense fallback={null}>
          <CarcaraImportDialog
            onClose={() => setShowCreate(false)}
            onSuccess={handleCreated}
            onCreatingChange={(isCreating) =>
              setDashboardLoading((current) => ({
                ...current,
                isCreatingAnalysis: isCreating,
              }))
            }
            isSynchronizing={
              dashboardLoading.isHydratingAnalysis || dashboardLoading.isReloadingDashboard
            }
            syncLabel={dashboardBusyLabel}
            userName={user?.name ?? ""}
          />
        </Suspense>
      )}

      {analysesModal.isOpen && (
        <AnalysesDialog
          isOpen={analysesModal.isOpen}
          analyses={analyses}
          selectedIds={analysisSelection.selectedIds}
          onClose={analysesModal.close}
          onSelect={handleSelectAnalysisIds}
          onDelete={handleDeleteAnalysis}
        />
      )}
    </AppLayout>
  );
}

function DashboardLoadingPanel({ label }: { label: string }) {
  return (
    <div className="rounded border border-border-low bg-surface-container p-10 text-center">
      <Icon name="sync" className="animate-spin text-4xl text-primary" />
      <p className="mt-4 text-sm font-black uppercase tracking-widest">{label}</p>
      <p className="mt-1 text-xs text-on-surface-variant">
        Consolidando viagens, diesel, producao, PDE e financeiro da analise ativa.
      </p>
    </div>
  );
}

function DashboardErrorPanel({ error }: { error: unknown }) {
  return (
    <div className="rounded border border-status-error/40 bg-status-error/10 p-6">
      <div className="flex items-center gap-2">
        <Icon name="error" className="text-status-error" />
        <p className="text-sm font-black uppercase tracking-widest">
          Nao foi possivel carregar a dashboard
        </p>
      </div>
      <p className="mt-2 text-xs text-on-surface-variant">
        {error instanceof Error ? error.message : "Tente novamente."}
      </p>
    </div>
  );
}


