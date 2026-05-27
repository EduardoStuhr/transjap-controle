import { createServerFn } from "@tanstack/react-start";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  equipmentDailyParts,
  fueling,
  type DbEquipmentDailyPart,
  type DbFueling,
} from "@/db/schema";
import { getOptionalD1 } from "@/lib/cf-env";
import { normalizeFleet } from "@/lib/carcara-parser";
import { normalizeEquipmentKey } from "@/lib/equipment-normalization";
import { calculateFuelAllocation } from "@/services/fuelAllocation/calculateFuelAllocation";
import type {
  FuelAllocationAuditResult,
  FuelAllocationResult,
  FuelEntry,
  PDEEntry,
} from "@/services/fuelAllocation/types";

type AllocationSupportScope = {
  analysisIds?: string[];
  fleet?: string;
  sourceFuelingId?: string;
  dateFrom?: string;
  dateTo?: string;
};

type AllocationSupportFilters = {
  dateFrom?: string;
  dateTo?: string;
  obra?: string;
  fleet?: string;
  sourceFuelingId?: string;
  analysisIds?: string[];
};

export type FuelAllocationSupportRow = {
  id: string;
  sourceFuelingId: string;
  equipmentId: string;
  fleet: string;
  pdeId: string | null;
  pdeDate: string;
  obra: string;
  hourmeterStart: number;
  hourmeterEnd: number;
  allocatedHours: number;
  litersAllocated: number;
  costAllocated: number;
  createdAt: string | null;
};

export type FuelAllocationAuditRow = {
  id: string;
  sourceFuelingId: string | null;
  equipmentId: string | null;
  fleet: string | null;
  type: string;
  message: string;
  unresolvedHours: number;
  metadata: string | null;
  createdAt: string | null;
};

const WRITE_BATCH_SIZE = 100;

function sourceFleet(
  row: Pick<DbFueling, "prefix" | "vehicleId" | "plate" | "vehicleType" | "owner">,
) {
  return normalizeEquipmentKey(row.prefix || row.vehicleId || row.plate, {
    source: "fueling",
    description: [row.vehicleType, row.owner].filter(Boolean).join(" "),
  });
}

function pdeFleet(row: Pick<DbEquipmentDailyPart, "fleet">) {
  return normalizeEquipmentKey(row.fleet, "dailyPart");
}

function filterFleet(value: string) {
  return normalizeEquipmentKey(value, "fuelAllocation") || normalizeFleet(value);
}

async function supportSchemaAvailable(d1: D1Database) {
  const row = await d1
    .prepare(
      `SELECT COUNT(*) AS total
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('fuel_allocations', 'fuel_allocation_audit')`,
    )
    .first<{ total: number }>();
  return Number(row?.total ?? 0) === 2;
}

async function runBatch(d1: D1Database, statements: D1PreparedStatement[]) {
  for (let start = 0; start < statements.length; start += WRITE_BATCH_SIZE) {
    await d1.batch(statements.slice(start, start + WRITE_BATCH_SIZE));
  }
}

function allocationId(row: FuelAllocationResult, sequence: number) {
  return `FAL:${row.sourceFuelingId}:${row.pdeId}:${sequence}`;
}

function auditId(row: FuelAllocationAuditResult, sequence: number) {
  return `FAA:${row.sourceFuelingId ?? "UNKNOWN"}:${row.type}:${sequence}`;
}

function analysisSourceWhere(analysisIds: string[]) {
  const clauses = analysisIds.map(() => "(source_fueling_id = ? OR source_fueling_id LIKE ?)");
  const params = analysisIds.flatMap((analysisId) => [analysisId, `${analysisId}:%`]);
  return { sql: clauses.length ? `(${clauses.join(" OR ")})` : "", params };
}

