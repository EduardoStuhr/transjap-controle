import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDieselFilterChange,
  deleteDieselFilterChange,
  listDieselFilterChanges,
  updateDieselFilterChange,
  type DieselFilterChange,
  type DieselFilterChangeDraft,
  type DieselFilterChangeFilters,
  type DieselFilterChangePatch,
} from "@/lib/api/diesel-filter-changes";

export type { DieselFilterChange, DieselFilterChangeDraft, DieselFilterChangeFilters };

export type DieselFilterChangeWithHours = DieselFilterChange & {
  hoursSinceLastChange: number | null;
  hoursSinceLastChangeLabel: string;
  intervalStatus: "first" | "normal" | "attention" | "critical";
};

export type DieselFilterSummary = {
  totalChanges: number;
  trackedFleets: number;
  maxInterval: number | null;
  upcomingChanges: number;
};

const QK = ["diesel-filter-changes"] as const;
const ATTENTION_LIMIT_HOURS = 250;
const CRITICAL_LIMIT_HOURS = 300;

function roundHours(value: number) {
  return Math.round(value * 10) / 10;
}

function compareAscending(a: DieselFilterChange, b: DieselFilterChange) {
  return (
    a.date.localeCompare(b.date) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.hourmeter - b.hourmeter
  );
}

function compareDescending(a: DieselFilterChange, b: DieselFilterChange) {
  return (
    b.date.localeCompare(a.date) ||
    b.createdAt.localeCompare(a.createdAt) ||
    b.hourmeter - a.hourmeter
  );
}

function intervalStatus(hours: number | null): DieselFilterChangeWithHours["intervalStatus"] {
  if (hours === null) return "first";
  if (hours >= CRITICAL_LIMIT_HOURS) return "critical";
  if (hours >= ATTENTION_LIMIT_HOURS) return "attention";
  return "normal";
}

function intervalLabel(hours: number | null) {
  if (hours === null) return "Primeira troca";
  return `${hours.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(hours) ? 0 : 1,
    maximumFractionDigits: 1,
  })} h`;
}

export function enrichDieselFilterChanges(
  rows: DieselFilterChange[],
): DieselFilterChangeWithHours[] {
  const byId = new Map<string, DieselFilterChangeWithHours>();
  const fleets = new Map<string, DieselFilterChange[]>();

  rows.forEach((row) => {
    const fleetRows = fleets.get(row.fleet) ?? [];
    fleetRows.push(row);
    fleets.set(row.fleet, fleetRows);
  });

  fleets.forEach((fleetRows) => {
    fleetRows.sort(compareAscending);
    fleetRows.forEach((row, index) => {
      const previous = index > 0 ? fleetRows[index - 1] : null;
      const hours = previous ? roundHours(row.hourmeter - previous.hourmeter) : null;
      byId.set(row.id, {
        ...row,
        hoursSinceLastChange: hours,
        hoursSinceLastChangeLabel: intervalLabel(hours),
        intervalStatus: intervalStatus(hours),
      });
    });
  });

  return rows
    .map((row) => byId.get(row.id))
    .filter((row): row is DieselFilterChangeWithHours => Boolean(row))
    .sort(compareDescending);
}

export function summarizeDieselFilterChanges(
  rows: DieselFilterChangeWithHours[],
): DieselFilterSummary {
  const fleets = new Map<string, DieselFilterChangeWithHours[]>();
  let maxInterval: number | null = null;

  rows.forEach((row) => {
    const current = fleets.get(row.fleet) ?? [];
    current.push(row);
    fleets.set(row.fleet, current);
    if (row.hoursSinceLastChange !== null) {
      maxInterval = Math.max(maxInterval ?? 0, row.hoursSinceLastChange);
    }
  });

  const upcomingChanges = Array.from(fleets.values()).filter((fleetRows) => {
    const latest = [...fleetRows].sort(compareDescending)[0];
    return latest?.hoursSinceLastChange !== null && latest.hoursSinceLastChange >= ATTENTION_LIMIT_HOURS;
  }).length;

  return {
    totalChanges: rows.length,
    trackedFleets: fleets.size,
    maxInterval,
    upcomingChanges,
  };
}

function matchesSearch(value: string | null | undefined, needle: string) {
  return (value ?? "").toLowerCase().includes(needle);
}

export function filterDieselFilterChanges(
  rows: DieselFilterChangeWithHours[],
  filters: DieselFilterChangeFilters,
) {
  const fleet = filters.fleet?.trim().toLowerCase() ?? "";
  const obra = filters.obra?.trim().toLowerCase() ?? "";
  const responsible = filters.responsible?.trim().toLowerCase() ?? "";
  const date = filters.date?.trim() ?? "";

  return rows.filter((row) => {
    if (fleet && !row.fleet.toLowerCase().includes(fleet)) return false;
    if (obra && !matchesSearch(row.obra, obra)) return false;
    if (responsible && !matchesSearch(row.responsible, responsible)) return false;
    if (date && row.date !== date) return false;
    return true;
  });
}

export function useDieselFilterChanges(enabled = true) {
  return useQuery({
    queryKey: QK,
    queryFn: async () => enrichDieselFilterChanges(await listDieselFilterChanges({ data: {} })),
    enabled,
    staleTime: 0,
    retry: 1,
    placeholderData: [],
  });
}

export function useDieselFilterActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: (draft: DieselFilterChangeDraft) => createDieselFilterChange({ data: draft }),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: DieselFilterChangePatch }) =>
      updateDieselFilterChange({ data: { id, patch } }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDieselFilterChange({ data: id }),
    onSuccess: invalidate,
  });

  return {
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
