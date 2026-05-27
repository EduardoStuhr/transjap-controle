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
import {
  listFuelAttributionFn,
  recalculateFuelFn,
} from "@/lib/api/fuel-attribution";

import { ChartCard } from "@/components/charts/ChartCard";
import {
  ChartAggregateRanking,
  ChartBars,
  ChartDonut,
  ChartHBars,
  ChartHourlyProduction,
  ChartLine,
  ChartMultiLine,
  ChartProducaoEmpoladaDiesel,
  ChartProdConsumo,
  ChartProdStack,
  ChartVolumeLinePorObra,
  type AggregateRankingPoint,
} from "@/components/charts/Charts";
import { EmptyChartState } from "@/components/charts/ProductionConsumptionCharts";
import { CHART_SERIES_COLORS } from "@/lib/chart-theme";

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

function equipmentKey(row: { prefix?: string | null; vehicleId?: string | null; plate?: string | null }) {
  return row.prefix || row.vehicleId || row.plate || "SEM_EQUIPAMENTO";
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
            <span className="text-right tnum font-semibold">{formatHours(shift.productiveHours)}</span>
            <span className="text-on-surface-variant">Viagens</span>
            <span className="text-right tnum font-semibold">{shift.trips}</span>
            <span className="text-on-surface-variant">Produção</span>
            <span className="text-right tnum font-semibold">{formatHourlyM3(shift.m3)}</span>
            <span className="text-on-surface-variant">Produção/hora</span>
            <span className="text-right tnum font-semibold">
              {shift.productiveHours > 0 ? `${formatNumber(shift.productionPerHour, 2)} m³/h` : "Dados insuficientes"}
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
      fuelAttributions: [],
    };
  }

  throwIfAborted(signal);
  const [tripsResult, fuelResult, dailyPartResult, attrResult] = await Promise.all([
    listTrips({ data: { analysisIds: normalizedIds } }),
    listFueling({ data: { analysisIds: normalizedIds } }),
    listDailyParts({ data: { analysisIds: normalizedIds } }),
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
    fuelAttributions: (attrResult as DbFuelAttribution[]).filter((row) =>
      sourceBelongsToAnalyses(row.sourceFuelingId, allowedIds),
    ),
  };
}