async function deleteCachedResults(
  d1: D1Database,
  fuelingIds: string[],
  scope: AllocationSupportScope,
) {
  const analysisIds = scope.analysisIds?.filter(Boolean) ?? [];
  if (analysisIds.length > 0 && !scope.sourceFuelingId && !scope.dateFrom && !scope.dateTo) {
    const analysisFilter = analysisSourceWhere(analysisIds);
    const fleet = scope.fleet ? filterFleet(scope.fleet) : "";
    const fleetSql = fleet ? " AND fleet = ?" : "";
    const params = fleet ? [...analysisFilter.params, fleet] : analysisFilter.params;
    await runBatch(d1, [
      d1
        .prepare(`DELETE FROM fuel_allocations WHERE ${analysisFilter.sql}${fleetSql}`)
        .bind(...params),
      d1
        .prepare(`DELETE FROM fuel_allocation_audit WHERE ${analysisFilter.sql}${fleetSql}`)
        .bind(...params),
    ]);
    return;
  }

  const sources = [...new Set(fuelingIds)];
  const deletes: D1PreparedStatement[] = [];
  for (let start = 0; start < sources.length; start += WRITE_BATCH_SIZE) {
    const chunk = sources.slice(start, start + WRITE_BATCH_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    deletes.push(
      d1
        .prepare(`DELETE FROM fuel_allocations WHERE source_fueling_id IN (${placeholders})`)
        .bind(...chunk),
      d1
        .prepare(`DELETE FROM fuel_allocation_audit WHERE source_fueling_id IN (${placeholders})`)
        .bind(...chunk),
    );
  }
  if (deletes.length > 0) await runBatch(d1, deletes);
}

async function replaceCachedResults(
  d1: D1Database,
  fuelingIds: string[],
  allocations: FuelAllocationResult[],
  audits: FuelAllocationAuditResult[],
  scope: AllocationSupportScope,
) {
  await deleteCachedResults(d1, fuelingIds, scope);
  const writes: D1PreparedStatement[] = allocations.map((row, index) =>
    d1
      .prepare(
        `INSERT INTO fuel_allocations (
          id, source_fueling_id, equipment_id, fleet, pde_id, pde_date, obra,
          hourmeter_start, hourmeter_end, allocated_hours, liters_allocated, cost_allocated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        allocationId(row, index),
        row.sourceFuelingId,
        row.equipmentId,
        row.fleet,
        row.pdeId,
        row.pdeDate,
        row.obra,
        row.hourmeterStart,
        row.hourmeterEnd,
        row.allocatedHours,
        row.litersAllocated,
        row.costAllocated,
      ),
  );
  writes.push(
    ...audits.map((row, index) =>
      d1
        .prepare(
          `INSERT INTO fuel_allocation_audit (
            id, source_fueling_id, equipment_id, fleet, type, message, unresolved_hours, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          auditId(row, index),
          row.sourceFuelingId ?? null,
          row.equipmentId ?? null,
          row.fleet ?? null,
          row.type,
          row.message,
          row.unresolvedHours,
          row.metadata ? JSON.stringify(row.metadata) : null,
        ),
    ),
  );
  if (writes.length > 0) await runBatch(d1, writes);
}

async function loadSourceData(d1: D1Database, scope: AllocationSupportScope) {
  const db = getDb(d1);
  const analysisIds = scope.analysisIds?.filter(Boolean) ?? [];
  const fuelRows = analysisIds.length
    ? await db.select().from(fueling).where(inArray(fueling.analysisId, analysisIds)).all()
    : await db.select().from(fueling).all();
  const pdeRows = analysisIds.length
    ? await db
        .select()
        .from(equipmentDailyParts)
        .where(inArray(equipmentDailyParts.analysisId, analysisIds))
        .all()
    : await db.select().from(equipmentDailyParts).all();
  const historicalFuelRows = analysisIds.length ? await db.select().from(fueling).all() : fuelRows;
  const selectedFleet = scope.fleet ? filterFleet(scope.fleet) : "";
  const selectedSourceFuelingId = scope.sourceFuelingId?.trim() ?? "";
  const inFuelingDateRange = (row: DbFueling) => {
    const date = row.datetime.slice(0, 10);
    if (scope.dateFrom && date < scope.dateFrom) return false;
    if (scope.dateTo && date > scope.dateTo) return false;
    return true;
  };
  return {
    fuelRows: fuelRows.filter(
      (row) =>
        (!selectedFleet || sourceFleet(row) === selectedFleet) &&
        (!selectedSourceFuelingId || row.id === selectedSourceFuelingId) &&
        inFuelingDateRange(row),
    ),
    pdeRows: pdeRows.filter((row) => !selectedFleet || pdeFleet(row) === selectedFleet),
    historicalFuelRows: historicalFuelRows.filter(
      (row) => !selectedFleet || sourceFleet(row) === selectedFleet,
    ),
  };
}

function fuelEntryFromRow(row: DbFueling): FuelEntry | null {
  const fleet = sourceFleet(row);
  if (!fleet) return null;
  return {
    id: row.id,
    equipmentId: fleet,
    fleet,
    liters: row.liters,
    totalCost: row.total,
    previousHourmeter: row.kmPrevious > 0 ? row.kmPrevious : undefined,
    currentHourmeter: row.kmCurrent,
    date: row.datetime.slice(0, 10),
  };
}

function findPriorFuel(fuel: FuelEntry, historicalFuels: FuelEntry[], selectedIds: Set<string>) {
  return historicalFuels
    .filter(
      (row) =>
        row.equipmentId === fuel.equipmentId &&
        !selectedIds.has(row.id) &&
        (row.date < fuel.date ||
          (row.date === fuel.date && row.currentHourmeter < fuel.currentHourmeter)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.currentHourmeter - b.currentHourmeter)
    .at(-1);
}

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}

function inferPdeHourmeterScale(fuels: FuelEntry[], pdes: PDEEntry[]) {
  const fuelMeters = fuels.flatMap((fuel) =>
    [fuel.previousHourmeter, fuel.currentHourmeter].filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
    ),
  );
  const pdeMeters = pdes.flatMap((pde) =>
    [pde.startHourmeter, pde.endHourmeter].filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
    ),
  );
  if (fuelMeters.length === 0 || pdeMeters.length === 0) return 1;

  const fuelMedian = median(fuelMeters);
  const pdeMedian = median(pdeMeters);
  if (fuelMedian <= 0 || pdeMedian <= 0) return 1;

  const ratio = fuelMedian / pdeMedian;
  if (ratio < 8 || ratio > 12) return 1;

  const scaledMin = Math.min(...pdeMeters) * 10;
  const scaledMax = Math.max(...pdeMeters) * 10;
  const fuelMin = Math.min(...fuelMeters);
  const fuelMax = Math.max(...fuelMeters);
  const overlapsFuelRange = scaledMax >= fuelMin && scaledMin <= fuelMax;
  return overlapsFuelRange ? 10 : 1;
}

