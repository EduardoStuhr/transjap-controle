/**
 * Dashboard Produção × Consumo (VIZ-1)
 * Template app_transjap aplicado — paleta OKLCH + 8 gráficos do template
 * em 8 abas dedicadas.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { toast } from "sonner";

import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuthStore } from "@/lib/auth-store";
import { DEBUG_FLAG_LABELS, isDebugFlagEnabled, isDebugRuntimeEnabled } from "@/lib/debug-flags";
import { integrationStatusLabel, type IntegrationStatus } from "@/lib/production-consumption-types";
import {
  deleteAnalysis,
  listAnalyses,
  listDailyParts,
  listFueling,
  listTrips,
} from "@/lib/api/production-consumption";
import { listFuelAttributionFn, recalculateFuelFn } from "@/lib/api/fuel-attribution";
import {
  listFuelAllocationAuditSupportFn,
  listFuelAllocationsSupportFn,
  type FuelAllocationAuditRow,
  recalculateFuelAllocationsSupportFn,
  type FuelAllocationSupportRow,
} from "@/lib/api/fuel-allocation-support";

import { ChartCard } from "@/components/charts/ChartCard";
import type { AggregateRankingPoint, StackedBarSeries } from "@/components/charts/Charts";
import { EmptyChartState } from "@/components/charts/ProductionConsumptionCharts";
import { LegendDot } from "@/components/charts/LegendDot";
import { CHART_SERIES_COLORS } from "@/lib/chart-theme";
import {
  exportDashboardTabAsExcel,
  exportDashboardTabAsPdf,
  type DashboardExportCell,
  type DashboardExportSheet,
} from "@/lib/dashboard-tab-export";
import { normalizeFleet } from "@/lib/carcara-parser";
import {
  displayEquipmentLabel,
  equipmentMatches,
  isKnownOwnFleetEquipment,
  isAggregateEquipment,
  normalizeEquipmentKey,
  resolveEquipmentKind,
  sortEquipmentLabels,
  type EquipmentContext,
  type EquipmentKind,
} from "@/lib/equipment-normalization";
import {
  OPERATIONAL_ITEM_ORDER,
  operationalItemLabel,
  operationalItemRank,
  resolveEquipmentOperationalClass,
  isPipaLike,
  type OperationalItem,
} from "@/lib/production-consumption-items";
import { excludedFuelFromProductionRule } from "@/lib/non-productive-fuel-rules";

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
  buildMultiObraChartData,
  buildRcoObraDomain,
  multiObraMetricDisplayKey,
  multiObraMetricKey,
  multiObraMetricOutlierKey,
  type MultiObraDomainEntry,
} from "@/lib/multi-obra-chart";
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

type ChartsModule = typeof import("@/components/charts/Charts");

function lazyChart(name: keyof ChartsModule) {
  return lazy(async () => {
    const module = await import("@/components/charts/Charts");
    return { default: module[name] as ComponentType<Record<string, unknown>> };
  });
}

const ChartAggregateRanking = lazyChart("ChartAggregateRanking");
const ChartBars = lazyChart("ChartBars");
const ChartCompareBars = lazyChart("ChartCompareBars");
const ChartDonut = lazyChart("ChartDonut");
const ChartHBars = lazyChart("ChartHBars");
const ChartHistogram = lazyChart("ChartHistogram");
const ChartHourlyProduction = lazyChart("ChartHourlyProduction");
const ChartLine = lazyChart("ChartLine");
const ChartLineLpm3 = lazyChart("ChartLineLpm3");
const ChartLineRef = lazyChart("ChartLineRef");
const ChartLphRanking = lazyChart("ChartLphRanking");
const ChartM3Diesel = lazyChart("ChartM3Diesel");
const ChartM3DieselMultiObra = lazyChart("ChartM3DieselMultiObra");
const ChartEfficiencyMultiObra = lazyChart("ChartEfficiencyMultiObra");
const ChartMultiLine = lazyChart("ChartMultiLine");
const ChartProducaoEmpoladaDiesel = lazyChart("ChartProducaoEmpoladaDiesel");
const ChartProdConsumo = lazyChart("ChartProdConsumo");
const ChartProdStack = lazyChart("ChartProdStack");
const ChartStackedBars = lazyChart("ChartStackedBars");
const ChartVolumeLinePorObra = lazyChart("ChartVolumeLinePorObra");

export const Route = createFileRoute("/producao-consumo")({
  component: ProducaoConsumo,
});

function ProducaoConsumo() {
  return <ProducaoConsumoRefactored />;
}

const PAGE_SIZE = 12;
const COMPARISON_TOP_PER_OBRA = 5;
const LEGACY_OVERVIEW_ENABLED = false;

function storageFlagEnabled(key: string) {
  if (typeof window === "undefined") return false;
  if (import.meta.env.PROD) return false;
  return window.localStorage.getItem(key) === "1";
}

function debugPerformanceEnabled() {
  if (typeof window === "undefined") return false;
  return isDebugRuntimeEnabled() && (import.meta.env.DEV || storageFlagEnabled("debugPerformance"));
}

function timeEnd(label: string, enabled: boolean) {
  if (enabled) console.timeEnd(label);
}

function dashboardExportCell(value: unknown): DashboardExportCell {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function dashboardExportRows<T extends object>(rows: T[]) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, dashboardExportCell(value)]),
    ),
  );
}

function isOperationalTab(tab: string): tab is Exclude<OperationalItem, "outros"> {
  return (
    tab === "limpeza" ||
    tab === "escavacao" ||
    tab === "transporte" ||
    tab === "tratamento" ||
    tab === "compactacao"
  );
}

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
  obra: string;
  obraKey: string;
  item: OperationalItem;
  equipmentKey: string;
  equipmentLabel: string;
  equipmentHours: number;
  itemTotalHours: number;
  totalOperationalHours: number;
  share: number;
  compactedM3Day: number;
  relatedM3: number;
  looseM3: number;
  trips: number;
  cost: number;
  diesel: number;
  dieselCoveredHours?: number;
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
    return pdeFleetKeys.has(ownKey) || isKnownOwnFleetEquipment(value) ? ownKey : `CB:${fleet}`;
  }
  return normalizeEquipmentKey(value, fallbackContext) || "";
}

function equipmentLabelFromKey(key: string, fallback = "") {
  if (key.startsWith("CB:")) return `CB ${key.slice(3)}`;
  if (key.startsWith("FROTA:")) return `FROTA ${key.slice(6)}`;
  return fallback || key || "SEM EQUIPAMENTO";
}

function fuelingEquipmentContext(row: {
  analysisId?: string | null;
  vehicleType?: string | null;
  owner?: string | null;
  operator?: string | null;
}): EquipmentContext {
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

function isTripPipaLike(row: DbTrip) {
  return isPipaLike({
    prefix: row.prefix,
    fleet: row.prefix || row.vehicleId || row.plate,
    plate: row.plate,
    type: row.operation,
    description: [row.owner, row.driver, row.material, row.origin, row.destination, row.status]
      .filter(Boolean)
      .join(" "),
    equipmentLabel: displayEquipmentLabel(equipmentRaw(row), "trip"),
    raw: row,
  });
}

function buildTripAggregateKeys(trips: DbTrip[]) {
  return new Set(
    trips
      .filter((trip) => !isTripPipaLike(trip))
      .map((trip) => normalizeEquipmentKey(equipmentRaw(trip), "aggregate"))
      .filter((key) => isAggregateEquipment(key)),
  );
}

function formatHourlyM3(value: number) {
  return `${formatNumber(value, 2)} m³`;
}

const OBRA_SCOPE_STATUS_INFERRED = "Obra inferida por filtro único";
const OBRA_SCOPE_STATUS_UNINFORMED = "Obra não informada";
const OBRA_SCOPE_STATUS_MISSING = "Obra ausente em allocation/PDE";
const OBRA_SCOPE_UNINFORMED_LABEL = "Obra não informada";
const OBRA_SCOPE_UNINFORMED_KEY = "OBRA_NAO_INFORMADA";

type ObraStatus = "ok" | "inferred" | "absent" | "wrong";
type DieselIntegrationStatus = IntegrationStatus;

type ObraScopeAudit = {
  obraOriginal?: string;
  obraScopeStatus?: string;
  obraStatus?: ObraStatus;
  resolvedObraKey?: string;
  resolvedObraLabel?: string;
};

type IntegrationAuditMetadata = ObraScopeAudit & {
  integrationStatus?: DieselIntegrationStatus;
  integrationReason?: string;
  sourceWorksite?: string;
};

function resolveScopedObra(
  obra: string,
  selectedObraLabels: ReadonlyMap<string, string>,
): {
  obra: string;
  scopeStatus: string;
  obraStatus: ObraStatus;
  resolvedObraKey: string;
  resolvedObraLabel: string;
} | null {
  const rawObra = String(obra ?? "");
  const trimmedObra = rawObra.trim();
  const matchedObra = selectedObraLabels.get(normalizeObraKey(trimmedObra));
  if (matchedObra) {
    return {
      obra: matchedObra,
      scopeStatus: "",
      obraStatus: "ok",
      resolvedObraKey: normalizeObraKey(matchedObra),
      resolvedObraLabel: matchedObra,
    };
  }

  if (!trimmedObra) {
    if (selectedObraLabels.size === 1) {
      const singleSelectedObra = selectedObraLabels.values().next().value;
      if (!singleSelectedObra) {
        return {
          obra: OBRA_SCOPE_UNINFORMED_LABEL,
          scopeStatus: OBRA_SCOPE_STATUS_UNINFORMED,
          obraStatus: "absent",
          resolvedObraKey: OBRA_SCOPE_UNINFORMED_KEY,
          resolvedObraLabel: OBRA_SCOPE_UNINFORMED_LABEL,
        };
      }
      return {
        obra: singleSelectedObra,
        scopeStatus: OBRA_SCOPE_STATUS_INFERRED,
        obraStatus: "inferred",
        resolvedObraKey: normalizeObraKey(singleSelectedObra),
        resolvedObraLabel: singleSelectedObra,
      };
    }
    if (selectedObraLabels.size > 1) return null;
    return {
      obra: OBRA_SCOPE_UNINFORMED_LABEL,
      scopeStatus: OBRA_SCOPE_STATUS_UNINFORMED,
      obraStatus: "absent",
      resolvedObraKey: OBRA_SCOPE_UNINFORMED_KEY,
      resolvedObraLabel: OBRA_SCOPE_UNINFORMED_LABEL,
    };
  }

  return null;
}

function scopeRowsToSelectedObras<T extends { obra: string }>(
  rows: T[],
  selectedObraLabels: ReadonlyMap<string, string>,
): Array<T & ObraScopeAudit> {
  return rows.flatMap((row) => {
    const scoped = resolveScopedObra(row.obra, selectedObraLabels);
    return scoped
      ? [
          {
            ...row,
            obra: scoped.obra,
            obraOriginal: row.obra,
            obraScopeStatus: scoped.scopeStatus,
            obraStatus: scoped.obraStatus,
            resolvedObraKey: scoped.resolvedObraKey,
            resolvedObraLabel: scoped.resolvedObraLabel,
          },
        ]
      : [];
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
  relatedM3: number;
  equipment: ItemEquipmentMetric[];
  daily: Array<{
    date: string;
    d: string;
    obra: string;
    obraLabel: string;
    obraKey: string;
    obraStatus: ObraStatus;
    resolvedObraKey: string;
    resolvedObraLabel: string;
    m3: number;
    relatedM3: number;
    looseM3: number;
    diesel: number;
    efficiencyDiesel: number;
    dieselCoveredHours: number;
    dieselCoverageRatio: number;
    dieselEstimated: boolean;
    cost: number;
    hours: number;
    itemOperationalHours: number;
    totalOperationalHours: number;
    trips: number;
    baseM3: number;
    lPorM3: number;
    m3PorH: number;
    formulaUsed: string;
    sourceDiesel: string;
    sourceM3: string;
    status: DieselIntegrationStatus;
    statusReason: string;
  }>;
};

type AuditSource =
  | "dailyPart"
  | "fueling"
  | "fuelAllocation"
  | "fuelAttribution"
  | "trip"
  | "catalog";

type FuelOperationalClassification = {
  equipment: string;
  resolvedLabel: string;
  operationalItem: OperationalItem;
  dieselAuditSource: AuditSource;
  kind: EquipmentKind;
  existsInPDE: boolean;
  isAggregate: boolean;
  isAggregateByPdeRule: boolean;
  isPipa: boolean;
  includedInTransport: boolean;
  reason: string;
};

type TransportDieselDebugRow = {
  date: string;
  liters: number;
  equipmentKey: string;
  equipmentLabel: string;
  rawPrefix: string;
  rawFleet: string;
  rawPlate: string;
  rawId: string;
  rawVehicleType: string;
  rawDescription: string;
  source: string;
  sourceId: string;
  isFromFuelAllocation: boolean;
  isFromRawFueling: boolean;
  existsInPDE: boolean;
  isAggregate: boolean;
  isPipa: boolean;
  resolvedItem: OperationalItem;
  includedInTransport: boolean;
  reason: string;
};

type DieselM3Source = "fuelAllocation" | "rawFueling" | "fuelAttribution";
type FuelUsageBucket = "producao" | "limpeza";

type ClassifiedFuelUsageRow = {
  id: string;
  obra: string;
  obraKey: string;
  date: string;
  fleet: string;
  equipmentKey: string;
  equipment: string;
  liters: number;
  cost: number;
  hours: number;
  sourceFuelingId: string;
  source: string;
  bucket: FuelUsageBucket;
  reason: string;
  item: OperationalItem;
  excludedFromProductiveCalculation: boolean;
  productiveExclusionReason?: string;
  fuel: DbFueling & IntegrationAuditMetadata;
};
type DieselM3OriginFilter = "all" | DieselM3Source;
type DieselM3View = "obraDay" | "item" | "equipment";
type DieselM3RankingMode = "diesel" | "lph";

type DieselM3Filters = {
  dateFrom: string;
  dateTo: string;
  obra: string;
  item: string;
  equipment: string;
  aggregate: string;
  origin: DieselM3OriginFilter;
  view: DieselM3View;
  ranking: DieselM3RankingMode;
  compareObraA: string;
  compareObraB: string;
};

type DieselM3DailyProductionRow = {
  date: string;
  d: string;
  obra: string;
  obraKey: string;
  obraStatus: ObraStatus;
  compactedM3: number;
  looseM3: number;
  trips: number;
};

type DieselM3RelatedRow = {
  date: string;
  obra: string;
  obraKey: string;
  item: OperationalItem;
  itemLabel: string;
  equipmentKey: string;
  equipmentLabel: string;
  kind: EquipmentKind;
  baseCompactedM3: number;
  relatedM3: number;
  hours: number;
  totalOperationalHours: number;
  participation: number;
  formulaUsed: string;
  trips: number;
  obraStatus: ObraStatus;
  status: DieselIntegrationStatus;
  statusReason: string;
};

type DieselM3DetailRow = DieselM3RelatedRow & {
  diesel: number;
  m3PerLiter: number;
  litersPerM3: number;
  dieselSource: DieselM3Source;
  isPipa: boolean;
  blockedSource?: boolean;
  sourceWorksite?: string;
};

type DieselM3ObraComparisonRow = {
  obra: string;
  obraKey: string;
  compactedM3: number;
  looseM3: number;
  relatedM3: number;
  diesel: number;
  m3PerLiter: number;
  relatedM3PerLiter: number;
  litersPerM3: number;
};

type PeriodComparisonRange = {
  dateFrom: string;
  dateTo: string;
};

type PeriodComparisonScope = {
  obraKeys: string[];
  item: string;
  equipment: string;
  aggregate: string;
};

type PeriodComparisonMetrics = {
  compactedM3: number;
  looseM3: number;
  diesel: number;
  trips: number;
  m3PerLiter: number;
  litersPerM3: number;
  litersPerHour: number;
  pdeHours: number;
  m3PerHour: number;
};

const DIESEL_M3_DEFAULT_FILTERS: DieselM3Filters = {
  dateFrom: "",
  dateTo: "",
  obra: "all",
  item: "all",
  equipment: "all",
  aggregate: "all",
  origin: "all",
  view: "obraDay",
  ranking: "diesel",
  compareObraA: "",
  compareObraB: "",
};

function periodComparisonMetrics(
  baseData: DieselM3BaseData,
  period: PeriodComparisonRange,
  scope: PeriodComparisonScope,
): PeriodComparisonMetrics {
  const selectedObras = new Set(scope.obraKeys);
  const productionRows = baseData.dailyProductionByWorksite.filter((row) => {
    if (!dateInFilterRange(row.date, period.dateFrom, period.dateTo)) return false;
    if (selectedObras.size > 0 && !selectedObras.has(row.obraKey)) return false;
    return true;
  });
  const detailRows = baseData.dieselM3Rows.filter((row) => {
    if (!dateInFilterRange(row.date, period.dateFrom, period.dateTo)) return false;
    if (selectedObras.size > 0 && !selectedObras.has(row.obraKey)) return false;
    if (scope.item !== "all" && row.item !== scope.item) return false;
    if (scope.equipment !== "all" && row.equipmentKey !== scope.equipment) return false;
    if (scope.aggregate !== "all" && row.equipmentKey !== scope.aggregate) return false;
    return true;
  });

  const compactedM3 = productionRows.reduce((sum, row) => sum + row.compactedM3, 0);
  const looseM3 = productionRows.reduce((sum, row) => sum + row.looseM3, 0);
  const trips = productionRows.reduce((sum, row) => sum + row.trips, 0);
  const diesel = detailRows.reduce((sum, row) => sum + row.diesel, 0);
  const pdeHours = detailRows.reduce((sum, row) => sum + row.hours, 0);
  const equipmentScope = scope.equipment !== "all" || scope.aggregate !== "all";
  const relatedM3 = detailRows.reduce((sum, row) => sum + row.relatedM3, 0);
  const efficiencyM3 = equipmentScope ? relatedM3 : compactedM3;

  return {
    compactedM3,
    looseM3,
    diesel,
    trips,
    m3PerLiter: divide(efficiencyM3, diesel),
    litersPerM3: divide(diesel, efficiencyM3),
    litersPerHour: divide(diesel, pdeHours),
    pdeHours,
    m3PerHour: divide(efficiencyM3, pdeHours),
  };
}

function dieselAuditSourceForFuel(fuel: DbFueling): AuditSource {
  if (fuel.analysisId === "allocated") return "fuelAllocation";
  if (fuel.analysisId === "attributed") return "fuelAttribution";
  return "fueling";
}

function fuelSourceId(fuel: DbFueling) {
  return fuel.analysisId === "allocated" || fuel.analysisId === "attributed"
    ? fuel.importBatchId || fuel.id
    : fuel.id;
}

function dieselM3SourceForFuel(fuel: DbFueling): DieselM3Source {
  if (fuel.analysisId === "allocated") return "fuelAllocation";
  if (fuel.analysisId === "attributed") return "fuelAttribution";
  return "rawFueling";
}

function dieselM3SourceLabel(source: DieselM3Source) {
  if (source === "fuelAllocation") return "fuel_allocations";
  if (source === "fuelAttribution") return "fuel_attribution";
  return "CMB bruto";
}

function analysisObraLabels(analysis: DbProductionAnalysis): string[] {
  const context = analysis.context as { obras?: unknown } | null;
  if (Array.isArray(context?.obras)) {
    const obras = context.obras.filter(
      (obra): obra is string => typeof obra === "string" && obra.trim().length > 0,
    );
    if (obras.length > 0) return obras;
  }
  if (normalizeObraName(analysis.obra) === "MULTIOBRA") return [];
  return [analysis.obra];
}

function fuelHasValidHourmeter(fuel: Pick<DbFueling, "kmPrevious" | "kmCurrent">) {
  const start = fuel.kmPrevious || 0;
  const end = fuel.kmCurrent || 0;
  const delta = end - start;
  return start > 0 && end > 0 && delta > 0 && delta <= 24;
}

function fuelingAggregateContext(fuel: DbFueling): EquipmentContext {
  return {
    source: "fueling",
    description: [fuel.vehicleType, fuel.owner, fuel.operator, fuel.status]
      .filter(Boolean)
      .join(" "),
  };
}

function resolveFuelOperationalClassification(
  fuel: DbFueling,
  pdeFleetKeys: ReadonlySet<string>,
  aggregateKeys: ReadonlySet<string>,
): FuelOperationalClassification {
  const context = fuelingEquipmentContext(fuel);
  const rawEquipment = equipmentRaw(fuel);
  const rawContext = fuelingAggregateContext(fuel);
  const invalidHourmeter = !fuelHasValidHourmeter(fuel);
  const rawLooksAggregate =
    resolveEquipmentKind(rawEquipment, rawContext) === "aggregate" ||
    isAggregateEquipment(rawEquipment, rawContext) ||
    aggregateKeys.has(normalizeEquipmentKey(rawEquipment, "aggregate"));
  const rawLooksPipa = isPipaLike({
    prefix: fuel.prefix,
    fleet: rawEquipment,
    plate: fuel.plate,
    vehicleType: fuel.vehicleType,
    type: fuel.vehicleType,
    description: `${fuel.owner} ${fuel.operator} ${fuel.status ?? ""}`,
    equipmentLabel: equipmentLabel(fuel, rawContext),
    raw: fuel,
  });
  const equipment =
    !rawLooksPipa && rawLooksAggregate && invalidHourmeter
      ? normalizeEquipmentKey(rawEquipment, "aggregate")
      : equipmentKeyByPdeRule(rawEquipment, pdeFleetKeys, context);
  const fleetNumber = normalizedFleetNumber(equipment || equipmentRaw(fuel));
  const existsInPDE = Boolean(fleetNumber && pdeFleetKeys.has(`FROTA:${fleetNumber}`));
  const rawAggregateByPdeRule =
    !rawLooksPipa &&
    (equipment.startsWith("CB:") || aggregateKeys.has(equipment) || rawLooksAggregate);
  const resolvedLabel = equipmentLabelFromKey(equipment, equipmentLabel(fuel, context));
  const operationalClass = resolveEquipmentOperationalClass({
    prefix: fuel.prefix,
    fleet: equipment || fuel.prefix || fuel.vehicleId || fuel.plate,
    plate: fuel.plate,
    equipment: resolvedLabel,
    equipmentLabel: resolvedLabel,
    obra: resolvedWorksiteLabel(fuel as DbFueling & ObraScopeAudit),
    vehicleType: fuel.vehicleType,
    type: fuel.vehicleType,
    description: `${fuel.owner} ${fuel.operator} ${fuel.status ?? ""}`,
    raw: fuel,
  });
  const isPipa =
    rawLooksPipa ||
    operationalClass.reason.includes("Pipa") ||
    isPipaLike({
      prefix: fuel.prefix,
      fleet: equipment || fuel.vehicleId,
      plate: fuel.plate,
      vehicleType: fuel.vehicleType,
      type: fuel.vehicleType,
      description: `${fuel.owner} ${fuel.operator} ${fuel.status ?? ""}`,
      equipmentLabel: resolvedLabel,
      raw: fuel,
    });
  const hasFixedOperationalRule = operationalClass.classificationSource === "fixed";
  const isAggregateByPdeRule = !hasFixedOperationalRule && !isPipa && rawAggregateByPdeRule;
  const operationalItem = hasFixedOperationalRule
    ? operationalClass.item
    : isPipa
      ? "tratamento"
      : isAggregateByPdeRule || operationalClass.isAggregate
        ? "transporte"
        : operationalClass.item;
  const isAggregate =
    !hasFixedOperationalRule && (rawAggregateByPdeRule || operationalClass.isAggregate);

  return {
    equipment,
    resolvedLabel,
    operationalItem,
    dieselAuditSource: dieselAuditSourceForFuel(fuel),
    kind: hasFixedOperationalRule || isPipa ? "ownFleet" : isAggregate ? "aggregate" : "ownFleet",
    existsInPDE,
    isAggregate,
    isAggregateByPdeRule,
    isPipa,
    includedInTransport: operationalItem === "transporte" && !isPipa,
    reason: hasFixedOperationalRule
      ? operationalClass.reason
      : isPipa
        ? "Pipa redirecionado para Tratamento"
        : isAggregateByPdeRule
          ? invalidHourmeter
            ? "CB/agregado com horimetro CMB invalido; usando CMB bruto em Transporte"
            : "nao consta em PDE real; tratado como CB/agregado"
          : operationalClass.reason,
  };
}

function resolveTripOperationalClassification(trip: DbTrip) {
  const rawEquipment = equipmentRaw(trip);
  const operationalClass = resolveEquipmentOperationalClass({
    prefix: trip.prefix,
    fleet: rawEquipment,
    plate: trip.plate,
    equipment: equipmentLabel(trip, "trip"),
    obra: resolvedWorksiteLabel(trip as DbTrip & ObraScopeAudit),
    description: `${trip.operation} ${trip.owner} ${trip.operator} ${trip.status ?? ""}`,
    raw: trip,
  });

  if (operationalClass.classificationSource === "fixed") {
    return {
      item: operationalClass.item,
      equipment: operationalClass.key,
      label: operationalClass.label,
      kind: "ownFleet" as EquipmentKind,
      reason: operationalClass.reason,
    };
  }

  const equipment = normalizeEquipmentKey(rawEquipment, "aggregate");
  return {
    item: "transporte" as OperationalItem,
    equipment,
    label: equipmentLabelFromKey(equipment, equipmentLabel(trip, "trip")),
    kind: "aggregate" as EquipmentKind,
    reason: "viagem RCO produtiva classificada como transporte",
  };
}

type RawFuelFallbackDecision = {
  hasOfficialAllocation: boolean;
  includedAsRawFallback: boolean;
  reason: string;
  classification: FuelOperationalClassification | null;
};

function resolveRawFuelFallbackDecision(
  fuel: DbFueling,
  allocatedSourceIds: ReadonlySet<string>,
  pdeFleetKeys: ReadonlySet<string>,
  aggregateKeys: ReadonlySet<string>,
): RawFuelFallbackDecision {
  if (allocatedSourceIds.has(fuel.id)) {
    return {
      hasOfficialAllocation: true,
      includedAsRawFallback: false,
      reason: "sourceFuelingId já possui fuel_allocations oficiais",
      classification: null,
    };
  }

  const classification = resolveFuelOperationalClassification(fuel, pdeFleetKeys, aggregateKeys);
  const includedAsRawFallback = classification.includedInTransport || classification.isPipa;
  return {
    hasOfficialAllocation: false,
    includedAsRawFallback,
    reason: includedAsRawFallback
      ? classification.isPipa
        ? "CMB bruto incluído: pipa sem allocation oficial"
        : "CMB bruto incluído: CB/agregado sem allocation oficial"
      : classification.reason,
    classification,
  };
}

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

type AbsentWorksiteAuditRow = {
  source: string;
  date: string;
  equipment: string;
  resolvedObraLabel: string;
  resolvedObraKey: string;
  obraStatus: ObraStatus;
  liters: number;
  hours: number;
  reason: DieselIntegrationStatus;
};

type NonProductiveFuelAuditRow = {
  obra: string;
  date: string;
  equipment: string;
  item: string;
  liters: number;
  reason: string;
};

type ProductionAggregationAuditRow = {
  item: string;
  metrica: string;
  data: string;
  obra: string;
  material: string;
  geral: number;
  somaObras: number;
  somaEquipamentos: number;
  somaMateriais: number;
  diferencaMax: number;
  status: "OK" | "ERRO_AGREGACAO";
};

function shortDateLabel(date: string) {
  const key = extractDateKey(date);
  return key && key.length >= 10 ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : date;
}

function dateInFilterRange(date: string | Date | null | undefined, dateFrom = "", dateTo = "") {
  const key = extractDateKey(date);
  if (!key) return false;
  if (dateFrom && key < dateFrom) return false;
  if (dateTo && key > dateTo) return false;
  return true;
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
    relatedM3: 0,
    equipment: [],
    daily: [],
  };
}

const EMPTY_ITEM_SUMMARIES = OPERATIONAL_ITEM_ORDER.map((item) => emptyItemSummary(item));

function divide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function suppressEquipmentProductionMetrics(_item: OperationalItem) {
  return true;
}

function worksiteLabel(value: string | null | undefined) {
  const label = String(value ?? "").trim();
  return label || "Obra indefinida";
}

function worksiteKey(value: string | null | undefined) {
  return normalizeObraKey(worksiteLabel(value));
}

function dateWorksiteKey(date: string, obraKey: string) {
  return `${date}|${obraKey}`;
}

function obraStatusForRow(row: Partial<ObraScopeAudit> & { obra?: string | null }) {
  if (row.obraStatus) return row.obraStatus;
  return String(row.obra ?? "").trim() ? "ok" : "absent";
}

function resolvedWorksiteLabel(row: Partial<ObraScopeAudit> & { obra?: string | null }) {
  if (row.resolvedObraLabel) return row.resolvedObraLabel;
  if (obraStatusForRow(row) === "absent") return OBRA_SCOPE_UNINFORMED_LABEL;
  return worksiteLabel(row.obra);
}

function resolvedWorksiteKey(row: Partial<ObraScopeAudit> & { obra?: string | null }) {
  if (row.resolvedObraKey) return row.resolvedObraKey;
  if (obraStatusForRow(row) === "absent") return OBRA_SCOPE_UNINFORMED_KEY;
  return normalizeObraKey(resolvedWorksiteLabel(row));
}

function obraSelectionKey(value: string | null | undefined) {
  const key = normalizeObraKey(value);
  return key === normalizeObraKey(OBRA_SCOPE_UNINFORMED_LABEL) ? OBRA_SCOPE_UNINFORMED_KEY : key;
}

function multiObraHasMetricData(
  rows: Array<Record<string, unknown>>,
  series: Array<{ key: string }>,
  metricIds: string[],
) {
  return rows.some((row) =>
    series.some((obra) =>
      metricIds.some((metricId) => {
        const rawValue = Number(row[multiObraMetricKey(obra.key, metricId)] ?? 0);
        const displayValue = Number(row[multiObraMetricDisplayKey(obra.key, metricId)] ?? 0);
        return rawValue > 0 || displayValue > 0;
      }),
    ),
  );
}

function mergeIntegrationStatus(
  current: DieselIntegrationStatus,
  next: DieselIntegrationStatus,
): DieselIntegrationStatus {
  const rank: Record<DieselIntegrationStatus, number> = {
    WRONG_WORKSITE: 7,
    BLOCKED_SOURCE: 6,
    WORKSITE_ABSENT: 5,
    NO_PRODUCTION: 4,
    NO_DIESEL: 3,
    NO_DATA: 2,
    OK: 1,
  };
  return rank[next] > rank[current] ? next : current;
}

function dieselIntegrationStatus({
  diesel,
  m3,
  hours,
  obraStatus,
  blockedSource = false,
  wrongWorksite = false,
}: {
  diesel: number;
  m3: number;
  hours: number;
  obraStatus?: ObraStatus;
  blockedSource?: boolean;
  wrongWorksite?: boolean;
}): DieselIntegrationStatus {
  if (wrongWorksite) return "WRONG_WORKSITE";
  if (blockedSource) return "BLOCKED_SOURCE";
  if (obraStatus === "absent") return "WORKSITE_ABSENT";
  if (m3 <= 0 && (diesel > 0 || hours > 0)) return "NO_PRODUCTION";
  if ((m3 > 0 || hours > 0) && diesel <= 0) return "NO_DIESEL";
  if (diesel <= 0 && m3 <= 0 && hours <= 0) return "NO_DATA";
  return "OK";
}

function dieselIntegrationReason(status: DieselIntegrationStatus) {
  return status === "OK" ? "OK" : integrationStatusLabel(status);
}

/**
 * Horas de PDE de um ÚNICO registro de equipamento.
 * Usa o horímetro (final - inicial) quando válido; senão cai para as horas
 * trabalhadas (workedHours) do PDE. Nunca usa allocatedHours nem horas de
 * abastecimento. O guarda de validade evita horímetro acumulado/incoerente.
 */
function pdeRowHours(part: Pick<DbEquipmentDailyPart, "hours" | "horimInicial" | "horimFinal">) {
  const start = part.horimInicial || 0;
  const end = part.horimFinal || 0;
  const delta = end - start;
  if (start > 0 && end > 0 && delta > 0 && delta <= 24) return delta;
  return part.hours || 0;
}

/**
 * Fonte ÚNICA das horas operacionais vindas do PDE.
 * Para cada dia e item operacional soma APENAS o PDE real do dia, contando
 * cada frota uma única vez (evita duplicar o PDE por causa de múltiplos
 * abastecimentos/alocações). Nunca usa fuel_allocations.allocatedHours, horas
 * de abastecimento, horas acumuladas do período nem horas de outro dia.
 */
