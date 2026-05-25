/**
 * Dashboard Produção × Consumo (VIZ-1)
 * Template app_transjap aplicado — paleta OKLCH + 8 gráficos do template
 * em 8 abas dedicadas.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
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
  ChartBars,
  ChartBubble,
  ChartDieselPorM3Empolado,
  ChartDonut,
  ChartHBars,
  ChartLine,
  ChartMultiLine,
  ChartProdConsumo,
  ChartProdStack,
  ChartVolumeLinePorObra,
  type BubblePoint,
} from "@/components/charts/Charts";
import { EmptyChartState } from "@/components/charts/ProductionConsumptionCharts";
import { CHART_SERIES_COLORS } from "@/lib/chart-theme";

import {
  DashboardFilters,
  DashboardTabs,
  KpiCardCompact,
} from "@/components/charts/DashboardFilters";
import { MyAnalysesDialog, AnalysisHistoryPanel } from "@/components/charts/AnalysisSelector";
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
  calculateOperationalKPIs,
  calculateAggregateMetrics,
  calculateEquipmentMetrics,
  calculateObraDistribution,
  detectOperationalAlerts,
} from "@/lib/production-consumption-calculations";
import {
  formatDate,
  formatBRL,
  formatM3,
  formatLiters,
  formatNumber,
  uniqueValues,
} from "@/lib/production-consumption-utils";
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
  key: string;
  color: string;
  compactedKey: string;
  looseKey: string;
  dieselKey: string;
  fuelPerM3Key: string;
  fuelPerLooseM3Key: string;
};

function normalizeObraName(value: string | null | undefined) {
  return value?.trim() || "Sem obra";
}

function equipmentKey(row: { prefix?: string | null; vehicleId?: string | null; plate?: string | null }) {
  return row.prefix || row.vehicleId || row.plate || "SEM_EQUIPAMENTO";
}

function withObraLabel(label: string, obra: string) {
  return `${label} · ${obra}`;
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
  "audit",
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

  const {
    page: tripPage,
    nextPage: tripNextPage,
    prevPage: tripPrevPage,
  } = usePagination(tripRows.length, PAGE_SIZE);

  const visibleTabs = useMemo(
    () => tabs.filter((t) => TAB_IDS_VISIBLE.includes(t.id as (typeof TAB_IDS_VISIBLE)[number])),
    [tabs],
  );

  const { filteredTrips, filteredFueling, filteredDailyParts } = useFilteredData(
    tripRows,
    fuelRows,
    dailyPartRows,
    filters,
  );

  const distinctObras = useMemo(
    () =>
      uniqueValues([
        ...filteredTrips.map((t) => t.obra?.trim()),
        ...filteredFueling.map((f) => f.obra?.trim()),
        ...filteredDailyParts.map((p) => p.obra?.trim()),
      ]),
    [filteredDailyParts, filteredFueling, filteredTrips],
  );
  const compareByObra = filters.obra === "all" && distinctObras.length > 1;
  const comparisonSeries = useMemo<ComparisonSeries[]>(
    () =>
      compareByObra
        ? distinctObras.map((obra, index) => ({
            obra,
            key: `obra${index}`,
            color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
            compactedKey: `obra${index}CompactedM3`,
            looseKey: `obra${index}LooseM3`,
            dieselKey: `obra${index}Diesel`,
            fuelPerM3Key: `obra${index}FuelPerM3`,
            fuelPerLooseM3Key: `obra${index}FuelPerLooseM3`,
          }))
        : [],
    [compareByObra, distinctObras],
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
    return fuelAttrRows.filter((row) => {
      if (filters.dateFrom && row.date < filters.dateFrom) return false;
      if (filters.dateTo && row.date > filters.dateTo) return false;
      if (filters.obra !== "all" && row.obra && row.obra !== filters.obra) return false;
      return true;
    });
  }, [fuelAttrRows, filters.dateFrom, filters.dateTo, filters.obra]);

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
        const trips = filteredTrips.filter((trip) => normalizeObraName(trip.obra) === series.obra);
        const fueling = attributedFueling.filter(
          (fuel) => normalizeObraName(fuel.obra) === series.obra,
        );
        const dailyParts = filteredDailyParts.filter(
          (part) => normalizeObraName(part.obra) === series.obra,
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
        if (day.looseM3 > 0) row[obra.fuelPerLooseM3Key] = day.diesel / day.looseM3;
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

  const obraVolumeFuelPerLooseM3Series = useMemo(
    () =>
      obraComparison.map((obra) => ({
        obra: obra.obra,
        color: obra.color,
        volumeKey: obra.looseKey,
        lineKey: obra.fuelPerLooseM3Key,
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

  const dieselPorM3EmpoladoData = useMemo(
    () =>
      dailyData.map((d) => ({
        d: d.label,
        m3Empolado: d.looseM3,
        diesel: d.diesel,
        litrosPorM3Empolado: d.looseM3 > 0 ? Number((d.diesel / d.looseM3).toFixed(3)) : 0,
      })),
    [dailyData],
  );

  const mediaDieselPorM3Empolado = useMemo(() => {
    const totalM3Empolado = dailyData.reduce((sum, d) => sum + d.looseM3, 0);
    const totalDiesel = dailyData.reduce((sum, d) => sum + d.diesel, 0);
    return totalM3Empolado > 0 ? totalDiesel / totalM3Empolado : 0;
  }, [dailyData]);

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

  // Bubble: agregados — eficiência (m³ × viagens × R$)
  const bubbleData: BubblePoint[] = useMemo(
    () => {
      if (compareByObra) {
        return obraComparison
          .flatMap((obra) =>
            obra.aggregateMetrics.map((a) => ({
              ...a,
              obra: obra.obra,
              dieselBase: obra.kpis.diesel,
            })),
          )
          .filter((a) => a.compactedM3 > 0)
          .map((a) => {
            const proxyDiesel = (a.dieselBase * a.participation) / 100;
            return {
              name: a.aggregate,
              tipo: a.obra,
              horas: a.trips,
              m3: a.compactedM3,
              diesel: proxyDiesel,
              lPorM3: proxyDiesel > 0 ? proxyDiesel / a.compactedM3 : 0,
            };
          });
      }

      return aggregateMetrics
        .filter((a) => a.compactedM3 > 0)
        .map((a) => {
          // Proxy de "diesel" por agregado: dividir o consumo total proporcional à participação.
          const proxyDiesel = (kpis.diesel * a.participation) / 100;
          return {
            name: a.aggregate,
            tipo: "agregado",
            horas: a.trips,
            m3: a.compactedM3,
            diesel: proxyDiesel,
            lPorM3: proxyDiesel > 0 ? proxyDiesel / a.compactedM3 : 0,
          };
        });
    },
    [aggregateMetrics, compareByObra, kpis.diesel, obraComparison],
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
    const nextIds = [analysisId];
    const nextKey = analysisIdsKey(nextIds);

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
            Minhas Análises
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
            obras={distinctObras}
            materials={distinctMaterials}
            equipment={distinctEquipment}
            aggregates={distinctAggregates}
            loading={loading}
          />

          <DashboardTabs tabs={visibleTabs} activeTab={activeTab} onChange={setActiveTab} />

          {/* KPI strip */}
          <div className="mb-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KpiCardCompact
              label="Produção m³"
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
            <KpiCardCompact label="L/m³" value={formatNumber(kpis.fuelPerM3, 2)} icon="speed" />
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
                    hasData={
                      compareByObra
                        ? dailyObraComparisonData.length > 0
                        : prodConsumoData.length > 0
                    }
                  >
                    {compareByObra ? (
                      <ChartVolumeLinePorObra
                        data={dailyObraComparisonData}
                        series={obraVolumeDieselSeries}
                        volumeName="m³ empolado"
                        volumeUnit="m³"
                        lineName="diesel"
                        lineUnit="L"
                        volumeAxisLabel="m³ empolado"
                        lineAxisLabel="L diesel"
                        linePrecision={0}
                      />
                    ) : (
                      <ChartProdConsumo data={prodConsumoData} />
                    )}
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
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ChartCard
                title="Produção empilhada · compactada × solta"
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
                title="Frota agregada — eficiência"
                description="Bolha: viagens × m³ compactado · tamanho = litros diesel atribuídos"
                height={420}
                hasData={bubbleData.length > 0}
              >
                <ChartBubble data={bubbleData} />
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
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="xl:col-span-2">
                <ChartCard
                  title="Diesel por m³ empolado"
                  description="Barras: produção empolada por dia · linha: litros por m³ empolado"
                  height={360}
                  hasData={
                    compareByObra
                      ? dailyObraComparisonData.length > 0
                      : dieselPorM3EmpoladoData.length > 0
                  }
                >
                  {compareByObra ? (
                    <ChartVolumeLinePorObra
                      data={dailyObraComparisonData}
                      series={obraVolumeFuelPerLooseM3Series}
                      volumeName="m³ empolado"
                      volumeUnit="m³"
                      lineName="L/m³ empolado"
                      lineUnit="L/m³"
                      volumeAxisLabel="m³ empolado"
                      lineAxisLabel="L/m³"
                      linePrecision={2}
                    />
                  ) : (
                    <ChartDieselPorM3Empolado
                      data={dieselPorM3EmpoladoData}
                      media={mediaDieselPorM3Empolado}
                    />
                  )}
                </ChartCard>
              </div>
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
          )}

          {activeTab === "audit" && (
            <>
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

              {tripRows.length > 0 && (
                <div className="mt-5 rounded border border-border-low bg-surface-container overflow-hidden">
                  <div className="p-3 border-b border-border-low">
                    <h3 className="text-xs font-black uppercase tracking-widest">
                      Viagens importadas ({tripRows.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border-low bg-surface-low">
                          <th className="px-3 py-2 text-left font-black uppercase">Data</th>
                          <th className="px-3 py-2 text-left font-black uppercase">Agregado</th>
                          <th className="px-3 py-2 text-left font-black uppercase">Obra</th>
                          <th className="px-3 py-2 text-right font-black uppercase">m³ Comp.</th>
                          <th className="px-3 py-2 text-right font-black uppercase">R$</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tripRows
                          .slice(tripPage * PAGE_SIZE, (tripPage + 1) * PAGE_SIZE)
                          .map((trip) => (
                            <tr key={trip.id} className="border-b border-border-low/40">
                              <td className="px-3 py-2">{formatDate(trip.datetime)}</td>
                              <td className="px-3 py-2 tnum">
                                {trip.prefix || trip.vehicleId || trip.plate}
                              </td>
                              <td className="px-3 py-2">{trip.obra}</td>
                              <td className="px-3 py-2 text-right tnum">
                                {formatNumber(trip.cubicMCompacted, 1)}
                              </td>
                              <td className="px-3 py-2 text-right tnum">{formatBRL(trip.total)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center p-3 border-t border-border-low">
                    <span className="text-xs text-on-surface-variant">
                      Página {tripPage + 1} de {Math.ceil(tripRows.length / PAGE_SIZE)}
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
                        disabled={tripPage >= Math.ceil(tripRows.length / PAGE_SIZE) - 1}
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
        <MyAnalysesDialog
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
