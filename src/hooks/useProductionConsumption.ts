/**
 * Hooks customizados para o dashboard de Produção x Consumo
 * Gerencia estado, cálculos e persistência
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DbProductionAnalysis, DbTrip, DbFueling, DbEquipmentDailyPart } from "@/db/schema";
import type { DashboardFilterState } from "@/lib/production-consumption-types";

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

function readJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
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

/**
 * Hook para gerenciar filtros do dashboard
 * Persiste em localStorage automaticamente
 */
export function useDashboardFilters(storageKey = "dashboard_filters") {
  const [filters, setFilters] = useState<DashboardFilterState>(() =>
    readStoredFilters(storageKey),
  );

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
 * Persiste em localStorage automaticamente
 */
export function useAnalysisSelection(
  analyses: DbProductionAnalysis[],
  storageKey = "dashboard_selectedAnalysisIds",
) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const ids = readJsonArray(localStorage.getItem(storageKey));
    if (ids.length > 0) {
      const validIds = ids.filter((id) => analyses.some((a) => a.id === id));
      if (validIds.length > 0) return validIds;
    }
    // Fallback to first analysis if none stored or all are invalid
    return analyses.length > 0 ? [analyses[0].id] : [];
  });

  // Persist whenever selectedIds changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(selectedIds));
    }
  }, [selectedIds, storageKey]);

  useEffect(() => {
    setSelectedIds((current) => {
      if (analyses.length === 0) return current.length ? [] : current;
      const availableIds = new Set(analyses.map((analysis) => analysis.id));
      const kept = current.filter((id) => availableIds.has(id));
      if (kept.length > 0) return kept.length === current.length ? current : kept;
      return [analyses[0].id];
    });
  }, [analyses]);

  const updateSelectedIds = useCallback(
    (ids: string[] | ((current: string[]) => string[])) => {
      setSelectedIds((current) => {
        const next = typeof ids === "function" ? ids(current) : ids;
        return normalizeIds(next);
      });
    },
    [],
  );

  const selectedAnalyses = useMemo(
    () => analyses.filter((a) => selectedIds.includes(a.id)),
    [analyses, selectedIds],
  );

  const primaryAnalysis = selectedAnalyses[0] ?? null;

  const isMultipleSelected = selectedIds.length > 1;

  const label = useMemo(() => {
    if (selectedIds.length === 0) return "Selecione uma análise";
    if (isMultipleSelected) return `${selectedIds.length} análises acumuladas`;
    return `${primaryAnalysis?.name ?? "?"} · ${primaryAnalysis?.obra ?? "?"}`;
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
  const dateKey = (value: string) => (value ? value.slice(0, 10) : "");
  const equipmentKey = (row: { prefix?: string; vehicleId?: string; plate?: string }) =>
    row.prefix || row.vehicleId || row.plate || "";

  const filteredTrips = useMemo(() => {
    return trips.filter((row) => {
      if (filters.dateFrom && dateKey(row.datetime) < filters.dateFrom) return false;
      if (filters.dateTo && dateKey(row.datetime) > filters.dateTo) return false;
      if (filters.obra !== "all" && row.obra !== filters.obra) return false;
      if (filters.material !== "all" && row.material !== filters.material) return false;
      if (filters.aggregate !== "all" && equipmentKey(row) !== filters.aggregate) return false;
      if (filters.analysisType === "production-only" && row.cubicMLoose <= 0) return false;
      return true;
    });
  }, [trips, filters]);

  const filteredFueling = useMemo(() => {
    return fueling.filter((row) => {
      if (filters.dateFrom && dateKey(row.datetime) < filters.dateFrom) return false;
      if (filters.dateTo && dateKey(row.datetime) > filters.dateTo) return false;
      if (filters.obra !== "all" && row.obra !== filters.obra) return false;
      if (filters.equipment !== "all" && equipmentKey(row) !== filters.equipment) return false;
      if (filters.analysisType === "consumption-only" && row.liters <= 0) return false;
      return true;
    });
  }, [fueling, filters]);

  const filteredDailyParts = useMemo(() => {
    return dailyParts.filter((row) => {
      if (filters.dateFrom && row.date < filters.dateFrom) return false;
      if (filters.dateTo && row.date > filters.dateTo) return false;
      if (filters.obra !== "all" && row.obra && row.obra !== filters.obra) return false;
      if (
        filters.equipment !== "all" &&
        row.fleet !== filters.equipment &&
        row.fleetLabel !== filters.equipment
      ) {
        return false;
      }
      return true;
    });
  }, [dailyParts, filters]);

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
    { id: "overview", label: "Visão Geral" },
    { id: "production", label: "Produção" },
    { id: "consumption", label: "Consumo Diesel" },
    { id: "trucks", label: "Agregados" },
    { id: "equipment", label: "Equipamentos Próprios" },
    { id: "efficiency", label: "Eficiência" },
    { id: "financial", label: "Financeiro" },
    { id: "accumulated", label: "Acumulado" },
    { id: "comparison", label: "Comparativo" },
    { id: "audit", label: "Auditoria" },
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