function buildPdeOperationalHours(dailyParts: DbEquipmentDailyPart[]) {
  const totalByDateObra = new Map<string, number>();
  const itemByDateObra = new Map<string, number>();
  const equipmentByDateObra = new Map<string, number>();
  const seen = new Set<string>();
  dailyParts.forEach((part) => {
    if (!part.usedInAnalysis || (part.hours || 0) <= 0) return;
    const obraKey = resolvedWorksiteKey(part as DbEquipmentDailyPart & ObraScopeAudit);
    const item = resolveEquipmentOperationalClass({
      fleet: part.fleet,
      equipment: part.fleetLabel || part.fleet,
      obra: resolvedWorksiteLabel(part as DbEquipmentDailyPart & ObraScopeAudit),
      description: `${part.sourceSheet} ${part.status}`,
    }).item;
    if (item === "limpeza" || item === "outros") return;
    const equipmentKey =
      normalizeEquipmentKey(part.fleet || part.fleetLabel, "dailyPart") ||
      part.fleet ||
      part.fleetLabel ||
      "SEM_EQUIPAMENTO";
    const dedupKey = `${part.date}|${obraKey}|${item}|${equipmentKey}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    const hours = pdeRowHours(part);
    if (hours <= 0) return;
    const dateObraKey = dateWorksiteKey(part.date, obraKey);
    totalByDateObra.set(dateObraKey, (totalByDateObra.get(dateObraKey) ?? 0) + hours);
    const itemKey = `${dateObraKey}|${item}`;
    itemByDateObra.set(itemKey, (itemByDateObra.get(itemKey) ?? 0) + hours);
    const equipmentHoursKey = `${itemKey}|${equipmentKey}`;
    equipmentByDateObra.set(
      equipmentHoursKey,
      (equipmentByDateObra.get(equipmentHoursKey) ?? 0) + hours,
    );
  });
  return { totalByDateObra, itemByDateObra, equipmentByDateObra };
}

function getDailyItemPdeHours(
  itemByDate: ReadonlyMap<string, number>,
  date: string,
  obraKey: string,
  item: OperationalItem,
) {
  return itemByDate.get(`${dateWorksiteKey(date, obraKey)}|${item}`) ?? 0;
}

function compactacaoM3LStatus({
  compactedM3Day,
  relatedM3,
  hours,
  diesel,
  m3PerLiter,
}: {
  compactedM3Day: number;
  relatedM3: number;
  hours: number;
  diesel: number;
  m3PerLiter: number;
}) {
  const reasons: string[] = [];
  if (m3PerLiter > 50) reasons.push("m3/L > 50");
  if (relatedM3 > 0 && diesel < 20) reasons.push("diesel da compactacao < 20 L");
  if (hours > 0 && diesel <= 0) reasons.push("compactacao com horas e sem diesel");
  if (compactedM3Day > 0 && diesel > 0 && diesel < 20) {
    reasons.push("producao do dia com diesel muito baixo");
  }
  if (relatedM3 > 0 && diesel <= 0) reasons.push("m3 relacionado sem diesel");
  return {
    status: reasons.length ? "SUSPEITO" : "OK",
    statusReason: reasons.join("; "),
  };
}

function buildEquipmentOperationalShare({
  dailyParts,
  compactedM3ByDateObra,
}: {
  dailyParts: DbEquipmentDailyPart[];
  compactedM3ByDateObra: ReadonlyMap<string, number>;
}): EquipmentOperationalShare[] {
  const dailyPartEquipmentKey = (part: DbEquipmentDailyPart) =>
    normalizeEquipmentKey(part.fleet || part.fleetLabel, "dailyPart") ||
    part.fleet ||
    part.fleetLabel ||
    "SEM_EQUIPAMENTO";

  // Horas operacionais totais do PDE no dia: cada frota/item conta uma unica
  // vez. Esse e o denominador do m3 relacionado; o m3 do RCO nao e producao
  // direta dos rolos.
  const totalOperationalHoursByDateObra = new Map<string, number>();
  const itemOperationalHoursByDateObra = new Map<string, number>();
  const countedTotalHoursKeys = new Set<string>();
  dailyParts.forEach((part) => {
    if (!part.usedInAnalysis || part.hours <= 0) return;
    const obraKey = resolvedWorksiteKey(part as DbEquipmentDailyPart & ObraScopeAudit);
    const item = resolveEquipmentOperationalClass({
      fleet: part.fleet,
      equipment: part.fleetLabel || part.fleet,
      obra: resolvedWorksiteLabel(part as DbEquipmentDailyPart & ObraScopeAudit),
      description: `${part.sourceSheet} ${part.status}`,
    }).item;
    if (item === "limpeza" || item === "outros") return;
    const dedupKey = `${part.date}|${obraKey}|${item}|${dailyPartEquipmentKey(part)}`;
    if (countedTotalHoursKeys.has(dedupKey)) return;
    countedTotalHoursKeys.add(dedupKey);
    const hours = pdeRowHours(part);
    if (hours <= 0) return;
    const dayObraKey = dateWorksiteKey(part.date, obraKey);
    totalOperationalHoursByDateObra.set(
      dayObraKey,
      (totalOperationalHoursByDateObra.get(dayObraKey) ?? 0) + hours,
    );
    const itemKey = `${dayObraKey}|${item}`;
    itemOperationalHoursByDateObra.set(
      itemKey,
      (itemOperationalHoursByDateObra.get(itemKey) ?? 0) + hours,
    );
  });

  const sharesByEquipmentDay = new Map<string, EquipmentOperationalShare>();
  dailyParts.forEach((part) => {
    if (!part.usedInAnalysis || part.hours <= 0) return;
    const scopedPart = part as DbEquipmentDailyPart & ObraScopeAudit;
    const obra = resolvedWorksiteLabel(scopedPart);
    const obraKey = resolvedWorksiteKey(scopedPart);
    const item = resolveEquipmentOperationalClass({
      fleet: part.fleet,
      equipment: part.fleetLabel || part.fleet,
      obra,
      description: `${part.sourceSheet} ${part.status}`,
    }).item;
    if (item === "limpeza" || item === "escavacao") return;
    const dayObraKey = dateWorksiteKey(part.date, obraKey);
    const totalOperationalHours = totalOperationalHoursByDateObra.get(dayObraKey) ?? 0;
    const itemTotalHours = itemOperationalHoursByDateObra.get(`${dayObraKey}|${item}`) ?? 0;
    const compactedM3Day = compactedM3ByDateObra.get(dayObraKey) ?? 0;
    if (totalOperationalHours <= 0 || itemTotalHours <= 0 || compactedM3Day <= 0) return;

    const equipmentKey = dailyPartEquipmentKey(part);
    const key = `${part.date}|${obraKey}|${item}|${equipmentKey}`;
    // mesma frota/dia conta uma única vez
    if (sharesByEquipmentDay.has(key)) return;
    const hours = pdeRowHours(part);
    const itemRelatedM3 = compactedM3Day * (itemTotalHours / totalOperationalHours);
    const equipmentShareWithinItem = hours / itemTotalHours;
    const relatedM3 = itemRelatedM3 * equipmentShareWithinItem;
    const share = hours / totalOperationalHours;
    sharesByEquipmentDay.set(key, {
      date: part.date,
      obra,
      obraKey,
      item,
      equipmentKey,
      equipmentLabel: displayEquipmentLabel(part.fleet || part.fleetLabel, "dailyPart"),
      equipmentHours: hours,
      itemTotalHours,
      totalOperationalHours,
      share,
      compactedM3Day,
      relatedM3,
      looseM3: 0,
      trips: 0,
      cost: 0,
      diesel: 0,
      m3PerLiter: 0,
      m3PerHour: divide(relatedM3, hours),
    });
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
const EMPTY_ITEM_STACKS = new Map<OperationalItem, ItemStackView>();

type DieselM3BaseData = {
  dailyProductionByWorksite: DieselM3DailyProductionRow[];
  rcoWorksites: Array<{ obra: string; obraKey: string; obraStatus: ObraStatus }>;
  dieselByDateWorksiteItemEquipment: Array<Record<string, unknown>>;
  equipmentDailyRelatedM3: DieselM3RelatedRow[];
  dieselM3Rows: DieselM3DetailRow[];
};

const EMPTY_DIESEL_M3_BASE_DATA: DieselM3BaseData = {
  dailyProductionByWorksite: [],
  rcoWorksites: [],
  dieselByDateWorksiteItemEquipment: [],
  equipmentDailyRelatedM3: [],
  dieselM3Rows: [],
};

function fixedNumber(value: number, decimals = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : 0;
}

function itemDailyChartRows(summary: ItemSummary) {
  return summary.daily.map((day) => {
    const relatedM3 = day.relatedM3;
    const itemHours = day.itemOperationalHours;
    const efficiencyDiesel = day.efficiencyDiesel > 0 ? day.efficiencyDiesel : day.diesel;
    const m3PerLiter = efficiencyDiesel > 0 ? divide(relatedM3, efficiencyDiesel) : 0;
    return {
      ...day,
      d: day.d,
      diesel: fixedNumber(day.diesel, 2),
      efficiencyDiesel: fixedNumber(efficiencyDiesel, 2),
      m3Usado: fixedNumber(relatedM3, 2),
      compactedM3Day: fixedNumber(day.baseM3, 2),
      relatedM3: fixedNumber(relatedM3, 2),
      m3: fixedNumber(relatedM3, 2),
      lPorM3: fixedNumber(m3PerLiter, 3),
      m3PerLiter: fixedNumber(m3PerLiter, 3),
      m3PorH: 0,
      horas: fixedNumber(itemHours, 2),
      horasOperacionaisDia: fixedNumber(day.totalOperationalHours, 2),
      participacao: fixedNumber(divide(itemHours, day.totalOperationalHours) * 100, 2),
    };
  });
}

function itemEquipmentChartRows(summary: ItemSummary) {
  return summary.equipment
    .filter((row) => row.liters > 0 || row.hours > 0 || row.m3 > 0 || row.trips > 0)
    .map((row) => {
      const suppressEquipmentProduction = suppressEquipmentProductionMetrics(summary.item);
      const shareDays = row.productionShares.filter((share) => share.itemTotalHours > 0);
      const averageShare = divide(
        shareDays.reduce((sum, share) => sum + share.share, 0),
        shareDays.length,
      );
      return {
        id: row.label,
        item: row.item,
        equipamento: row.label,
        litros: fixedNumber(row.liters, 2),
        horas: fixedNumber(row.hours, 2),
        lph: fixedNumber(row.fuelPerHour, 2),
        lpm3: suppressEquipmentProduction ? 0 : fixedNumber(row.fuelPerM3, 3),
        m3: suppressEquipmentProduction ? 0 : fixedNumber(row.m3, 2),
        share: fixedNumber(averageShare, 4),
        dias: shareDays.length,
        viagens: suppressEquipmentProduction ? 0 : fixedNumber(row.trips, 0),
        lViagem: suppressEquipmentProduction ? 0 : fixedNumber(row.fuelPerTrip, 2),
        m3PorH: suppressEquipmentProduction ? 0 : fixedNumber(row.productionPerHour, 2),
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

function sumByKey<T>(rows: T[], keyOf: (row: T) => string, valueOf: (row: T) => number) {
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

  if (mode === "limpeza") {
    return (
      <div className="grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCardCompact
          label="Diesel"
          value={formatLiters(summary.diesel)}
          icon="local_gas_station"
        />
        <KpiCardCompact
          label="Horas trabalhadas"
          value={formatHours(summary.hours)}
          icon="schedule"
        />
        <KpiCardCompact label="L/h" value={formatNumber(summary.fuelPerHour, 2)} icon="speed" />
        <KpiCardCompact
          label="Equipamentos"
          value={String(equipmentCount)}
          icon="precision_manufacturing"
        />
      </div>
    );
  }

  if (mode === "transporte") {
    return (
      <div className="grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCardCompact
          label="Viagens"
          value={formatNumber(summary.trips, 0)}
          icon="local_shipping"
        />
        <KpiCardCompact label="m3" value={formatM3(summary.compactedM3)} icon="compress" />
        <KpiCardCompact
          label="Diesel dos agregados"
          value={formatLiters(summary.diesel)}
          icon="local_gas_station"
        />
        <KpiCardCompact label="m3/L" value={formatNumber(summary.fuelPerM3, 3)} icon="speed" />
        <KpiCardCompact
          label="L/viagem"
          value={formatNumber(summary.fuelPerTrip, 2)}
          icon="route"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <KpiCardCompact
        label="Diesel"
        value={formatLiters(summary.diesel)}
        icon="local_gas_station"
      />
      <KpiCardCompact
        label="Horas trabalhadas"
        value={formatHours(summary.hours)}
        icon="schedule"
      />
      <KpiCardCompact label="L/h" value={formatNumber(summary.fuelPerHour, 2)} icon="speed" />
      <KpiCardCompact label="m3/L" value={formatNumber(summary.fuelPerM3, 3)} icon="query_stats" />
      <KpiCardCompact label="m3" value={formatM3(summary.compactedM3)} icon="compress" />
      <KpiCardCompact
        label="Equipamentos"
        value={String(equipmentCount)}
        icon="precision_manufacturing"
      />
    </div>
  );
}

function ItemEquipmentTable({ rows }: { rows: ReturnType<typeof itemEquipmentChartRows> }) {
  if (rows.length === 0) return null;

  const headings = ["Equipamento", "Horas", "Diesel", "L/h"];

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
                <td className="py-2 pr-4 tnum">{formatHours(row.horas)}</td>
                <td className="py-2 pr-4 tnum">{formatLiters(row.litros)}</td>
                <td className="py-2 pr-4 tnum">{formatNumber(row.lph, 2)}</td>
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
  validObras,
}: {
  summary: ItemSummary;
  stack: ItemStackView;
  validObras: MultiObraDomainEntry[];
}) {
  const dailyRows = itemDailyChartRows(summary);
  const equipmentRows = itemEquipmentChartRows(summary);
  const itemMultiObraInfo = useMemo(
    () =>
      buildMultiObraChartData({
        rows: dailyRows,
        getX: (row) => row.date,
        getXLabel: (row) => row.d,
        getObra: (row) => row.obra,
        getObraKey: (row) => row.obraKey,
        getObraStatus: (row) => row.obraStatus,
        validObras,
        metrics: [
          { id: "m3", getValue: (row) => row.m3 },
          { id: "diesel", getValue: (row) => row.diesel },
          {
            id: "m3PerLiter",
            getValue: (row) => (row.diesel > 0 && row.m3 > 0 ? row.m3PerLiter : null),
            outlier: true,
          },
          { id: "m3PorH", getValue: (row) => row.m3PorH },
        ],
        outlierPolicy: "mark-and-limit",
      }),
    [dailyRows, validObras],
  );
  const itemHasMultipleObras = itemMultiObraInfo.series.length > 1;
  const itemMultiObraHasProductionDiesel = multiObraHasMetricData(
    itemMultiObraInfo.chartData,
    itemMultiObraInfo.series,
    ["m3", "diesel"],
  );
  const itemMultiObraHasEfficiency = multiObraHasMetricData(
    itemMultiObraInfo.chartData,
    itemMultiObraInfo.series,
    ["m3PerLiter"],
  );
  const histogramMetric = equipmentRows.map((row) => row.lph);
  const histogramUnit = "L/h";
  const lpm3Target = summary.fuelPerM3 > 0 ? summary.fuelPerM3 : 16.7;

  if (isDebugFlagEnabled("debugDailySeries") && summary.item === "compactacao") {
    const sourceDays = summary.daily.filter((day) => day.date === "2026-05-25");
    const chartDays = dailyRows.filter((day) => day.date === "2026-05-25");
    console.log(
      "[TRACE_COMPACTACAO_25]",
      chartDays.map((day) => ({
        source: "OperationalItemPanel/itemDailyChartRows",
        date: day.date,
        item: summary.item,
        obra: day.obra,
        m3Base: day.compactedM3Day ?? day.baseM3,
        relatedM3: day.relatedM3,
        diesel: day.diesel,
        hours: day.horas ?? day.hours,
        totalOperationalHours: day.horasOperacionaisDia ?? day.totalOperationalHours,
        formula: day.formulaUsed,
        result: day.lPorM3,
        sourceDay: sourceDays,
      })),
    );
  }

  return (
    <div className="space-y-4">
      <ItemKpiGrid summary={summary} mode={summary.item} />

      {summary.item === "escavacao" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Escavacao - eficiencia diaria"
              description="Producao dividida pelo diesel do item"
              height={320}
              hasData={itemHasMultipleObras ? itemMultiObraHasEfficiency : dailyRows.length > 0}
            >
              {itemHasMultipleObras ? (
                <ChartEfficiencyMultiObra
                  data={itemMultiObraInfo.chartData}
                  series={itemMultiObraInfo.series}
                />
              ) : (
                <ChartLineLpm3 data={dailyRows} />
              )}
            </ChartCard>
            <ChartCard
              title="Escavacao - m3 x diesel"
              description="Producao e diesel do item"
              height={320}
              hasData={
                itemHasMultipleObras ? itemMultiObraHasProductionDiesel : dailyRows.length > 0
              }
            >
              {itemHasMultipleObras ? (
                <ChartM3DieselMultiObra
                  data={itemMultiObraInfo.chartData}
                  series={itemMultiObraInfo.series}
                />
              ) : (
                <ChartM3Diesel data={dailyRows} />
              )}
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
              title="Ranking L/h de escavacao"
              description="Diesel por hora de escavadeira"
              height={340}
              hasData={equipmentRows.some((row) => row.lph > 0)}
            >
              <ChartLphRanking data={equipmentRows} topN={10} />
            </ChartCard>
          </div>
        </>
      )}

      {summary.item === "limpeza" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard
            title="Limpeza - diesel por equipamento"
            description="Consumo das frotas 236 e 238 em Campo Log 05"
            height={330}
            hasData={equipmentRows.some((row) => row.litros > 0)}
          >
            <ChartHBars data={equipmentRows} dataKey="litros" nameKey="id" unit="L" topN={10} />
          </ChartCard>
          <ChartCard
            title="Limpeza - diesel empilhado"
            description="Litros por equipamento e dia"
            height={330}
            hasData={stack.data.length > 0 && stack.series.length > 0}
          >
            <ChartStackedBars data={stack.data} series={stack.series} />
          </ChartCard>
        </div>
      )}

      {summary.item === "transporte" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Transporte - m3 x diesel"
              description="Producao e diesel dos caminhoes/agregados"
              height={330}
              hasData={
                itemHasMultipleObras ? itemMultiObraHasProductionDiesel : dailyRows.length > 0
              }
            >
              {itemHasMultipleObras ? (
                <ChartM3DieselMultiObra
                  data={itemMultiObraInfo.chartData}
                  series={itemMultiObraInfo.series}
                />
              ) : (
                <ChartM3Diesel data={dailyRows} />
              )}
            </ChartCard>
            <ChartCard
              title="Ranking L/h por agregado"
              description="Diesel por hora dos equipamentos de transporte"
              height={330}
              hasData={equipmentRows.some((row) => row.lph > 0)}
            >
              <ChartLphRanking data={equipmentRows} topN={10} />
            </ChartCard>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Distribuicao L/h"
              description="Faixas de consumo por hora"
              height={320}
              hasData={histogramMetric.length > 0}
            >
              <ChartHistogram data={histogramRows(histogramMetric, histogramUnit)} />
            </ChartCard>
            <ChartCard
              title="Ranking por consumo"
              description="Litros por caminhao/agregado"
              height={320}
              hasData={equipmentRows.some((row) => row.litros > 0)}
            >
              <ChartHBars data={equipmentRows} dataKey="litros" nameKey="id" unit="L" topN={10} />
            </ChartCard>
          </div>
        </>
      )}

      {summary.item === "tratamento" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Tratamento - eficiencia diaria"
              description="Producao dividida pelo diesel do item"
              height={320}
              hasData={itemHasMultipleObras ? itemMultiObraHasEfficiency : dailyRows.length > 0}
            >
              {itemHasMultipleObras ? (
                <ChartEfficiencyMultiObra
                  data={itemMultiObraInfo.chartData}
                  series={itemMultiObraInfo.series}
                />
              ) : (
                <ChartLineLpm3 data={dailyRows} />
              )}
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
              title="Ranking L/h por equipamento"
              description="Diesel por hora"
              height={340}
              hasData={equipmentRows.some((row) => row.lph > 0)}
            >
              <ChartLphRanking data={equipmentRows} topN={10} />
            </ChartCard>
          </div>
        </>
      )}

      {summary.item === "compactacao" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Compactacao - eficiencia diaria"
              description="Producao da obra/dia dividida pelo diesel do item"
              height={320}
              hasData={itemHasMultipleObras ? itemMultiObraHasEfficiency : dailyRows.length > 0}
            >
              {itemHasMultipleObras ? (
                <ChartEfficiencyMultiObra
                  data={itemMultiObraInfo.chartData}
                  series={itemMultiObraInfo.series}
                />
              ) : (
                <ChartLineLpm3 data={dailyRows} />
              )}
            </ChartCard>
            <ChartCard
              title="Compactacao - m3/L com referencia"
              description="Producao por litro de diesel"
              height={320}
              hasData={itemHasMultipleObras ? itemMultiObraHasEfficiency : dailyRows.length > 0}
            >
              {itemHasMultipleObras ? (
                <ChartEfficiencyMultiObra
                  data={itemMultiObraInfo.chartData}
                  series={itemMultiObraInfo.series}
                />
              ) : (
                <ChartLineRef
                  title="Compactacao - m3/L com referencia"
                  data={dailyRows}
                  dataKey="lPorM3"
                  dataKeys={["lPorM3"]}
                  series={[{ dataKey: "lPorM3", name: "m3/L" }]}
                  refValue={lpm3Target}
                  refLabel="Ref."
                  unit="m³/L"
                />
              )}
            </ChartCard>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Consumo por equipamento"
              description="Litros por rolo ou compactador"
              height={330}
              hasData={equipmentRows.some((row) => row.litros > 0)}
            >
              <ChartHBars data={equipmentRows} dataKey="litros" nameKey="id" unit="L" topN={10} />
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
        <ChartCard
          title={`Distribuicao ${histogramUnit}`}
          description="Faixas por equipamento"
          height={300}
          hasData={histogramMetric.length > 0}
        >
          <ChartHistogram data={histogramRows(histogramMetric, histogramUnit)} />
        </ChartCard>
      </div>

      <ItemEquipmentTable rows={equipmentRows} />
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
          <div className="mt-3 grid grid-cols-1 min-[390px]:grid-cols-2 gap-x-3 gap-y-2 text-xs">
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
  fuelAllocationAudits: FuelAllocationAuditRow[];
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
const EMPTY_FUEL_ALLOCATION_AUDIT_ROWS: FuelAllocationAuditRow[] = [];
const EMPTY_FUEL_ATTR_ROWS: DbFuelAttribution[] = [];

function normalizeAnalysisIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean))).sort();
}

function analysisIdsKey(ids: string[]) {
  return normalizeAnalysisIds(ids).join("|");
}

function addUtcDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildDateRange(startValue: string, endValue: string) {
  const start = extractDateKey(startValue);
  const end = extractDateKey(endValue);
  if (!start || !end || start > end) return [];

  const dates: string[] = [];
  let current = start;
  for (let guard = 0; guard < 370 && current && current <= end; guard += 1) {
    dates.push(current);
    current = addUtcDays(current, 1);
  }
  return dates;
}

function dateKeysBetween(startValue: string, endValue: string) {
  return buildDateRange(startValue, endValue);
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

function filterRowsByAnalysis<T extends { analysisId: string }>(
  rows: unknown,
  source: string,
  allowedIds: ReadonlySet<string>,
): T[] {
  if (!Array.isArray(rows)) {
    console.error("[CREATE_ANALYSIS_ERROR]", {
      object: source,
      value: rows,
      reason: "server function nao retornou array antes do filtro por analysisId",
    });
    throw new Error(`${source} não retornou uma lista válida.`);
  }

  const filtered: T[] = [];
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") {
      console.error("[CREATE_ANALYSIS_ERROR]", {
        object: `${source}[${index}]`,
        value: row,
        line: "fetchDashboardRows -> row.analysisId",
        reason: "linha indefinida antes do acesso a analysisId",
      });
      return;
    }

    const analysisId = (row as { analysisId?: unknown }).analysisId;
    if (typeof analysisId !== "string" || !analysisId) {
      console.error("[CREATE_ANALYSIS_ERROR]", {
        object: `${source}[${index}].analysisId`,
        value: row,
        line: "fetchDashboardRows -> row.analysisId",
        reason: "linha sem analysisId string",
      });
      return;
    }

    if (allowedIds.has(analysisId)) filtered.push(row as T);
  });

  return filtered;
}

async function fetchTripsForDashboard(
  ids: string[],
  allowedIds: ReadonlySet<string>,
  analyses: DbProductionAnalysis[] = [],
  signal?: AbortSignal,
) {
  const analysisById = new Map(analyses.map((analysis) => [analysis.id, analysis]));
  const requests = ids.flatMap((analysisId) => {
    const analysis = analysisById.get(analysisId);
    const dates = analysis ? dateKeysBetween(analysis.dateStart, analysis.dateEnd) : [];
    if (dates.length === 0) {
      return [{ analysisId, date: "", label: analysisId }];
    }
    return dates.map((date) => ({ analysisId, date, label: `${analysisId}:${date}` }));
  });

  const rowsById = new Map<string, DbTrip>();
  for (let index = 0; index < requests.length; index += 6) {
    throwIfAborted(signal);
    const batch = requests.slice(index, index + 6);
    const results = await Promise.all(
      batch.map((request) =>
        listTrips({
          data: request.date
            ? {
                analysisId: request.analysisId,
                dateFrom: request.date,
                dateTo: request.date,
              }
            : { analysisId: request.analysisId },
        }),
      ),
    );
    results.forEach((result, resultIndex) => {
      filterRowsByAnalysis<DbTrip>(
        result,
        `listTrips:${batch[resultIndex]?.label ?? resultIndex}`,
        allowedIds,
      ).forEach((row) => {
        rowsById.set(row.id, row);
      });
    });
  }

  return Array.from(rowsById.values());
}

async function fetchAnalyses(signal?: AbortSignal) {
  throwIfAborted(signal);
  const rows = (await listAnalyses({ data: {} })) as DbProductionAnalysis[];
  throwIfAborted(signal);
  return rows;
}

async function fetchDashboardRows(
  ids: string[],
  signal?: AbortSignal,
  analyses: DbProductionAnalysis[] = [],
): Promise<DashboardRows> {
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
      fuelAllocationAudits: [],
      fuelAttributions: [],
    };
  }

  throwIfAborted(signal);
  const [
    tripsResult,
    fuelResult,
    dailyPartResult,
    allocationResult,
    allocationAuditResult,
    attrResult,
  ] = await Promise.all([
    fetchTripsForDashboard(normalizedIds, allowedIds, analyses, signal),
    listFueling({ data: { analysisIds: normalizedIds } }),
    listDailyParts({ data: { analysisIds: normalizedIds } }),
    listFuelAllocationsSupportFn({ data: { analysisIds: normalizedIds } }).catch(
      () => [] as FuelAllocationSupportRow[],
    ),
    listFuelAllocationAuditSupportFn({ data: { analysisIds: normalizedIds } }).catch(
      () => [] as FuelAllocationAuditRow[],
    ),
    listFuelAttributionFn({ data: { analysisIds: normalizedIds } }).catch(
      () => [] as DbFuelAttribution[],
    ),
  ]);
  throwIfAborted(signal);

  return {
    analysisIds: normalizedIds,
    analysisIdsKey: key,
    trips: filterRowsByAnalysis<DbTrip>(tripsResult, "listTrips", allowedIds),
    fueling: filterRowsByAnalysis<DbFueling>(fuelResult, "listFueling", allowedIds),
    dailyParts: filterRowsByAnalysis<DbEquipmentDailyPart>(
      dailyPartResult,
      "listDailyParts",
      allowedIds,
    ),
    fuelAllocations: (allocationResult as FuelAllocationSupportRow[]).filter((row) =>
      sourceBelongsToAnalyses(row.sourceFuelingId, allowedIds),
    ),
    fuelAllocationAudits: (allocationAuditResult as FuelAllocationAuditRow[]).filter((row) =>
      sourceBelongsToAnalyses(row.sourceFuelingId, allowedIds),
    ),
    fuelAttributions: (attrResult as DbFuelAttribution[]).filter((row) =>
      sourceBelongsToAnalyses(row.sourceFuelingId, allowedIds),
    ),
  };
}

const TAB_IDS_VISIBLE = [
  "overview",
  "dieselM3",
  "limpeza",
  "escavacao",
  "transporte",
  "tratamento",
  "compactacao",
  "hours",
] as const;

const ITEM_DASHBOARD_TABS = [
  { id: "overview", label: "Visão Geral" },
  { id: "dieselM3", label: "Diesel × m³" },
  { id: "limpeza", label: "Limpeza" },
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
  const [showPeriodComparison, setShowPeriodComparison] = useState(false);
  const [exportingTab, setExportingTab] = useState<"pdf" | "excel" | null>(null);
  const activeTabExportRef = useRef<HTMLDivElement>(null);
  const [dieselM3Filters, setDieselM3Filters] =
    useState<DieselM3Filters>(DIESEL_M3_DEFAULT_FILTERS);

  const analysesQuery = useQuery({
    queryKey: productionQueryKeys.analyses(),
    queryFn: ({ signal }) => fetchAnalyses(signal),
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });
  const analyses = useMemo(() => analysesQuery.data ?? [], [analysesQuery.data]);
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
  const tabChangeTimerRef = useRef(false);
  const debugProductionAudit = isDebugFlagEnabled("debugProductionAudit");
  const debugProductionMath = storageFlagEnabled("debugProductionMath");
  const debugFuelAllocation = storageFlagEnabled("debugFuelAllocation");
  const debugDieselM3 = storageFlagEnabled("debugDieselM3");
  const debugDieselIntegration = isDebugFlagEnabled("debugDieselIntegration");
  const debugDieselDay = storageFlagEnabled("debugDieselDay");
  const debugTransportDiesel = storageFlagEnabled("debugTransportDiesel");
  const debugM3LCompactacao = storageFlagEnabled("debugM3LCompactacao");
  const debugDailySeries = isDebugFlagEnabled("debugDailySeries");
  const debugPdeHours = storageFlagEnabled("debugPdeHours");
  const debugWorksiteHours = isDebugFlagEnabled("debugWorksiteHours");
  const debugAllocatedSourceIds = storageFlagEnabled("debugAllocatedSourceIds");

  useEffect(() => {
    if (!isDebugRuntimeEnabled()) return;
    console.log("[VERSAO_CALCULO_COMPACTACAO_OBRA_AWARE_V2]");
  }, []);

  const activeOperationalItem = isOperationalTab(activeTab) ? activeTab : null;
  const needsTechnicalAudit =
    showTechnicalAudit || debugProductionAudit || debugM3LCompactacao || debugDailySeries;
  const needsDieselFlowAudit = showTechnicalAudit || debugProductionAudit;
  const needsItemSummaries =
    activeTab === "overview" ||
    Boolean(activeOperationalItem) ||
    showTechnicalAudit ||
    debugProductionAudit ||
    debugProductionMath ||
    debugFuelAllocation ||
    debugM3LCompactacao ||
    debugDailySeries;
  const needsItemEquipmentStacks =
    activeTab === "overview" ||
    Boolean(activeOperationalItem) ||
    showTechnicalAudit ||
    debugProductionAudit ||
    debugFuelAllocation;
  const needsDieselM3 = activeTab === "dieselM3" || debugDieselM3 || debugDailySeries;
  const needsHours = activeTab === "hours";
  const needsLegacyCharts =
    activeTab === "production" ||
    activeTab === "consumption" ||
    activeTab === "trucks" ||
    activeTab === "equipment" ||
    activeTab === "efficiency";
  const needsAggregateMetrics = needsLegacyCharts;
  const needsEquipmentMetrics = showTechnicalAudit || needsLegacyCharts;
  const needsObraComparison = needsLegacyCharts;
  const analysesModal = useAnalysesModal();
  const handleActiveTabChange = useCallback(
    (tab: string) => {
      if (tab === activeTab) return;
      if (debugPerformanceEnabled()) {
        console.time("troca de aba");
        console.time("render active tab");
        tabChangeTimerRef.current = true;
      }
      setActiveTab(tab);
    },
    [activeTab, setActiveTab],
  );

  useEffect(() => {
    if (!tabChangeTimerRef.current || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      timeEnd("render active tab", true);
      timeEnd("troca de aba", true);
      tabChangeTimerRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab]);

  const updateDieselM3Filter = useCallback((key: keyof DieselM3Filters, value: string) => {
    setDieselM3Filters((current) => ({ ...current, [key]: value }));
  }, []);

  const dashboardQuery = useQuery({
    queryKey: productionQueryKeys.dashboard(selectedIdsKey),
    queryFn: ({ signal }) => fetchDashboardRows(selectedAnalysisIds, signal, analyses),
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
  const allocatedSourceIds = useMemo(
    () =>
      new Set(
        fuelAllocationRows
          .map((allocation) => allocation.sourceFuelingId)
          .filter((sourceFuelingId): sourceFuelingId is string => Boolean(sourceFuelingId)),
      ),
    [fuelAllocationRows],
  );
  const fuelAllocationAuditRows =
    dashboardRows?.fuelAllocationAudits ?? EMPTY_FUEL_ALLOCATION_AUDIT_ROWS;
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
      uniqueNormalizedObras([
        ...analysisSelection.selectedAnalyses.flatMap(analysisObraLabels),
        ...tripRows.map((row) => row.obra),
      ]),
    [analysisSelection.selectedAnalyses, tripRows],
  );
  const selectedAnalysisDateKeys = useMemo(
    () =>
      Array.from(
        new Set(
          analysisSelection.selectedAnalyses.flatMap((analysis) =>
            buildDateRange(analysis.dateStart, analysis.dateEnd),
          ),
        ),
      ).sort(),
    [analysisSelection.selectedAnalyses],
  );
  const visibleDateKeys = useMemo(
    () =>
      selectedAnalysisDateKeys.filter((date) => {
        return dateInFilterRange(date, filters.dateFrom, filters.dateTo);
      }),
    [filters.dateFrom, filters.dateTo, selectedAnalysisDateKeys],
  );
  const selectedObraLabels = useMemo(
    () => new Map(selectedObras.map((obra) => [normalizeObraKey(obra), obra])),
    [selectedObras],
  );
  const rawFuelById = useMemo(() => new Map(fuelRows.map((fuel) => [fuel.id, fuel])), [fuelRows]);
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
  const availableObras = useMemo(
    () =>
      uniqueNormalizedObras([
        ...selectedObras,
        ...obraScopedTripRows.map((row) => row.resolvedObraLabel ?? row.obra),
        ...obraScopedFuelRows.map((row) => row.resolvedObraLabel ?? row.obra),
        ...obraScopedDailyPartRows.map((row) => row.resolvedObraLabel ?? row.obra),
        ...obraScopedFuelAllocationRows.map((row) => row.resolvedObraLabel ?? row.obra),
        ...obraScopedFuelAttrRows.map((row) => row.resolvedObraLabel ?? row.obra),
      ]),
    [
      obraScopedDailyPartRows,
      obraScopedFuelAllocationRows,
      obraScopedFuelAttrRows,
      obraScopedFuelRows,
      obraScopedTripRows,
      selectedObras,
    ],
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
  const itemScopeFilters = useMemo(
    () => ({
      ...filters,
      equipment: [],
      aggregate: "all",
    }),
    [filters],
  );
  const {
    filteredTrips: itemScopeTrips,
    filteredFueling: itemScopeFueling,
    filteredDailyParts: itemScopeDailyParts,
  } = useFilteredData(
    obraScopedTripRows,
    obraScopedFuelRows,
    obraScopedDailyPartRows,
    itemScopeFilters,
  );
  const productiveTrips = useMemo(
    () => filteredTrips.filter((trip) => isRcoProductiveTrip(trip)),
    [filteredTrips],
  );
  const itemScopeProductiveTrips = useMemo(
    () => itemScopeTrips.filter((trip) => isRcoProductiveTrip(trip)),
    [itemScopeTrips],
  );
  const chartRcoObras = useMemo(() => {
    const selectedDomain = buildRcoObraDomain({
      rows: selectedObras,
      getObra: (obra) => obra,
      getObraKey: (obra) => obraSelectionKey(obra),
      getStatus: () => "ok",
    });
    const productionDomain = buildRcoObraDomain({
      rows: productiveTrips,
      getObra: (trip) => resolvedWorksiteLabel(trip as DbTrip & ObraScopeAudit),
      getObraKey: (trip) => resolvedWorksiteKey(trip as DbTrip & ObraScopeAudit),
      getStatus: (trip) => obraStatusForRow(trip as DbTrip & ObraScopeAudit),
    });
    const byKey = new Map(selectedDomain.map((obra) => [obra.obraKey, obra]));
    productionDomain.forEach((obra) => {
      if (!byKey.has(obra.obraKey)) byKey.set(obra.obraKey, obra);
    });
    return [...byKey.values()].sort((a, b) => a.obra.localeCompare(b.obra, "pt-BR"));
  }, [productiveTrips, selectedObras]);

  const visibleObras = useMemo(
    () =>
      filters.obra === "all"
        ? availableObras
        : availableObras.filter((obra) => obraMatches(obra, filters.obra)),
    [availableObras, filters.obra],
  );
  const chartVisibleObras = useMemo(
    () =>
      filters.obra === "all"
        ? chartRcoObras
        : chartRcoObras.filter(
            (obra) =>
              obra.obraKey === obraSelectionKey(filters.obra) ||
              obraMatches(obra.obra, filters.obra),
          ),
    [chartRcoObras, filters.obra],
  );
  const compareByObra = filters.obra === "all" && chartVisibleObras.length > 1;
  const comparisonSeries = useMemo<ComparisonSeries[]>(
    () =>
      compareByObra
        ? chartVisibleObras.map((obra, index) => ({
            obra: obra.obra,
            obraKey: obra.obraKey,
            key: `obra${index}`,
            color: obra.color,
            compactedKey: `obra${index}CompactedM3`,
            looseKey: `obra${index}LooseM3`,
            dieselKey: `obra${index}Diesel`,
            fuelPerM3Key: `obra${index}FuelPerM3`,
          }))
        : [],
    [chartVisibleObras, compareByObra],
  );
  const distinctMaterials = useMemo(
    () => uniqueValues(productiveTrips.map((t) => t.material)),
    [productiveTrips],
  );
  const distinctEquipment = useMemo(() => {
    const labels = new Map<string, string>();
    const pdeFleetKeys = buildPdeFleetKeys(itemScopeDailyParts);
    itemScopeFueling.forEach((fuel) => {
      const context = fuelingEquipmentContext(fuel);
      const key = equipmentKeyByPdeRule(equipmentRaw(fuel), pdeFleetKeys, context);
      if (key && key.startsWith("FROTA:")) labels.set(key, equipmentLabelFromKey(key));
    });
    itemScopeDailyParts.forEach((part) => {
      if (!hasRealPdeEvidence(part)) return;
      const key = equipmentKeyByPdeRule(part.fleet || part.fleetLabel, pdeFleetKeys, "dailyPart");
      if (key && key.startsWith("FROTA:")) {
        labels.set(key, equipmentLabelFromKey(key));
      }
    });
    return sortEquipmentLabels([...labels.values()]);
  }, [itemScopeDailyParts, itemScopeFueling]);
  const distinctAggregates = useMemo(() => {
    const labels = new Map<string, string>();
    const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
    productiveTrips.forEach((trip) => {
      if (isTripPipaLike(trip)) return;
      const key = normalizeEquipmentKey(equipmentRaw(trip), "aggregate");
      if (key && isAggregateEquipment(key)) labels.set(key, equipmentLabelFromKey(key));
    });
    filteredFueling.forEach((fuel) => {
      const context = fuelingEquipmentContext(fuel);
      const key = equipmentKeyByPdeRule(equipmentRaw(fuel), pdeFleetKeys, context);
      if (
        isPipaLike({
          prefix: fuel.prefix,
          fleet: key || fuel.vehicleId,
          plate: fuel.plate,
          vehicleType: fuel.vehicleType,
          type: fuel.vehicleType,
          equipmentLabel: equipmentLabelFromKey(key, equipmentLabel(fuel, context)),
          description: `${fuel.owner} ${fuel.operator} ${fuel.status ?? ""}`,
          raw: fuel,
        })
      ) {
        return;
      }
      if (key && key.startsWith("CB:")) labels.set(key, equipmentLabelFromKey(key));
    });
    return sortEquipmentLabels([...labels.values()]);
  }, [filteredDailyParts, filteredFueling, productiveTrips]);

  const filteredFuelAllocations = useMemo(() => {
    return obraScopedFuelAllocationRows.filter((row) => {
      if (!dateInFilterRange(row.pdeDate, filters.dateFrom, filters.dateTo)) return false;
      if (
        filters.obra !== "all" &&
        resolvedWorksiteKey(row as FuelAllocationSupportRow & ObraScopeAudit) !==
          obraSelectionKey(filters.obra)
      ) {
        return false;
      }
      if (
        filters.equipment.length > 0 &&
        !filters.equipment.some(
          (selected) =>
            equipmentMatches(row.fleet, selected, "fuelAllocation") ||
            equipmentMatches(row.equipmentId, selected, "fuelAllocation"),
        )
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
      if (!dateInFilterRange(row.date, filters.dateFrom, filters.dateTo)) return false;
      if (
        filters.obra !== "all" &&
        resolvedWorksiteKey(row as DbFuelAttribution & ObraScopeAudit) !==
          obraSelectionKey(filters.obra)
      ) {
        return false;
      }
      if (
        filters.equipment.length > 0 &&
        !filters.equipment.some(
          (selected) =>
            equipmentMatches(row.fleet, selected, "fuelAttribution") ||
            equipmentMatches(row.fleetLabel, selected, "fuelAttribution"),
        )
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
      : "";
  const absentWorksiteAuditRows = useMemo<AbsentWorksiteAuditRow[]>(() => {
    if (!showTechnicalAudit && !debugProductionAudit && !debugDieselIntegration) return [];
    const fuelRowsAudit = filteredFueling
      .filter((row) => obraStatusForRow(row as DbFueling & ObraScopeAudit) === "absent")
      .map((row) => ({
        source: "CMB",
        date: extractDateKey(row.datetime),
        equipment: equipmentLabel(row, "fueling"),
        resolvedObraLabel:
          (row as DbFueling & ObraScopeAudit).resolvedObraLabel ?? OBRA_SCOPE_UNINFORMED_LABEL,
        resolvedObraKey:
          (row as DbFueling & ObraScopeAudit).resolvedObraKey ??
          normalizeObraKey(OBRA_SCOPE_UNINFORMED_LABEL),
        obraStatus: "absent" as ObraStatus,
        liters: row.liters || 0,
        hours: 0,
        reason: "WORKSITE_ABSENT" as DieselIntegrationStatus,
      }));
    const allocationRowsAudit = filteredFuelAllocations
      .filter(
        (row) => obraStatusForRow(row as FuelAllocationSupportRow & ObraScopeAudit) === "absent",
      )
      .map((row) => ({
        source: "fuel_allocations",
        date: row.pdeDate,
        equipment: row.fleet || row.equipmentId || "SEM_EQUIPAMENTO",
        resolvedObraLabel:
          (row as FuelAllocationSupportRow & ObraScopeAudit).resolvedObraLabel ??
          OBRA_SCOPE_UNINFORMED_LABEL,
        resolvedObraKey:
          (row as FuelAllocationSupportRow & ObraScopeAudit).resolvedObraKey ??
          normalizeObraKey(OBRA_SCOPE_UNINFORMED_LABEL),
        obraStatus: "absent" as ObraStatus,
        liters: row.litersAllocated || 0,
        hours: row.allocatedHours || 0,
        reason: "WORKSITE_ABSENT" as DieselIntegrationStatus,
      }));
    const pdeRowsAudit = filteredDailyParts
      .filter((row) => obraStatusForRow(row as DbEquipmentDailyPart & ObraScopeAudit) === "absent")
      .map((row) => ({
        source: "equipment_daily_parts",
        date: row.date,
        equipment: displayEquipmentLabel(row.fleet || row.fleetLabel, "dailyPart"),
        resolvedObraLabel:
          (row as DbEquipmentDailyPart & ObraScopeAudit).resolvedObraLabel ??
          OBRA_SCOPE_UNINFORMED_LABEL,
        resolvedObraKey:
          (row as DbEquipmentDailyPart & ObraScopeAudit).resolvedObraKey ??
          normalizeObraKey(OBRA_SCOPE_UNINFORMED_LABEL),
        obraStatus: "absent" as ObraStatus,
        liters: 0,
        hours: pdeRowHours(row),
        reason: "WORKSITE_ABSENT" as DieselIntegrationStatus,
      }));
    return [...fuelRowsAudit, ...allocationRowsAudit, ...pdeRowsAudit].sort(
      (a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source),
    );
  }, [
    debugDieselIntegration,
    debugProductionAudit,
    filteredDailyParts,
    filteredFuelAllocations,
    filteredFueling,
    showTechnicalAudit,
  ]);

  const attributedFueling = useMemo<Array<DbFueling & IntegrationAuditMetadata>>(() => {
    if (hasOfficialFuelAllocations) {
      const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
      const aggregateKeys = buildTripAggregateKeys(productiveTrips);
      const allocatedFueling = filteredFuelAllocations.map((a) => {
        const raw = rawFuelById.get(a.sourceFuelingId);
        const allocationObra = a.obra || "";
        const rawObra = raw?.obra || "";
        const allocationObraStatus = obraStatusForRow(
          a as FuelAllocationSupportRow & ObraScopeAudit,
        );
        const rawDiffersFromAllocation =
          Boolean(rawObra.trim() && allocationObra.trim()) &&
          normalizeObraKey(rawObra) !== normalizeObraKey(allocationObra);
        const integrationStatus = dieselIntegrationStatus({
          diesel: a.litersAllocated || 0,
          m3: 1,
          hours: a.allocatedHours || 0,
          obraStatus: allocationObraStatus,
          wrongWorksite: rawDiffersFromAllocation,
        });
        return {
          id: a.id,
          analysisId: "allocated",
          datetime: `${a.pdeDate}T12:00:00.000Z`,
          owner: "",
          plate: raw?.plate ?? "",
          vehicleId: raw?.vehicleId ?? "",
          prefix: a.fleet,
          vehicleType: raw?.vehicleType ?? "",
          kmPrevious: a.hourmeterStart,
          kmCurrent: a.hourmeterEnd,
          liters: a.litersAllocated || 0,
          unitPrice: 0,
          total: a.costAllocated || 0,
          consumption: 0,
          standardConsumption: 0,
          operator: raw?.operator ?? "",
          obra: allocationObra,
          status: null,
          importBatchId: a.sourceFuelingId,
          importedAt: a.createdAt ?? "",
          obraOriginal: (a as FuelAllocationSupportRow & ObraScopeAudit).obraOriginal,
          obraScopeStatus: (a as FuelAllocationSupportRow & ObraScopeAudit).obraScopeStatus,
          obraStatus: allocationObraStatus,
          resolvedObraKey:
            (a as FuelAllocationSupportRow & ObraScopeAudit).resolvedObraKey ??
            normalizeObraKey(allocationObra),
          resolvedObraLabel:
            (a as FuelAllocationSupportRow & ObraScopeAudit).resolvedObraLabel ?? allocationObra,
          integrationStatus,
          integrationReason: rawDiffersFromAllocation
            ? `CMB obra=${rawObra || "vazia"} divergente da allocation/PDE obra=${allocationObra || "vazia"}`
            : dieselIntegrationReason(integrationStatus),
          sourceWorksite: rawObra,
        } satisfies DbFueling & IntegrationAuditMetadata;
      });
      const aggregateRawFueling = filteredFueling.flatMap((fuel) => {
        const fallback = resolveRawFuelFallbackDecision(
          fuel,
          allocatedSourceIds,
          pdeFleetKeys,
          aggregateKeys,
        );
        if (!fallback.includedAsRawFallback) return [];
        const obraStatus = obraStatusForRow(fuel as DbFueling & ObraScopeAudit);
        const integrationStatus = dieselIntegrationStatus({
          diesel: fuel.liters || 0,
          m3: 1,
          hours: 0,
          obraStatus,
        });
        return [
          {
            ...fuel,
            obraStatus,
            integrationStatus,
            integrationReason: dieselIntegrationReason(integrationStatus),
            sourceWorksite: fuel.obra,
          } satisfies DbFueling & IntegrationAuditMetadata,
        ];
      });
      return [...allocatedFueling, ...aggregateRawFueling];
    }
    if (!hasLegacyFuelAttributions) {
      return filteredFueling.map((fuel) => {
        const obraStatus = obraStatusForRow(fuel as DbFueling & ObraScopeAudit);
        const integrationStatus = dieselIntegrationStatus({
          diesel: fuel.liters || 0,
          m3: 1,
          hours: 0,
          obraStatus,
        });
        return {
          ...fuel,
          obraStatus,
          integrationStatus,
          integrationReason: dieselIntegrationReason(integrationStatus),
          sourceWorksite: fuel.obra,
        };
      });
    }
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
      obraStatus: obraStatusForRow(a as DbFuelAttribution & ObraScopeAudit),
      resolvedObraKey:
        (a as DbFuelAttribution & ObraScopeAudit).resolvedObraKey ?? normalizeObraKey(a.obra),
      resolvedObraLabel:
        (a as DbFuelAttribution & ObraScopeAudit).resolvedObraLabel ?? worksiteLabel(a.obra),
      integrationStatus: dieselIntegrationStatus({
        diesel: a.litersAttributed || 0,
        m3: 1,
        hours: 0,
        obraStatus: obraStatusForRow(a as DbFuelAttribution & ObraScopeAudit),
      }),
      integrationReason: dieselIntegrationReason(
        dieselIntegrationStatus({
          diesel: a.litersAttributed || 0,
          m3: 1,
          hours: 0,
          obraStatus: obraStatusForRow(a as DbFuelAttribution & ObraScopeAudit),
        }),
      ),
      sourceWorksite: a.obra || "",
    }));
  }, [
    allocatedSourceIds,
    filteredAttributions,
    filteredFuelAllocations,
    filteredFueling,
    filteredDailyParts,
    hasLegacyFuelAttributions,
    hasOfficialFuelAllocations,
    productiveTrips,
    rawFuelById,
  ]);

  const productionDateObraKeys = useMemo(() => {
    const keys = new Set<string>();
    itemScopeProductiveTrips.forEach((trip) => {
      const date = extractDateKey(trip.datetime);
      if (!date) return;
      const compactedM3 = calculateCompactedVolume(trip.cubicMLoose || 0, trip.swellFactorApplied);
      if (compactedM3 <= 0) return;
      keys.add(dateWorksiteKey(date, resolvedWorksiteKey(trip as DbTrip & ObraScopeAudit)));
    });
    return keys;
  }, [itemScopeProductiveTrips]);

  const classifiedFuelUsageRows = useMemo<ClassifiedFuelUsageRow[]>(() => {
    const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
    const aggregateKeys = buildTripAggregateKeys(itemScopeProductiveTrips);
    return attributedFueling.map((fuel) => {
      const date = extractDateKey(fuel.datetime);
      const scopedFuel = fuel as DbFueling & IntegrationAuditMetadata;
      const obra = resolvedWorksiteLabel(scopedFuel);
      const obraKey = resolvedWorksiteKey(scopedFuel);
      const productionKey = dateWorksiteKey(date, obraKey);
      const hasProduction = Boolean(date && productionDateObraKeys.has(productionKey));
      const classification = resolveFuelOperationalClassification(
        fuel,
        pdeFleetKeys,
        aggregateKeys,
      );
      const bucket: FuelUsageBucket = hasProduction ? "producao" : "limpeza";
      const productiveExclusion = excludedFuelFromProductionRule({
        obra,
        obraKey,
        date,
        item: classification.operationalItem,
        equipmentKey: classification.equipment,
        equipmentLabel: classification.resolvedLabel,
        rawEquipment: fuel.prefix || fuel.vehicleId || fuel.plate,
        vehicleType: fuel.vehicleType,
        description: `${fuel.owner} ${fuel.operator} ${fuel.status ?? ""}`,
      });
      return {
        id: fuel.id,
        obra,
        obraKey,
        date,
        fleet: fuel.prefix || fuel.vehicleId || fuel.plate || classification.equipment,
        equipmentKey: classification.equipment,
        equipment: classification.resolvedLabel,
        liters: fuel.liters || 0,
        cost: fuel.total || 0,
        hours: Math.max(0, (fuel.kmCurrent || 0) - (fuel.kmPrevious || 0)),
        sourceFuelingId: fuelSourceId(fuel),
        source: dieselM3SourceLabel(dieselM3SourceForFuel(fuel)),
        bucket,
        reason: hasProduction ? "Produção RCO encontrada na obra/data" : "Sem produção associada",
        item: classification.operationalItem,
        excludedFromProductiveCalculation: Boolean(productiveExclusion),
        productiveExclusionReason: productiveExclusion?.reason,
        fuel,
      };
    });
  }, [attributedFueling, filteredDailyParts, itemScopeProductiveTrips, productionDateObraKeys]);

  const productionFueling = useMemo(
    () =>
      classifiedFuelUsageRows
        .filter(
          (row) =>
            !row.excludedFromProductiveCalculation &&
            (row.bucket === "producao" || row.item === "limpeza"),
        )
        .map((row) => row.fuel),
    [classifiedFuelUsageRows],
  );

  const nonProductiveFuelAuditRows = useMemo<NonProductiveFuelAuditRow[]>(
    () =>
      classifiedFuelUsageRows
        .filter((row) => row.excludedFromProductiveCalculation && row.liters > 0)
        .map((row) => ({
          obra: row.obra,
          date: row.date,
          equipment: row.equipment,
          item: operationalItemLabel(row.item),
          liters: row.liters,
          reason: row.productiveExclusionReason || row.reason,
        }))
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.obra.localeCompare(b.obra, "pt-BR") ||
            a.equipment.localeCompare(b.equipment, "pt-BR"),
        ),
    [classifiedFuelUsageRows],
  );

  const limpezaRows = useMemo(
    () =>
      classifiedFuelUsageRows
        .filter((row) => row.bucket === "limpeza" && row.liters > 0)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.obra.localeCompare(b.obra, "pt-BR") ||
            b.liters - a.liters,
        ),
    [classifiedFuelUsageRows],
  );

  const allocatedSourceIdsDebugRows = useMemo(() => {
    if (!debugAllocatedSourceIds) return [];
    const pdeFleetKeys = buildPdeFleetKeys(itemScopeDailyParts);
    const aggregateKeys = buildTripAggregateKeys(itemScopeProductiveTrips);

    return filteredFueling.map((fuel) => {
      const fallback = resolveRawFuelFallbackDecision(
        fuel,
        allocatedSourceIds,
        pdeFleetKeys,
        aggregateKeys,
      );
      const context = fuelingEquipmentContext(fuel);
      const equipmentKey =
        fallback.classification?.equipment ||
        equipmentKeyByPdeRule(equipmentRaw(fuel), pdeFleetKeys, context);
      const obraStatus =
        (fuel as DbFueling & ObraScopeAudit).obraScopeStatus ||
        (!fuel.obra.trim() ? OBRA_SCOPE_STATUS_MISSING : "");

      return {
        fuelingId: fuel.id,
        date: extractDateKey(fuel.datetime),
        equipment:
          fallback.classification?.resolvedLabel ||
          equipmentLabelFromKey(equipmentKey, equipmentLabel(fuel, context)),
        obra: fuel.obra || OBRA_SCOPE_UNINFORMED_LABEL,
        liters: fixedNumber(fuel.liters || 0, 2),
        hasOfficialAllocation: fallback.hasOfficialAllocation,
        includedAsRawFallback: fallback.includedAsRawFallback,
        reason: fallback.reason,
        auditStatus: fallback.hasOfficialAllocation
          ? "CMB bloqueado: já alocado oficialmente"
          : obraStatus || "OK",
        obraStatus,
      };
    });
  }, [
    allocatedSourceIds,
    debugAllocatedSourceIds,
    filteredFueling,
    itemScopeDailyParts,
    itemScopeProductiveTrips,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !debugAllocatedSourceIds) return;
    console.groupCollapsed("[debugAllocatedSourceIds] CMB bruto x fuel_allocations oficiais");
    console.table(allocatedSourceIdsDebugRows);
    console.groupEnd();
  }, [allocatedSourceIdsDebugRows, debugAllocatedSourceIds]);

  const dieselIntegrationDebugRows = useMemo(() => {
    if (!debugDieselIntegration) return [];
    const pdeFleetKeys = buildPdeFleetKeys(itemScopeDailyParts);
    const aggregateKeys = buildTripAggregateKeys(itemScopeProductiveTrips);
    const filteredAllocationIds = new Set(filteredFuelAllocations.map((row) => row.id));
    const attributedSourceIds = new Set(attributedFueling.map((fuel) => fuelSourceId(fuel)));
    const pdeById = new Map(
      dailyPartRows.map((part) => {
        const record = part as DbEquipmentDailyPart & { pdeId?: string };
        return [String(record.pdeId ?? record.id), part] as const;
      }),
    );

    const worksiteFilterStatus = (obra: string) => {
      const scoped = resolveScopedObra(obra, selectedObraLabels);
      if (!scoped) {
        return {
          obra: obra || OBRA_SCOPE_UNINFORMED_LABEL,
          obraStatus: "wrong" as ObraStatus,
          status: "WRONG_WORKSITE" as DieselIntegrationStatus,
          reason: "obra nao pertence as obras selecionadas",
        };
      }
      if (
        filters.obra !== "all" &&
        normalizeObraKey(scoped.obra) !== normalizeObraKey(filters.obra)
      ) {
        return {
          obra: scoped.obra,
          obraStatus: scoped.obraStatus,
          status: "WRONG_WORKSITE" as DieselIntegrationStatus,
          reason: "obra diferente do filtro global",
        };
      }
      return {
        obra: scoped.obra,
        obraStatus: scoped.obraStatus,
        status:
          scoped.obraStatus === "absent"
            ? ("WORKSITE_ABSENT" as DieselIntegrationStatus)
            : ("OK" as DieselIntegrationStatus),
        reason: scoped.scopeStatus || "OK",
      };
    };

    const rawRows = fuelRows.map((fuel) => {
      const classification = resolveFuelOperationalClassification(
        fuel,
        pdeFleetKeys,
        aggregateKeys,
      );
      const worksite = worksiteFilterStatus(fuel.obra);
      const blocked = allocatedSourceIds.has(fuel.id);
      const date = extractDateKey(fuel.datetime);
      const dateFiltered = !dateInFilterRange(date, filters.dateFrom, filters.dateTo);
      const status = blocked ? "BLOCKED_SOURCE" : dateFiltered ? "NO_DATA" : worksite.status;
      return {
        source: "CMB",
        id: fuel.id,
        date,
        pdeDate: "",
        equipmentKey: classification.equipment,
        equipmentLabel: classification.resolvedLabel,
        cmbWorksite: fuel.obra || OBRA_SCOPE_UNINFORMED_LABEL,
        allocationWorksite: "",
        pdeWorksite: "",
        scopedWorksite: worksite.obra,
        obraStatus: worksite.obraStatus,
        liters: fixedNumber(fuel.liters || 0, 2),
        included: attributedSourceIds.has(fuel.id),
        status,
        reason: blocked
          ? "BLOCKED_SOURCE: CMB ja possui fuel_allocations oficiais"
          : dateFiltered
            ? "fora do filtro de data"
            : worksite.reason,
      };
    });

    const allocationRows = fuelAllocationRows.map((allocation) => {
      const raw = rawFuelById.get(allocation.sourceFuelingId);
      const pde = allocation.pdeId ? pdeById.get(allocation.pdeId) : undefined;
      const worksite = worksiteFilterStatus(allocation.obra);
      const rawWorksite = raw?.obra || "";
      const pdeWorksite = pde?.obra || "";
      const rawDiffers =
        Boolean(rawWorksite.trim() && allocation.obra.trim()) &&
        normalizeObraKey(rawWorksite) !== normalizeObraKey(allocation.obra);
      const pdeDiffers =
        Boolean(pdeWorksite.trim() && allocation.obra.trim()) &&
        normalizeObraKey(pdeWorksite) !== normalizeObraKey(allocation.obra);
      const dateFiltered = !dateInFilterRange(allocation.pdeDate, filters.dateFrom, filters.dateTo);
      const status =
        rawDiffers || pdeDiffers ? "WRONG_WORKSITE" : dateFiltered ? "NO_DATA" : worksite.status;
      return {
        source: "fuel_allocation",
        id: allocation.id,
        date: extractDateKey(raw?.datetime ?? ""),
        pdeDate: allocation.pdeDate,
        equipmentKey: normalizeEquipmentKey(allocation.fleet, "fuelAllocation"),
        equipmentLabel: equipmentLabelFromKey(allocation.fleet, allocation.fleet),
        cmbWorksite: rawWorksite || OBRA_SCOPE_UNINFORMED_LABEL,
        allocationWorksite: allocation.obra || OBRA_SCOPE_UNINFORMED_LABEL,
        pdeWorksite: pdeWorksite || allocation.obra || OBRA_SCOPE_UNINFORMED_LABEL,
        scopedWorksite: worksite.obra,
        obraStatus: worksite.obraStatus,
        liters: fixedNumber(allocation.litersAllocated || 0, 2),
        included:
          filteredAllocationIds.has(allocation.id) &&
          attributedSourceIds.has(allocation.sourceFuelingId),
        status,
        reason: rawDiffers
          ? "WRONG_WORKSITE: obra do CMB diverge da allocation/PDE"
          : pdeDiffers
            ? "WRONG_WORKSITE: obra do PDE diverge da allocation"
            : dateFiltered
              ? "fora do filtro de data"
              : worksite.reason,
      };
    });

    return [...rawRows, ...allocationRows].sort(
      (a, b) =>
        String(a.date || a.pdeDate).localeCompare(String(b.date || b.pdeDate)) ||
        a.source.localeCompare(b.source) ||
        a.equipmentLabel.localeCompare(b.equipmentLabel),
    );
  }, [
    allocatedSourceIds,
    attributedFueling,
    dailyPartRows,
    debugDieselIntegration,
    filteredFuelAllocations,
    filters.dateFrom,
    filters.dateTo,
    filters.obra,
    fuelAllocationRows,
    fuelRows,
    itemScopeDailyParts,
    itemScopeProductiveTrips,
    rawFuelById,
    selectedObraLabels,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !debugDieselIntegration) return;
    console.groupCollapsed(`${DEBUG_FLAG_LABELS.debugDieselIntegration} RCO x PDE x CMB por obra`);
    console.table(dieselIntegrationDebugRows);
    console.groupEnd();
  }, [debugDieselIntegration, dieselIntegrationDebugRows]);

  const transportDieselDebugRows = useMemo<TransportDieselDebugRow[]>(() => {
    if (!debugTransportDiesel) return [];
    const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
    const aggregateKeys = buildTripAggregateKeys(productiveTrips);
    const rawFuelById = new Map(fuelRows.map((fuel) => [fuel.id, fuel]));

    return attributedFueling
      .filter((fuel) => (fuel.liters || 0) > 0)
      .map((fuel) => {
        const classification = resolveFuelOperationalClassification(
          fuel,
          pdeFleetKeys,
          aggregateKeys,
        );
        const sourceId = fuelSourceId(fuel);
        const raw = rawFuelById.get(sourceId);
        const rawDescription = [
          raw?.owner ?? fuel.owner,
          raw?.operator ?? fuel.operator,
          raw?.status ?? fuel.status ?? "",
        ]
          .filter(Boolean)
          .join(" ");

        return {
          date: extractDateKey(fuel.datetime),
          liters: fixedNumber(fuel.liters || 0, 2),
          equipmentKey: classification.equipment,
          equipmentLabel: classification.resolvedLabel,
          rawPrefix: raw?.prefix ?? fuel.prefix,
          rawFleet: raw?.vehicleId ?? fuel.vehicleId,
          rawPlate: raw?.plate ?? fuel.plate,
          rawId: raw?.id ?? fuel.id,
          rawVehicleType: raw?.vehicleType ?? fuel.vehicleType,
          rawDescription,
          source: classification.dieselAuditSource,
          sourceId,
          isFromFuelAllocation: fuel.analysisId === "allocated",
          isFromRawFueling: fuel.analysisId !== "allocated" && fuel.analysisId !== "attributed",
          existsInPDE: classification.existsInPDE,
          isAggregate: classification.isAggregate,
          isPipa: classification.isPipa,
          resolvedItem: classification.operationalItem,
          includedInTransport: classification.includedInTransport,
          reason: classification.reason,
        };
      });
  }, [attributedFueling, debugTransportDiesel, filteredDailyParts, fuelRows, productiveTrips]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!debugTransportDiesel) return;
    const transportDieselDebug = transportDieselDebugRows;
    console.table(transportDieselDebug);
  }, [debugTransportDiesel, transportDieselDebugRows]);

  const dieselDayDebug = useMemo(() => {
    if (!debugDieselDay) return [];
    const targetDate = "2026-05-20";
    const rawFuelById = new Map(obraScopedFuelRows.map((fuel) => [fuel.id, fuel]));
    const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
    const aggregateKeys = buildTripAggregateKeys(productiveTrips);
    const filteredAllocationIds = new Set(filteredFuelAllocations.map((row) => row.id));
    const filteredRawFuelIds = new Set(filteredFueling.map((row) => row.id));
    const attributedIds = new Set(attributedFueling.map((row) => row.id));

    const filterEquipmentMatches = (key: string, selected: string) => {
      const context: EquipmentContext = key.startsWith("CB:") ? "aggregate" : "ownFleet";
      return (
        equipmentMatches(key, selected, context) ||
        equipmentMatches(equipmentLabelFromKey(key), selected, context)
      );
    };

    const rawExclusionReason = (fuel: DbFueling, key: string) => {
      const date = extractDateKey(fuel.datetime);
      if (filters.dateFrom && !dateInFilterRange(date, filters.dateFrom, "")) {
        return "fora da data inicial";
      }
      if (filters.dateTo && !dateInFilterRange(date, "", filters.dateTo)) {
        return "fora da data final";
      }
      if (
        filters.obra !== "all" &&
        resolvedWorksiteKey(fuel as DbFueling & ObraScopeAudit) !== obraSelectionKey(filters.obra)
      ) {
        return "obra filtrada";
      }
      if (
        filters.equipment.length > 0 &&
        !filters.equipment.some((selected) => filterEquipmentMatches(key, selected))
      ) {
        return "equipamento filtrado";
      }
      if (filters.aggregate !== "all" && !filterEquipmentMatches(key, filters.aggregate)) {
        return "agregado filtrado";
      }
      if (filters.analysisType === "consumption-only" && fuel.liters <= 0) {
        return "sem litros no filtro consumo";
      }
      return "";
    };

    const allocationExclusionReason = (row: FuelAllocationSupportRow) => {
      if (filters.dateFrom && !dateInFilterRange(row.pdeDate, filters.dateFrom, ""))
        return "pdeDate antes da data inicial";
      if (filters.dateTo && !dateInFilterRange(row.pdeDate, "", filters.dateTo))
        return "pdeDate depois da data final";
      if (
        filters.obra !== "all" &&
        resolvedWorksiteKey(row as FuelAllocationSupportRow & ObraScopeAudit) !==
          obraSelectionKey(filters.obra)
      ) {
        return "obra filtrada";
      }
      if (
        filters.equipment.length > 0 &&
        !filters.equipment.some(
          (selected) =>
            equipmentMatches(row.fleet, selected, "fuelAllocation") ||
            equipmentMatches(row.equipmentId, selected, "fuelAllocation"),
        )
      ) {
        return "equipamento filtrado";
      }
      if (filters.analysisType === "consumption-only" && row.litersAllocated <= 0) {
        return "sem litros alocados";
      }
      return "";
    };

    const rows: Array<Record<string, unknown>> = [];

    obraScopedFuelRows
      .filter((fuel) => extractDateKey(fuel.datetime) === targetDate)
      .forEach((fuel) => {
        const context = fuelingEquipmentContext(fuel);
        const equipmentKey = equipmentKeyByPdeRule(equipmentRaw(fuel), pdeFleetKeys, context);
        const classification = resolveFuelOperationalClassification(
          fuel,
          pdeFleetKeys,
          aggregateKeys,
        );
        const filterReason = rawExclusionReason(fuel, equipmentKey);
        const includedInGraph = attributedIds.has(fuel.id);
        const excludedReason =
          filterReason ||
          (includedInGraph
            ? ""
            : hasOfficialFuelAllocations
              ? "frota propria usa fuel_allocations por pdeDate; CMB bruto nao entra direto"
              : "nao entrou em attributedFueling");
        rows.push({
          date: targetDate,
          dataUsada: "data CMB",
          equipment: equipmentLabelFromKey(equipmentKey, equipmentLabel(fuel, context)),
          item: operationalItemLabel(classification.operationalItem),
          rawLiters: fixedNumber(fuel.liters || 0, 3),
          allocatedLiters: 0,
          source: "CMB bruto",
          included: includedInGraph,
          excludedReason,
          filterMatched: !filterReason && filteredRawFuelIds.has(fuel.id),
          formula: "fueling.liters",
          fuelingId: fuel.id,
          sourceFuelingDate: targetDate,
          pdeDate: "",
          obra: fuel.obra,
          vehicleType: fuel.vehicleType,
          previousHourmeter: fuel.kmPrevious,
          currentHourmeter: fuel.kmCurrent,
        });
      });

    fuelAllocationRows
      .filter((row) => {
        const raw = rawFuelById.get(row.sourceFuelingId);
        return row.pdeDate === targetDate || extractDateKey(raw?.datetime ?? "") === targetDate;
      })
      .forEach((row) => {
        const raw = rawFuelById.get(row.sourceFuelingId);
        const sourceFuelingDate = extractDateKey(raw?.datetime ?? "");
        const displayDate = row.pdeDate === targetDate ? row.pdeDate : sourceFuelingDate;
        const excludedReason = allocationExclusionReason(row);
        const classificationFuel: DbFueling = {
          id: row.id,
          analysisId: "allocated",
          datetime: `${row.pdeDate}T12:00:00.000Z`,
          owner: "",
          plate: raw?.plate ?? "",
          vehicleId: raw?.vehicleId ?? "",
          prefix: row.fleet,
          vehicleType: raw?.vehicleType ?? "",
          kmPrevious: row.hourmeterStart,
          kmCurrent: row.hourmeterEnd,
          liters: row.litersAllocated || 0,
          unitPrice: 0,
          total: row.costAllocated || 0,
          consumption: 0,
          standardConsumption: 0,
          operator: "",
          obra: row.obra || raw?.obra || "",
          status: null,
          importBatchId: row.sourceFuelingId,
          importedAt: row.createdAt ?? "",
        };
        const classification = resolveFuelOperationalClassification(
          classificationFuel,
          pdeFleetKeys,
          aggregateKeys,
        );
        rows.push({
          date: displayDate,
          dataUsada: "pdeDate",
          equipment: equipmentLabelFromKey(row.fleet, row.fleet),
          item: operationalItemLabel(classification.operationalItem),
          rawLiters: raw ? fixedNumber(raw.liters || 0, 3) : 0,
          allocatedLiters: fixedNumber(row.litersAllocated || 0, 3),
          source: "fuel_allocations",
          included: filteredAllocationIds.has(row.id) && attributedIds.has(row.id),
          excludedReason,
          filterMatched: !excludedReason,
          formula: "(hourmeterEnd - hourmeterStart) * (sourceLiters / sourceHourmeterDelta)",
          fuelingId: row.sourceFuelingId,
          sourceFuelingDate,
          pdeDate: row.pdeDate,
          obra: row.obra,
          allocatedHours: fixedNumber(row.allocatedHours || 0, 3),
          previousHourmeter: row.hourmeterStart,
          currentHourmeter: row.hourmeterEnd,
        });
      });

    attributedFueling
      .filter((fuel) => extractDateKey(fuel.datetime) === targetDate)
      .forEach((fuel) => {
        const classification = resolveFuelOperationalClassification(
          fuel,
          pdeFleetKeys,
          aggregateKeys,
        );
        rows.push({
          date: targetDate,
          dataUsada: "linha exibida no grafico",
          equipment: classification.resolvedLabel,
          item: operationalItemLabel(classification.operationalItem),
          rawLiters: 0,
          allocatedLiters: fixedNumber(fuel.liters || 0, 3),
          source:
            fuel.analysisId === "allocated"
              ? "grafico via fuel_allocations"
              : "grafico via CMB bruto",
          included: true,
          excludedReason: "",
          filterMatched: true,
          formula:
            fuel.analysisId === "allocated"
              ? "dailyData.diesel soma fuel_allocations.litersAllocated por pdeDate"
              : "dailyData.diesel soma fueling.liters por data CMB",
          fuelingId: fuelSourceId(fuel),
          sourceFuelingDate: fuel.analysisId === "allocated" ? "" : targetDate,
          pdeDate: targetDate,
          obra: fuel.obra,
        });
      });

    return rows;
  }, [
    attributedFueling,
    debugDieselDay,
    filteredDailyParts,
    filteredFuelAllocations,
    filteredFueling,
    filters,
    fuelAllocationRows,
    hasOfficialFuelAllocations,
    obraScopedFuelRows,
    productiveTrips,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!debugDieselDay) return;
    const targetDate = "2026-05-20";
    const displayedRows = dieselDayDebug.filter(
      (row) => row.dataUsada === "linha exibida no grafico",
    );
    const rawRows = dieselDayDebug.filter((row) => row.source === "CMB bruto");
    const allocationRows = dieselDayDebug.filter((row) => row.source === "fuel_allocations");
    console.groupCollapsed("[debugDieselDay] 2026-05-20");
    console.table([
      {
        activeTab,
        selectedAnalyses: analysisSelection.selectedAnalyses
          .map((analysis) => {
            const obraLabel = analysisObraLabels(analysis).join(" | ") || analysis.obra;
            return `${analysis.name} / ${obraLabel} / ${analysis.material}`;
          })
          .join(" | "),
        filters: JSON.stringify(filters),
        dieselM3Filters: JSON.stringify(dieselM3Filters),
        displayedLiters: fixedNumber(
          displayedRows.reduce((sum, row) => sum + Number(row.allocatedLiters || 0), 0),
          3,
        ),
        rawFuelingLiters: fixedNumber(
          rawRows.reduce((sum, row) => sum + Number(row.rawLiters || 0), 0),
          3,
        ),
        pdeDateAllocatedLiters: fixedNumber(
          allocationRows
            .filter((row) => row.pdeDate === targetDate)
            .reduce((sum, row) => sum + Number(row.allocatedLiters || 0), 0),
          3,
        ),
        sourceDateAllocatedLiters: fixedNumber(
          allocationRows
            .filter((row) => row.sourceFuelingDate === targetDate)
            .reduce((sum, row) => sum + Number(row.allocatedLiters || 0), 0),
          3,
        ),
      },
    ]);
    console.table(dieselDayDebug);
    console.groupEnd();
  }, [
    activeTab,
    analysisSelection.selectedAnalyses,
    debugDieselDay,
    dieselDayDebug,
    dieselM3Filters,
    filters,
  ]);

  const dailyMetricsMap = useMemo(
    () => calculateDailyMetrics(productiveTrips, productionFueling),
    [productionFueling, productiveTrips],
  );
  const dailyData = useMemo(() => {
    const dates = new Set([...visibleDateKeys, ...dailyMetricsMap.keys()]);
    return [...dates]
      .filter((date) => {
        return dateInFilterRange(date, filters.dateFrom, filters.dateTo);
      })
      .sort()
      .map((date) => {
        const current = dailyMetricsMap.get(date);
        const hours = filteredDailyParts
          .filter((part) => part.date === date && part.usedInAnalysis)
          .reduce((sum, part) => sum + pdeRowHours(part), 0);
        const compactedM3 = current?.compactedM3 ?? 0;
        const diesel = current?.diesel ?? 0;
        const status = dieselIntegrationStatus({
          diesel,
          m3: compactedM3,
          hours,
        });
        return {
          date,
          label: shortDateLabel(date),
          compactedM3,
          looseM3: current?.looseM3 ?? 0,
          diesel,
          hours,
          relatedM3: compactedM3,
          m3PerHour: status === "OK" ? divide(compactedM3, hours) : 0,
          litersPerM3: status === "OK" ? divide(diesel, compactedM3) : 0,
          cost: current?.cost ?? 0,
          trips: current?.trips ?? 0,
          revenue: current?.revenue ?? 0,
          margin: current?.margin ?? 0,
          fuelPerM3: status === "OK" ? divide(compactedM3, diesel) : 0,
          costPerM3: status === "OK" ? divide(current?.cost ?? 0, compactedM3) : 0,
          status,
          statusReason: dieselIntegrationReason(status),
        };
      });
  }, [dailyMetricsMap, filteredDailyParts, filters.dateFrom, filters.dateTo, visibleDateKeys]);

  const kpis = useMemo(
    () => calculateOperationalKPIs(productiveTrips, productionFueling, filteredDailyParts),
    [filteredDailyParts, productionFueling, productiveTrips],
  );

  const hourlyAnalysisTrips = useMemo(() => {
    if (!needsHours) return [];
    const allowedIds = new Set(selectedAnalysisIds);
    return tripRows.filter((trip) => allowedIds.has(trip.analysisId));
  }, [needsHours, selectedAnalysisIds, tripRows]);

  const hourlyTripsWithActiveFilters = useMemo(() => {
    if (!needsHours) return [];
    return hourlyAnalysisTrips.filter((trip) => {
      const date = parseRcoOperationalDateTime(trip.datetime)?.date ?? "";
      if (!dateInFilterRange(date, filters.dateFrom, filters.dateTo)) return false;
      if (!isRcoProductiveTrip(trip)) return false;
      if (filters.material !== "all" && trip.material !== filters.material) return false;
      if (
        filters.aggregate !== "all" &&
        !equipmentMatches(equipmentRaw(trip), filters.aggregate, "trip")
      ) {
        return false;
      }
      return true;
    });
  }, [
    filters.aggregate,
    filters.dateFrom,
    filters.dateTo,
    filters.material,
    hourlyAnalysisTrips,
    needsHours,
  ]);

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

  const productionDateOptions = useMemo(() => {
    if (!needsHours) return [];
    return uniqueValues(
      hourlyTripsWithActiveFilters.map(
        (trip) => parseRcoOperationalDateTime(trip.datetime)?.date ?? "",
      ),
    )
      .filter(Boolean)
      .sort((left, right) => right.localeCompare(left));
  }, [hourlyTripsWithActiveFilters, needsHours]);

  useEffect(() => {
    if (!needsHours) return;
    setProductionDate((current) =>
      current && productionDateOptions.includes(current)
        ? current
        : (productionDateOptions[0] ?? ""),
    );
  }, [needsHours, productionDateOptions]);

  const hoursObrasAvailable = useMemo(() => {
    if (!needsHours || !productionDate) return [];
    const obras = new Map<string, string>();
    hourlyTripsWithActiveFilters
      .filter((trip) => parseRcoOperationalDateTime(trip.datetime)?.date === productionDate)
      .forEach((trip) => {
        const label = displayObraName(trip.obra);
        const key = normalizeObraName(label);
        if (!obras.has(key)) obras.set(key, label);
      });
    return Array.from(obras.values()).sort((left, right) => left.localeCompare(right, "pt-BR"));
  }, [hourlyTripsWithActiveFilters, needsHours, productionDate]);

  useEffect(() => {
    if (!needsHours) return;
    if (hoursObraFilter === "all") return;
    if (
      !hoursObrasAvailable.some(
        (obra) => normalizeObraName(obra) === normalizeObraName(hoursObraFilter),
      )
    ) {
      setHoursObraFilter("all");
    }
  }, [hoursObraFilter, hoursObrasAvailable, needsHours]);

  const hoursFilteredTrips = useMemo(() => {
    if (!needsHours) return [];
    return hourlyAnalysisTrips.filter((trip) => {
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
      if (!dateInFilterRange(date, filters.dateFrom, filters.dateTo)) return false;
      return true;
    });
  }, [
    filters.aggregate,
    filters.dateFrom,
    filters.dateTo,
    filters.material,
    hourlyAnalysisTrips,
    hoursObraFilter,
    needsHours,
    productionDate,
  ]);

  const timeSummaries = useMemo(
    () =>
      needsHours && productionDate
        ? buildWorksiteTimeSummaries(hoursFilteredTrips, productionDate)
        : [],
    [hoursFilteredTrips, needsHours, productionDate],
  );
  const totalTimeSummary = useMemo(
    () =>
      needsHours && productionDate
        ? buildWorksiteTimeSummary(hoursFilteredTrips, productionDate, "Total filtrado", {
            debug: activeTab === "hours",
          })
        : null,
    [activeTab, hoursFilteredTrips, needsHours, productionDate],
  );
  const dailyDieselByObra = useMemo(() => {
    const liters = new Map<string, number>();
    if (!needsHours) return liters;
    if (filters.material !== "all" || filters.aggregate !== "all") return liters;
    productionFueling
      .filter((fuel) => extractDateKey(fuel.datetime) === productionDate)
      .forEach((fuel) => {
        const key = normalizeObraName(fuel.obra);
        liters.set(key, (liters.get(key) ?? 0) + (fuel.liters || 0));
      });
    return liters;
  }, [filters.aggregate, filters.material, needsHours, productionDate, productionFueling]);
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
    () =>
      needsAggregateMetrics
        ? calculateAggregateMetrics(
            productiveTrips.filter((trip) => !isTripPipaLike(trip)),
            kpis.compactedM3,
          )
        : [],
    [needsAggregateMetrics, productiveTrips, kpis.compactedM3],
  );

  const equipmentMetrics = useMemo(
    () =>
      needsEquipmentMetrics ? calculateEquipmentMetrics(productionFueling, filteredDailyParts) : [],
    [filteredDailyParts, needsEquipmentMetrics, productionFueling],
  );

  const itemSummaries = useMemo(() => {
    if (!needsItemSummaries) return EMPTY_ITEM_SUMMARIES;
    const debugPerformance = debugPerformanceEnabled();
    if (debugPerformance) {
      console.time("build datasets");
      console.time("build itemSummaries");
    }
    const summaries = new Map<OperationalItem, ItemSummary>(
      OPERATIONAL_ITEM_ORDER.map((item) => [item, emptyItemSummary(item)]),
    );
    const equipmentByKey = new Map<string, ItemEquipmentMetric>();
    const dailyByItem = new Map<OperationalItem, Map<string, ItemSummary["daily"][number]>>();
    const pdeFleetKeys = buildPdeFleetKeys(itemScopeDailyParts);
    const aggregateKeys = buildTripAggregateKeys(itemScopeProductiveTrips);
    const selectedEquipmentMatches = (
      equipmentKey: string,
      label: string,
      kind: EquipmentKind,
      context: EquipmentContext,
    ) => {
      if (
        filters.equipment.length > 0 &&
        !filters.equipment.some(
          (selected) =>
            equipmentMatches(equipmentKey, selected, context) ||
            equipmentMatches(label, selected, context),
        )
      ) {
        return false;
      }
      if (
        filters.aggregate !== "all" &&
        (kind !== "aggregate" ||
          (!equipmentMatches(equipmentKey, filters.aggregate, "aggregate") &&
            !equipmentMatches(label, filters.aggregate, "aggregate")))
      ) {
        return false;
      }
      return true;
    };

    const ensureSummary = (item: OperationalItem) => {
      const current = summaries.get(item) ?? emptyItemSummary(item);
      summaries.set(item, current);
      return current;
    };
    const ensureDaily = (
      item: OperationalItem,
      date: string,
      obraInput: string | null | undefined,
      inputObraStatus?: ObraStatus,
      inputResolvedObraKey?: string,
      inputResolvedObraLabel?: string,
    ) => {
      const byDate = dailyByItem.get(item) ?? new Map<string, ItemSummary["daily"][number]>();
      dailyByItem.set(item, byDate);
      const obra = inputResolvedObraLabel ?? worksiteLabel(obraInput);
      const obraStatus =
        inputObraStatus ?? (inputResolvedObraKey === OBRA_SCOPE_UNINFORMED_KEY ? "absent" : "ok");
      const obraKey =
        inputResolvedObraKey ??
        (obraStatus === "absent" ? OBRA_SCOPE_UNINFORMED_KEY : worksiteKey(obraInput));
      const dailyKey = dateWorksiteKey(date, obraKey);
      const current =
        byDate.get(dailyKey) ??
        ({
          date,
          obra,
          obraLabel: obra,
          obraKey,
          obraStatus,
          resolvedObraKey: obraKey,
          resolvedObraLabel: obra,
          d: shortDateLabel(date),
          m3: 0,
          relatedM3: 0,
          looseM3: 0,
          diesel: 0,
          efficiencyDiesel: 0,
          dieselCoveredHours: 0,
          dieselCoverageRatio: 0,
          dieselEstimated: false,
          cost: 0,
          hours: 0,
          itemOperationalHours: 0,
          totalOperationalHours: 0,
          trips: 0,
          baseM3: 0,
          lPorM3: 0,
          m3PorH: 0,
          formulaUsed: "",
          sourceDiesel: "",
          sourceM3: "",
          status: "OK",
          statusReason: "",
        } satisfies ItemSummary["daily"][number]);
      byDate.set(dailyKey, current);
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
        (item) =>
          item.date === share.date && item.obraKey === share.obraKey && item.item === share.item,
      );
      if (current) {
        current.equipmentHours += share.equipmentHours;
        current.relatedM3 += share.relatedM3;
        current.looseM3 += share.looseM3;
        current.trips += share.trips;
        current.cost += share.cost;
        current.diesel += share.diesel;
        current.dieselCoveredHours =
          (current.dieselCoveredHours ?? 0) + (share.dieselCoveredHours ?? 0);
        current.share += share.share;
        current.compactedM3Day = share.compactedM3Day;
        current.itemTotalHours = share.itemTotalHours;
        current.totalOperationalHours = share.totalOperationalHours;
        current.m3PerLiter = 0;
        current.m3PerHour = 0;
        return;
      }
      row.productionShares.push({
        ...share,
        m3PerLiter: 0,
        m3PerHour: 0,
      });
    };
    const addDailyDieselToProductionShare = (
      row: ItemEquipmentMetric,
      date: string,
      obra: string,
      obraKey: string,
      liters: number,
      cost: number,
      coveredHours = 0,
    ) => {
      const allShares = row.productionShares.filter(
        (share) => share.date === date && share.obraKey === obraKey,
      );
      const pdeShares = allShares.filter(
        (share) => share.totalOperationalHours > 0 && share.itemTotalHours > 0,
      );
      const shares = pdeShares.length > 0 ? pdeShares : allShares;
      if (shares.length === 0) {
        addProductionShare(row, {
          date,
          obra,
          obraKey,
          item: row.item,
          equipmentKey: row.equipment,
          equipmentLabel: row.label,
          equipmentHours: 0,
          itemTotalHours: 0,
          totalOperationalHours: 0,
          share: 0,
          compactedM3Day: 0,
          relatedM3: 0,
          looseM3: 0,
          trips: 0,
          cost,
          diesel: liters,
          dieselCoveredHours: coveredHours,
        });
        return;
      }
      const totalShareHours = shares.reduce((sum, share) => sum + share.equipmentHours, 0);
      shares.forEach((share) => {
        const dieselShare =
          totalShareHours > 0 ? share.equipmentHours / totalShareHours : 1 / shares.length;
        share.diesel += liters * dieselShare;
        share.dieselCoveredHours = (share.dieselCoveredHours ?? 0) + coveredHours * dieselShare;
        share.cost += cost * dieselShare;
        share.m3PerLiter = 0;
        share.m3PerHour = 0;
      });
    };

    const productionByDateObra = new Map<
      string,
      {
        date: string;
        obra: string;
        obraKey: string;
        compactedM3: number;
        looseM3: number;
        trips: number;
        revenue: number;
      }
    >();
    itemScopeProductiveTrips.forEach((trip) => {
      const date = extractDateKey(trip.datetime);
      const scopedTrip = trip as DbTrip & ObraScopeAudit;
      const obra = resolvedWorksiteLabel(scopedTrip);
      const obraKey = resolvedWorksiteKey(scopedTrip);
      const productionKey = dateWorksiteKey(date, obraKey);
      const currentDate = productionByDateObra.get(productionKey) ?? {
        date,
        obra,
        obraKey,
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
      productionByDateObra.set(productionKey, currentDate);
    });
    const periodBaseCompactedM3 = [...productionByDateObra.values()].reduce(
      (sum, row) => sum + row.compactedM3,
      0,
    );
    const activeItemsByProductionKey = new Map<string, Set<OperationalItem>>();
    const markActiveItem = (date: string, obraKey: string, item: OperationalItem) => {
      if (item === "outros") return;
      const key = dateWorksiteKey(date, obraKey);
      const items = activeItemsByProductionKey.get(key) ?? new Set<OperationalItem>();
      items.add(item);
      activeItemsByProductionKey.set(key, items);
    };
    itemScopeDailyParts.forEach((part) => {
      if (!part.usedInAnalysis || (part.hours || 0) <= 0) return;
      const scopedPart = part as DbEquipmentDailyPart & ObraScopeAudit;
      const operationalClass = resolveEquipmentOperationalClass({
        fleet: part.fleet,
        equipment: part.fleetLabel || part.fleet,
        obra: resolvedWorksiteLabel(scopedPart),
        description: `${part.sourceSheet} ${part.status}`,
      });
      const item = operationalClass.item;
      const key = normalizeEquipmentKey(part.fleet || part.fleetLabel, "dailyPart");
      const kind = operationalClass.isAggregate
        ? ("aggregate" as EquipmentKind)
        : ("ownFleet" as EquipmentKind);
      const label = displayEquipmentLabel(part.fleet || part.fleetLabel, "dailyPart");
      if (!selectedEquipmentMatches(key || part.fleet, label, kind, "dailyPart")) return;
      markActiveItem(part.date, resolvedWorksiteKey(scopedPart), item);
    });
    itemScopeProductiveTrips.forEach((trip) => {
      if (isTripPipaLike(trip)) return;
      const date = extractDateKey(trip.datetime);
      if (!date) return;
      const scopedTrip = trip as DbTrip & ObraScopeAudit;
      const classification = resolveTripOperationalClassification(trip);
      if (
        !selectedEquipmentMatches(
          classification.equipment,
          classification.label,
          classification.kind,
          classification.kind === "aggregate" ? "aggregate" : "trip",
        )
      ) {
        return;
      }
      markActiveItem(date, resolvedWorksiteKey(scopedTrip), classification.item);
    });
    productionFueling.forEach((fuel) => {
      const date = extractDateKey(fuel.datetime);
      if (!date) return;
      const classification = resolveFuelOperationalClassification(
        fuel,
        pdeFleetKeys,
        aggregateKeys,
      );
      if (
        !selectedEquipmentMatches(
          classification.equipment,
          classification.resolvedLabel,
          classification.kind,
          classification.kind === "aggregate" ? "aggregate" : "fueling",
        )
      ) {
        return;
      }
      markActiveItem(
        date,
        resolvedWorksiteKey(fuel as DbFueling & ObraScopeAudit),
        classification.operationalItem,
      );
    });

    const appliedOperationalShareKeys = new Set<string>();
    const countedDailyHoursKeys = new Set<string>();
    const appliedItemProductionKeys = new Set<string>();
    // Fonte única das horas PDE por dia/item (deduplicada por frota; horímetro
    // ou workedHours). Substitui qualquer soma direta de part.hours.
    const { totalByDateObra: totalOperationalHoursByDateObra } =
      buildPdeOperationalHours(itemScopeDailyParts);

    productionByDateObra.forEach((production, productionKey) => {
      const activeItems =
        activeItemsByProductionKey.get(productionKey) ?? new Set<OperationalItem>();
      activeItems.forEach((item) => {
        if (item === "limpeza") return;
        const itemProductionKey = `${productionKey}|${item}`;
        if (appliedItemProductionKeys.has(itemProductionKey)) return;
        appliedItemProductionKeys.add(itemProductionKey);
        const compactedM3 = production.compactedM3;
        const looseM3 = production.looseM3;
        const trips = production.trips;
        const revenue = production.revenue;
        const summary = ensureSummary(item);
        const day = ensureDaily(
          item,
          production.date,
          production.obra,
          "ok",
          production.obraKey,
          production.obra,
        );
        summary.compactedM3 += compactedM3;
        summary.looseM3 += looseM3;
        summary.trips += trips;
        summary.revenue += revenue;
        day.m3 += compactedM3;
        day.relatedM3 += compactedM3;
        day.looseM3 += looseM3;
        day.trips += trips;
      });
    });

    itemScopeProductiveTrips.forEach((trip) => {
      if (isTripPipaLike(trip)) return;
      const classification = resolveTripOperationalClassification(trip);
      const item = classification.item;
      const date = extractDateKey(trip.datetime);
      const scopedTrip = trip as DbTrip & ObraScopeAudit;
      const obra = resolvedWorksiteLabel(scopedTrip);
      const obraKey = resolvedWorksiteKey(scopedTrip);
      const cost = AGGREGATE_TRIP_PRICE;
      const key = classification.equipment;
      const label = classification.label;
      if (
        !selectedEquipmentMatches(
          key,
          label,
          classification.kind,
          classification.kind === "aggregate" ? "aggregate" : "trip",
        )
      ) {
        return;
      }
      ensureEquipment(key, item, label, classification.kind, "trip", classification.reason);
      const summary = ensureSummary(item);
      const day = ensureDaily(item, date, obra, obraStatusForRow(scopedTrip), obraKey, obra);
      summary.cost += cost;
      day.cost += cost;
    });

    itemScopeDailyParts.forEach((part) => {
      const scopedPart = part as DbEquipmentDailyPart & ObraScopeAudit;
      const obra = resolvedWorksiteLabel(scopedPart);
      const obraKey = resolvedWorksiteKey(scopedPart);
      const productionKey = dateWorksiteKey(part.date, obraKey);
      const operationalClass = resolveEquipmentOperationalClass({
        fleet: part.fleet,
        equipment: part.fleetLabel || part.fleet,
        obra,
        description: `${part.sourceSheet} ${part.status}`,
      });
      const item = operationalClass.item;
      const summary = ensureSummary(item);
      const key = normalizeEquipmentKey(part.fleet || part.fleetLabel, "dailyPart");
      const kind = operationalClass.isAggregate
        ? ("aggregate" as EquipmentKind)
        : ("ownFleet" as EquipmentKind);
      const label = displayEquipmentLabel(part.fleet || part.fleetLabel, "dailyPart");
      if (!selectedEquipmentMatches(key || part.fleet, label, kind, "dailyPart")) return;
      const equipment = ensureEquipment(
        key || part.fleet,
        item,
        label,
        kind,
        "dailyPart",
        operationalClass.reason,
      );
      const day = ensureDaily(item, part.date, obra, obraStatusForRow(scopedPart), obraKey, obra);

      // Horas do equipamento/dia: cada frota uma única vez, via fonte única
      // pdeRowHours (não duplica o PDE por múltiplos abastecimentos).
      const dailyHoursKey = `${part.date}|${obraKey}|${item}|${key || part.fleet || part.fleetLabel || "SEM_EQUIPAMENTO"}`;
      const partHours = part.usedInAnalysis ? pdeRowHours(part) : 0;
      if (!countedDailyHoursKeys.has(dailyHoursKey)) {
        countedDailyHoursKeys.add(dailyHoursKey);
        summary.hours += partHours;
        equipment.hours += partHours;
        equipment.m3EquipmentHours += part.usedInAnalysis && (part.hours || 0) > 0 ? partHours : 0;
        day.hours += partHours;
      }

      const shareKey = `${part.date}|${obraKey}|${item}|${key || part.fleet || part.fleetLabel || "SEM_EQUIPAMENTO"}`;
      if (appliedOperationalShareKeys.has(shareKey)) return;
      appliedOperationalShareKeys.add(shareKey);
      const addHoursOnlyShare = (compactedM3Day = 0, totalOperationalHours = 0) => {
        if (!part.usedInAnalysis || partHours <= 0) return;
        addProductionShare(equipment, {
          date: part.date,
          obra,
          obraKey,
          item,
          equipmentKey: equipment.equipment,
          equipmentLabel: equipment.label,
          equipmentHours: partHours,
          itemTotalHours: 0,
          totalOperationalHours,
          share: 0,
          compactedM3Day,
          relatedM3: 0,
          looseM3: 0,
          trips: 0,
          cost: 0,
          diesel: 0,
        });
      };
      if (!part.usedInAnalysis || part.hours <= 0) {
        addHoursOnlyShare();
        return;
      }
      const production = productionByDateObra.get(productionKey);
      equipment.m3AllocationRule =
        "sem rateio: producao pertence a obra/dia; equipamento recebe apenas horas e diesel";
      addHoursOnlyShare(
        production?.compactedM3 ?? 0,
        totalOperationalHoursByDateObra.get(productionKey) ?? 0,
      );
    });

    productionFueling.forEach((fuel) => {
      const classification = resolveFuelOperationalClassification(
        fuel,
        pdeFleetKeys,
        aggregateKeys,
      );
      const item = classification.operationalItem;
      if (
        !selectedEquipmentMatches(
          classification.equipment,
          classification.resolvedLabel,
          classification.kind,
          classification.kind === "aggregate" ? "aggregate" : "fueling",
        )
      ) {
        return;
      }
      const summary = ensureSummary(item);
      const row = ensureEquipment(
        classification.equipment,
        item,
        classification.resolvedLabel,
        classification.kind,
        classification.dieselAuditSource,
        classification.reason,
      );
      const date = extractDateKey(fuel.datetime);
      const scopedFuel = fuel as DbFueling & ObraScopeAudit;
      const obra = resolvedWorksiteLabel(scopedFuel);
      const obraKey = resolvedWorksiteKey(scopedFuel);
      const day = ensureDaily(item, date, obra, obraStatusForRow(scopedFuel), obraKey, obra);
      const liters = fuel.liters || 0;
      const cost = fuel.total || 0;

      summary.diesel += liters;
      summary.cost += cost;
      row.liters += liters;
      row.cost += cost;
      row.dieselSources.add(classification.dieselAuditSource);
      const coveredHours =
        fuel.analysisId === "allocated"
          ? Math.max(0, (fuel.kmCurrent || 0) - (fuel.kmPrevious || 0))
          : 0;
      addDailyDieselToProductionShare(row, date, obra, obraKey, liters, cost, coveredHours);
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
      row.m3 = 0;
      row.relatedCompactedM3 = 0;
      row.m3FromTrips = 0;
      row.m3AllocatedByHours = 0;
      row.m3Sources.clear();
      row.trips = 0;
      row.fuelPerHour = divide(row.liters, row.hours);
      row.fuelPerM3 = 0;
      row.fuelPerTrip = 0;
      row.productionPerHour = 0;
      row.m3AllocationRule =
        row.m3AllocationRule ||
        "sem rateio: producao pertence a obra/dia; equipamento recebe apenas horas e diesel";
      row.includedInEquipmentCount = isCountableEquipment(row);
      row.equipmentCountReason = equipmentCountReason(row);
    });

    summaries.forEach((summary) => {
      summary.baseCompactedM3 =
        summary.item !== "outros" && (summary.diesel > 0 || summary.hours > 0 || summary.trips > 0)
          ? periodBaseCompactedM3
          : 0;
      summary.compactedM3 = summary.baseCompactedM3;
      summary.fuelPerHour = divide(summary.diesel, summary.hours);
      summary.fuelPerTrip = divide(summary.diesel, summary.trips);
      summary.costPerM3 = divide(summary.cost, summary.baseCompactedM3);
      summary.margin = summary.revenue - summary.cost;
      summary.equipment = [...equipmentByKey.values()]
        .filter((row) => row.item === summary.item)
        .sort((a, b) => b.liters - a.liters || b.hours - a.hours || b.m3 - a.m3);

      visibleDateKeys.forEach((date) => {
        visibleObras.forEach((obra) => {
          ensureDaily(
            summary.item,
            date,
            obra,
            normalizeObraKey(obra) === normalizeObraKey(OBRA_SCOPE_UNINFORMED_LABEL)
              ? "absent"
              : "ok",
            normalizeObraKey(obra) === normalizeObraKey(OBRA_SCOPE_UNINFORMED_LABEL)
              ? OBRA_SCOPE_UNINFORMED_KEY
              : normalizeObraKey(obra),
            obra,
          );
        });
      });
      const dailyMap = dailyByItem.get(summary.item) ?? new Map();
      const worksiteDailyRows = [...dailyMap.values()].map((day) => {
        const dayObraKey = dateWorksiteKey(day.date, day.obraKey);
        const compactedM3Day = productionByDateObra.get(dayObraKey)?.compactedM3 ?? 0;
        const totalOperationalHours = totalOperationalHoursByDateObra.get(dayObraKey) ?? 0;
        const selectedItemHours = day.hours;
        const dayShares = summary.equipment.flatMap((equipment) =>
          equipment.productionShares.filter(
            (share) =>
              share.date === day.date &&
              share.obraKey === day.obraKey &&
              share.item === summary.item,
          ),
        );
        const dieselCoveredHours = dayShares.reduce(
          (sum, share) => sum + (share.dieselCoveredHours ?? 0),
          0,
        );
        const efficiencyDiesel =
          dayShares.length > 0
            ? dayShares.reduce((sum, share) => {
                const coveredHours = share.dieselCoveredHours ?? 0;
                const hasPartialCoverage =
                  share.equipmentHours > 0 &&
                  share.diesel > 0 &&
                  coveredHours > 0 &&
                  coveredHours + 0.01 < share.equipmentHours;
                const shareDiesel = hasPartialCoverage
                  ? share.diesel * (share.equipmentHours / coveredHours)
                  : share.diesel;
                return sum + shareDiesel;
              }, 0)
            : day.diesel;
        const dieselEstimated = efficiencyDiesel > day.diesel + 0.01;
        const dieselCoverageRatio =
          selectedItemHours > 0 ? Math.min(1, divide(dieselCoveredHours, selectedItemHours)) : 0;
        const usesRelatedDailyM3 = day.relatedM3 > 0 || day.m3 > 0;
        const relatedM3 = day.relatedM3;
        const m3Used = relatedM3;
        const m3PerLiter = efficiencyDiesel > 0 ? divide(relatedM3, efficiencyDiesel) : 0;
        const m3PerHour = 0;
        const suspect =
          summary.item === "compactacao"
            ? compactacaoM3LStatus({
                compactedM3Day,
                relatedM3,
                hours: selectedItemHours,
                diesel: day.diesel,
                m3PerLiter,
              })
            : { status: "OK", statusReason: "" };
        let integrationStatus = dieselIntegrationStatus({
          diesel: day.diesel,
          m3: m3Used,
          hours: selectedItemHours,
          obraStatus: day.obraStatus,
        });
        if (compactedM3Day > 0 && selectedItemHours <= 0 && day.diesel > 0) {
          integrationStatus = mergeIntegrationStatus(integrationStatus, "NO_PRODUCTION");
        }
        const statusReason = [
          dieselIntegrationReason(integrationStatus),
          dieselEstimated
            ? `Diesel de eficiencia estimado: cobertura parcial do horimetro (${fixedNumber(dieselCoveredHours, 2)}h de ${fixedNumber(selectedItemHours, 2)}h)`
            : "",
          compactedM3Day > 0 && selectedItemHours <= 0 && day.diesel > 0
            ? "Producao RCO da obra/dia existe, mas nao ha horas PDE do equipamento selecionado para relacionar m3"
            : "",
          suspect.status !== "OK" ? suspect.statusReason : "",
        ]
          .filter(Boolean)
          .filter((value, index, list) => list.indexOf(value) === index)
          .join("; ");

        return {
          ...day,
          baseM3: compactedM3Day,
          relatedM3,
          m3: m3Used,
          efficiencyDiesel,
          dieselCoveredHours,
          dieselCoverageRatio,
          dieselEstimated,
          lPorM3: m3PerLiter,
          m3PorH: m3PerHour,
          itemOperationalHours: selectedItemHours,
          totalOperationalHours,
          formulaUsed: usesRelatedDailyM3
            ? "m3 fracionado na base canonica por equipamento antes do filtro visual"
            : "sem m3 relacionado: faltam horas/viagens/diesel do equipamento selecionado",
          sourceDiesel: dieselSource,
          sourceM3: usesRelatedDailyM3
            ? "base canonica: RCO compactado fracionado por equipamento/item"
            : "sem m3 relacionado por ausencia de dados suficientes",
          status: integrationStatus,
          statusReason,
        };
      });
      summary.daily = worksiteDailyRows
        .map((day) => ({
          ...day,
          obraLabel: day.obra,
          d: shortDateLabel(day.date),
          lPorM3: day.efficiencyDiesel > 0 ? divide(day.relatedM3, day.efficiencyDiesel) : 0,
          m3PorH: 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.obra.localeCompare(b.obra));
      const validProductionDays = summary.daily;
      summary.relatedM3 = validProductionDays.reduce((sum, day) => sum + day.relatedM3, 0);
      summary.compactedM3 = summary.relatedM3;
      summary.hours = validProductionDays.reduce(
        (sum, day) => sum + (day.itemOperationalHours || day.hours),
        0,
      );
      summary.trips = validProductionDays.reduce((sum, day) => sum + day.trips, 0);
      summary.fuelPerM3 = summary.diesel > 0 ? divide(summary.relatedM3, summary.diesel) : 0;
      summary.fuelPerHour = divide(summary.diesel, summary.hours);
      summary.fuelPerTrip = divide(summary.diesel, summary.trips);
      summary.costPerM3 = summary.relatedM3 > 0 ? divide(summary.cost, summary.relatedM3) : 0;
    });

    const result = OPERATIONAL_ITEM_ORDER.map((item) => ensureSummary(item));
    timeEnd("build itemSummaries", debugPerformance);
    timeEnd("build datasets", debugPerformance);
    return result;
  }, [
    filters.aggregate,
    filters.equipment,
    dieselSource,
    itemScopeDailyParts,
    itemScopeProductiveTrips,
    needsItemSummaries,
    productionFueling,
    visibleDateKeys,
    visibleObras,
  ]);

  const itemSummaryById = useMemo(
    () => new Map(itemSummaries.map((summary) => [summary.item, summary])),
    [itemSummaries],
  );

  const productionAggregationAuditRows = useMemo<ProductionAggregationAuditRow[]>(() => {
    if (!debugProductionAudit) return [];
    const material = filters.material === "all" ? "todos" : filters.material;
    const emptyTotals = () => ({
      m3: 0,
      looseM3: 0,
      diesel: 0,
      hours: 0,
      trips: 0,
      cost: 0,
    });
    type Totals = ReturnType<typeof emptyTotals>;
    const addTotals = (target: Totals, source: Totals) => {
      target.m3 += source.m3;
      target.looseM3 += source.looseM3;
      target.diesel += source.diesel;
      target.hours += source.hours;
      target.trips += source.trips;
      target.cost += source.cost;
    };
    const pushMetricRows = ({
      rows,
      summary,
      date,
      obra,
      general,
      byEquipment,
    }: {
      rows: ProductionAggregationAuditRow[];
      summary: ItemSummary;
      date: string;
      obra: string;
      general: Totals;
      byEquipment: Totals;
    }) => {
      const metrics = [
        ["m3_compactado", general.m3, byEquipment.m3, 2],
        ["m3_solto", general.looseM3, byEquipment.looseM3, 2],
        ["diesel_litros", general.diesel, byEquipment.diesel, 2],
        ["horas", general.hours, byEquipment.hours, 2],
        ["viagens", general.trips, byEquipment.trips, 2],
        ["custo", general.cost, byEquipment.cost, 2],
        [
          "eficiencia_m3_l",
          divide(general.m3, general.diesel),
          divide(byEquipment.m3, byEquipment.diesel),
          3,
        ],
      ] as const;

      metrics.forEach(([metric, generalValue, equipmentValue, decimals]) => {
        if (Math.abs(generalValue) <= 0 && Math.abs(equipmentValue) <= 0) return;
        const somaObras = generalValue;
        const somaMateriais = generalValue;
        const productionByWorksiteOnly = [
          "m3_compactado",
          "m3_solto",
          "viagens",
          "eficiencia_m3_l",
        ].includes(metric);
        const diferencaMax = Math.max(
          Math.abs(generalValue - somaObras),
          productionByWorksiteOnly ? 0 : Math.abs(generalValue - equipmentValue),
          Math.abs(generalValue - somaMateriais),
        );
        rows.push({
          item: summary.label,
          metrica: metric,
          data: date,
          obra,
          material,
          geral: fixedNumber(generalValue, decimals),
          somaObras: fixedNumber(somaObras, decimals),
          somaEquipamentos: fixedNumber(equipmentValue, decimals),
          somaMateriais: fixedNumber(somaMateriais, decimals),
          diferencaMax: fixedNumber(diferencaMax, decimals),
          status: diferencaMax <= 0.01 ? "OK" : "ERRO_AGREGACAO",
        });
      });
    };

    const rows: ProductionAggregationAuditRow[] = [];
    itemSummaries.forEach((summary) => {
      const equipmentTotalsByDateObra = new Map<string, Totals>();
      const equipmentTotalsByDate = new Map<string, Totals>();
      summary.equipment.forEach((equipment) => {
        equipment.productionShares.forEach((share) => {
          const totals = {
            m3: share.relatedM3,
            looseM3: share.looseM3,
            diesel: share.diesel,
            hours: share.equipmentHours,
            trips: share.trips,
            cost: share.cost,
          };
          const dateObraKey = dateWorksiteKey(share.date, share.obraKey);
          const byDateObra = equipmentTotalsByDateObra.get(dateObraKey) ?? emptyTotals();
          addTotals(byDateObra, totals);
          equipmentTotalsByDateObra.set(dateObraKey, byDateObra);

          const byDate = equipmentTotalsByDate.get(share.date) ?? emptyTotals();
          addTotals(byDate, totals);
          equipmentTotalsByDate.set(share.date, byDate);
        });
      });

      const generalTotalsByDate = new Map<string, Totals>();
      summary.daily.forEach((day) => {
        const general = {
          m3: day.relatedM3,
          looseM3: day.looseM3,
          diesel: day.diesel,
          hours: day.itemOperationalHours || day.hours,
          trips: day.trips,
          cost: day.cost,
        };
        const byDate = generalTotalsByDate.get(day.date) ?? emptyTotals();
        addTotals(byDate, general);
        generalTotalsByDate.set(day.date, byDate);

        pushMetricRows({
          rows,
          summary,
          date: day.date,
          obra: day.obra,
          general,
          byEquipment:
            equipmentTotalsByDateObra.get(dateWorksiteKey(day.date, day.obraKey)) ?? emptyTotals(),
        });
      });

      generalTotalsByDate.forEach((general, date) => {
        pushMetricRows({
          rows,
          summary,
          date,
          obra: "TODAS",
          general,
          byEquipment: equipmentTotalsByDate.get(date) ?? emptyTotals(),
        });
      });
    });

    return rows.sort(
      (a, b) =>
        a.data.localeCompare(b.data) ||
        a.item.localeCompare(b.item, "pt-BR") ||
        a.obra.localeCompare(b.obra, "pt-BR") ||
        a.metrica.localeCompare(b.metrica),
    );
  }, [debugProductionAudit, filters.material, itemSummaries]);

  const itemDonutData = useMemo(
    () =>
      itemSummaries
        .filter((summary) => summary.diesel > 0)
        .map((summary) => ({ name: summary.label, value: summary.diesel })),
    [itemSummaries],
  );

  const itemRankingData = useMemo(() => {
    if (!needsItemSummaries) return [];
    const debugPerformance = debugPerformanceEnabled();
    if (debugPerformance) console.time("rankings");
    const result = itemSummaries
      .filter((summary) => summary.diesel > 0 || summary.compactedM3 > 0 || summary.trips > 0)
      .map((summary) => ({
        id: summary.label,
        item: summary.item,
        diesel: summary.diesel,
        m3: summary.compactedM3,
        lpm3: summary.fuelPerM3,
        horas: summary.hours,
        viagens: summary.trips,
        status: summary.daily.reduce<DieselIntegrationStatus>(
          (current, day) => mergeIntegrationStatus(current, day.status),
          "OK",
        ),
        statusReason: [
          ...new Set(
            summary.daily
              .filter((day) => day.status !== "OK")
              .map((day) => dieselIntegrationReason(day.status)),
          ),
        ].join("; "),
      }))
      .sort((a, b) => operationalItemRank(a.item) - operationalItemRank(b.item));
    timeEnd("rankings", debugPerformance);
    return result;
  }, [itemSummaries, needsItemSummaries]);

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
        row[summary.item] = Number(row[summary.item] ?? 0) + day.diesel;
        rows.set(day.date, row);
      });
    });
    return [...rows.values()].sort((a, b) =>
      String(a.date ?? "").localeCompare(String(b.date ?? "")),
    );
  }, [itemSummaries]);

  const itemEquipmentStacks = useMemo(() => {
    if (!needsItemEquipmentStacks) return EMPTY_ITEM_STACKS;
    const raw = new Map<
      OperationalItem,
      {
        totals: Map<string, { equipment: string; label: string; liters: number }>;
        daily: Map<string, Map<string, number>>;
      }
    >();
    const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
    const aggregateKeys = buildTripAggregateKeys(productiveTrips);

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

    productionFueling.forEach((fuel) => {
      const classification = resolveFuelOperationalClassification(
        fuel,
        pdeFleetKeys,
        aggregateKeys,
      );
      const item = classification.operationalItem;
      const date = extractDateKey(fuel.datetime);
      const liters = fuel.liters || 0;
      if (liters <= 0) return;

      const group = ensureRaw(item);
      const total = group.totals.get(classification.equipment) ?? {
        equipment: classification.equipment,
        label: classification.resolvedLabel,
        liters: 0,
      };
      total.liters += liters;
      group.totals.set(classification.equipment, total);

      const day = group.daily.get(date) ?? new Map<string, number>();
      day.set(classification.equipment, (day.get(classification.equipment) ?? 0) + liters);
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
  }, [filteredDailyParts, needsItemEquipmentStacks, productionFueling, productiveTrips]);

  const dieselM3BaseData = useMemo<DieselM3BaseData>(() => {
    if (!needsDieselM3) return EMPTY_DIESEL_M3_BASE_DATA;
    const debugPerformance = debugPerformanceEnabled();
    if (debugPerformance) console.time("dieselM3 datasets");
    const dailyProductionMap = new Map<string, DieselM3DailyProductionRow>();
    itemScopeProductiveTrips.forEach((trip) => {
      const date = extractDateKey(trip.datetime);
      if (!date) return;
      const scopedTrip = trip as DbTrip & ObraScopeAudit;
      const obra = resolvedWorksiteLabel(scopedTrip);
      const obraKey = resolvedWorksiteKey(scopedTrip);
      const key = `${date}|${obraKey}`;
      const current =
        dailyProductionMap.get(key) ??
        ({
          date,
          d: shortDateLabel(date),
          obra,
          obraKey,
          obraStatus: obraStatusForRow(scopedTrip),
          compactedM3: 0,
          looseM3: 0,
          trips: 0,
        } satisfies DieselM3DailyProductionRow);
      current.compactedM3 += calculateCompactedVolume(
        trip.cubicMLoose || 0,
        trip.swellFactorApplied,
      );
      current.looseM3 += trip.cubicMLoose || 0;
      current.trips += 1;
      dailyProductionMap.set(key, current);
    });
    const rcoWorksiteDomain = new Map<
      string,
      { obra: string; obraKey: string; obraStatus: ObraStatus }
    >();
    dailyProductionMap.forEach((row) => {
      if (!rcoWorksiteDomain.has(row.obraKey)) {
        rcoWorksiteDomain.set(row.obraKey, {
          obra: row.obra,
          obraKey: row.obraKey,
          obraStatus: row.obraStatus,
        });
      }
    });
    const resolveRcoVisualWorksite = (fuel: DbFueling & IntegrationAuditMetadata) => {
      const candidates = [
        fuel.resolvedObraLabel,
        fuel.obra,
        fuel.obraOriginal,
        fuel.sourceWorksite,
      ];
      for (const candidate of candidates) {
        const key = obraSelectionKey(candidate);
        const worksite = rcoWorksiteDomain.get(key);
        if (worksite) return worksite;
      }
      return rcoWorksiteDomain.get(resolvedWorksiteKey(fuel)) ?? null;
    };

    const partClassifications = filteredDailyParts
      .filter((part) => part.usedInAnalysis && part.hours > 0)
      .map((part) => {
        const operationalClass = resolveEquipmentOperationalClass({
          fleet: part.fleet,
          equipment: part.fleetLabel || part.fleet,
          obra: resolvedWorksiteLabel(part as DbEquipmentDailyPart & ObraScopeAudit),
          description: `${part.sourceSheet} ${part.status}`,
          raw: part,
        });
        const equipmentKey =
          normalizeEquipmentKey(part.fleet || part.fleetLabel, "dailyPart") ||
          part.fleet ||
          part.fleetLabel ||
          "SEM_EQUIPAMENTO";
        const scopedPart = part as DbEquipmentDailyPart & ObraScopeAudit;
        const obra = resolvedWorksiteLabel(scopedPart);
        const obraKey = resolvedWorksiteKey(scopedPart);
        return {
          part,
          item: operationalClass.item,
          itemLabel: operationalItemLabel(operationalClass.item),
          equipmentKey,
          equipmentLabel: displayEquipmentLabel(part.fleet || part.fleetLabel, "dailyPart"),
          kind: operationalClass.isAggregate
            ? ("aggregate" as EquipmentKind)
            : ("ownFleet" as EquipmentKind),
          hours: pdeRowHours(part),
          obra,
          obraKey,
          obraStatus: obraStatusForRow(scopedPart),
        };
      });

    const totalOperationalHoursByDateObra = new Map<string, number>();
    const countedOperationalHoursKeys = new Set<string>();
    partClassifications.forEach(({ part, item, equipmentKey, obraKey, hours }) => {
      if (item === "outros" || hours <= 0) return;
      const dedupKey = `${part.date}|${obraKey}|${item}|${equipmentKey}`;
      if (countedOperationalHoursKeys.has(dedupKey)) return;
      countedOperationalHoursKeys.add(dedupKey);
      const key = `${part.date}|${obraKey}`;
      totalOperationalHoursByDateObra.set(
        key,
        (totalOperationalHoursByDateObra.get(key) ?? 0) + hours,
      );
    });

    const relatedByKey = new Map<string, DieselM3RelatedRow>();
    const ensureRelated = (input: DieselM3RelatedRow) => {
      const key = `${input.date}|${input.obraKey}|${input.item}|${input.equipmentKey}`;
      const current = relatedByKey.get(key) ?? { ...input, relatedM3: 0, hours: 0, trips: 0 };
      current.baseCompactedM3 = Math.max(current.baseCompactedM3, input.baseCompactedM3);
      current.relatedM3 += input.relatedM3;
      current.hours += input.hours;
      current.trips += input.trips;
      current.totalOperationalHours = Math.max(
        current.totalOperationalHours,
        input.totalOperationalHours,
      );
      current.participation = 0;
      if (!current.formulaUsed) current.formulaUsed = input.formulaUsed;
      current.status = mergeIntegrationStatus(current.status, input.status);
      current.statusReason = [current.statusReason, input.statusReason]
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index)
        .join("; ");
      relatedByKey.set(key, current);
      return current;
    };

    partClassifications.forEach(
      ({
        part,
        item,
        itemLabel,
        equipmentKey,
        equipmentLabel,
        kind,
        hours,
        obra,
        obraKey,
        obraStatus,
      }) => {
        const production = dailyProductionMap.get(`${part.date}|${obraKey}`);
        const totalOperationalHours =
          totalOperationalHoursByDateObra.get(`${part.date}|${obraKey}`) ?? 0;
        const baseCompactedM3 = production?.compactedM3 ?? 0;
        const participation = divide(hours, totalOperationalHours);
        const relatedM3 = 0;
        const status = dieselIntegrationStatus({
          diesel: 0,
          m3: relatedM3,
          hours,
          obraStatus,
        });
        ensureRelated({
          date: part.date,
          obra,
          obraKey,
          item,
          itemLabel,
          equipmentKey,
          equipmentLabel,
          kind,
          baseCompactedM3,
          relatedM3,
          hours,
          totalOperationalHours,
          participation: 0,
          formulaUsed: "sem m3 por equipamento: producao pertence a obra/dia",
          trips: 0,
          obraStatus,
          status: "OK",
          statusReason: "m3 oficial calculado por obra/dia/item",
        });
      },
    );

    itemScopeProductiveTrips.forEach((trip) => {
      if (isTripPipaLike(trip)) return;
      const date = extractDateKey(trip.datetime);
      if (!date) return;
      const scopedTrip = trip as DbTrip & ObraScopeAudit;
      const obra = resolvedWorksiteLabel(scopedTrip);
      const obraKey = resolvedWorksiteKey(scopedTrip);
      const obraStatus = obraStatusForRow(scopedTrip);
      const production = dailyProductionMap.get(`${date}|${obraKey}`);
      const classification = resolveTripOperationalClassification(trip);
      const equipmentKey = classification.equipment || "SEM_EQUIPAMENTO";
      const relatedM3 =
        classification.item === "limpeza"
          ? 0
          : calculateCompactedVolume(trip.cubicMLoose || 0, trip.swellFactorApplied);
      const status = dieselIntegrationStatus({
        diesel: 0,
        m3: relatedM3,
        hours: 0,
        obraStatus,
      });
      ensureRelated({
        date,
        obra,
        obraKey,
        item: classification.item,
        itemLabel: operationalItemLabel(classification.item),
        equipmentKey,
        equipmentLabel: classification.label,
        kind: classification.kind,
        baseCompactedM3: classification.item === "limpeza" ? 0 : (production?.compactedM3 ?? 0),
        relatedM3,
        hours: 0,
        totalOperationalHours: 0,
        participation: 0,
        formulaUsed:
          classification.item === "limpeza"
            ? "RCO vinculado a frota 236 sem producao atribuida"
            : "m3 direto da viagem RCO de transporte",
        trips: 1,
        obraStatus,
        status,
        statusReason: dieselIntegrationReason(status),
      });
    });

    const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
    const aggregateKeys = buildTripAggregateKeys(itemScopeProductiveTrips);
    type DieselGroup = DieselM3RelatedRow & {
      diesel: number;
      dieselSource: DieselM3Source;
      sourceIds: Set<string>;
      isPipa: boolean;
      sourceWorksite: string;
      blockedSource?: boolean;
    };
    const dieselByKey = new Map<string, DieselGroup>();

    productionFueling.forEach((fuel) => {
      const diesel = fuel.liters || 0;
      if (diesel <= 0) return;
      const date = extractDateKey(fuel.datetime);
      if (!date) return;
      const classification = resolveFuelOperationalClassification(
        fuel,
        pdeFleetKeys,
        aggregateKeys,
      );
      const scopedFuel = fuel as DbFueling & IntegrationAuditMetadata;
      const visualWorksite = resolveRcoVisualWorksite(scopedFuel);
      if (!visualWorksite) return;
      const obra = visualWorksite.obra;
      const obraKey = visualWorksite.obraKey;
      const obraStatus = visualWorksite.obraStatus;
      const scopedObraKey = resolvedWorksiteKey(scopedFuel);
      const production = dailyProductionMap.get(`${date}|${obraKey}`);
      const relatedKey = `${date}|${obraKey}|${classification.operationalItem}|${classification.equipment}`;
      const scopedRelatedKey = `${date}|${scopedObraKey}|${classification.operationalItem}|${classification.equipment}`;
      const related = relatedByKey.get(relatedKey) ?? relatedByKey.get(scopedRelatedKey);
      const key = relatedKey;
      const source = dieselM3SourceForFuel(fuel);
      const sourceWrongWorksite = fuel.integrationStatus === "WRONG_WORKSITE";
      const current =
        dieselByKey.get(key) ??
        ({
          date,
          obra,
          obraKey,
          item: classification.operationalItem,
          itemLabel: operationalItemLabel(classification.operationalItem),
          equipmentKey: classification.equipment,
          equipmentLabel: classification.resolvedLabel,
          kind: classification.kind,
          baseCompactedM3: production?.compactedM3 ?? related?.baseCompactedM3 ?? 0,
          relatedM3: related?.relatedM3 ?? 0,
          hours: related?.hours ?? 0,
          totalOperationalHours: related?.totalOperationalHours ?? 0,
          participation: related?.participation ?? 0,
          formulaUsed: related?.formulaUsed ?? "",
          trips: related?.trips ?? 0,
          obraStatus,
          diesel: 0,
          dieselSource: source,
          sourceIds: new Set<string>(),
          isPipa: classification.isPipa,
          sourceWorksite: fuel.sourceWorksite ?? fuel.obra,
          status: "OK",
          statusReason: "",
        } satisfies DieselGroup);
      current.diesel += diesel;
      current.sourceIds.add(fuelSourceId(fuel));
      current.isPipa ||= classification.isPipa;
      current.status = mergeIntegrationStatus(
        current.status,
        !sourceWrongWorksite
          ? "OK"
          : dieselIntegrationStatus({
              diesel: current.diesel,
              m3: current.relatedM3,
              hours: current.hours,
              obraStatus: current.obraStatus,
              wrongWorksite: sourceWrongWorksite,
            }),
      );
      current.statusReason = [
        current.statusReason,
        fuel.integrationReason,
        dieselIntegrationReason(current.status),
      ]
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index)
        .join("; ");
      dieselByKey.set(key, current);
    });

    const rowsByKey = new Map<string, DieselM3DetailRow>();
    dieselByKey.forEach((row, key) => {
      if (!rcoWorksiteDomain.has(row.obraKey)) return;
      rowsByKey.set(key, {
        ...row,
        m3PerLiter: 0,
        litersPerM3: 0,
      });
    });

    relatedByKey.forEach((row, key) => {
      if (rowsByKey.has(key)) return;
      if (!rcoWorksiteDomain.has(row.obraKey)) return;
      rowsByKey.set(key, {
        ...row,
        diesel: 0,
        m3PerLiter: 0,
        litersPerM3: 0,
        dieselSource: "rawFueling",
        isPipa: false,
        sourceWorksite: row.obra,
        status: "OK",
        statusReason: "m3 oficial calculado por obra/dia/item",
      });
    });

    const dailyProductionByWorksite = [...dailyProductionMap.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.obra.localeCompare(b.obra),
    );
    const rcoWorksites = [...rcoWorksiteDomain.values()].sort((a, b) =>
      a.obra.localeCompare(b.obra),
    );
    const equipmentDailyRelatedM3 = [...relatedByKey.values()].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.item.localeCompare(b.item) ||
        a.equipmentLabel.localeCompare(b.equipmentLabel),
    );
    const dieselM3Rows = [...rowsByKey.values()].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.obra.localeCompare(b.obra) ||
        operationalItemRank(a.item) - operationalItemRank(b.item) ||
        b.diesel - a.diesel,
    );

    const result = {
      dailyProductionByWorksite,
      rcoWorksites,
      dieselByDateWorksiteItemEquipment: [...dieselByKey.values()].map((row) => ({
        ...row,
        sourceIds: [...row.sourceIds].join(", "),
        dieselSourceLabel: dieselM3SourceLabel(row.dieselSource),
      })),
      equipmentDailyRelatedM3,
      dieselM3Rows,
    };
    timeEnd("dieselM3 datasets", debugPerformance);
    return result;
  }, [filteredDailyParts, itemScopeProductiveTrips, needsDieselM3, productionFueling]);

  const dieselM3ObraOptions = useMemo(() => {
    const options = new Map<string, string>();
    dieselM3BaseData.rcoWorksites.forEach((row) => options.set(row.obraKey, row.obra));
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [dieselM3BaseData]);

  const dieselM3RcoObraDomain = useMemo(() => {
    const domain = new Map<string, { obra: string; obraKey: string; obraStatus: ObraStatus }>();
    dieselM3BaseData.rcoWorksites.forEach((row) => domain.set(row.obraKey, row));
    return domain;
  }, [dieselM3BaseData.rcoWorksites]);

  const dieselM3SelectedObraKey =
    dieselM3Filters.obra !== "all" && dieselM3RcoObraDomain.has(dieselM3Filters.obra)
      ? dieselM3Filters.obra
      : "all";

  const dieselM3EquipmentOptions = useMemo(() => {
    const options = new Map<string, string>();
    dieselM3BaseData.dieselM3Rows.forEach((row) => {
      if (row.equipmentKey) options.set(row.equipmentKey, row.equipmentLabel);
    });
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [dieselM3BaseData]);

  const dieselM3AggregateOptions = useMemo(
    () => dieselM3EquipmentOptions.filter(([key]) => key.startsWith("CB:")),
    [dieselM3EquipmentOptions],
  );

  const dieselM3ProductionRows = useMemo(
    () =>
      dieselM3BaseData.dailyProductionByWorksite.filter((row) => {
        if (!dateInFilterRange(row.date, dieselM3Filters.dateFrom, dieselM3Filters.dateTo))
          return false;
        if (dieselM3SelectedObraKey !== "all" && row.obraKey !== dieselM3SelectedObraKey)
          return false;
        return true;
      }),
    [dieselM3BaseData.dailyProductionByWorksite, dieselM3Filters, dieselM3SelectedObraKey],
  );

  const dieselM3Rows = useMemo(
    () =>
      dieselM3BaseData.dieselM3Rows.filter((row) => {
        if (!dieselM3RcoObraDomain.has(row.obraKey)) return false;
        if (!dateInFilterRange(row.date, dieselM3Filters.dateFrom, dieselM3Filters.dateTo))
          return false;
        if (dieselM3SelectedObraKey !== "all" && row.obraKey !== dieselM3SelectedObraKey)
          return false;
        if (dieselM3Filters.item !== "all" && row.item !== dieselM3Filters.item) return false;
        if (dieselM3Filters.equipment !== "all" && row.equipmentKey !== dieselM3Filters.equipment)
          return false;
        if (dieselM3Filters.aggregate !== "all" && row.equipmentKey !== dieselM3Filters.aggregate)
          return false;
        if (dieselM3Filters.origin !== "all" && row.dieselSource !== dieselM3Filters.origin)
          return false;
        return true;
      }),
    [
      dieselM3BaseData.dieselM3Rows,
      dieselM3Filters,
      dieselM3RcoObraDomain,
      dieselM3SelectedObraKey,
    ],
  );

  const dieselM3EquipmentScope =
    dieselM3Filters.view === "equipment" ||
    dieselM3Filters.equipment !== "all" ||
    dieselM3Filters.aggregate !== "all";
  const dieselM3UsesRelatedM3 = dieselM3EquipmentScope;

  const blockedRawFuelingByDateObra = useMemo(() => {
    const blocked = new Map<
      string,
      { date: string; obra: string; obraKey: string; liters: number; count: number; reason: string }
    >();
    if (!hasOfficialFuelAllocations) return blocked;

    filteredFueling.forEach((fuel) => {
      if (!allocatedSourceIds.has(fuel.id)) return;
      const date = extractDateKey(fuel.datetime);
      if (!date) return;
      const scopedFuel = fuel as DbFueling & ObraScopeAudit;
      const obra = resolvedWorksiteLabel(scopedFuel);
      const obraKey = resolvedWorksiteKey(scopedFuel);
      const rcoWorksite = dieselM3RcoObraDomain.get(obraKey);
      if (!rcoWorksite) return;
      const key = dateWorksiteKey(date, obraKey);
      const current = blocked.get(key) ?? {
        date,
        obra: rcoWorksite.obra,
        obraKey,
        liters: 0,
        count: 0,
        reason: "CMB ja possui fuel_allocations oficiais e nao entra como bruto",
      };
      current.liters += fuel.liters || 0;
      current.count += 1;
      blocked.set(key, current);
    });

    return blocked;
  }, [allocatedSourceIds, dieselM3RcoObraDomain, filteredFueling, hasOfficialFuelAllocations]);

  const dieselM3DailyRows = useMemo(() => {
    const rows = new Map<
      string,
      {
        date: string;
        d: string;
        obra: string;
        obraKey: string;
        obraStatus: ObraStatus;
        resolvedObraKey: string;
        resolvedObraLabel: string;
        compactedM3: number;
        looseM3: number;
        relatedM3: number;
        hours: number;
        totalOperationalHours: number;
        participation: number;
        diesel: number;
        status: DieselIntegrationStatus;
        statusReason: string;
        formulaUsed: string;
        blockedSource: boolean;
      }
    >();
    const obraOptions = new Map<string, { obra: string; obraStatus: ObraStatus }>();
    dieselM3RcoObraDomain.forEach((row) =>
      obraOptions.set(row.obraKey, { obra: row.obra, obraStatus: row.obraStatus }),
    );
    if (dieselM3SelectedObraKey !== "all") {
      [...obraOptions.keys()].forEach((key) => {
        if (key !== dieselM3SelectedObraKey) obraOptions.delete(key);
      });
    }
    const unionDates = new Set([
      ...selectedAnalysisDateKeys,
      ...dieselM3ProductionRows.map((row) => row.date),
      ...dieselM3Rows.map((row) => row.date),
      ...[...blockedRawFuelingByDateObra.values()].map((row) => row.date),
    ]);
    const calendarDates = [...unionDates]
      .filter((date) => {
        return (
          dateInFilterRange(date, filters.dateFrom, filters.dateTo) &&
          dateInFilterRange(date, dieselM3Filters.dateFrom, dieselM3Filters.dateTo)
        );
      })
      .sort();
    const ensure = (
      date: string,
      obra: string,
      inputObraStatus: ObraStatus = "ok",
      inputObraKey?: string,
    ) => {
      const obraKey =
        inputObraKey ??
        (inputObraStatus === "absent" ? OBRA_SCOPE_UNINFORMED_KEY : normalizeObraKey(obra));
      const key = dateWorksiteKey(date, obraKey);
      const current = rows.get(key) ?? {
        date,
        d: shortDateLabel(date),
        obra,
        obraKey,
        obraStatus: inputObraStatus,
        resolvedObraKey: obraKey,
        resolvedObraLabel: obra,
        compactedM3: 0,
        looseM3: 0,
        relatedM3: 0,
        hours: 0,
        totalOperationalHours: 0,
        participation: 0,
        diesel: 0,
        status: "NO_DATA",
        statusReason: dieselIntegrationReason("NO_DATA"),
        formulaUsed: "",
        blockedSource: false,
      };
      rows.set(key, current);
      return current;
    };

    calendarDates.forEach((date) => {
      obraOptions.forEach((obra) => {
        ensure(date, obra.obra, obra.obraStatus);
      });
    });
    dieselM3ProductionRows.forEach((production) => {
      const row = ensure(
        production.date,
        production.obra,
        production.obraStatus,
        production.obraKey,
      );
      row.compactedM3 = production.compactedM3;
      row.looseM3 = production.looseM3;
      row.obraStatus = production.obraStatus;
    });
    dieselM3Rows.forEach((detail) => {
      const row = ensure(detail.date, detail.obra, detail.obraStatus, detail.obraKey);
      row.compactedM3 = Math.max(row.compactedM3, detail.baseCompactedM3);
      row.relatedM3 += detail.relatedM3;
      row.hours += detail.hours;
      row.totalOperationalHours = Math.max(row.totalOperationalHours, detail.totalOperationalHours);
      row.diesel += detail.diesel;
      row.formulaUsed = detail.formulaUsed || row.formulaUsed;
      row.obraStatus = detail.obraStatus;
      row.status = mergeIntegrationStatus(row.status, detail.status);
      row.statusReason = [row.statusReason, detail.statusReason]
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index)
        .join("; ");
    });
    blockedRawFuelingByDateObra.forEach((blocked) => {
      if (!dieselM3RcoObraDomain.has(blocked.obraKey)) return;
      if (dieselM3SelectedObraKey !== "all" && blocked.obraKey !== dieselM3SelectedObraKey) return;
      const row = ensure(
        blocked.date,
        blocked.obra,
        blocked.obraKey === OBRA_SCOPE_UNINFORMED_KEY ? "absent" : "ok",
        blocked.obraKey,
      );
      row.blockedSource = true;
      row.status = mergeIntegrationStatus(row.status, "BLOCKED_SOURCE");
      row.statusReason = [row.statusReason, blocked.reason]
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index)
        .join("; ");
    });

    return [...rows.values()]
      .map((row) => {
        const m3 = dieselM3UsesRelatedM3 ? row.relatedM3 : row.compactedM3;
        const participation = divide(row.hours, row.totalOperationalHours) * 100;
        const derivedStatus = dieselIntegrationStatus({
          diesel: row.diesel,
          m3,
          hours: row.hours,
          obraStatus: row.obraStatus,
          blockedSource: row.blockedSource,
        });
        const status = mergeIntegrationStatus(row.status, derivedStatus);
        return {
          ...row,
          baseCompactedM3: row.compactedM3,
          participation,
          m3,
          m3PerLiter: divide(m3, row.diesel),
          litersPerM3: divide(row.diesel, m3),
          status,
          statusReason: [row.statusReason, dieselIntegrationReason(status)]
            .filter(Boolean)
            .filter((value, index, list) => list.indexOf(value) === index)
            .join("; "),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.obra.localeCompare(b.obra));
  }, [
    blockedRawFuelingByDateObra,
    dieselM3Filters,
    dieselM3ProductionRows,
    dieselM3RcoObraDomain,
    dieselM3SelectedObraKey,
    dieselM3Rows,
    dieselM3UsesRelatedM3,
    filters.dateFrom,
    filters.dateTo,
    selectedAnalysisDateKeys,
  ]);

  const dieselM3ValidObras = useMemo(
    () =>
      chartRcoObras.filter(
        (obra) =>
          dieselM3RcoObraDomain.has(obra.obraKey) &&
          (dieselM3SelectedObraKey === "all" || obra.obraKey === dieselM3SelectedObraKey),
      ),
    [chartRcoObras, dieselM3RcoObraDomain, dieselM3SelectedObraKey],
  );

  const dieselM3MultiObraInfo = useMemo(() => {
    const result = buildMultiObraChartData({
      rows: dieselM3DailyRows,
      getX: (row) => row.date,
      getXLabel: (row) => shortDateLabel(row.date),
      getObra: (row) => row.obra,
      getObraKey: (row) => row.obraKey,
      getObraStatus: (row) => row.obraStatus,
      validObras: dieselM3ValidObras,
      metrics: [
        { id: "m3", getValue: (row) => row.m3 },
        { id: "diesel", getValue: (row) => row.diesel },
        { id: "compactedM3", getValue: (row) => row.compactedM3 },
        {
          id: "m3PerLiter",
          getValue: (row) => (row.diesel > 0 && row.m3 > 0 ? row.m3PerLiter : null),
          outlier: true,
        },
      ],
      outlierPolicy: "mark-and-limit",
    });
    return {
      isMultiObra: result.series.length > 1,
      series: result.series,
      obras: result.series.map((obra) => obra.obra),
      pivotData: result.chartData,
      outliers: result.outliers,
      ignoredRows: result.ignoredRows,
    };
  }, [dieselM3DailyRows, dieselM3ValidObras]);
  const dieselM3MultiObraHasProductionDiesel = multiObraHasMetricData(
    dieselM3MultiObraInfo.pivotData,
    dieselM3MultiObraInfo.series,
    ["m3", "diesel"],
  );

  const dieselM3Kpis = useMemo(() => {
    const compactedM3Base = dieselM3ProductionRows.reduce((sum, row) => sum + row.compactedM3, 0);
    const looseM3 = dieselM3ProductionRows.reduce((sum, row) => sum + row.looseM3, 0);
    const relatedM3 = dieselM3Rows.reduce((sum, row) => sum + row.relatedM3, 0);
    const diesel = dieselM3Rows.reduce((sum, row) => sum + row.diesel, 0);
    const m3ForEfficiency = dieselM3UsesRelatedM3 ? relatedM3 : compactedM3Base;
    const efficientDays = dieselM3DailyRows.filter((row) => row.diesel > 0 && row.m3 > 0);
    const bestDay = [...efficientDays].sort((a, b) => b.m3PerLiter - a.m3PerLiter)[0];
    const worstDay = [...efficientDays].sort((a, b) => a.m3PerLiter - b.m3PerLiter)[0];
    return {
      compactedM3Base,
      looseM3,
      relatedM3,
      diesel,
      m3PerLiter: divide(m3ForEfficiency, diesel),
      litersPerM3: divide(diesel, m3ForEfficiency),
      days: new Set(dieselM3DailyRows.map((row) => row.date)).size,
      worksites: new Set([
        ...dieselM3ProductionRows.map((row) => row.obraKey),
        ...dieselM3Rows.map((row) => row.obraKey),
      ]).size,
      bestDay,
      worstDay,
    };
  }, [dieselM3DailyRows, dieselM3ProductionRows, dieselM3Rows, dieselM3UsesRelatedM3]);

  const obraComparisonRows = useMemo<DieselM3ObraComparisonRow[]>(() => {
    const rows = new Map<string, DieselM3ObraComparisonRow>();
    const ensure = (obra: string, obraKey: string) => {
      const key = obraKey;
      const current =
        rows.get(key) ??
        ({
          obra,
          obraKey,
          compactedM3: 0,
          looseM3: 0,
          relatedM3: 0,
          diesel: 0,
          m3PerLiter: 0,
          relatedM3PerLiter: 0,
          litersPerM3: 0,
        } satisfies DieselM3ObraComparisonRow);
      rows.set(key, current);
      return current;
    };

    dieselM3ProductionRows.forEach((production) => {
      const row = ensure(production.obra, production.obraKey);
      row.compactedM3 += production.compactedM3;
      row.looseM3 += production.looseM3;
    });
    dieselM3Rows.forEach((detail) => {
      const row = ensure(detail.obra, detail.obraKey);
      row.relatedM3 += detail.relatedM3;
      row.diesel += detail.diesel;
    });
    return [...rows.values()]
      .map((row) => ({
        ...row,
        m3PerLiter: divide(row.compactedM3, row.diesel),
        relatedM3PerLiter: divide(row.relatedM3, row.diesel),
        litersPerM3: divide(row.diesel, row.compactedM3),
      }))
      .sort((a, b) => b.m3PerLiter - a.m3PerLiter || b.compactedM3 - a.compactedM3);
  }, [dieselM3ProductionRows, dieselM3Rows]);

  const dieselM3ItemRows = useMemo(() => {
    const rows = new Map<
      OperationalItem,
      {
        id: string;
        item: OperationalItem;
        diesel: number;
        m3Base: number;
        m3Relacionado: number;
        m3PorLitroBase: number;
        m3PorLitroRelacionado: number;
        litrosPorM3Relacionado: number;
      }
    >();
    const baseKeys = new Set<string>();
    dieselM3Rows.forEach((detail) => {
      const current = rows.get(detail.item) ?? {
        id: detail.itemLabel,
        item: detail.item,
        diesel: 0,
        m3Base: 0,
        m3Relacionado: 0,
        m3PorLitroBase: 0,
        m3PorLitroRelacionado: 0,
        litrosPorM3Relacionado: 0,
      };
      const baseKey = `${detail.item}|${detail.date}|${detail.obraKey}`;
      if (!baseKeys.has(baseKey)) {
        current.m3Base += detail.baseCompactedM3;
        baseKeys.add(baseKey);
      }
      current.diesel += detail.diesel;
      current.m3Relacionado += detail.relatedM3;
      rows.set(detail.item, current);
    });
    return [...rows.values()]
      .map((row) => {
        const officialM3 = row.m3Base;
        return {
          ...row,
          m3Relacionado: row.m3Base,
          m3PorLitroBase: divide(row.m3Base, row.diesel),
          m3PorLitroRelacionado: divide(officialM3, row.diesel),
          litrosPorM3Relacionado: divide(row.diesel, officialM3),
        };
      })
      .sort((a, b) => operationalItemRank(a.item) - operationalItemRank(b.item));
  }, [dieselM3Rows]);

  const dieselM3EquipmentRows = useMemo(() => {
    const rows = new Map<
      string,
      {
        id: string;
        item: OperationalItem;
        itemLabel: string;
        tipo: string;
        diesel: number;
        m3Relacionado: number;
        horas: number;
        lph: number;
        m3PorLitro: number;
        litrosPorM3: number;
        status: string;
      }
    >();
    dieselM3Rows.forEach((detail) => {
      const key = `${detail.item}|${detail.equipmentKey}`;
      const current = rows.get(key) ?? {
        id: detail.equipmentLabel,
        item: detail.item,
        itemLabel: detail.itemLabel,
        tipo: detail.kind === "aggregate" ? "Agregado/CB" : "Frota",
        diesel: 0,
        m3Relacionado: 0,
        horas: 0,
        lph: 0,
        m3PorLitro: 0,
        litrosPorM3: 0,
        status: detail.status,
      };
      current.diesel += detail.diesel;
      current.m3Relacionado += detail.relatedM3;
      current.horas += detail.hours;
      if (detail.status !== "OK") current.status = detail.status;
      rows.set(key, current);
    });
    return [...rows.values()]
      .map((row) => ({
        ...row,
        lph: divide(row.diesel, row.horas),
        m3Relacionado: 0,
        m3PorLitro: 0,
        litrosPorM3: 0,
      }))
      .sort((a, b) => b.diesel - a.diesel || b.m3Relacionado - a.m3Relacionado);
  }, [dieselM3Rows]);

  const dieselM3EquipmentRankingData = useMemo(() => {
    if (!needsDieselM3) return [];
    const debugPerformance = debugPerformanceEnabled();
    if (debugPerformance) console.time("rankings");
    let result = [...dieselM3EquipmentRows];
    if (dieselM3Filters.ranking === "lph") {
      result = result.filter((row) => row.lph > 0).sort((a, b) => b.lph - a.lph);
    } else {
      result = result.sort((a, b) => b.diesel - a.diesel);
    }
    timeEnd("rankings", debugPerformance);
    return result;
  }, [dieselM3EquipmentRows, dieselM3Filters.ranking, needsDieselM3]);

  const dieselM3RankingKey = dieselM3Filters.ranking === "lph" ? "lph" : "diesel";
  const dieselM3RankingUnit = dieselM3Filters.ranking === "lph" ? "L/h" : "L";

  const dieselM3CompareA =
    obraComparisonRows.find((row) => row.obraKey === dieselM3Filters.compareObraA) ??
    obraComparisonRows[0];
  const dieselM3CompareB =
    obraComparisonRows.find((row) => row.obraKey === dieselM3Filters.compareObraB) ??
    obraComparisonRows.find((row) => row.obra !== dieselM3CompareA?.obra);
  const dieselM3CompareDelta =
    dieselM3CompareA && dieselM3CompareB && dieselM3CompareB.m3PerLiter > 0
      ? ((dieselM3CompareA.m3PerLiter - dieselM3CompareB.m3PerLiter) /
          dieselM3CompareB.m3PerLiter) *
        100
      : 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!debugDieselM3) return;
    console.groupCollapsed("[debugDieselM3] Diesel x m3");
    console.table(dieselM3BaseData.dailyProductionByWorksite);
    console.table(dieselM3BaseData.dieselByDateWorksiteItemEquipment);
    console.table(dieselM3BaseData.equipmentDailyRelatedM3);
    console.table(dieselM3Rows);
    console.table(obraComparisonRows);
    console.groupEnd();
  }, [debugDieselM3, dieselM3BaseData, dieselM3Rows, obraComparisonRows]);

  const limpezaSummary = itemSummaryById.get("limpeza") ?? emptyItemSummary("limpeza");
  const escavacaoSummary = itemSummaryById.get("escavacao") ?? emptyItemSummary("escavacao");
  const transporteSummary = itemSummaryById.get("transporte") ?? emptyItemSummary("transporte");
  const tratamentoSummary = itemSummaryById.get("tratamento") ?? emptyItemSummary("tratamento");
  const compactacaoSummary = itemSummaryById.get("compactacao") ?? emptyItemSummary("compactacao");

  const dailySeriesDebug = useMemo(() => {
    if (!debugDailySeries) return [];
    return compactacaoSummary.daily.map((day) => ({
      date: day.date,
      item: "compactacao",
      equipment: compactacaoSummary.equipment
        .filter((equipment) => equipment.productionShares.some((share) => share.date === day.date))
        .map((equipment) => equipment.label)
        .join(" | "),
      dailyCompactedM3: fixedNumber(day.baseM3, 2),
      dailyLooseM3: fixedNumber(day.looseM3, 2),
      totalOperationalHoursDay: fixedNumber(day.totalOperationalHours, 2),
      itemHoursDay: fixedNumber(day.itemOperationalHours || day.hours, 2),
      equipmentHoursDay: fixedNumber(day.itemOperationalHours, 2),
      relatedM3: fixedNumber(day.relatedM3, 2),
      diesel: fixedNumber(day.diesel, 2),
      m3PerHour: fixedNumber(day.m3PorH, 2),
      m3PerLiter: fixedNumber(day.lPorM3, 3),
      participation: fixedNumber(
        divide(day.itemOperationalHours, day.totalOperationalHours) * 100,
        2,
      ),
      status: day.status,
      sourceM3: day.sourceM3,
      sourceHours: "PDE por obra/dia via pdeRowHours, deduplicado por obra/frota/item",
      sourceDiesel: day.sourceDiesel,
      formula:
        "dailyCompactedM3 x compactacaoHoursDay / totalOperationalHoursDay; depois / horas ou / diesel",
    }));
  }, [compactacaoSummary, debugDailySeries]);

  // Tarefas 1 e 5: debugPdeHours=1 imprime a origem das horas de compactação
  // do dia 25/05 (uma linha por registro de PDE) e a produção do RCO do dia.
  useEffect(() => {
    if (typeof window === "undefined" || !debugPdeHours) return;
    const targetDate = "2026-05-25";
    const seen = new Set<string>();
    let totalCompactacaoHoursFromPde = 0;

    const compactacaoHours25Debug = filteredDailyParts
      .filter((part) => part.date === targetDate)
      .map((part) => {
        const item = resolveEquipmentOperationalClass({
          fleet: part.fleet,
          equipment: part.fleetLabel || part.fleet,
          obra: resolvedWorksiteLabel(part as DbEquipmentDailyPart & ObraScopeAudit),
          description: `${part.sourceSheet} ${part.status}`,
        }).item;
        const equipmentKey =
          normalizeEquipmentKey(part.fleet || part.fleetLabel, "dailyPart") ||
          part.fleet ||
          part.fleetLabel ||
          "SEM_EQUIPAMENTO";
        const workedHours = part.hours || 0;
        const start = part.horimInicial || 0;
        const end = part.horimFinal || 0;
        const delta = end - start;
        const horimeterValid = start > 0 && end > 0 && delta > 0 && delta <= 24;
        const calculatedHours = horimeterValid ? delta : 0;
        const source = horimeterValid ? "horimetro(final-inicial)" : "workedHours(PDE)";
        const dedupKey = `${part.date}|${resolvedWorksiteKey(part as DbEquipmentDailyPart & ObraScopeAudit)}|${item}|${equipmentKey}`;
        const isCompactacao = item === "compactacao";
        let included = false;
        let reason = "";
        if (!isCompactacao) reason = `item resolvido = ${item}`;
        else if (!part.usedInAnalysis) reason = "usedInAnalysis = false";
        else if (workedHours <= 0) reason = "workedHours <= 0";
        else if (seen.has(dedupKey)) reason = "duplicado (frota/dia ja contada)";
        else {
          included = true;
          reason = "contado uma vez";
          seen.add(dedupKey);
          totalCompactacaoHoursFromPde += pdeRowHours(part);
        }
        const record = part as unknown as Record<string, unknown>;
        return {
          pdeId: String(record.pdeId ?? record.id ?? ""),
          date: part.date,
          equipmentKey,
          equipmentLabel: displayEquipmentLabel(part.fleet || part.fleetLabel, "dailyPart"),
          item,
          startHourmeter: fixedNumber(start, 2),
          endHourmeter: fixedNumber(end, 2),
          workedHours: fixedNumber(workedHours, 2),
          calculatedHours: fixedNumber(calculatedHours, 2),
          hoursUsed: fixedNumber(included ? pdeRowHours(part) : 0, 2),
          source,
          included,
          reason,
        };
      });

    const chartDay = compactacaoSummary.daily.find((day) => day.date === targetDate);
    const totalUsedByChart = fixedNumber(chartDay?.itemOperationalHours || chartDay?.hours || 0, 2);
    const totalFromPde = fixedNumber(totalCompactacaoHoursFromPde, 2);

    const productionByObraMaterial = new Map<
      string,
      {
        date: string;
        obra: string;
        material: string;
        trips: number;
        looseM3: number;
        compactedM3: number;
      }
    >();
    productiveTrips
      .filter((trip) => extractDateKey(trip.datetime) === targetDate)
      .forEach((trip) => {
        const obra = resolvedWorksiteLabel(trip as DbTrip & ObraScopeAudit);
        const material = trip.material || "Sem material";
        const key = `${resolvedWorksiteKey(trip as DbTrip & ObraScopeAudit)}|${material}`;
        const current = productionByObraMaterial.get(key) ?? {
          date: targetDate,
          obra,
          material,
          trips: 0,
          looseM3: 0,
          compactedM3: 0,
        };
        current.trips += 1;
        current.looseM3 += trip.cubicMLoose || 0;
        current.compactedM3 += calculateCompactedVolume(
          trip.cubicMLoose || 0,
          trip.swellFactorApplied,
        );
        productionByObraMaterial.set(key, current);
      });
    const rcoProduction25Debug = [...productionByObraMaterial.values()].map((row) => ({
      date: row.date,
      obra: row.obra,
      trips: row.trips,
      looseM3: fixedNumber(row.looseM3, 2),
      compactedM3: fixedNumber(row.compactedM3, 2),
      material: row.material,
    }));

    console.groupCollapsed("[debugPdeHours] Compactacao 25/05");
    console.table(compactacaoHours25Debug);
    console.log({
      totalCompactacaoHoursFromPde: totalFromPde,
      totalUsedByChart,
      diff: fixedNumber(totalUsedByChart - totalFromPde, 2),
    });
    console.table(rcoProduction25Debug);
    console.groupEnd();
  }, [debugPdeHours, filteredDailyParts, productiveTrips, compactacaoSummary]);

  useEffect(() => {
    if (typeof window === "undefined" || !debugWorksiteHours) return;
    const selectedWorksite =
      filters.obra !== "all" ? filters.obra : selectedObras.join(" | ") || "all";
    const selectedWorksiteKey = filters.obra !== "all" ? obraSelectionKey(filters.obra) : "";
    const filteredKeys = new Set(
      filteredDailyParts.map((part) => {
        const record = part as unknown as Record<string, unknown>;
        return String(record.id ?? `${part.date}|${part.fleet}|${part.obra}|${part.sourceSheet}`);
      }),
    );
    const seen = new Set<string>();

    const rows = dailyPartRows.map((part) => {
      const record = part as unknown as Record<string, unknown>;
      const rawId = String(
        record.id ?? `${part.date}|${part.fleet}|${part.obra}|${part.sourceSheet}`,
      );
      const rawObra = String(part.obra ?? "");
      const scopedObra = resolveScopedObra(rawObra, selectedObraLabels);
      const pdeWorksite = scopedObra?.resolvedObraLabel ?? worksiteLabel(part.obra);
      const pdeWorksiteKey = scopedObra?.resolvedObraKey ?? worksiteKey(pdeWorksite);
      const matchedSelectedWorksite = Boolean(scopedObra);
      const matchedFilter = !scopedObra
        ? false
        : !selectedWorksiteKey || pdeWorksiteKey === selectedWorksiteKey;
      const item = resolveEquipmentOperationalClass({
        fleet: part.fleet,
        equipment: part.fleetLabel || part.fleet,
        obra: pdeWorksite,
        description: `${part.sourceSheet} ${part.status}`,
        raw: part,
      }).item;
      const equipmentKey =
        normalizeEquipmentKey(part.fleet || part.fleetLabel, "dailyPart") ||
        part.fleet ||
        part.fleetLabel ||
        "SEM_EQUIPAMENTO";
      const dedupKey = `${part.date}|${pdeWorksiteKey}|${item}|${equipmentKey}`;
      const hoursFromPde = pdeRowHours(part);
      const includedInCurrentCalculation = filteredKeys.has(rawId);
      let included = false;
      let reason = "";
      if (!matchedSelectedWorksite) reason = "obra do PDE nao pertence as obras selecionadas";
      else if (!matchedFilter) reason = "obra do PDE nao corresponde ao filtro de obra";
      else if (!includedInCurrentCalculation) reason = "excluido por data/equipamento/filtros";
      else if (!part.usedInAnalysis) reason = "usedInAnalysis = false";
      else if (item === "outros") reason = "item resolvido como outros";
      else if (hoursFromPde <= 0) reason = "horas PDE <= 0";
      else if (seen.has(dedupKey)) reason = "duplicado date|obra|item|equipment";
      else {
        included = true;
        reason = "incluido no agrupamento PDE por obra";
        seen.add(dedupKey);
      }

      return {
        date: part.date,
        groupKey: dedupKey,
        obra: pdeWorksite,
        obraKey: pdeWorksiteKey,
        rawObra: rawObra || "Obra indefinida",
        selectedWorksite,
        selectedWorksiteKey: selectedWorksiteKey || "all",
        pdeWorksite,
        pdeWorksiteKey,
        equipmentKey,
        equipmentLabel: displayEquipmentLabel(part.fleet || part.fleetLabel, "dailyPart"),
        item,
        hours: fixedNumber(included ? hoursFromPde : 0, 2),
        hoursUsed: fixedNumber(included ? hoursFromPde : 0, 2),
        rawWorkedHours: fixedNumber(part.hours || 0, 2),
        startHourmeter: fixedNumber(part.horimInicial || 0, 2),
        endHourmeter: fixedNumber(part.horimFinal || 0, 2),
        included,
        includedInCurrentCalculation,
        denominatorKey: `${part.date}|${pdeWorksiteKey}`,
        reason,
        filteredByWorksite: !matchedSelectedWorksite || !matchedFilter,
      };
    });

    const grouped = new Map<
      string,
      {
        groupKey: string;
        date: string;
        selectedWorksite: string;
        pdeWorksite: string;
        pdeWorksiteKey: string;
        item: OperationalItem;
        equipmentKey: string;
        equipmentLabel: string;
        included: boolean;
        hours: number;
        includedRows: number;
        excludedRows: number;
        reasons: Set<string>;
      }
    >();

    rows.forEach((row) => {
      const current =
        grouped.get(row.groupKey) ??
        ({
          groupKey: row.groupKey,
          date: row.date,
          selectedWorksite: row.selectedWorksite,
          pdeWorksite: row.pdeWorksite,
          pdeWorksiteKey: row.pdeWorksiteKey,
          item: row.item,
          equipmentKey: row.equipmentKey,
          equipmentLabel: row.equipmentLabel,
          included: false,
          hours: 0,
          includedRows: 0,
          excludedRows: 0,
          reasons: new Set<string>(),
        } satisfies {
          groupKey: string;
          date: string;
          selectedWorksite: string;
          pdeWorksite: string;
          pdeWorksiteKey: string;
          item: OperationalItem;
          equipmentKey: string;
          equipmentLabel: string;
          included: boolean;
          hours: number;
          includedRows: number;
          excludedRows: number;
          reasons: Set<string>;
        });
      current.included ||= row.included;
      current.hours += row.hoursUsed;
      if (row.included) current.includedRows += 1;
      else current.excludedRows += 1;
      current.reasons.add(row.reason);
      grouped.set(row.groupKey, current);
    });

    const groupedRows = [...grouped.values()]
      .map((row) => ({
        groupKey: row.groupKey,
        date: row.date,
        selectedWorksite: row.selectedWorksite,
        pdeWorksite: row.pdeWorksite,
        pdeWorksiteKey: row.pdeWorksiteKey,
        item: row.item,
        equipmentKey: row.equipmentKey,
        equipmentLabel: row.equipmentLabel,
        included: row.included,
        hours: fixedNumber(row.hours, 2),
        includedRows: row.includedRows,
        excludedRows: row.excludedRows,
        reason: [...row.reasons].join("; "),
      }))
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.pdeWorksite.localeCompare(b.pdeWorksite) ||
          a.item.localeCompare(b.item) ||
          a.equipmentKey.localeCompare(b.equipmentKey),
      );

    console.groupCollapsed(
      `${DEBUG_FLAG_LABELS.debugWorksiteHours} PDE horas por date|obra|item|equipment`,
    );
    console.table(groupedRows);
    console.table(rows);
    console.groupEnd();
  }, [
    dailyPartRows,
    debugWorksiteHours,
    filteredDailyParts,
    filters.obra,
    selectedObraLabels,
    selectedObras,
  ]);

  const compactacaoM3LDebug = useMemo(() => {
    if (!debugM3LCompactacao && activeTab !== "compactacao" && !showTechnicalAudit) return [];
    const equipmentDieselByDate = new Map<string, Map<string, number>>();
    const equipmentHoursByDate = new Map<string, Map<string, number>>();
    const equipmentRelatedM3ByDate = new Map<string, Map<string, number>>();
    const dieselSourcesByDate = new Map<string, Set<string>>();

    const addToNestedMap = (
      target: Map<string, Map<string, number>>,
      date: string,
      label: string,
      value: number,
    ) => {
      if (!date || !label || value <= 0) return;
      const current = target.get(date) ?? new Map<string, number>();
      current.set(label, (current.get(label) ?? 0) + value);
      target.set(date, current);
    };
    const mapToText = (map?: Map<string, number>) =>
      map
        ? [...map.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([label, value]) => `${label}: ${fixedNumber(value, 2)}`)
            .join(" | ")
        : "";

    const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
    const aggregateKeys = buildTripAggregateKeys(productiveTrips);
    productionFueling.forEach((fuel) => {
      const classification = resolveFuelOperationalClassification(
        fuel,
        pdeFleetKeys,
        aggregateKeys,
      );
      if (classification.operationalItem !== "compactacao") return;
      const date = extractDateKey(fuel.datetime);
      addToNestedMap(equipmentDieselByDate, date, classification.resolvedLabel, fuel.liters || 0);
      const sources = dieselSourcesByDate.get(date) ?? new Set<string>();
      sources.add(dieselM3SourceLabel(dieselM3SourceForFuel(fuel)));
      dieselSourcesByDate.set(date, sources);
    });

    filteredDailyParts.forEach((part) => {
      const operationalClass = resolveEquipmentOperationalClass({
        fleet: part.fleet,
        equipment: part.fleetLabel || part.fleet,
        obra: resolvedWorksiteLabel(part as DbEquipmentDailyPart & ObraScopeAudit),
        description: `${part.sourceSheet} ${part.status}`,
      });
      if (operationalClass.item !== "compactacao") return;
      addToNestedMap(
        equipmentHoursByDate,
        part.date,
        displayEquipmentLabel(part.fleet || part.fleetLabel, "dailyPart"),
        part.usedInAnalysis ? part.hours || 0 : 0,
      );
    });

    compactacaoSummary.equipment.forEach((equipment) => {
      equipment.productionShares.forEach((share) => {
        addToNestedMap(
          equipmentRelatedM3ByDate,
          share.date,
          share.equipmentLabel || equipment.label,
          share.relatedM3,
        );
      });
    });

    return compactacaoSummary.daily.map((day) => ({
      date: day.date,
      compactedM3Day: fixedNumber(day.baseM3, 2),
      compactacaoRelatedM3Day: fixedNumber(day.relatedM3, 2),
      compactacaoHoursDay: fixedNumber(day.itemOperationalHours || day.hours, 2),
      dieselCompactacaoDay: fixedNumber(day.diesel, 2),
      dieselByEquipment: mapToText(equipmentDieselByDate.get(day.date)),
      hoursByEquipment: mapToText(equipmentHoursByDate.get(day.date)),
      relatedM3ByEquipment: mapToText(equipmentRelatedM3ByDate.get(day.date)),
      m3PerLiter: fixedNumber(day.lPorM3, 3),
      formulaUsed: day.formulaUsed,
      sourceDiesel:
        [...(dieselSourcesByDate.get(day.date) ?? new Set<string>())].join(", ") ||
        day.sourceDiesel,
      sourceM3: day.sourceM3,
      status: day.status === "OK" ? "OK" : `${day.status}: ${day.statusReason}`,
    }));
  }, [
    activeTab,
    compactacaoSummary,
    debugM3LCompactacao,
    filteredDailyParts,
    productionFueling,
    productiveTrips,
    showTechnicalAudit,
  ]);

  const compactacaoM3LAuditRows = useMemo(
    () => compactacaoM3LDebug.filter((row) => String(row.status).startsWith("SUSPEITO")),
    [compactacaoM3LDebug],
  );

  const compactacaoAllocationDebugRows = useMemo(() => {
    if (!debugM3LCompactacao) return [];
    const sourceFuelingDateById = new Map(
      fuelRows.map((fuel) => [fuel.id, extractDateKey(fuel.datetime)]),
    );
    const auditBySourceFleet = new Map<string, string>();
    fuelAllocationAuditRows.forEach((row) => {
      const key = `${row.sourceFuelingId ?? ""}|${normalizeEquipmentKey(row.fleet, "fuelAllocation")}`;
      const value = [row.type, row.message].filter(Boolean).join(": ");
      auditBySourceFleet.set(key, value || "audit");
    });

    return fuelAllocationRows
      .filter((row) => row.pdeDate === "2026-05-25")
      .map((row) => {
        const item = resolveEquipmentOperationalClass({
          fleet: row.fleet,
          equipment: row.equipmentId || row.fleet,
          obra: row.obra,
          description: row.fleet,
        }).item;
        const fleetKey = normalizeEquipmentKey(row.fleet, "fuelAllocation");
        return {
          sourceFuelingId: row.sourceFuelingId,
          sourceFuelingDate: sourceFuelingDateById.get(row.sourceFuelingId) ?? "",
          pdeDate: row.pdeDate,
          fleet: row.fleet,
          equipmentLabel: displayEquipmentLabel(row.fleet || row.equipmentId, "fuelAllocation"),
          pdeId: row.pdeId,
          hourmeterStart: fixedNumber(row.hourmeterStart, 2),
          hourmeterEnd: fixedNumber(row.hourmeterEnd, 2),
          allocatedHours: fixedNumber(row.allocatedHours, 2),
          litersAllocated: fixedNumber(row.litersAllocated, 2),
          auditStatus: auditBySourceFleet.get(`${row.sourceFuelingId}|${fleetKey}`) ?? "OK",
          itemResolved: item,
        };
      })
      .filter((row) => row.itemResolved === "compactacao");
  }, [debugM3LCompactacao, fuelAllocationAuditRows, fuelAllocationRows, fuelRows]);

  const compactacaoPdeDebugRows = useMemo(() => {
    if (!debugM3LCompactacao) return [];
    const allocationFleetDates = new Set(
      fuelAllocationRows.map(
        (row) => `${normalizeEquipmentKey(row.fleet, "fuelAllocation")}|${row.pdeDate}`,
      ),
    );
    return filteredDailyParts
      .filter((part) => part.date === "2026-05-25")
      .map((part) => {
        const itemResolved = resolveEquipmentOperationalClass({
          fleet: part.fleet,
          equipment: part.fleetLabel || part.fleet,
          obra: resolvedWorksiteLabel(part as DbEquipmentDailyPart & ObraScopeAudit),
          description: `${part.sourceSheet} ${part.status}`,
        }).item;
        const fleetKey = normalizeEquipmentKey(part.fleet || part.fleetLabel, "dailyPart");
        return {
          fleet: part.fleet,
          equipmentType: part.fleetLabel || part.sourceSheet,
          startHourmeter: fixedNumber(part.horimInicial, 2),
          endHourmeter: fixedNumber(part.horimFinal, 2),
          workedHours: fixedNumber(part.hours, 2),
          itemResolved,
          hasDieselAllocation: allocationFleetDates.has(`${fleetKey}|${part.date}`),
          status: part.status,
        };
      })
      .filter((row) => row.itemResolved === "compactacao");
  }, [debugM3LCompactacao, filteredDailyParts, fuelAllocationRows]);

  const compactacaoTripsDebugRows = useMemo(() => {
    if (!debugM3LCompactacao) return [];
    const rows = new Map<
      string,
      {
        date: string;
        obra: string;
        material: string;
        trips: number;
        looseM3: number;
        compactedM3: number;
        source: string;
      }
    >();
    productiveTrips
      .filter((trip) => extractDateKey(trip.datetime) === "2026-05-25")
      .forEach((trip) => {
        const key = `${extractDateKey(trip.datetime)}|${trip.obra}|${trip.material}`;
        const current = rows.get(key) ?? {
          date: extractDateKey(trip.datetime),
          obra: trip.obra,
          material: trip.material,
          trips: 0,
          looseM3: 0,
          compactedM3: 0,
          source: "RCO trips",
        };
        current.trips += 1;
        current.looseM3 += trip.cubicMLoose || 0;
        current.compactedM3 += calculateCompactedVolume(
          trip.cubicMLoose || 0,
          trip.swellFactorApplied,
        );
        rows.set(key, current);
      });
    return [...rows.values()].map((row) => ({
      ...row,
      looseM3: fixedNumber(row.looseM3, 2),
      compactedM3: fixedNumber(row.compactedM3, 2),
    }));
  }, [debugM3LCompactacao, productiveTrips]);

  const compactacaoFuelingDebugRows = useMemo(() => {
    if (!debugM3LCompactacao) return [];
    const pdeFleetKeys = buildPdeFleetKeys(filteredDailyParts);
    const aggregateKeys = buildTripAggregateKeys(productiveTrips);
    return fuelRows
      .map((fuel) => {
        const date = extractDateKey(fuel.datetime);
        const classification = resolveFuelOperationalClassification(
          fuel,
          pdeFleetKeys,
          aggregateKeys,
        );
        return {
          sourceFuelingId: fuel.id,
          date,
          fleet: fuel.prefix || fuel.vehicleId || fuel.plate,
          equipmentLabel: classification.resolvedLabel,
          liters: fixedNumber(fuel.liters || 0, 2),
          obra: fuel.obra,
          resolvedItem: classification.operationalItem,
          reason: classification.reason,
        };
      })
      .filter(
        (row) =>
          row.resolvedItem === "compactacao" &&
          row.date >= "2026-05-23" &&
          row.date <= "2026-05-26",
      );
  }, [debugM3LCompactacao, filteredDailyParts, fuelRows, productiveTrips]);

  useEffect(() => {
    if (!debugM3LCompactacao) return;
    console.groupCollapsed("[debugM3LCompactacao] Compactacao - m3/L com referencia");
    console.table(compactacaoM3LDebug);
    console.table(compactacaoM3LDebug.filter((row) => row.date === "2026-05-25"));
    console.table(compactacaoAllocationDebugRows);
    console.table(compactacaoPdeDebugRows);
    console.table(compactacaoTripsDebugRows);
    console.table(compactacaoFuelingDebugRows);
    console.groupEnd();
  }, [
    compactacaoAllocationDebugRows,
    compactacaoFuelingDebugRows,
    compactacaoM3LDebug,
    compactacaoPdeDebugRows,
    compactacaoTripsDebugRows,
    debugM3LCompactacao,
  ]);

  useEffect(() => {
    if (!debugDailySeries) return;
    console.groupCollapsed(`${DEBUG_FLAG_LABELS.debugDailySeries} Compactacao daily series`);
    console.table(dailySeriesDebug);
    console.table(dailySeriesDebug.filter((row) => row.date === "2026-05-25"));
    console.groupEnd();
  }, [dailySeriesDebug, debugDailySeries]);

  const technicalAuditRows = useMemo<TechnicalAuditRow[]>(() => {
    if (!needsTechnicalAudit) return [];
    const debugPerformance = debugPerformanceEnabled();
    if (debugPerformance) console.time("auditoria");
    const rows = itemSummaries.flatMap((summary) =>
      summary.equipment.map((row) => {
        const status: DieselIntegrationStatus = "OK";
        const reasons = [dieselIntegrationReason(status)];
        if (summary.item !== "transporte" && row.hours <= 0) reasons.push("Sem horas PDE");
        if (row.item === "outros") reasons.push("Fora do item esperado");
        if (row.duplicateAcrossItems) reasons.push("Duplicado");
        if (!row.includedInEquipmentCount) reasons.push("Nao contado");
        if (row.classificationReason.includes("Pipa redirecionado")) {
          reasons.push("Pipa redirecionado para Tratamento");
        }
        if (row.classificationReason.includes("CB/agregado")) {
          reasons.push("CB/agregado tratado como Transporte");
        }
        if (row.classificationReason.includes("sem correspondencia")) {
          reasons.push("Classificacao suspeita");
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
          m3Source: "sem m3 por equipamento: producao pertence a obra/dia/item",
          includedInEquipmentCount: row.includedInEquipmentCount,
          status,
          reason:
            [...new Set(reasons.filter((reason) => reason && reason !== "OK"))].join("; ") ||
            row.equipmentCountReason,
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
    );
    timeEnd("auditoria", debugPerformance);
    return rows;
  }, [itemSummaries, needsTechnicalAudit]);

  const dieselFlowAuditRows = useMemo<DieselFlowAuditRow[]>(() => {
    if (!needsDieselFlowAudit) return [];
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
    const blockedRawFueling = new Map<string, number>();
    const excludedProductiveFueling = new Map<string, number>();

    filteredFueling.forEach((fuel) => {
      const context = fuelingEquipmentContext(fuel);
      const key = equipmentKeyByPdeRule(equipmentRaw(fuel), pdeFleetKeys, context);
      add(
        rawFueling,
        key,
        equipmentLabelFromKey(key, equipmentLabel(fuel, context)),
        fuel.liters || 0,
      );
      if (allocatedSourceIds.has(fuel.id)) {
        add(
          blockedRawFueling,
          key,
          equipmentLabelFromKey(key, equipmentLabel(fuel, context)),
          fuel.liters || 0,
        );
      }
    });
    filteredFuelAllocations.forEach((allocation) => {
      const key = normalizeEquipmentKey(allocation.fleet, "fuelAllocation");
      add(
        allocated,
        key,
        displayEquipmentLabel(allocation.fleet, "fuelAllocation"),
        allocation.litersAllocated || 0,
      );
    });
    attributedFueling.forEach((fuel) => {
      const context = fuelingEquipmentContext(fuel);
      const key = equipmentKeyByPdeRule(equipmentRaw(fuel), pdeFleetKeys, context);
      add(
        attributed,
        key,
        equipmentLabelFromKey(key, equipmentLabel(fuel, context)),
        fuel.liters || 0,
      );
    });
    itemSummaries.forEach((summary) => {
      summary.equipment.forEach((equipment) => {
        add(dashboard, equipment.equipment, equipment.label, equipment.liters);
      });
    });
    itemEquipmentStacks.forEach((stack) => {
      stack.data.forEach((row) => {
        stack.series.forEach((series) => {
          const key =
            (series as StackedBarSeries & { equipmentKey?: string }).equipmentKey ?? series.name;
          labels.set(key, series.name);
          stacked.set(key, (stacked.get(key) ?? 0) + Number(row[series.dataKey] ?? 0));
        });
      });
    });
    classifiedFuelUsageRows
      .filter((row) => row.excludedFromProductiveCalculation)
      .forEach((row) => {
        add(excludedProductiveFueling, row.equipmentKey, row.equipment, row.liters);
      });

    const keys = new Set([
      ...rawFueling.keys(),
      ...allocated.keys(),
      ...attributed.keys(),
      ...dashboard.keys(),
      ...stacked.keys(),
      ...excludedProductiveFueling.keys(),
    ]);
    return [...keys]
      .map((key) => {
        const fuelingLiters = rawFueling.get(key) ?? 0;
        const allocatedLiters = allocated.get(key) ?? 0;
        const attributedLiters = attributed.get(key) ?? 0;
        const itemSummaryLiters = dashboard.get(key) ?? 0;
        const stackedChartLiters = stacked.get(key) ?? 0;
        const blockedRawLiters = blockedRawFueling.get(key) ?? 0;
        const excludedProductiveLiters = excludedProductiveFueling.get(key) ?? 0;
        const productiveExpectedLiters =
          (hasOfficialFuelAllocations ? allocatedLiters : attributedLiters) -
          excludedProductiveLiters;
        const auditTypes: string[] = [];
        if (excludedProductiveLiters > 0) {
          auditTypes.push("Diesel excluido do calculo produtivo");
        }
        if (fuelingLiters > 0 && allocatedLiters <= 0 && hasOfficialFuelAllocations) {
          auditTypes.push(
            blockedRawLiters > 0 ? "CMB bloqueado: já alocado oficialmente" : "Sem allocation",
          );
        }
        if (Math.abs(productiveExpectedLiters - itemSummaryLiters) > 0.01) {
          auditTypes.push("Divergencia de soma");
        }
        if (itemSummaryLiters > 0 && stackedChartLiters <= 0)
          auditTypes.push("Fora do stack top 6");
        return {
          equipmentKey: key,
          equipmentLabel: labels.get(key) ?? key,
          fuelingLiters,
          allocatedLiters,
          attributedLiters,
          itemSummaryLiters,
          stackedChartLiters,
          diffFuelingToAllocation: fuelingLiters - allocatedLiters,
          diffAllocationToDashboard: productiveExpectedLiters - itemSummaryLiters,
          auditTypes: auditTypes.join(", ") || "OK",
        };
      })
      .sort(
        (a, b) =>
          b.itemSummaryLiters - a.itemSummaryLiters ||
          a.equipmentLabel.localeCompare(b.equipmentLabel),
      );
  }, [
    allocatedSourceIds,
    attributedFueling,
    classifiedFuelUsageRows,
    filteredFuelAllocations,
    filteredFueling,
    filteredDailyParts,
    hasOfficialFuelAllocations,
    itemEquipmentStacks,
    itemSummaries,
    needsDieselFlowAudit,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    if (!debugFuelAllocation) return;

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
      obraStatus: row.obra.trim() ? "" : OBRA_SCOPE_STATUS_MISSING,
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
    console.table(sumByKey(fuelRows, fuelingKey, (fuel) => fuel.liters || 0));
    console.table(
      sumByKey(
        fuelAllocationRows,
        (allocation) => normalizeEquipmentKey(allocation.fleet, "fuelAllocation"),
        (allocation) => allocation.litersAllocated || 0,
      ),
    );
    console.table(sumByKey(attributedFueling, fuelingKey, (fuel) => fuel.liters || 0));
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
  }, [
    attributedFueling,
    debugFuelAllocation,
    filteredDailyParts,
    fuelAllocationRows,
    fuelRows,
    itemEquipmentStacks,
    itemSummaries,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!debugProductionAudit) return;

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

    console.groupCollapsed(`${DEBUG_FLAG_LABELS.debugProductionAudit} Producao x Consumo`);
    console.table(productionAggregationAuditRows);
    const aggregationErrors = productionAggregationAuditRows.filter(
      (row) => row.status === "ERRO_AGREGACAO",
    );
    if (aggregationErrors.length > 0) {
      console.warn("[production-aggregation-audit] ERRO_AGREGACAO", aggregationErrors);
    }
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
            obra: share.obra,
            obraKey: share.obraKey,
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
  }, [
    debugProductionAudit,
    dieselFlowAuditRows,
    itemSummaries,
    productionAggregationAuditRows,
    technicalAuditRows,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!debugProductionMath) return;

    const equipmentDailyRows = itemSummaries.flatMap((summary) =>
      summary.equipment.flatMap((equipment) =>
        equipment.productionShares.map((share) => ({
          date: share.date,
          obra: share.obra,
          obraKey: share.obraKey,
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
        const suspectedIssue = "OK";
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
          formula:
            "sem m3 por equipamento; eficiencia oficial = m3 da obra/dia/item / diesel do item",
          suspectedIssue,
        };
      }),
    );
    const componentFormulaRows = [
      {
        component: "KPI m3/L do item",
        m3Source: "summary.relatedM3",
        dieselSource: "summary.diesel",
        formula: "sum(relatedM3 obra/dia do item) / summary.diesel",
        scope: "item/periodo",
        status: "OK",
      },
      {
        component: "Grafico eficiencia diaria do item",
        m3Source: "day.relatedM3",
        dieselSource: "day.diesel do item",
        formula: "dailyCompactedM3DaObra * itemHoursDay / totalOperationalHoursDay / itemDieselDay",
        scope: "item/dia",
        status: "OK",
      },
      {
        component: "Ranking m3/L por equipamento",
        m3Source: "bloqueado para todos os itens",
        dieselSource: "equipment.liters",
        formula: "nao calcula m3/L por equipamento",
        scope: "equipamento/periodo",
        status: "OK",
      },
      {
        component: "Tabela operacional por equipamento",
        m3Source: "bloqueado para todos os itens",
        dieselSource: "equipment.liters",
        formula: "equipamento mostra apenas horas, diesel, L/h e custo",
        scope: "equipamento/periodo",
        status: "OK",
      },
      {
        component: "Produtividade m3/h por equipamento",
        m3Source: "bloqueado para todos os itens",
        dieselSource: "n/a",
        formula: "nao calcula m3/h por equipamento",
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
  }, [debugProductionMath, itemSummaries]);

  const obraComparison = useMemo(() => {
    if (!needsObraComparison) return [];
    return comparisonSeries.map((series) => {
      const trips = productiveTrips.filter(
        (trip) => resolvedWorksiteKey(trip as DbTrip & ObraScopeAudit) === series.obraKey,
      );
      const fueling = productionFueling.filter(
        (fuel) => resolvedWorksiteKey(fuel as DbFueling & ObraScopeAudit) === series.obraKey,
      );
      const dailyParts = filteredDailyParts.filter(
        (part) =>
          resolvedWorksiteKey(part as DbEquipmentDailyPart & ObraScopeAudit) === series.obraKey,
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
        aggregateMetrics: calculateAggregateMetrics(
          trips.filter((trip) => !isTripPipaLike(trip)),
          obraKpis.compactedM3,
        ),
        equipmentMetrics: calculateEquipmentMetrics(fueling, dailyParts),
      };
    });
  }, [
    comparisonSeries,
    filteredDailyParts,
    needsObraComparison,
    productionFueling,
    productiveTrips,
  ]);

  const dailyObraComparisonInfo = useMemo(() => {
    if (!needsObraComparison) {
      return {
        chartData: [] as Array<Record<string, unknown>>,
        series: [] as Array<MultiObraDomainEntry & { key: string }>,
        ignoredRows: [],
        outliers: [],
      };
    }
    const pdeHoursById = new Map(
      filteredDailyParts.map((part) => [part.id, part.usedInAnalysis ? pdeRowHours(part) : 0]),
    );
    const allocationGroups = new Map<
      string,
      {
        date: string;
        obraKey: string;
        liters: number;
        coveredHours: number;
        pdeHours: number;
      }
    >();
    filteredFuelAllocations.forEach((allocation) => {
      const date = allocation.pdeDate;
      if (!date) return;
      const scopedAllocation = allocation as FuelAllocationSupportRow & ObraScopeAudit;
      const obraKey = resolvedWorksiteKey(scopedAllocation);
      const groupKey =
        allocation.pdeId || `${date}|${obraKey}|${allocation.fleet}|${allocation.equipmentId}`;
      const current = allocationGroups.get(groupKey) ?? {
        date,
        obraKey,
        liters: 0,
        coveredHours: 0,
        pdeHours: allocation.pdeId ? (pdeHoursById.get(allocation.pdeId) ?? 0) : 0,
      };
      current.liters += allocation.litersAllocated || 0;
      current.coveredHours += allocation.allocatedHours || 0;
      if (!current.pdeHours && allocation.pdeId) {
        current.pdeHours = pdeHoursById.get(allocation.pdeId) ?? 0;
      }
      allocationGroups.set(groupKey, current);
    });
    const efficiencyDieselByDateObra = new Map<string, number>();
    allocationGroups.forEach((group) => {
      const hasPartialCoverage =
        group.pdeHours > 0 &&
        group.coveredHours > 0 &&
        group.liters > 0 &&
        group.coveredHours + 0.01 < group.pdeHours;
      const efficiencyDiesel = hasPartialCoverage
        ? group.liters * (group.pdeHours / group.coveredHours)
        : group.liters;
      const key = dateWorksiteKey(group.date, group.obraKey);
      efficiencyDieselByDateObra.set(
        key,
        (efficiencyDieselByDateObra.get(key) ?? 0) + efficiencyDiesel,
      );
    });
    const rows = obraComparison.flatMap((obra) => {
      const dailyByDate = new Map(obra.daily.map((day) => [day.date, day]));
      return visibleDateKeys.map((date) => {
        const day = dailyByDate.get(date);
        const compactedM3 = day?.compactedM3 ?? 0;
        const looseM3 = day?.looseM3 ?? 0;
        const diesel = day?.diesel ?? 0;
        const efficiencyDiesel =
          efficiencyDieselByDateObra.get(dateWorksiteKey(date, obra.obraKey)) ?? diesel;
        const hours = obra.dailyParts
          .filter((part) => part.date === date)
          .reduce((sum, part) => sum + pdeRowHours(part), 0);
        const status = dieselIntegrationStatus({ diesel, m3: compactedM3, hours });
        return {
          date,
          d: shortDateLabel(date),
          obra: obra.obra,
          obraKey: obra.obraKey,
          compactedM3,
          looseM3,
          diesel,
          efficiencyDiesel,
          hours,
          fuelPerM3: efficiencyDiesel > 0 && compactedM3 > 0 ? compactedM3 / efficiencyDiesel : 0,
          status,
          statusReason: dieselIntegrationReason(status),
        };
      });
    });
    return buildMultiObraChartData({
      rows,
      getX: (row) => row.date,
      getXLabel: (row) => row.d,
      getObra: (row) => row.obra,
      getObraKey: (row) => row.obraKey,
      validObras: chartVisibleObras,
      metrics: [
        { id: "compactedM3", getValue: (row) => row.compactedM3 },
        { id: "looseM3", getValue: (row) => row.looseM3 },
        { id: "diesel", getValue: (row) => row.diesel },
        { id: "hours", getValue: (row) => row.hours },
        { id: "fuelPerM3", getValue: (row) => row.fuelPerM3 || null, outlier: true },
      ],
      outlierPolicy: "mark-and-limit",
    });
  }, [
    chartVisibleObras,
    filteredDailyParts,
    filteredFuelAllocations,
    needsObraComparison,
    obraComparison,
    visibleDateKeys,
  ]);

  const dailyObraComparisonData = dailyObraComparisonInfo.chartData;
  const dailyObraHasVolumeDiesel = multiObraHasMetricData(
    dailyObraComparisonData,
    dailyObraComparisonInfo.series,
    ["looseM3", "diesel"],
  );
  const dailyObraHasCompactedM3 = multiObraHasMetricData(
    dailyObraComparisonData,
    dailyObraComparisonInfo.series,
    ["compactedM3"],
  );
  const dailyObraHasDiesel = multiObraHasMetricData(
    dailyObraComparisonData,
    dailyObraComparisonInfo.series,
    ["diesel"],
  );

  const obraVolumeDieselSeries = useMemo(
    () =>
      dailyObraComparisonInfo.series.map((obra) => ({
        obra: obra.obra,
        color: obra.color,
        volumeKey: multiObraMetricKey(obra.key, "looseM3"),
        lineKey: multiObraMetricKey(obra.key, "diesel"),
      })),
    [dailyObraComparisonInfo.series],
  );

  const obraCompactedM3Series = useMemo(
    () =>
      dailyObraComparisonInfo.series.map((obra) => ({
        dataKey: multiObraMetricKey(obra.key, "compactedM3"),
        name: obra.obra,
        color: obra.color,
      })),
    [dailyObraComparisonInfo.series],
  );

  const obraDieselSeries = useMemo(
    () =>
      dailyObraComparisonInfo.series.map((obra) => ({
        dataKey: multiObraMetricKey(obra.key, "diesel"),
        name: obra.obra,
        color: obra.color,
      })),
    [dailyObraComparisonInfo.series],
  );

  const obraFuelPerM3Series = useMemo(
    () =>
      dailyObraComparisonInfo.series.map((obra) => ({
        dataKey: multiObraMetricDisplayKey(obra.key, "fuelPerM3"),
        valueDataKey: multiObraMetricKey(obra.key, "fuelPerM3"),
        outlierDataKey: multiObraMetricOutlierKey(obra.key, "fuelPerM3"),
        name: obra.obra,
        color: obra.color,
      })),
    [dailyObraComparisonInfo.series],
  );

  const obraDistribution = useMemo(
    () => (needsLegacyCharts ? calculateObraDistribution(productiveTrips) : []),
    [needsLegacyCharts, productiveTrips],
  );

  const operationalAlerts = useMemo(
    () =>
      showTechnicalAudit
        ? detectOperationalAlerts(
            productiveTrips,
            filteredFueling,
            equipmentMetrics.map((e) => ({
              equipment: e.equipment,
              hours: e.hours,
              liters: e.liters,
            })),
          )
        : [],
    [equipmentMetrics, filteredFueling, productiveTrips, showTechnicalAudit],
  );

  const prefetchDashboardForIds = useCallback(
    async (ids: string[]) => {
      const normalizedIds = normalizeAnalysisIds(ids);
      const key = analysisIdsKey(normalizedIds);
      if (normalizedIds.length === 0) return null;
      return queryClient.fetchQuery({
        queryKey: productionQueryKeys.dashboard(key),
        queryFn: ({ signal }) => fetchDashboardRows(normalizedIds, signal, analyses),
        staleTime: 5_000,
      });
    },
    [analyses, queryClient],
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
  const limpezaKpis = useMemo(() => {
    const diesel = limpezaRows.reduce((sum, row) => sum + row.liters, 0);
    const cost = limpezaRows.reduce((sum, row) => sum + row.cost, 0);
    const hours = limpezaRows.reduce((sum, row) => sum + row.hours, 0);
    return {
      diesel,
      cost,
      hours,
      days: new Set(limpezaRows.map((row) => row.date).filter(Boolean)).size,
      worksites: new Set(limpezaRows.map((row) => row.obraKey).filter(Boolean)).size,
      equipment: new Set(limpezaRows.map((row) => row.fleet || row.equipment).filter(Boolean)).size,
    };
  }, [limpezaRows]);

  const limpezaDailyData = useMemo(() => {
    const rows = new Map<
      string,
      { date: string; d: string; diesel: number; cost: number; hours: number }
    >();
    limpezaRows.forEach((row) => {
      if (!row.date) return;
      const current = rows.get(row.date) ?? {
        date: row.date,
        d: shortDateLabel(row.date),
        diesel: 0,
        cost: 0,
        hours: 0,
      };
      current.diesel += row.liters;
      current.cost += row.cost;
      current.hours += row.hours;
      rows.set(row.date, current);
    });
    return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [limpezaRows]);

  const limpezaByObraData = useMemo(() => {
    const rows = new Map<string, { obra: string; diesel: number; cost: number; hours: number }>();
    limpezaRows.forEach((row) => {
      const current = rows.get(row.obraKey) ?? { obra: row.obra, diesel: 0, cost: 0, hours: 0 };
      current.diesel += row.liters;
      current.cost += row.cost;
      current.hours += row.hours;
      rows.set(row.obraKey, current);
    });
    return [...rows.values()].sort((a, b) => b.diesel - a.diesel);
  }, [limpezaRows]);

  const limpezaByEquipmentData = useMemo(() => {
    const rows = new Map<
      string,
      { equipment: string; diesel: number; cost: number; hours: number }
    >();
    limpezaRows.forEach((row) => {
      const key = row.fleet || row.equipment;
      const current = rows.get(key) ?? {
        equipment: row.equipment || key,
        diesel: 0,
        cost: 0,
        hours: 0,
      };
      current.diesel += row.liters;
      current.cost += row.cost;
      current.hours += row.hours;
      rows.set(key, current);
    });
    return [...rows.values()].sort((a, b) => b.diesel - a.diesel);
  }, [limpezaRows]);

  const prodConsumoData = useMemo(
    () =>
      dailyData.map((d) => ({
        date: d.date,
        d: d.label,
        compactada: d.compactedM3,
        solta: d.looseM3,
        diesel: d.diesel,
        hours: d.hours ?? 0,
        m3PerLiter: d.fuelPerM3,
        litersPerM3: d.litersPerM3 ?? 0,
        status: d.status ?? "OK",
        statusReason: d.statusReason ?? "",
      })),
    [dailyData],
  );

  const dieselLineData = useMemo(
    () =>
      dailyData.map((d) => ({
        date: d.date,
        d: d.label,
        diesel: d.diesel,
        status: d.status ?? "OK",
        statusReason: d.statusReason ?? "",
      })),
    [dailyData],
  );

  const fuelPerM3LineData = useMemo(
    () =>
      dailyData.map((d) => ({
        d: d.label,
        lpm3: Number((d.fuelPerM3 || 0).toFixed(2)),
        diesel: d.diesel,
        m3: d.compactedM3,
        hours: d.hours ?? 0,
        status: d.status ?? "OK",
        statusReason: d.statusReason ?? "",
      })),
    [dailyData],
  );

  const producaoEmpoladaDieselData = useMemo(
    () =>
      dailyData.map((d) => ({
        d: d.label,
        m3Empolado: d.looseM3,
        diesel: d.diesel,
        status: d.status ?? "OK",
        statusReason: d.statusReason ?? "",
      })),
    [dailyData],
  );

  const obraEfficiency = useMemo(() => {
    if (!needsLegacyCharts) return [];
    const tripsByKey = new Map<string, { obra: string; compactedM3: number; trips: number }>();
    itemScopeProductiveTrips.forEach((trip) => {
      const scopedTrip = trip as DbTrip & ObraScopeAudit;
      const key = resolvedWorksiteKey(scopedTrip);
      const cur = tripsByKey.get(key) ?? {
        obra: resolvedWorksiteLabel(scopedTrip),
        compactedM3: 0,
        trips: 0,
      };
      cur.compactedM3 += calculateCompactedVolume(trip.cubicMLoose || 0, trip.swellFactorApplied);
      cur.trips += 1;
      tripsByKey.set(key, cur);
    });

    const litersByKey = new Map<string, number>();
    productionFueling.forEach((fuel) => {
      const key = resolvedWorksiteKey(fuel as DbFueling & ObraScopeAudit);
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
  }, [itemScopeProductiveTrips, needsLegacyCharts, productionFueling]);

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
        id: a.aggregate,
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
        id: e.equipment,
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
        id: e.equipment,
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
          equipamento: e.equipment,
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
              name: a.aggregate,
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
    if (!showTechnicalAudit) return [];
    const tally = new Map<string, number>();
    const groups = compareByObra
      ? obraComparison.flatMap((obra) =>
          obra.equipmentMetrics.map((equipment) => ({ ...equipment, obra: obra.obra })),
        )
      : equipmentMetrics.map((equipment) => ({ ...equipment, obra: "" }));

    groups.forEach((e) => {
      const status = e.status || "OK";
      const key = status;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    });
    return Array.from(tally.entries()).map(([name, value]) => ({ name, value }));
  }, [compareByObra, equipmentMetrics, obraComparison, showTechnicalAudit]);

  const auditDonutTotal = useMemo(
    () => auditDonutData.reduce((s, x) => s + x.value, 0),
    [auditDonutData],
  );

  async function handleCreated(analysisId: string) {
    if (isDebugRuntimeEnabled()) {
      console.log("[CREATE_ANALYSIS_DEBUG]", {
        variableName: "handleCreated.analysisId",
        value: analysisId,
      });
    }
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
      if (isDebugRuntimeEnabled()) {
        console.log("[CREATE_ANALYSIS_DEBUG]", {
          variableName: "handleCreated.nextAnalyses",
          value: {
            count: nextAnalyses.length,
            ids: nextAnalyses.map((analysis) => analysis.id),
            targetAnalysisId: analysisId,
          },
        });
      }
      if (!nextAnalyses.some((analysis) => analysis.id === analysisId)) {
        throw new Error("A analise foi criada, mas ainda nao ficou disponivel para leitura.");
      }
      await recalculateFuelAllocationsSupportFn({ data: { analysisIds: [analysisId] } }).catch(
        (err) => {
          console.error("[fuel-allocation] recalc on createAnalysis failed", err);
        },
      );
      const nextIds = [analysisId];
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
        queryFn: ({ signal }) => fetchDashboardRows(nextIds, signal, nextAnalyses),
        staleTime: 5_000,
      });
    } catch (error) {
      console.error("[CREATE_ANALYSIS_ERROR]", {
        object: "handleCreated",
        value: { analysisId },
        error,
      });
      throw error;
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

  const activeTabLabel =
    visibleTabs.find((tab) => tab.id === activeTab)?.label ?? "Produção × Consumo";
  const dashboardExportFilters = useMemo<Array<[string, string]>>(() => {
    const range =
      filters.dateFrom || filters.dateTo
        ? `${filters.dateFrom || "Início"} até ${filters.dateTo || "Fim"}`
        : "Todo o período";
    const rows: Array<[string, string]> = [
      ["Análises", analysisSelection.label],
      ["Período", range],
      ["Obra", filters.obra === "all" ? "Todas as obras" : filters.obra],
      ["Material", filters.material === "all" ? "Todos materiais" : filters.material],
      [
        "Equipamentos",
        filters.equipment.length > 0 ? filters.equipment.join(" | ") : "Todos equipamentos",
      ],
      ["Agregado", filters.aggregate === "all" ? "Todos agregados" : filters.aggregate],
    ];

    if (activeTab === "dieselM3") {
      const selectedEquipment =
        dieselM3EquipmentOptions.find(([key]) => key === dieselM3Filters.equipment)?.[1] ??
        dieselM3Filters.equipment;
      rows.push(
        [
          "Período da aba",
          dieselM3Filters.dateFrom || dieselM3Filters.dateTo
            ? `${dieselM3Filters.dateFrom || "Início"} até ${dieselM3Filters.dateTo || "Fim"}`
            : "Todo o período",
        ],
        [
          "Obra da aba",
          dieselM3SelectedObraKey === "all"
            ? "Todas"
            : dieselM3ObraOptions.find(([key]) => key === dieselM3SelectedObraKey)?.[1] ||
              dieselM3SelectedObraKey,
        ],
        [
          "Item",
          dieselM3Filters.item === "all"
            ? "Todos"
            : operationalItemLabel(dieselM3Filters.item as OperationalItem),
        ],
        ["Equipamento da aba", selectedEquipment === "all" ? "Todos" : selectedEquipment],
        ["Origem diesel", dieselM3Filters.origin === "all" ? "Ambos" : dieselM3Filters.origin],
      );
    }
    return rows;
  }, [
    activeTab,
    analysisSelection.label,
    dieselM3EquipmentOptions,
    dieselM3Filters,
    dieselM3ObraOptions,
    dieselM3SelectedObraKey,
    filters,
  ]);

  const activeTabExportSheets = useMemo<DashboardExportSheet[]>(() => {
    if (activeTab === "dieselM3") {
      return [
        {
          name: "KPIs Diesel x m3",
          rows: [
            { Indicador: "m³ compactado total", Valor: dieselM3Kpis.compactedM3Base },
            { Indicador: "m³ solto total", Valor: dieselM3Kpis.looseM3 },
            { Indicador: "m³ relacionado", Valor: dieselM3Kpis.relatedM3 },
            { Indicador: "Diesel total", Valor: dieselM3Kpis.diesel },
            { Indicador: "m³/L geral", Valor: dieselM3Kpis.m3PerLiter },
            { Indicador: "L/m³ geral", Valor: dieselM3Kpis.litersPerM3 },
            { Indicador: "Dias analisados", Valor: dieselM3Kpis.days },
            { Indicador: "Obras", Valor: dieselM3Kpis.worksites },
          ],
        },
        { name: "Produção x diesel", rows: dashboardExportRows(dieselM3DailyRows) },
        {
          name: "Séries por obra",
          rows: dashboardExportRows(dieselM3MultiObraInfo.pivotData),
        },
        { name: "Comparativo por obra", rows: dashboardExportRows(obraComparisonRows) },
        { name: "Dados por item", rows: dashboardExportRows(dieselM3ItemRows) },
        {
          name: "Ranking equipamentos",
          rows: dashboardExportRows(dieselM3EquipmentRankingData),
        },
      ];
    }

    return [];
  }, [
    activeTab,
    dieselM3DailyRows,
    dieselM3EquipmentRankingData,
    dieselM3ItemRows,
    dieselM3Kpis,
    dieselM3MultiObraInfo.pivotData,
    obraComparisonRows,
  ]);

  const handleExportActiveTab = useCallback(
    async (format: "pdf" | "excel") => {
      const element = activeTabExportRef.current;
      if (!element) {
        toast.error("A aba ainda não terminou de carregar.");
        return;
      }

      setExportingTab(format);
      try {
        const options = {
          element,
          tabLabel: activeTabLabel,
          filters: dashboardExportFilters,
          dataSheets: activeTabExportSheets,
        };
        if (format === "pdf") {
          await exportDashboardTabAsPdf(options);
          toast.success("PDF exportado com os gráficos da aba.");
        } else {
          await exportDashboardTabAsExcel(options);
          toast.success("Excel exportado com a visualização da aba.");
        }
      } catch (error) {
        toast.error(`Não foi possível exportar ${format === "pdf" ? "o PDF" : "o Excel"}.`, {
          description: error instanceof Error ? error.message : "Tente novamente.",
        });
      } finally {
        setExportingTab(null);
      }
    },
    [activeTabExportSheets, activeTabLabel, dashboardExportFilters],
  );

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
            obras={availableObras}
            materials={distinctMaterials}
            equipment={distinctEquipment}
            aggregates={distinctAggregates}
            loading={loading}
          />

          <DashboardTabs
            tabs={visibleTabs}
            activeTab={activeTab}
            onChange={handleActiveTabChange}
          />
          {dieselSourceNotice && (
            <div className="mb-3 rounded border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-on-surface-variant">
              {dieselSourceNotice}
            </div>
          )}
          <div className="mb-4 flex flex-wrap justify-end gap-2" data-export-exclude>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={Boolean(exportingTab) || globalBusy}
              onClick={() => void handleExportActiveTab("pdf")}
            >
              <Icon name="picture_as_pdf" className="text-base mr-1" />
              {exportingTab === "pdf" ? "Preparando PDF…" : "Exportar PDF"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={Boolean(exportingTab) || globalBusy}
              onClick={() => void handleExportActiveTab("excel")}
            >
              <Icon name="table_view" className="text-base mr-1" />
              {exportingTab === "excel" ? "Preparando Excel…" : "Exportar Excel"}
            </Button>
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

          <div ref={activeTabExportRef} data-export-tab={activeTab}>
            {/* KPI strip */}
            <div className="mb-5 grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
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

            <Suspense fallback={<DashboardLoadingPanel label="Carregando graficos..." />}>
            {activeTab === "overview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                  <KpiCardCompact
                    label="m3 compactado"
                    value={formatM3(kpis.compactedM3)}
                    icon="compress"
                  />
                  <KpiCardCompact label="m3 solto" value={formatM3(kpis.looseM3)} icon="compress" />
                  <KpiCardCompact
                    label="Diesel total"
                    value={formatLiters(kpis.diesel)}
                    icon="local_gas_station"
                  />
                  <KpiCardCompact
                    label="m3/L"
                    value={formatNumber(kpis.fuelPerM3, 3)}
                    icon="speed"
                  />
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
                    description="Barras empilhadas por limpeza, escavacao, transporte, tratamento e compactacao"
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
                    description="Producao por litro de diesel"
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
                        onClick={() => handleActiveTabChange(summary.item)}
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
                        <div className="mt-4 grid grid-cols-1 min-[390px]:grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-on-surface-variant">Diesel</p>
                            <p className="tnum font-black">{formatLiters(summary.diesel)}</p>
                          </div>
                          <div>
                            <p className="text-on-surface-variant">
                              {summary.item === "limpeza" ? "L/h" : "m3/L"}
                            </p>
                            <p className="tnum font-black">
                              {formatNumber(
                                summary.item === "limpeza"
                                  ? summary.fuelPerHour
                                  : summary.fuelPerM3,
                                summary.item === "limpeza" ? 2 : 3,
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-on-surface-variant">Horas</p>
                            <p className="tnum font-black">{formatHours(summary.hours)}</p>
                          </div>
                          <div>
                            <p className="text-on-surface-variant">
                              {summary.item === "limpeza" ? "Equipamentos" : "m3"}
                            </p>
                            <p className="tnum font-black">
                              {summary.item === "limpeza"
                                ? String(summary.equipment.filter(isCountableEquipment).length)
                                : formatM3(summary.compactedM3)}
                            </p>
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

            {activeTab === "dieselM3" && (
              <div className="space-y-4">
                <div className="rounded border border-border-low bg-surface-container p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-black uppercase tracking-widest">Diesel × m³</h2>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        Produção diária real comparada ao diesel alocado por PDE ou ao CMB bruto de
                        CB/agregado.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2" data-export-exclude>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setShowPeriodComparison(true)}
                      >
                        <Icon name="compare_arrows" className="text-base" />
                        Comparar períodos
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setDieselM3Filters(DIESEL_M3_DEFAULT_FILTERS)}
                      >
                        Limpar filtros
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Data inicial
                      <input
                        type="date"
                        value={dieselM3Filters.dateFrom}
                        onChange={(event) => updateDieselM3Filter("dateFrom", event.target.value)}
                        className="mt-1 block w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                      />
                    </label>
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Data final
                      <input
                        type="date"
                        value={dieselM3Filters.dateTo}
                        onChange={(event) => updateDieselM3Filter("dateTo", event.target.value)}
                        className="mt-1 block w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                      />
                    </label>
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Obra
                      <select
                        value={dieselM3SelectedObraKey}
                        onChange={(event) => updateDieselM3Filter("obra", event.target.value)}
                        className="mt-1 block w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                      >
                        <option value="all">Todas</option>
                        {dieselM3ObraOptions.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Item
                      <select
                        value={dieselM3Filters.item}
                        onChange={(event) => updateDieselM3Filter("item", event.target.value)}
                        className="mt-1 block w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                      >
                        <option value="all">Todos</option>
                        {OPERATIONAL_ITEM_ORDER.map((item) => (
                          <option key={item} value={item}>
                            {operationalItemLabel(item)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Equipamento
                      <select
                        value={dieselM3Filters.equipment}
                        onChange={(event) => updateDieselM3Filter("equipment", event.target.value)}
                        className="mt-1 block w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                      >
                        <option value="all">Todos</option>
                        {dieselM3EquipmentOptions.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Agregado
                      <select
                        value={dieselM3Filters.aggregate}
                        onChange={(event) => updateDieselM3Filter("aggregate", event.target.value)}
                        className="mt-1 block w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                      >
                        <option value="all">Todos</option>
                        {dieselM3AggregateOptions.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Origem diesel
                      <select
                        value={dieselM3Filters.origin}
                        onChange={(event) => updateDieselM3Filter("origin", event.target.value)}
                        className="mt-1 block w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                      >
                        <option value="all">Ambos</option>
                        <option value="fuelAllocation">fuel_allocations</option>
                        <option value="rawFueling">CMB bruto</option>
                        <option value="fuelAttribution">fuel_attribution</option>
                      </select>
                    </label>
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Visão
                      <select
                        value={dieselM3Filters.view}
                        onChange={(event) => updateDieselM3Filter("view", event.target.value)}
                        className="mt-1 block w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                      >
                        <option value="obraDay">Geral por obra/dia</option>
                        <option value="item">Por item</option>
                        <option value="equipment">Por equipamento</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                  <KpiCardCompact
                    label="m³ compactado total"
                    value={formatM3(dieselM3Kpis.compactedM3Base)}
                    icon="compress"
                  />
                  <KpiCardCompact
                    label="m³ solto total"
                    value={formatM3(dieselM3Kpis.looseM3)}
                    icon="compress"
                  />
                  <KpiCardCompact
                    label="Diesel total"
                    value={formatLiters(dieselM3Kpis.diesel)}
                    icon="local_gas_station"
                  />
                  <KpiCardCompact
                    label="m³/L geral"
                    value={formatNumber(dieselM3Kpis.m3PerLiter, 3)}
                    icon="speed"
                  />
                  <KpiCardCompact
                    label="L/m³ geral"
                    value={formatNumber(dieselM3Kpis.litersPerM3, 3)}
                    icon="speed"
                  />
                  <KpiCardCompact
                    label="Dias analisados"
                    value={String(dieselM3Kpis.days)}
                    icon="calendar_month"
                  />
                  <KpiCardCompact
                    label="Melhor dia m³/L"
                    value={
                      dieselM3Kpis.bestDay ? formatNumber(dieselM3Kpis.bestDay.m3PerLiter, 3) : "—"
                    }
                    sub={dieselM3Kpis.bestDay?.d}
                    icon="trending_up"
                    tone="success"
                  />
                  <KpiCardCompact
                    label="Pior dia m³/L"
                    value={
                      dieselM3Kpis.worstDay
                        ? formatNumber(dieselM3Kpis.worstDay.m3PerLiter, 3)
                        : "—"
                    }
                    sub={dieselM3Kpis.worstDay?.d}
                    icon="trending_down"
                    tone="warning"
                  />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <ChartCard
                    title="Produção x Diesel por dia"
                    description={
                      dieselM3MultiObraInfo.isMultiObra
                        ? `Barras + linha por obra · ${dieselM3MultiObraInfo.series.length} obras comparadas`
                        : "Barras: producao · linha: diesel"
                    }
                    height={340}
                    hasData={
                      dieselM3MultiObraInfo.isMultiObra
                        ? dieselM3MultiObraHasProductionDiesel
                        : dieselM3DailyRows.length > 0
                    }
                  >
                    {dieselM3MultiObraInfo.isMultiObra ? (
                      <ChartM3DieselMultiObra
                        data={dieselM3MultiObraInfo.pivotData}
                        series={dieselM3MultiObraInfo.series}
                        mName="m³"
                      />
                    ) : (
                      <ChartM3Diesel data={dieselM3DailyRows} mName="m³" />
                    )}
                  </ChartCard>
                  <ChartCard
                    title="Eficiência diária m³/L"
                    description={
                      dieselM3MultiObraInfo.isMultiObra
                        ? "Uma linha por obra · maior = mais eficiente"
                        : "Producao dividida pelo diesel"
                    }
                    height={340}
                    hasData={
                      dieselM3MultiObraInfo.isMultiObra
                        ? dieselM3MultiObraInfo.pivotData.some((row) =>
                            dieselM3MultiObraInfo.series.some(
                              (obra) =>
                                Number(
                                  row[multiObraMetricDisplayKey(obra.key, "m3PerLiter")] ?? 0,
                                ) > 0,
                            ),
                          )
                        : dieselM3DailyRows.some((row) => row.m3PerLiter > 0)
                    }
                  >
                    {dieselM3MultiObraInfo.isMultiObra ? (
                      <ChartEfficiencyMultiObra
                        data={dieselM3MultiObraInfo.pivotData}
                        series={dieselM3MultiObraInfo.series}
                      />
                    ) : (
                      <ChartLine
                        data={dieselM3DailyRows}
                        dataKey="m3PerLiter"
                        name="m³/L"
                        unit="m³/L"
                        color="oklch(0.72 0.13 150)"
                        fillArea
                      />
                    )}
                  </ChartCard>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <ChartCard
                    title="Comparativo por obra"
                    description="Producao por litro de diesel"
                    height={320}
                    hasData={obraComparisonRows.some((row) => row.m3PerLiter > 0)}
                  >
                    <ChartCompareBars
                      data={obraComparisonRows}
                      dataKey="m3PerLiter"
                      nameKey="obra"
                      unit="m³/L"
                    />
                  </ChartCard>
                  <ChartCard
                    title="Diesel por obra"
                    description="Litros por obra no escopo da aba"
                    height={320}
                    hasData={obraComparisonRows.some((row) => row.diesel > 0)}
                  >
                    <ChartHBars
                      data={obraComparisonRows}
                      dataKey="diesel"
                      nameKey="obra"
                      unit="L"
                      topN={10}
                    />
                  </ChartCard>
                  <ChartCard
                    title="Ranking de consumo por item"
                    description="Diesel por item operacional"
                    height={320}
                    hasData={dieselM3ItemRows.some((row) => row.diesel > 0)}
                  >
                    <ChartHBars
                      data={dieselM3ItemRows}
                      dataKey="diesel"
                      nameKey="id"
                      unit="L"
                      topN={dieselM3ItemRows.length || 5}
                    />
                  </ChartCard>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <ChartCard
                    title="m³/L por item"
                    description="Producao por litro de diesel"
                    height={320}
                    hasData={dieselM3ItemRows.some(
                      (row) => row.item !== "limpeza" && row.m3PorLitroRelacionado > 0,
                    )}
                  >
                    <ChartCompareBars
                      data={dieselM3ItemRows
                        .filter((row) => row.item !== "limpeza")
                        .sort((a, b) => b.m3PorLitroRelacionado - a.m3PorLitroRelacionado)}
                      dataKey="m3PorLitroRelacionado"
                      nameKey="id"
                      unit="m³/L"
                    />
                  </ChartCard>
                  <ChartCard
                    title="L/m³ por item"
                    description="Diesel por m³ do item"
                    height={320}
                    hasData={dieselM3ItemRows.some((row) => row.litrosPorM3Relacionado > 0)}
                  >
                    <ChartHBars
                      data={dieselM3ItemRows.filter((row) => row.litrosPorM3Relacionado > 0)}
                      dataKey="litrosPorM3Relacionado"
                      nameKey="id"
                      unit="L/m³"
                      topN={dieselM3ItemRows.length || 5}
                      color="oklch(0.72 0.13 150)"
                    />
                  </ChartCard>
                  <div className="rounded border border-border-low bg-surface-container p-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Ranking por máquina/equipamento
                      <select
                        value={dieselM3Filters.ranking}
                        onChange={(event) => updateDieselM3Filter("ranking", event.target.value)}
                        className="mt-1 block w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                      >
                        <option value="diesel">Top 10 por diesel</option>
                        <option value="lph">Top 10 por L/h</option>
                      </select>
                    </label>
                    <div className="mt-4 h-[260px]">
                      <ChartHBars
                        data={dieselM3EquipmentRankingData}
                        dataKey={dieselM3RankingKey}
                        nameKey="id"
                        unit={dieselM3RankingUnit}
                        topN={10}
                      />
                    </div>
                  </div>
                </div>

                {obraComparisonRows.length > 1 && (
                  <div className="rounded border border-border-low bg-surface-container p-4">
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-widest">
                          Comparar obras
                        </h3>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          Diferenca calculada sobre m3 por litro.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                          Obra A
                          <select
                            value={dieselM3Filters.compareObraA || dieselM3CompareA?.obraKey}
                            onChange={(event) =>
                              updateDieselM3Filter("compareObraA", event.target.value)
                            }
                            className="mt-1 block min-w-44 rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                          >
                            {obraComparisonRows.map((row) => (
                              <option key={row.obraKey} value={row.obraKey}>
                                {row.obra}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                          Obra B
                          <select
                            value={dieselM3Filters.compareObraB || dieselM3CompareB?.obraKey}
                            onChange={(event) =>
                              updateDieselM3Filter("compareObraB", event.target.value)
                            }
                            className="mt-1 block min-w-44 rounded border border-border-low bg-surface-highest px-3 py-2 text-xs font-normal normal-case tracking-normal text-on-surface"
                          >
                            {obraComparisonRows.map((row) => (
                              <option key={row.obraKey} value={row.obraKey}>
                                {row.obra}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                    {dieselM3CompareA && dieselM3CompareB && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        {[dieselM3CompareA, dieselM3CompareB].map((row) => (
                          <div
                            key={row.obra}
                            className="rounded border border-border-low bg-surface-low p-3"
                          >
                            <h4 className="mb-2 font-black uppercase tracking-widest">
                              {row.obra}
                            </h4>
                            <p className="flex justify-between">
                              <span>m³ compactado</span>
                              <span className="tnum font-bold">{formatM3(row.compactedM3)}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Diesel</span>
                              <span className="tnum font-bold">{formatLiters(row.diesel)}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>m³/L</span>
                              <span className="tnum font-bold">
                                {formatNumber(row.m3PerLiter, 3)}
                              </span>
                            </p>
                            <p className="flex justify-between">
                              <span>L/m³</span>
                              <span className="tnum font-bold">
                                {formatNumber(row.litersPerM3, 3)}
                              </span>
                            </p>
                          </div>
                        ))}
                        <div className="rounded border border-border-low bg-surface-low p-3">
                          <h4 className="mb-2 font-black uppercase tracking-widest">Resultado</h4>
                          <p className="text-sm font-black">
                            {dieselM3CompareA.m3PerLiter >= dieselM3CompareB.m3PerLiter
                              ? `${dieselM3CompareA.obra} foi mais eficiente`
                              : `${dieselM3CompareB.obra} foi mais eficiente`}
                          </p>
                          <p className="mt-2 text-on-surface-variant">
                            Diferença A vs B:{" "}
                            <span className="tnum font-bold">
                              {formatNumber(dieselM3CompareDelta, 1)}%
                            </span>
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === "limpezaSemProducao" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-5 gap-3">
                  <KpiCardCompact
                    label="Diesel limpeza"
                    value={formatLiters(limpezaKpis.diesel)}
                    icon="local_gas_station"
                  />
                  <KpiCardCompact
                    label="Horas sem produção"
                    value={formatHours(limpezaKpis.hours)}
                    icon="schedule"
                  />
                  <KpiCardCompact
                    label="Dias"
                    value={String(limpezaKpis.days)}
                    icon="calendar_month"
                  />
                  <KpiCardCompact
                    label="Obras"
                    value={String(limpezaKpis.worksites)}
                    icon="domain"
                  />
                  <KpiCardCompact
                    label="Equipamentos"
                    value={String(limpezaKpis.equipment)}
                    icon="precision_manufacturing"
                  />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <ChartCard
                    title="Diesel de limpeza por dia"
                    description="Litros alocados em obra/data sem produção RCO"
                    height={320}
                    hasData={limpezaDailyData.some((row) => row.diesel > 0)}
                  >
                    <ChartLine
                      data={limpezaDailyData}
                      dataKey="diesel"
                      name="Limpeza"
                      unit="L"
                      color="oklch(0.72 0.13 150)"
                      fillArea
                    />
                  </ChartCard>
                  <ChartCard
                    title="Limpeza por obra"
                    description="Diesel sem produção associada"
                    height={320}
                    hasData={limpezaByObraData.some((row) => row.diesel > 0)}
                  >
                    <ChartHBars
                      data={limpezaByObraData}
                      dataKey="diesel"
                      nameKey="obra"
                      unit="L"
                      topN={10}
                    />
                  </ChartCard>
                  <ChartCard
                    title="Limpeza por equipamento"
                    description="Ranking por litros"
                    height={320}
                    hasData={limpezaByEquipmentData.some((row) => row.diesel > 0)}
                  >
                    <ChartHBars
                      data={limpezaByEquipmentData}
                      dataKey="diesel"
                      nameKey="equipment"
                      unit="L"
                      topN={10}
                    />
                  </ChartCard>
                </div>

                <div className="rounded border border-border-low bg-surface-container p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-widest">
                        Auditoria LIMPEZA
                      </h3>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        Diesel alocado por PDE sem produção RCO na mesma obra e data.
                      </p>
                    </div>
                    <span className="text-xs font-bold text-on-surface-variant">
                      {limpezaRows.length} registros
                    </span>
                  </div>
                  {limpezaRows.length === 0 ? (
                    <EmptyChartState
                      title="Sem diesel de limpeza"
                      message="Nenhum consumo sem produção associada nos filtros atuais."
                    />
                  ) : (
                    <div className="max-h-[520px] overflow-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border-low text-on-surface-variant">
                            <th className="py-2 pr-4 text-left font-black uppercase">Data</th>
                            <th className="py-2 pr-4 text-left font-black uppercase">Obra</th>
                            <th className="py-2 pr-4 text-left font-black uppercase">
                              Equipamento
                            </th>
                            <th className="py-2 pr-4 text-left font-black uppercase">Origem</th>
                            <th className="py-2 pr-4 text-right font-black uppercase">Litros</th>
                            <th className="py-2 pr-4 text-right font-black uppercase">Horas</th>
                            <th className="py-2 pr-4 text-left font-black uppercase">Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {limpezaRows.slice(0, 300).map((row) => (
                            <tr key={row.id} className="border-b border-border-low/40">
                              <td className="py-2 pr-4 tnum">{formatDate(row.date)}</td>
                              <td className="py-2 pr-4">{row.obra}</td>
                              <td className="py-2 pr-4">{row.equipment}</td>
                              <td className="py-2 pr-4">{row.source}</td>
                              <td className="py-2 pr-4 text-right tnum font-bold">
                                {formatNumber(row.liters, 2)} L
                              </td>
                              <td className="py-2 pr-4 text-right tnum">
                                {formatNumber(row.hours, 2)} h
                              </td>
                              <td className="py-2 pr-4">{row.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "limpeza" && (
              <OperationalItemPanel
                summary={limpezaSummary}
                stack={itemEquipmentStacks.get("limpeza") ?? EMPTY_ITEM_STACK}
                validObras={chartVisibleObras}
              />
            )}

            {activeTab === "escavacao" && (
              <OperationalItemPanel
                summary={escavacaoSummary}
                stack={itemEquipmentStacks.get("escavacao") ?? EMPTY_ITEM_STACK}
                validObras={chartVisibleObras}
              />
            )}

            {activeTab === "transporte" && (
              <OperationalItemPanel
                summary={transporteSummary}
                stack={itemEquipmentStacks.get("transporte") ?? EMPTY_ITEM_STACK}
                validObras={chartVisibleObras}
              />
            )}

            {activeTab === "tratamento" && (
              <OperationalItemPanel
                summary={tratamentoSummary}
                stack={itemEquipmentStacks.get("tratamento") ?? EMPTY_ITEM_STACK}
                validObras={chartVisibleObras}
              />
            )}

            {activeTab === "compactacao" && (
              <OperationalItemPanel
                summary={compactacaoSummary}
                stack={itemEquipmentStacks.get("compactacao") ?? EMPTY_ITEM_STACK}
                validObras={chartVisibleObras}
              />
            )}

            {LEGACY_OVERVIEW_ENABLED && activeTab === "overview" && (
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
                    compareByObra ? dailyObraHasVolumeDiesel : producaoEmpoladaDieselData.length > 0
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
                    hasData={compareByObra ? dailyObraHasCompactedM3 : prodConsumoData.length > 0}
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
                  hasData={compareByObra ? dailyObraHasDiesel : dieselLineData.length > 0}
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
                              <span className="tnum font-medium">
                                {formatNumber(o.lpm3, 3)} m³/L
                              </span>
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
                    <div className="grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
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
                                    const item = summary.hourly.find(
                                      (row) => row.hour === hour.hour,
                                    );
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
                                  Produção: {formatHourlyM3(summary.m3)} · Viagens: {summary.trips}{" "}
                                  · {summary.firstTrip} a {summary.lastTrip}
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
                                <th
                                  key={label}
                                  className="py-2 pr-4 text-left font-black uppercase"
                                >
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
                  <h2 className="text-sm font-black uppercase tracking-widest">
                    Auditoria técnica
                  </h2>
                </div>
                {absentWorksiteAuditRows.length > 0 && (
                  <div className="mb-5 rounded border border-status-warning/30 bg-surface-container overflow-hidden">
                    <div className="p-3 border-b border-border-low">
                      <h3 className="text-xs font-black uppercase tracking-widest">
                        Linhas com obra ausente ({absentWorksiteAuditRows.length})
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border-low bg-surface-low">
                            <th className="px-3 py-2 text-left font-black uppercase">Fonte</th>
                            <th className="px-3 py-2 text-left font-black uppercase">Data</th>
                            <th className="px-3 py-2 text-left font-black uppercase">
                              Equipamento
                            </th>
                            <th className="px-3 py-2 text-left font-black uppercase">
                              Obra resolvida
                            </th>
                            <th className="px-3 py-2 text-left font-black uppercase">obraStatus</th>
                            <th className="px-3 py-2 text-right font-black uppercase">Diesel</th>
                            <th className="px-3 py-2 text-right font-black uppercase">Horas</th>
                            <th className="px-3 py-2 text-left font-black uppercase">Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {absentWorksiteAuditRows.slice(0, 120).map((row, index) => (
                            <tr
                              key={`${row.source}:${row.date}:${row.equipment}:${index}`}
                              className="border-b border-border-low/40"
                            >
                              <td className="px-3 py-2">{row.source}</td>
                              <td className="px-3 py-2 tnum">{formatDate(row.date)}</td>
                              <td className="px-3 py-2 font-semibold">{row.equipment}</td>
                              <td className="px-3 py-2">{row.resolvedObraLabel}</td>
                              <td className="px-3 py-2">{row.obraStatus}</td>
                              <td className="px-3 py-2 text-right tnum">
                                {formatNumber(row.liters, 2)} L
                              </td>
                              <td className="px-3 py-2 text-right tnum">
                                {formatNumber(row.hours, 2)}
                              </td>
                              <td className="px-3 py-2 text-status-warning">{row.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {nonProductiveFuelAuditRows.length > 0 && (
                  <div className="mb-5 rounded border border-status-warning/30 bg-surface-container overflow-hidden">
                    <div className="p-3 border-b border-border-low">
                      <h3 className="text-xs font-black uppercase tracking-widest">
                        Diesel excluído do cálculo produtivo ({nonProductiveFuelAuditRows.length})
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border-low bg-surface-low">
                            <th className="px-3 py-2 text-left font-black uppercase">Obra</th>
                            <th className="px-3 py-2 text-left font-black uppercase">Data</th>
                            <th className="px-3 py-2 text-left font-black uppercase">
                              Equipamento
                            </th>
                            <th className="px-3 py-2 text-left font-black uppercase">Item</th>
                            <th className="px-3 py-2 text-right font-black uppercase">Litros</th>
                            <th className="px-3 py-2 text-left font-black uppercase">Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nonProductiveFuelAuditRows.slice(0, 120).map((row, index) => (
                            <tr
                              key={`${row.obra}:${row.date}:${row.equipment}:${index}`}
                              className="border-b border-border-low/40"
                            >
                              <td className="px-3 py-2">{row.obra}</td>
                              <td className="px-3 py-2 tnum">{formatDate(row.date)}</td>
                              <td className="px-3 py-2 font-semibold">{row.equipment}</td>
                              <td className="px-3 py-2">{row.item}</td>
                              <td className="px-3 py-2 text-right tnum">
                                {formatNumber(row.liters, 2)} L
                              </td>
                              <td className="px-3 py-2 text-status-warning">{row.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
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
                          <th className="px-3 py-2 text-right font-black uppercase">
                            m3 relacionado
                          </th>
                          <th className="px-3 py-2 text-right font-black uppercase">m3 rateado</th>
                          <th className="px-3 py-2 text-right font-black uppercase">m3/L</th>
                          <th className="px-3 py-2 text-left font-black uppercase">
                            Origem diesel
                          </th>
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
                            <td className="px-3 py-2">
                              {row.kind === "aggregate" ? "Agregado" : "Frota"}
                            </td>
                            <td className="px-3 py-2 text-right tnum">
                              {formatNumber(row.hours, 2)}
                            </td>
                            <td className="px-3 py-2 text-right tnum">
                              {formatNumber(row.diesel, 2)} L
                            </td>
                            <td className="px-3 py-2 text-right tnum">{formatNumber(row.m3, 2)}</td>
                            <td className="px-3 py-2 text-right tnum">
                              {formatNumber(row.m3Relacionado, 2)}
                            </td>
                            <td className="px-3 py-2 text-right tnum">
                              {formatNumber(row.m3PerLiter, 3)}
                            </td>
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
                          <th className="px-3 py-2 text-right font-black uppercase">
                            Dif. alloc/dash
                          </th>
                          <th className="px-3 py-2 text-left font-black uppercase">Auditoria</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dieselFlowAuditRows.slice(0, 80).map((row) => (
                          <tr key={row.equipmentKey} className="border-b border-border-low/40">
                            <td className="px-3 py-2 font-semibold">{row.equipmentLabel}</td>
                            <td className="px-3 py-2 text-right tnum">
                              {formatNumber(row.fuelingLiters, 2)} L
                            </td>
                            <td className="px-3 py-2 text-right tnum">
                              {formatNumber(row.allocatedLiters, 2)} L
                            </td>
                            <td className="px-3 py-2 text-right tnum">
                              {formatNumber(row.attributedLiters, 2)} L
                            </td>
                            <td className="px-3 py-2 text-right tnum">
                              {formatNumber(row.itemSummaryLiters, 2)} L
                            </td>
                            <td className="px-3 py-2 text-right tnum">
                              {formatNumber(row.stackedChartLiters, 2)} L
                            </td>
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

                {compactacaoM3LAuditRows.length > 0 && (
                  <div className="mt-5 rounded border border-status-warning/40 bg-surface-container overflow-hidden">
                    <div className="p-3 border-b border-border-low">
                      <h3 className="text-xs font-black uppercase tracking-widest">
                        Alertas m3/L Compactacao ({compactacaoM3LAuditRows.length})
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border-low bg-surface-low">
                            {[
                              "Data",
                              "m3 compactado",
                              "m3 usado",
                              "Horas",
                              "Diesel",
                              "m3/L",
                              "Formula",
                              "Status",
                            ].map((heading) => (
                              <th
                                key={heading}
                                className="px-3 py-2 text-left font-black uppercase"
                              >
                                {heading}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {compactacaoM3LAuditRows.map((row) => (
                            <tr key={row.date} className="border-b border-border-low/40">
                              <td className="px-3 py-2 tnum">{formatDate(row.date)}</td>
                              <td className="px-3 py-2 text-right tnum">
                                {formatNumber(row.compactedM3Day, 2)}
                              </td>
                              <td className="px-3 py-2 text-right tnum">
                                {formatNumber(row.compactacaoRelatedM3Day, 2)}
                              </td>
                              <td className="px-3 py-2 text-right tnum">
                                {formatNumber(row.compactacaoHoursDay, 2)}
                              </td>
                              <td className="px-3 py-2 text-right tnum">
                                {formatNumber(row.dieselCompactacaoDay, 2)} L
                              </td>
                              <td className="px-3 py-2 text-right tnum">
                                {formatNumber(row.m3PerLiter, 3)}
                              </td>
                              <td className="px-3 py-2">{row.formulaUsed}</td>
                              <td className="px-3 py-2 text-status-warning">{row.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

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
                                <td className="px-3 py-2 text-right tnum">
                                  {formatBRL(trip.total)}
                                </td>
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
            </Suspense>
          </div>
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

      {showPeriodComparison && (
        <PeriodComparisonDialog
          open={showPeriodComparison}
          onOpenChange={setShowPeriodComparison}
          baseData={dieselM3BaseData}
          obraOptions={dieselM3ObraOptions}
          equipmentOptions={dieselM3EquipmentOptions.filter(([key]) => !key.startsWith("CB:"))}
          aggregateOptions={dieselM3AggregateOptions}
          initialScope={{
            obraKeys: dieselM3SelectedObraKey === "all" ? [] : [dieselM3SelectedObraKey],
            item: dieselM3Filters.item,
            equipment: dieselM3Filters.equipment,
            aggregate: dieselM3Filters.aggregate,
          }}
          initialDateFrom={dieselM3Filters.dateFrom}
          initialDateTo={dieselM3Filters.dateTo}
        />
      )}
    </AppLayout>
  );
}

function PeriodComparisonDialog({
  open,
  onOpenChange,
  baseData,
  obraOptions,
  equipmentOptions,
  aggregateOptions,
  initialScope,
  initialDateFrom,
  initialDateTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseData: DieselM3BaseData;
  obraOptions: Array<[string, string]>;
  equipmentOptions: Array<[string, string]>;
  aggregateOptions: Array<[string, string]>;
  initialScope: PeriodComparisonScope;
  initialDateFrom: string;
  initialDateTo: string;
}) {
  const initialPeriods = useMemo(() => {
    const allDates = [
      ...new Set(baseData.dailyProductionByWorksite.map((row) => row.date).filter(Boolean)),
    ].sort();
    const scopedDates = allDates.filter((date) =>
      dateInFilterRange(date, initialDateFrom, initialDateTo),
    );
    const dates = scopedDates.length > 0 ? scopedDates : allDates;
    if (dates.length === 0) {
      return {
        periodA: { dateFrom: initialDateFrom, dateTo: initialDateTo },
        periodB: { dateFrom: initialDateFrom, dateTo: initialDateTo },
      };
    }
    if (dates.length === 1) {
      return {
        periodA: { dateFrom: dates[0], dateTo: dates[0] },
        periodB: { dateFrom: dates[0], dateTo: dates[0] },
      };
    }
    const splitIndex = Math.floor(dates.length / 2);
    return {
      periodA: { dateFrom: dates[0], dateTo: dates[splitIndex - 1] },
      periodB: { dateFrom: dates[splitIndex], dateTo: dates[dates.length - 1] },
    };
  }, [baseData.dailyProductionByWorksite, initialDateFrom, initialDateTo]);

  const [periodA, setPeriodA] = useState<PeriodComparisonRange>(initialPeriods.periodA);
  const [periodB, setPeriodB] = useState<PeriodComparisonRange>(initialPeriods.periodB);
  const [scope, setScope] = useState<PeriodComparisonScope>(() => ({
    ...initialScope,
    equipment: initialScope.equipment.startsWith("CB:") ? "all" : initialScope.equipment,
    aggregate:
      initialScope.aggregate !== "all"
        ? initialScope.aggregate
        : initialScope.equipment.startsWith("CB:")
          ? initialScope.equipment
          : "all",
  }));
  const [exportingComparison, setExportingComparison] = useState<"pdf" | "excel" | null>(null);
  const comparisonExportRef = useRef<HTMLTableElement>(null);

  const metricsA = useMemo(
    () => periodComparisonMetrics(baseData, periodA, scope),
    [baseData, periodA, scope],
  );
  const metricsB = useMemo(
    () => periodComparisonMetrics(baseData, periodB, scope),
    [baseData, periodB, scope],
  );
  const invalidPeriodA = Boolean(
    periodA.dateFrom && periodA.dateTo && periodA.dateFrom > periodA.dateTo,
  );
  const invalidPeriodB = Boolean(
    periodB.dateFrom && periodB.dateTo && periodB.dateFrom > periodB.dateTo,
  );

  const metricDefinitions: Array<{
    key: keyof PeriodComparisonMetrics;
    label: string;
    format: (value: number) => string;
  }> = [
    { key: "compactedM3", label: "Produção m³ compactado", format: formatM3 },
    { key: "looseM3", label: "Produção m³ solto", format: formatM3 },
    { key: "diesel", label: "Diesel total", format: formatLiters },
    {
      key: "trips",
      label: "Viagens",
      format: (value) => formatNumber(value, 0),
    },
    {
      key: "m3PerLiter",
      label: "m³/L",
      format: (value) => `${formatNumber(value, 3)} m³/L`,
    },
    {
      key: "litersPerHour",
      label: "L/h",
      format: (value) => `${formatNumber(value, 3)} L/h`,
    },
    { key: "pdeHours", label: "Horas PDE", format: formatHours },
    {
      key: "m3PerHour",
      label: "m³/h",
      format: (value) => `${formatNumber(value, 2)} m³/h`,
    },
  ];

  const rows = metricDefinitions.map((metric) => {
    const valueA = metricsA[metric.key];
    const valueB = metricsB[metric.key];
    const delta = valueB - valueA;
    const percentage = valueA !== 0 ? (delta / Math.abs(valueA)) * 100 : null;
    return { ...metric, valueA, valueB, delta, percentage };
  });

  const updatePeriod = (
    setter: React.Dispatch<React.SetStateAction<PeriodComparisonRange>>,
    key: keyof PeriodComparisonRange,
    value: string,
  ) => setter((current) => ({ ...current, [key]: value }));

  const selectedObraLabels = scope.obraKeys.map(
    (key) => obraOptions.find(([optionKey]) => optionKey === key)?.[1] ?? key,
  );
  const selectedObrasLabel =
    selectedObraLabels.length === 0
      ? "Todas as obras"
      : selectedObraLabels.join(" | ");
  const selectedEquipmentLabel =
    scope.equipment === "all"
      ? "Todos"
      : equipmentOptions.find(([key]) => key === scope.equipment)?.[1] ?? scope.equipment;
  const selectedAggregateLabel =
    scope.aggregate === "all"
      ? "Todos"
      : aggregateOptions.find(([key]) => key === scope.aggregate)?.[1] ?? scope.aggregate;
  const comparisonExportFilters: Array<[string, string]> = [
    ["Período A", `${formatDate(periodA.dateFrom)} até ${formatDate(periodA.dateTo)}`],
    ["Período B", `${formatDate(periodB.dateFrom)} até ${formatDate(periodB.dateTo)}`],
    ["Obras", selectedObrasLabel],
    [
      "Item",
      scope.item === "all" ? "Todos" : operationalItemLabel(scope.item as OperationalItem),
    ],
    ["Equipamento", selectedEquipmentLabel],
    ["Agregado", selectedAggregateLabel],
  ];
  const comparisonExportSheets: DashboardExportSheet[] = [
    {
      name: "Comparativo",
      rows: rows.map((row) => ({
        Indicador: row.label,
        "Período A": row.valueA,
        "Período B": row.valueB,
        "Diferença absoluta": Math.abs(row.delta),
        "Diferença percentual (%)": row.percentage,
      })),
    },
  ];

  const handleExportComparison = async (format: "pdf" | "excel") => {
    if (invalidPeriodA || invalidPeriodB) {
      toast.error("Corrija as datas dos períodos antes de exportar.");
      return;
    }
    const element = comparisonExportRef.current;
    if (!element) {
      toast.error("A comparação ainda não terminou de carregar.");
      return;
    }

    setExportingComparison(format);
    try {
      const options = {
        element,
        tabLabel: "Comparação de períodos",
        filters: comparisonExportFilters,
        dataSheets: comparisonExportSheets,
      };
      if (format === "pdf") {
        await exportDashboardTabAsPdf(options);
        toast.success("Comparação exportada em PDF.");
      } else {
        await exportDashboardTabAsExcel(options);
        toast.success("Comparação exportada em Excel.");
      }
    } catch (error) {
      toast.error(`Não foi possível exportar ${format === "pdf" ? "o PDF" : "o Excel"}.`, {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setExportingComparison(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!exportingComparison) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        aria-busy={Boolean(exportingComparison)}
        inert={Boolean(exportingComparison)}
        className="period-comparison-dialog !h-[calc(100dvh-1rem)] !max-h-[calc(100dvh-1rem)] !w-[calc(100vw-1rem)] !max-w-none overflow-hidden border-border-low bg-surface-container p-3 sm:p-4 lg:p-5 [&>.app-dialog-close]:hidden"
        style={{
          width: "calc(100vw - 1rem)",
          maxWidth: "none",
          height: "calc(100dvh - 1rem)",
        }}
      >
        <DialogClose asChild>
          <button
            type="button"
            aria-label="Fechar comparação"
            className="absolute right-3 top-3 z-[70] flex h-9 w-9 items-center justify-center rounded-full border border-border-low bg-surface-highest text-on-surface shadow-industrial transition-industrial hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <Icon name="close" className="text-lg" />
          </button>
        </DialogClose>
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden lg:gap-4">
          <div className="shrink-0 space-y-3 lg:space-y-4">
        <DialogHeader className="pr-11">
          <DialogTitle className="text-lg font-black uppercase tracking-widest">
            Comparar períodos
          </DialogTitle>
          <DialogDescription>
            Compara dados já carregados nas análises. As diferenças consideram o Período B em
            relação ao Período A.
          </DialogDescription>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={Boolean(exportingComparison) || invalidPeriodA || invalidPeriodB}
              onClick={() => void handleExportComparison("pdf")}
            >
              <Icon name="picture_as_pdf" className="mr-1 text-base" />
              {exportingComparison === "pdf" ? "Preparando PDF…" : "Exportar PDF"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={Boolean(exportingComparison) || invalidPeriodA || invalidPeriodB}
              onClick={() => void handleExportComparison("excel")}
            >
              <Icon name="table_view" className="mr-1 text-base" />
              {exportingComparison === "excel" ? "Preparando Excel…" : "Exportar Excel"}
            </Button>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4">
          {[
            { title: "Período A", period: periodA, setter: setPeriodA, invalid: invalidPeriodA },
            { title: "Período B", period: periodB, setter: setPeriodB, invalid: invalidPeriodB },
          ].map(({ title, period, setter, invalid }) => (
            <div key={title} className="rounded border border-border-low bg-surface-highest p-3 lg:p-4">
              <h3 className="text-xs font-black uppercase tracking-widest">{title}</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ComparisonField label="Data inicial">
                  <input
                    type="date"
                    value={period.dateFrom}
                    onChange={(event) => updatePeriod(setter, "dateFrom", event.target.value)}
                    className="mt-1 block w-full min-w-0 rounded border border-border-low bg-surface-container px-3 py-2 text-xs whitespace-nowrap text-on-surface"
                  />
                </ComparisonField>
                <ComparisonField label="Data final">
                  <input
                    type="date"
                    value={period.dateTo}
                    onChange={(event) => updatePeriod(setter, "dateTo", event.target.value)}
                    className="mt-1 block w-full min-w-0 rounded border border-border-low bg-surface-container px-3 py-2 text-xs whitespace-nowrap text-on-surface"
                  />
                </ComparisonField>
              </div>
              {invalid && (
                <p className="mt-2 text-xs font-bold text-status-error">
                  A data final deve ser igual ou posterior à data inicial.
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="rounded border border-border-low bg-surface-highest p-3 lg:p-4">
          <h3 className="text-xs font-black uppercase tracking-widest">Filtros da comparação</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(280px,1.4fr)_minmax(140px,1fr)_minmax(170px,1fr)_minmax(150px,1fr)]">
            <div className="min-w-0 text-[10px] font-black uppercase tracking-widest text-on-surface-variant sm:col-span-2 xl:col-span-1">
              Obra
              <WorksiteMultiSelect
                options={obraOptions}
                selectedKeys={scope.obraKeys}
                onChange={(obraKeys) => setScope((current) => ({ ...current, obraKeys }))}
              />
            </div>
            <ComparisonField label="Item">
              <select
                value={scope.item}
                onChange={(event) =>
                  setScope((current) => ({ ...current, item: event.target.value }))
                }
                className="mt-1 block w-full min-w-0 rounded border border-border-low bg-surface-container px-3 py-2 text-xs whitespace-nowrap text-on-surface"
              >
                <option value="all">Todos</option>
                {OPERATIONAL_ITEM_ORDER.map((item) => (
                  <option key={item} value={item}>
                    {operationalItemLabel(item)}
                  </option>
                ))}
              </select>
            </ComparisonField>
            <ComparisonField label="Equipamento">
              <select
                value={scope.equipment}
                onChange={(event) =>
                  setScope((current) => ({
                    ...current,
                    equipment: event.target.value,
                    aggregate: event.target.value === "all" ? current.aggregate : "all",
                  }))
                }
                className="mt-1 block w-full min-w-0 rounded border border-border-low bg-surface-container px-3 py-2 text-xs whitespace-nowrap text-on-surface"
              >
                <option value="all">Todos</option>
                {equipmentOptions.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </ComparisonField>
            <ComparisonField label="Agregado">
              <select
                value={scope.aggregate}
                onChange={(event) =>
                  setScope((current) => ({
                    ...current,
                    aggregate: event.target.value,
                    equipment: event.target.value === "all" ? current.equipment : "all",
                  }))
                }
                className="mt-1 block w-full min-w-0 rounded border border-border-low bg-surface-container px-3 py-2 text-xs whitespace-nowrap text-on-surface"
              >
                <option value="all">Todos</option>
                {aggregateOptions.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </ComparisonField>
          </div>
        </div>

          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded border border-border-low">
          <div className="h-full overflow-auto">
            <table
              ref={comparisonExportRef}
              className="min-w-[760px] w-full table-fixed text-left text-[11px] lg:text-xs"
            >
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[17%]" />
                <col className="w-[17%]" />
                <col className="w-[19%]" />
                <col className="w-[19%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 border-b border-border-low bg-surface-highest text-[10px] uppercase tracking-widest text-on-surface-variant">
                <tr>
                  <th className="px-2 py-3 lg:px-3">Indicador</th>
                  <th className="px-3 py-3 text-right">Período A</th>
                  <th className="px-3 py-3 text-right">Período B</th>
                  <th className="px-3 py-3 text-right">Diferença absoluta</th>
                  <th className="px-3 py-3 text-right">Diferença percentual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-low">
                {rows.map((row) => (
                    <tr key={row.key} className="bg-surface-container">
                      <td className="px-2 py-3 font-bold lg:px-3">{row.label}</td>
                      <td className="px-2 py-3 text-right tnum whitespace-nowrap lg:px-3">
                        {row.format(row.valueA)}
                      </td>
                      <td className="px-2 py-3 text-right tnum whitespace-nowrap lg:px-3">
                        {row.format(row.valueB)}
                      </td>
                      <td className="px-2 py-3 text-right tnum whitespace-nowrap lg:px-3">
                        {row.format(Math.abs(row.delta))}
                      </td>
                      <td className="px-2 py-3 text-right tnum whitespace-nowrap lg:px-3">
                        {row.percentage === null
                          ? "—"
                          : `${row.percentage > 0 ? "+" : ""}${formatNumber(row.percentage, 1)}%`}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorksiteMultiSelect({
  options,
  selectedKeys,
  onChange,
}: {
  options: Array<[string, string]>;
  selectedKeys: string[];
  onChange: (selectedKeys: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const selectedSet = new Set(selectedKeys);
  const selectionLabel =
    selectedKeys.length === 0
      ? "Todas as obras"
      : selectedKeys.length === 1
        ? "1 obra selecionada"
        : `${selectedKeys.length} obras selecionadas`;
  const selectedBadge =
    selectedKeys.length === 0
      ? "Todas"
      : selectedKeys.length === 1
        ? "1 obra selecionada"
        : `${selectedKeys.length} obras selecionadas`;
  const normalizedSearch = search
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  const filteredOptions = options.filter(([, label]) => {
    if (!normalizedSearch) return true;
    return label
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .includes(normalizedSearch);
  });

  const toggleWorksite = (key: string) => {
    if (selectedSet.has(key)) {
      onChange(selectedKeys.filter((selectedKey) => selectedKey !== key));
      return;
    }
    onChange([...selectedKeys, key]);
  };

  return (
    <Popover>
      <div className="mt-1 min-w-[280px]">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-h-9 w-full min-w-[280px] items-center justify-between gap-3 rounded border border-border-low bg-surface-container px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-on-surface"
            aria-label={`Selecionar obras. ${selectionLabel}`}
          >
            <span className="min-w-0 flex-1 truncate whitespace-nowrap">Obras</span>
            <span className="shrink-0 whitespace-nowrap rounded border border-border-low bg-surface-highest px-2 py-0.5 text-[10px] font-black uppercase tracking-normal text-on-surface-variant">
              {selectedBadge}
            </span>
            <Icon name="expand_more" className="shrink-0 text-base text-on-surface-variant" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        align="start"
        side="bottom"
        collisionPadding={16}
        className="z-[70] max-w-[calc(100vw-2rem)] min-w-[280px] p-0"
        style={{ width: "max(280px, var(--radix-popover-trigger-width))" }}
      >
        <div className="border-b border-border-low p-2">
          <label className="sr-only" htmlFor="period-worksite-search">
            Buscar obra
          </label>
          <div className="flex min-h-9 items-center gap-2 rounded border border-border-low bg-surface-container px-3">
            <Icon name="search" className="shrink-0 text-base text-on-surface-variant" />
            <input
              id="period-worksite-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar obra"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm font-normal normal-case tracking-normal text-on-surface outline-none placeholder:text-on-surface-variant"
            />
          </div>
        </div>
        <div className="max-h-[50vh] overflow-auto overscroll-contain p-2">
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex min-h-11 w-full min-w-max items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-accent"
            aria-pressed={selectedKeys.length === 0}
          >
            <Checkbox
              checked={selectedKeys.length === 0}
              tabIndex={-1}
              className="pointer-events-none shrink-0"
            />
            <span className="whitespace-nowrap font-semibold">Todas as obras</span>
          </button>
          {filteredOptions.map(([key, label]) => {
            const checked = selectedSet.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleWorksite(key)}
                className="flex min-h-11 w-full min-w-max items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-accent"
                aria-pressed={checked}
              >
                <Checkbox checked={checked} tabIndex={-1} className="pointer-events-none shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
              </button>
            );
          })}
          {filteredOptions.length === 0 && (
            <div className="px-3 py-4 text-sm font-normal normal-case tracking-normal text-on-surface-variant">
              Nenhuma obra encontrada.
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border-low p-2">
          <span className="whitespace-nowrap px-2 text-[10px] font-bold text-on-surface-variant">
            {selectionLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={selectedKeys.length === 0}
            onClick={() => onChange([])}
          >
            Limpar seleção
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ComparisonField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
      {label}
      {children}
    </label>
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
