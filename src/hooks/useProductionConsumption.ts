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

/**
 * Hook para gerenciar filtros do dashboard
 * Persiste em localStorage automaticamente
 */
export function useDashboardFilters(storageKey = "dashboard_filters") {
  const [filters, setFilters] = useState<DashboardFilterState>(() => {
    if (typeof window === "undefined") return DEFAULT_FILTERS;
    const stored = localStorage.getItem(storageKey);
    return stored ? { ...DEFAULT_FILTERS, ...JSON.parse(stored) } : DEFAULT_FILTERS;
  });

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
    setFilters(DEFAULT_FILTERS);
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  return { filters, updateFilters, clearFilters };
}

/**
 * Hook para gerenciar seleção de análises
 */
export function useAnalysisSelection(analyses: DbProductionAnalysis[], initialIds?: string[]) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (!initialIds || initialIds.length === 0) {
      return analyses.length > 0 ? [analyses[0].id] : [];
    }
    return initialIds.filter((id) => analyses.some((a) => a.id === id));
  });

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
    setSelectedIds,
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

  const filteredTrips = useMemo(() => {
    return trips.filter((row) => {
      if (filters.dateFrom && dateKey(row.datetime) < filters.dateFrom) return false;
      if (filters.dateTo && dateKey(row.datetime) > filters.dateTo) return false;
      if (filters.obra !== "all" && row.obra !== filters.obra) return false;
      if (filters.material !== "all" && row.material !== filters.material) return false;
      if (filters.analysisType === "production-only" && row.cubicMLoose <= 0) return false;
      return true;
    });
  }, [trips, filters]);

  const filteredFueling = useMemo(() => {
    return fueling.filter((row) => {
      if (filters.dateFrom && dateKey(row.datetime) < filters.dateFrom) return false;
      if (filters.dateTo && dateKey(row.datetime) > filters.dateTo) return false;
      if (filters.obra !== "all" && row.obra !== filters.obra) return false;
      if (filters.analysisType === "consumption-only" && row.liters <= 0) return false;
      return true;
    });
  }, [fueling, filters]);

  const filteredDailyParts = useMemo(() => {
    return dailyParts.filter((row) => {
      if (filters.dateFrom && row.date < filters.dateFrom) return false;
      if (filters.dateTo && row.date > filters.dateTo) return false;
      if (filters.obra !== "all" && row.obra && row.obra !== filters.obra) return false;
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
 */
export function useDashboardTabs(initialTab = "overview") {
  const [activeTab, setActiveTab] = useState(initialTab);

  const tabs = [
    { id: "overview", label: "Visão Geral" },
    { id: "daily", label: "Diário" },
    { id: "accumulated", label: "Acumulado" },
    { id: "efficiency", label: "Eficiência" },
    { id: "financial", label: "Financeiro" },
    { id: "production", label: "Produção" },
    { id: "consumption", label: "Consumo" },
    { id: "equipment", label: "Equipamentos" },
    { id: "trucks", label: "Agregados" },
    { id: "comparison", label: "Comparativo" },
    { id: "history", label: "Histórico" },
    { id: "audit", label: "Auditoria" },
    { id: "crossAudit", label: "Cruzamento" },
    { id: "data", label: "Dados" },
  ];

  return {
    activeTab,
    setActiveTab,
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
export function useSearch(items: any[], searchFn: (item: any, query: string) => boolean) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query) return items;
    return items.filter((item) => searchFn(item, query.toLowerCase()));
  }, [items, query]);

  const clear = useCallback(() => setQuery(""), []);

  return {
    query,
    setQuery,
    filtered,
    clear,
    isEmpty: query.length === 0,
  };
}