function normalizePdeHourmeterScale(fuels: FuelEntry[], pdes: PDEEntry[]) {
  const scale = inferPdeHourmeterScale(fuels, pdes);
  if (scale === 1) return pdes;
  return pdes.map((pde) => ({
    ...pde,
    startHourmeter:
      typeof pde.startHourmeter === "number" ? pde.startHourmeter * scale : pde.startHourmeter,
    endHourmeter: typeof pde.endHourmeter === "number" ? pde.endHourmeter * scale : pde.endHourmeter,
  }));
}

function calculateFromExistingData(
  fuelRows: DbFueling[],
  pdeRows: DbEquipmentDailyPart[],
  historicalFuelRows: DbFueling[],
) {
  const groups = new Map<string, { fuels: FuelEntry[]; pdes: PDEEntry[]; sourceIds: string[] }>();

  for (const row of fuelRows) {
    const fuel = fuelEntryFromRow(row);
    if (!fuel) continue;
    const fleet = fuel.fleet as string;
    const key = `${row.analysisId}:${fleet}`;
    const group = groups.get(key) ?? { fuels: [], pdes: [], sourceIds: [] };
    group.fuels.push(fuel);
    group.sourceIds.push(row.id);
    groups.set(key, group);
  }

  for (const row of pdeRows) {
    const fleet = pdeFleet(row);
    if (!fleet || !row.usedInAnalysis) continue;
    const group = groups.get(`${row.analysisId}:${fleet}`);
    if (!group) continue;
    group.pdes.push({
      id: row.id,
      equipmentId: fleet,
      fleet,
      date: row.date,
      obra: row.obra,
      startHourmeter: row.horimInicial > 0 ? row.horimInicial : undefined,
      endHourmeter: row.horimFinal > 0 ? row.horimFinal : undefined,
      workedHours: row.hours,
    });
  }

  const sourceIds: string[] = [];
  const allocations: FuelAllocationResult[] = [];
  const audits: FuelAllocationAuditResult[] = [];
  const historicalFuels = historicalFuelRows
    .map(fuelEntryFromRow)
    .filter((row): row is FuelEntry => row !== null);
  for (const group of groups.values()) {
    const selectedIds = new Set(group.sourceIds);
    const allocationState = {
      fallbackHoursUsed: new Map<string, number>(),
      usedPdeHourmeterSlices: new Map<string, Array<{ start: number; end: number }>>(),
    };
    const orderedFuel = [...group.fuels].sort(
      (a, b) => a.date.localeCompare(b.date) || a.currentHourmeter - b.currentHourmeter,
    );
    const pdes = normalizePdeHourmeterScale(orderedFuel, group.pdes);
    let previousFuel: FuelEntry | undefined;
    for (const fuel of orderedFuel) {
      previousFuel ??= findPriorFuel(fuel, historicalFuels, selectedIds);
      const calculated = calculateFuelAllocation(fuel, pdes, previousFuel, allocationState);
      allocations.push(...calculated.allocations);
      audits.push(...calculated.audits);
      previousFuel = fuel;
    }
    sourceIds.push(...group.sourceIds);
  }
  return { sourceIds, allocations, audits };
}

