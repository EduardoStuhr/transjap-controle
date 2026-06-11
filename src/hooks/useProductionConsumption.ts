/**
 * Hooks customizados para o dashboard de Produção x Consumo
 * Gerencia estado, cálculos e persistência
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DbProductionAnalysis, DbTrip, DbFueling, DbEquipmentDailyPart } from "@/db/schema";
import { normalizeFleet } from "@/lib/carcara-parser";
import type { DashboardFilterState } from "@/lib/production-consumption-types";
import {
  extractDateKey,
  normalizeObraKey,
  normalizeObraName,
  uniqueNormalizedObras,
} from "@/lib/production-consumption-utils";
import {
  equipmentMatches,
  normalizeEquipmentKey,
  type EquipmentContext,
} from "@/lib/equipment-normalization";

type ObraScopedRow = {
  obra?: string | null;
  resolvedObraKey?: string | null;
  resolvedObraLabel?: string | null;
  obraStatus?: "ok" | "inferred" | "absent" | string | null;
};

const OBRA_NAO_INFORMADA_KEY = "OBRA_NAO_INFORMADA";

const DEFAULT_FILTERS: DashboardFilterState = {
  dateFrom: "",
  dateTo: "",
  obra: "all",
  material: "all",
  equipment: "all",
  aggregate: "all",
  analysisType: "all",
};

function defaultFilters(): DashboardFilterState {
  return { ...DEFAULT_FILTERS };
}

function readStoredFilters(storageKey: string): DashboardFilterState {
  if (typeof window === "undefined") return defaultFilters();
  const stored = localStorage.getItem(storageKey);
  if (!stored) return defaultFilters();
  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object"
      ? { ...DEFAULT_FILTERS, ...(parsed as Partial<DashboardFilterState>) }
      : defaultFilters();
  } catch {
    localStorage.removeItem(storageKey);
    return defaultFilters();
  }
}

function normalizeIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
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
  return analysis.obra ? [analysis.obra] : [];
}

function analysisObraDisplay(analysis: DbProductionAnalysis | null) {
  if (!analysis) return "?";
  return uniqueNormalizedObras(analysisObraLabels(analysis)).join(" | ") || analysis.obra || "?";
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

function equipmentLabelFromKey(key: string) {
  if (key.startsWith("CB:")) return `CB ${key.slice(3)}`;
  if (key.startsWith("FROTA:")) return `FROTA ${key.slice(6)}`;
  return key;
}

function pdeRuleEquipmentMatches(key: string, selected: string) {
  const context: EquipmentContext = key.startsWith("CB:") ? "aggregate" : "ownFleet";
  return (
    equipmentMatches(key, selected, context) ||
    equipmentMatches(equipmentLabelFromKey(key), selected, context)
  );
}

/**
 * Hook para gerenciar filtros do dashboard
 * Persiste em localStorage automaticamente
 */