const TAB_IDS_VISIBLE = [
  "overview",
  "production",
  "consumption",
  "trucks",
  "equipment",
  "efficiency",
  "hours",
] as const;

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
  const { activeTab, setActiveTab, tabs } = useDashboardTabs();
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
    () => uniqueNormalizedObras(analysisSelection.selectedAnalyses.map((analysis) => analysis.obra)),
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
  const obraScopedFuelAttrRows = useMemo(
    () => scopeRowsToSelectedObras(fuelAttrRows, selectedObraLabels),
    [fuelAttrRows, selectedObraLabels],
  );

  const {
    page: tripPage,
    nextPage: tripNextPage,
    prevPage: tripPrevPage,
  } = usePagination(obraScopedTripRows.length, PAGE_SIZE);

  const visibleTabs = useMemo(
    () => tabs.filter((t) => TAB_IDS_VISIBLE.includes(t.id as (typeof TAB_IDS_VISIBLE)[number])),
    [tabs],
  );

  const { filteredTrips, filteredFueling, filteredDailyParts } = useFilteredData(
    obraScopedTripRows,
    obraScopedFuelRows,
    obraScopedDailyPartRows,
    filters,
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
    () => uniqueValues(filteredTrips.map((t) => t.material)),
    [filteredTrips],
  );
  const distinctEquipment = useMemo(
    () =>
      uniqueValues([
        ...filteredFueling.map((f) => equipmentKey(f)),
        ...filteredDailyParts.map((p) => p.fleet),
      ]),
    [filteredDailyParts, filteredFueling],
  );
  const distinctAggregates = useMemo(
    () => uniqueValues(filteredTrips.map((t) => equipmentKey(t))),
    [filteredTrips],
  );

  const filteredAttributions = useMemo(() => {
    return obraScopedFuelAttrRows.filter((row) => {
      if (filters.dateFrom && row.date < filters.dateFrom) return false;
      if (filters.dateTo && row.date > filters.dateTo) return false;
      if (filters.obra !== "all" && !obraMatches(row.obra, filters.obra)) return false;
      return true;
    });
  }, [obraScopedFuelAttrRows, filters.dateFrom, filters.dateTo, filters.obra]);

  const attributedFueling = useMemo<DbFueling[]>(() => {
    if (filteredAttributions.length === 0) return filteredFueling;
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
  }, [filteredAttributions, filteredFueling]);

  const dailyMetricsMap = useMemo(
    () => calculateDailyMetrics(filteredTrips, attributedFueling),
    [attributedFueling, filteredTrips],
  );
  const dailyData = useMemo(
    () => Array.from(dailyMetricsMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    [dailyMetricsMap],
  );

  const kpis = useMemo(
    () => calculateOperationalKPIs(filteredTrips, attributedFueling, filteredDailyParts),
    [attributedFueling, filteredDailyParts, filteredTrips],
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
        if (filters.aggregate !== "all" && equipmentKey(trip) !== filters.aggregate) return false;
        return true;
      }),
    [
      filters.aggregate,
      filters.dateFrom,
      filters.dateTo,
      filters.material,
      hourlyAnalysisTrips,
    ],
  );

  useEffect(() => {
    if (!import.meta.env.DEV || activeTab !== "hours" || hourlyTripsWithActiveFilters.length === 0) {
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
      .filter(
        (trip) => parseRcoOperationalDateTime(trip.datetime)?.date === productionDate,
      )
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
        if (filters.aggregate !== "all" && equipmentKey(trip) !== filters.aggregate) return false;
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
        row[`obra${index}M3`] =
          summary.hourly.find((item) => item.hour === hour.hour)?.m3 ?? 0;
      });
      return row;
    });
  }, [timeSummaries, totalTimeSummary]);

  const aggregateMetrics = useMemo(
    () => calculateAggregateMetrics(filteredTrips, kpis.compactedM3),
    [filteredTrips, kpis.compactedM3],
  );

  const equipmentMetrics = useMemo(
    () => calculateEquipmentMetrics(attributedFueling, filteredDailyParts),
    [filteredDailyParts, attributedFueling],
  );

  const obraComparison = useMemo(
    () =>
      comparisonSeries.map((series) => {
        const trips = filteredTrips.filter(
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
    [attributedFueling, comparisonSeries, filteredDailyParts, filteredTrips],
  );

  const dailyObraComparisonData = useMemo(() => {
    const rows = new Map<string, Record<string, unknown>>();

    obraComparison.forEach((obra) => {
      obra.daily.forEach((day) => {
        const row = rows.get(day.date) ?? { date: day.date, d: day.label };
        row[obra.compactedKey] = day.compactedM3;
        row[obra.looseKey] = day.looseM3;
        row[obra.dieselKey] = day.diesel;
        if (day.compactedM3 > 0) row[obra.fuelPerM3Key] = day.diesel / day.compactedM3;
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

  const obraDistribution = useMemo(() => calculateObraDistribution(filteredTrips), [filteredTrips]);

  const operationalAlerts = useMemo(
    () =>
      detectOperationalAlerts(
        filteredTrips,
        filteredFueling,
        equipmentMetrics.map((e) => ({
          equipment: e.equipment,
          hours: e.hours,
          liters: e.liters,
        })),
      ),
    [equipmentMetrics, filteredFueling, filteredTrips],
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
    filteredTrips.forEach((trip) => {
      const key = normalizeObraKey(trip.obra);
      const cur = tripsByKey.get(key) ?? { obra: trip.obra || "Sem obra", compactedM3: 0, trips: 0 };
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
    const avgLpm3 = totalM3 > 0 ? totalLiters / totalM3 : 0;

    return [...tripsByKey.entries()]
      .map(([key, data]) => {
        const liters = litersByKey.get(key) ?? 0;
        const lpm3 = data.compactedM3 > 0 ? liters / data.compactedM3 : 0;
        const delta = avgLpm3 > 0 ? ((lpm3 - avgLpm3) / avgLpm3) * 100 : 0;
        const score: "ótima" | "média" | "ruim" =
          delta < -10 ? "ótima" : delta < 10 ? "média" : "ruim";
        return { obra: data.obra, compactedM3: data.compactedM3, liters, lpm3, avgLpm3, delta, score };
      })
      .filter((o) => o.compactedM3 > 0)
      .sort((a, b) => a.lpm3 - b.lpm3);
  }, [filteredTrips, attributedFueling]);

  const obraBarsData = useMemo(
    () => obraDistribution.map((o) => ({ obra: o.name, m3: o.value })),
    [obraDistribution],
  );

  const aggregatesTop = useMemo(
    () => {
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
    },
    [aggregateMetrics, compareByObra, obraComparison],
  );

  const equipmentHoursData = useMemo(
    () => {
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
    },
    [compareByObra, equipmentMetrics, obraComparison],
  );

  const equipmentLitersData = useMemo(
    () => {
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
    },
    [compareByObra, equipmentMetrics, obraComparison],
  );

  const equipmentLPerHourData = useMemo(
    () => {
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
    },
    [compareByObra, equipmentMetrics, obraComparison],
  );

  const aggregateRankingData: AggregateRankingPoint[] = useMemo(
    () => {
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
    },
    [aggregateMetrics, compareByObra, kpis.diesel, obraComparison, visibleObras],
  );

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
      const r = await recalculateFuelFn({ data: {} });
      toast.success(
        `Rateio recalculado: ${r.totalAttributions} atribuicoes, ${r.fleetsProcessed} frotas`,
      );
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
            <KpiCardCompact
              label="Custo Diesel"
              value={formatBRL(kpis.fuelCost)}
              icon="payments"
            />
            <KpiCardCompact label="Viagens" value={String(kpis.trips)} icon="local_shipping" />
            {activeTab === "efficiency" ? (
              <KpiCardCompact label="L/m³" value={formatNumber(kpis.fuelPerM3, 2)} icon="speed" />
            ) : (
              <KpiCardCompact label="Produção m³ solto" value={formatM3(kpis.looseM3)} icon="compress" />
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
                  <ChartDonut
                    data={obraDistribution}
                    total={kpis.compactedM3}
                    unit="m³"
                  />
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
                title="Eficiência diária · L/m³"
                description="Consumo específico — menor é melhor"
                height={320}
                hasData={
                  compareByObra ? dailyObraComparisonData.length > 0 : fuelPerM3LineData.length > 0
                }
              >
                {compareByObra ? (
                  <ChartMultiLine
                    data={dailyObraComparisonData}
                    series={obraFuelPerM3Series}
                    unit="L/m³"
                    yLabel="L/m³"
                    precision={2}
                  />
                ) : (
                  <ChartLine
                    data={fuelPerM3LineData}
                    dataKey="lpm3"
                    name="L/m³"
                    unit="L/m³"
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
                  data={compareByObra ? equipmentLPerHourData : equipmentLPerHourData.slice(0, 10)}
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
                          <span>L/m³</span>
                          <span className="tnum font-medium">{formatNumber(o.lpm3, 3)} L/m³</span>
                        </div>
                        {o.avgLpm3 > 0 && (
                          <div className="flex justify-between pt-1 border-t border-border-low/60">
                            <span>vs média</span>
                            <span
                              className={`tnum font-bold ${
                                o.delta < 0
                                  ? "text-status-success"
                                  : o.delta > 0
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
                                <th key={summary.obra} className="py-2 pr-4 text-right font-black uppercase">
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
                            {["Hora", "Obra", "Material", "Viagens", "m³ solto", "m³/h estimado"].map((label) => (
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
                                <td className="py-2 pr-4">
                                  {hour.materials.join(", ") || "—"}
                                </td>
                                <td className="py-2 pr-4 tnum">{hour.trips}</td>
                                <td className="py-2 pr-4 tnum">{formatHourlyM3(hour.m3)}</td>
                                <td className="py-2 pr-4 tnum">
                                  {formatNumber(hour.m3, 2)} m³/h
                                </td>
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
                    <ChartDonut
                      data={auditDonutData}
                      total={auditDonutTotal}
                      unit="equipamentos"
                    />
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
                          <th className="px-3 py-2 text-right font-black uppercase">m³ compactado</th>
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
                                  calculateCompactedVolume(trip.cubicMLoose || 0, trip.swellFactorApplied),
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
                        disabled={
                          tripPage >= Math.ceil(obraScopedTripRows.length / PAGE_SIZE) - 1
                        }
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