function buildFilterQuery(
  table: "fuel_allocations" | "fuel_allocation_audit",
  dateColumn: "pde_date" | "created_at",
  filters: AllocationSupportFilters,
) {
  const where: string[] = [];
  const params: string[] = [];
  if (filters.dateFrom) {
    where.push(`${dateColumn} >= ?`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push(`${dateColumn} <= ?`);
    params.push(filters.dateTo);
  }
  if (filters.fleet) {
    where.push("fleet = ?");
    params.push(filterFleet(filters.fleet));
  }
  if (filters.sourceFuelingId) {
    where.push("source_fueling_id = ?");
    params.push(filters.sourceFuelingId);
  }
  const analysisIds = filters.analysisIds?.filter(Boolean) ?? [];
  if (analysisIds.length > 0) {
    const sourceFilter = analysisSourceWhere(analysisIds);
    where.push(sourceFilter.sql);
    params.push(...sourceFilter.params);
  }
  if (filters.obra && table === "fuel_allocations") {
    where.push("obra = ?");
    params.push(filters.obra);
  }
  return {
    sql: where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

export const recalculateFuelAllocationsSupportFn = createServerFn({ method: "POST" })
  .inputValidator((data: AllocationSupportScope) => data)
  .handler(async ({ data }) => {
    const d1 = getOptionalD1();
    if (!d1) {
      return { totalAllocations: 0, totalAudits: 0, skipped: "no-d1" as const };
    }
    if (!(await supportSchemaAvailable(d1))) {
      return { totalAllocations: 0, totalAudits: 0, skipped: "migration-not-applied" as const };
    }

    const sourceData = await loadSourceData(d1, data);
    const results = calculateFromExistingData(
      sourceData.fuelRows,
      sourceData.pdeRows,
      sourceData.historicalFuelRows,
    );
    await replaceCachedResults(d1, results.sourceIds, results.allocations, results.audits, data);
    return {
      totalAllocations: results.allocations.length,
      totalAudits: results.audits.length,
      fuelingsProcessed: results.sourceIds.length,
    };
  });

export const listFuelAllocationsSupportFn = createServerFn({ method: "POST" })
  .inputValidator((data: AllocationSupportFilters) => data)
  .handler(async ({ data }): Promise<FuelAllocationSupportRow[]> => {
    const d1 = getOptionalD1();
    if (!d1 || !(await supportSchemaAvailable(d1))) return [];
    const filter = buildFilterQuery("fuel_allocations", "pde_date", data);
    const result = await d1
      .prepare(
        `SELECT
          id, source_fueling_id AS sourceFuelingId, equipment_id AS equipmentId, fleet,
          pde_id AS pdeId, pde_date AS pdeDate, obra,
          hourmeter_start AS hourmeterStart, hourmeter_end AS hourmeterEnd,
          allocated_hours AS allocatedHours, liters_allocated AS litersAllocated,
          cost_allocated AS costAllocated, created_at AS createdAt
        FROM fuel_allocations${filter.sql}
        ORDER BY pde_date, fleet, source_fueling_id`,
      )
      .bind(...filter.params)
      .all<FuelAllocationSupportRow>();
    return result.results;
  });

export const listFuelAllocationAuditSupportFn = createServerFn({ method: "POST" })
  .inputValidator((data: AllocationSupportFilters) => data)
  .handler(async ({ data }): Promise<FuelAllocationAuditRow[]> => {
    const d1 = getOptionalD1();
    if (!d1 || !(await supportSchemaAvailable(d1))) return [];
    const filter = buildFilterQuery("fuel_allocation_audit", "created_at", data);
    const result = await d1
      .prepare(
        `SELECT
          id, source_fueling_id AS sourceFuelingId, equipment_id AS equipmentId, fleet,
          type, message, unresolved_hours AS unresolvedHours, metadata, created_at AS createdAt
        FROM fuel_allocation_audit${filter.sql}
        ORDER BY created_at DESC, type, source_fueling_id`,
      )
      .bind(...filter.params)
      .all<FuelAllocationAuditRow>();
    return result.results;
  });