export function useDashboardFilters(storageKey = "dashboard_filters") {
  const [filters, setFilters] = useState<DashboardFilterState>(() => readStoredFilters(storageKey));

  const updateFilters = useCallback(
    (updates: Partial<DashboardFilterState>) => {
      setFilters((current) => {
        const next = { ...current, ...updates };
        if (typeof window !== "undefined") {
          localStorage.setItem(storageKey, JSON.stringify(next));
        }
        return next;
      });
    },
    [storageKey],
  );

  const clearFilters = useCallback(() => {
    setFilters(defaultFilters());
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  return { filters, updateFilters, clearFilters };
}

/**
 * Hook para gerenciar seleção de análises
 * Inicia cada abertura do modulo com todas as analises compartilhadas selecionadas.
 * Escolhas manuais continuam valendo enquanto o usuario permanece na pagina.
 */
export function useAnalysisSelection(analyses: DbProductionAnalysis[]) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const previousAvailableIdsRef = useRef<string[]>([]);
  const hasLoadedAnalysesRef = useRef(false);

  useEffect(() => {
    const allIds = analyses.map((analysis) => analysis.id);
    const previousAvailableIds = previousAvailableIdsRef.current;
    const isInitialSelection = !hasLoadedAnalysesRef.current;

    setSelectedIds((current) => {
      if (analyses.length === 0) return current.length ? [] : current;
      const availableIds = new Set(allIds);
      const kept = current.filter((id) => availableIds.has(id));
      if (isInitialSelection) return allIds;
      const allPreviouslySelected =
        previousAvailableIds.length > 0 && previousAvailableIds.every((id) => current.includes(id));
      if (allPreviouslySelected) return allIds;
      if (kept.length > 0) return kept.length === current.length ? current : kept;
      return allIds;
    });

    previousAvailableIdsRef.current = allIds;
    if (allIds.length > 0) hasLoadedAnalysesRef.current = true;
  }, [analyses]);

  const updateSelectedIds = useCallback((ids: string[] | ((current: string[]) => string[])) => {
    setSelectedIds((current) => {
      const next = typeof ids === "function" ? ids(current) : ids;
      return normalizeIds(next);
    });
  }, []);

  const selectedAnalyses = useMemo(
    () => analyses.filter((a) => selectedIds.includes(a.id)),
    [analyses, selectedIds],
  );

  const primaryAnalysis = selectedAnalyses[0] ?? null;

  const isMultipleSelected = selectedIds.length > 1;

  const label = useMemo(() => {
    if (selectedIds.length === 0) return "Selecione uma análise";
    if (isMultipleSelected) return `${selectedIds.length} análises acumuladas`;
    return `${primaryAnalysis?.name ?? "?"} · ${analysisObraDisplay(primaryAnalysis)}`;
  }, [selectedIds, isMultipleSelected, primaryAnalysis]);

  return {
    selectedIds,
    setSelectedIds: updateSelectedIds,
    selectedAnalyses,
    primaryAnalysis,
    isMultipleSelected,
    label,
  };
}

/**
 * Hook para filtrar dados por filtros de dashboard
 */
export function useFilteredData(
  trips: DbTrip[],
  fueling: DbFueling[],
  dailyParts: DbEquipmentDailyPart[],
  filters: DashboardFilterState,
) {
  const dateKey = extractDateKey;
  const equipmentKey = (row: { prefix?: string; vehicleId?: string; plate?: string }) =>
    row.prefix || row.vehicleId || row.plate || "";
  const selectedObraKey = filters.obra === "all" ? "" : normalizeObraKey(filters.obra);
  const filterObraKey =
    selectedObraKey && normalizeObraKey("Obra não informada") === selectedObraKey
      ? OBRA_NAO_INFORMADA_KEY
      : selectedObraKey;
  const rowObraKey = useCallback((row: ObraScopedRow | string | null | undefined) => {
    if (typeof row === "string" || row == null) return normalizeObraKey(row);
    if (row.resolvedObraKey) return row.resolvedObraKey;
    if (row.obraStatus === "absent") return OBRA_NAO_INFORMADA_KEY;
    return normalizeObraKey(row.resolvedObraLabel || row.obra);
  }, []);
  const matchesSelectedObra = useCallback(
    (row: ObraScopedRow | string | null | undefined) =>
      !filterObraKey || rowObraKey(row) === filterObraKey,
    [filterObraKey, rowObraKey],
  );
  const pdeFleetKeys = useMemo(() => buildPdeFleetKeys(dailyParts), [dailyParts]);
  const fuelingContext = useCallback(
    (
      row: Pick<
        DbFueling,
        "analysisId" | "vehicleType" | "owner" | "operator" | "prefix" | "vehicleId" | "plate"
      >,
    ): EquipmentContext => {
      if (row.analysisId === "allocated") return "fuelAllocation";
      if (row.analysisId === "attributed") return "fuelAttribution";
      const description = [row.vehicleType, row.owner, row.operator].filter(Boolean).join(" ");
      const key = equipmentKeyByPdeRule(equipmentKey(row), pdeFleetKeys, {
        source: "fueling",
        description,
      });
      if (key.startsWith("CB:")) return "aggregate";
      return {
        source: "fueling",
        description,
      };
    },
    [pdeFleetKeys],
  );

  const filteredTrips = useMemo(() => {
    return trips.filter((row) => {
      if (filters.dateFrom && dateKey(row.datetime) < filters.dateFrom) return false;
      if (filters.dateTo && dateKey(row.datetime) > filters.dateTo) return false;
      if (!matchesSelectedObra(row)) return false;
      if (filters.material !== "all" && row.material !== filters.material) return false;
      if (
        filters.aggregate !== "all" &&
        !equipmentMatches(equipmentKey(row), filters.aggregate, "trip")
      ) {
        return false;
      }
      if (filters.analysisType === "production-only" && row.cubicMLoose <= 0) return false;
      return true;
    });
  }, [trips, filters, matchesSelectedObra]);

  const filteredFueling = useMemo(() => {
    return fueling.filter((row) => {
      if (filters.dateFrom && dateKey(row.datetime) < filters.dateFrom) return false;
      if (filters.dateTo && dateKey(row.datetime) > filters.dateTo) return false;
      if (!matchesSelectedObra(row)) return false;
      const key = equipmentKeyByPdeRule(equipmentKey(row), pdeFleetKeys, fuelingContext(row));
      if (filters.equipment !== "all" && !pdeRuleEquipmentMatches(key, filters.equipment)) {
        return false;
      }
      if (filters.aggregate !== "all" && !pdeRuleEquipmentMatches(key, filters.aggregate)) {
        return false;
      }
      if (filters.analysisType === "consumption-only" && row.liters <= 0) return false;
      return true;
    });
  }, [fueling, filters, fuelingContext, pdeFleetKeys, matchesSelectedObra]);

  const filteredDailyParts = useMemo(() => {
    return dailyParts.filter((row) => {
      const rowDate = dateKey(row.date);
      if (filters.dateFrom && rowDate < filters.dateFrom) return false;
      if (filters.dateTo && rowDate > filters.dateTo) return false;
      if (!matchesSelectedObra(row)) return false;
      if (
        filters.equipment !== "all" &&
        !equipmentMatches(row.fleet, filters.equipment, "dailyPart") &&
        !equipmentMatches(row.fleetLabel, filters.equipment, "dailyPart")
      ) {
        return false;
      }
      return true;
    });
  }, [dailyParts, filters, matchesSelectedObra]);

  return {
    filteredTrips,
    filteredFueling,
    filteredDailyParts,
  };
}

/**
 * Hook para gerenciar estado de abas
 * Persiste em localStorage automaticamente
 */
export function useDashboardTabs(storageKey = "dashboard_activeTab") {
  const tabs = [
    { id: "escavacao", label: "Escavação" },
    { id: "transporte", label: "Transporte" },
    { id: "tratamento", label: "Tratamento" },
    { id: "compactacao", label: "Compactação" },
    { id: "overview", label: "Visão Geral" },
    { id: "dieselM3", label: "Diesel × m³" },
    { id: "limpeza", label: "Limpeza" },
    { id: "production", label: "Produção" },
    { id: "consumption", label: "Consumo Diesel" },
    { id: "trucks", label: "Agregados" },
    { id: "equipment", label: "Equipamentos Próprios" },
    { id: "efficiency", label: "Eficiência" },
    { id: "hours", label: "Produção por Hora" },
    { id: "financial", label: "Financeiro" },
    { id: "accumulated", label: "Acumulado" },
    { id: "comparison", label: "Comparativo" },
    { id: "history", label: "Histórico" },
    { id: "crossAudit", label: "Cruzamento" },
    { id: "data", label: "Dados" },
  ];

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "overview";
    const stored = localStorage.getItem(storageKey);
    // Validate stored tab exists in tabs list
    if (stored && tabs.some((t) => t.id === stored)) {
      return stored;
    }
    return "overview";
  });

  // Persist whenever activeTab changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, activeTab);
    }
  }, [activeTab, storageKey]);

  const handleTabChange = useCallback((newTab: string) => {
    setActiveTab(newTab);
  }, []);

  return {
    activeTab,
    setActiveTab: handleTabChange,
    tabs,
  };
}

/**
 * Hook para gerenciar modal de análises
 */
export function useAnalysesModal() {
  const [isOpen, setIsOpen] = useState(false);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}

/**
 * Hook para paginação
 */
export function usePagination(total: number, pageSize = 12) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const goToPage = useCallback(
    (newPage: number) => {
      setPage(Math.max(0, Math.min(newPage, pageCount - 1)));
    },
    [pageCount],
  );

  const nextPage = useCallback(() => goToPage(page + 1), [goToPage, page]);
  const prevPage = useCallback(() => goToPage(page - 1), [goToPage, page]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  return {
    page,
    pageCount,
    goToPage,
    nextPage,
    prevPage,
    canNext: page < pageCount - 1,
    canPrev: page > 0,
  };
}

/**
 * Hook para gerenciar busca/search
 */
export function useSearch<T>(items: T[], searchFn: (item: T, query: string) => boolean) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query) return items;
    return items.filter((item) => searchFn(item, query.toLowerCase()));
  }, [items, query, searchFn]);

  const clear = useCallback(() => setQuery(""), []);

  return {
    query,
    setQuery,
    filtered,
    clear,
    isEmpty: query.length === 0,
  };
}
