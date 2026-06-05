import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { equipmentDailyParts, fueling, productionAnalyses, swellFactors, trips } from "@/db/schema";
import { getOptionalD1 } from "@/lib/cf-env";
import { normalizeDateKey, normalizeFleet } from "@/lib/carcara-parser";
import { buildAnalysisSnapshot } from "@/lib/production-analytics";
import { recalculateFuelAttribution } from "@/lib/fuel-attribution";
import {
  calculateCompactedM3,
  displayObraName,
  normalizeObraKey,
} from "@/lib/production-consumption-utils";
import type { ParsedDailyPart, ParsedFueling, ParsedTrip } from "@/lib/carcara-parser";
import type {
  DbEquipmentDailyPart,
  DbFueling,
  DbProductionAnalysis,
  DbSwellFactor,
  DbTrip,
  JsonObject,
} from "@/db/schema";

type DateFilters = {
  dateFrom?: string;
  dateTo?: string;
  analysisId?: string;
  analysisIds?: string[];
};
type AnalysisFilters = { obra?: string; material?: string; dateFrom?: string; dateTo?: string };
type ImportResult = { inserted: number; updated: number; total: number; batchId: string };

export type CreateAnalysisInput = {
  name: string;
  obra: string;
  material: string;
  tipoAnalise?: string;
  dateStart: string;
  dateEnd: string;
  swellFactor: number;
  createdBy?: string;
  context?: JsonObject;
  tripsRows: ParsedTrip[];
  fuelingRows: ParsedFueling[];
  dailyPartRows: ParsedDailyPart[];
};

// Minimal serializable fields returned as preview sample (both RCO and CMB)
export type SamplePreviewRow = {
  id: string;
  obra: string;
  datetime: string;
  material: string;
  cubicMLoose: number;
  liters: number;
};

type PreviewResult = {
  totalRows: number;
  alreadyExists: number;
  willInsert: number;
  sampleNew: SamplePreviewRow[];
};

const D1_INSERT_BATCH_SIZE = 100;
const D1_SELECT_PAGE_SIZE = 2_000;

/**
 * Le tabelas grandes em paginas menores para cada resposta do D1 permanecer limitada.
 * Um limite defensivo evita varrer mais de 100.000 linhas sem um filtro adequado.
 */
async function paginatedSelect<T>(
  query: (limit: number, offset: number) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  for (let pageIndex = 0; pageIndex < 50; pageIndex += 1) {
    const page = await query(D1_SELECT_PAGE_SIZE, offset);
    rows.push(...page);
    if (page.length < D1_SELECT_PAGE_SIZE) break;
    offset += D1_SELECT_PAGE_SIZE;
  }
  if (rows.length > 20_000) {
    console.warn(
      `[paginatedSelect] query retornou ${rows.length} linhas - confira se filtro esta correto`,
    );
  }
  return rows;
}

const localAnalyses: DbProductionAnalysis[] = [];
const localTrips: DbTrip[] = [];
const localFueling: DbFueling[] = [];
const localDailyParts: DbEquipmentDailyPart[] = [];
const localSwellFactors: DbSwellFactor[] = [];

function analysisScopedId(analysisId: string, sourceId: string) {
  return `${analysisId}:${sourceId}`;
}

function uniqueScopedIdFactory(analysisId: string) {
  const counts = new Map<string, number>();
  return (sourceId: string) => {
    const base = analysisScopedId(analysisId, sourceId);
    const nextCount = (counts.get(base) ?? 0) + 1;
    counts.set(base, nextCount);
    return nextCount === 1 ? base : `${base}:${nextCount}`;
  };
}

function errorMessage(err: unknown) {
  if (!(err instanceof Error)) return String(err || "Erro desconhecido.");
  const cause =
    "cause" in err && err.cause
      ? ` (${err.cause instanceof Error ? err.cause.message : String(err.cause)})`
      : "";
  return `${err.message}${cause}`;
}

function createAnalysisFailure(step: string, err: unknown) {
  return new Error(`Nao foi possivel criar a analise (${step}): ${errorMessage(err)}`);
}

function createAnalysisId() {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `ANL-${Date.now().toString(36).toUpperCase()}-${random.toUpperCase()}`;
}

async function runD1Batch(d1: D1Database, statements: D1PreparedStatement[]) {
  for (let i = 0; i < statements.length; i += D1_INSERT_BATCH_SIZE) {
    await d1.batch(statements.slice(i, i + D1_INSERT_BATCH_SIZE));
  }
}

function tripInsertStatement(d1: D1Database, row: DbTrip) {
  return d1
    .prepare(
      `INSERT INTO trips (
        id, analysis_id, datetime, operator, operation, owner, plate, vehicle_id, prefix, driver,
        obra, origin, destination, km, material, weight, cubic_m_loose, swell_factor_applied,
        cubic_m_compacted, unit_price, total, status, import_batch_id, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.analysisId,
      row.datetime,
      row.operator,
      row.operation,
      row.owner,
      row.plate,
      row.vehicleId,
      row.prefix,
      row.driver,
      row.obra,
      row.origin,
      row.destination,
      row.km,
      row.material,
      row.weight,
      row.cubicMLoose,
      row.swellFactorApplied,
      row.cubicMCompacted,
      row.unitPrice,
      row.total,
      row.status,
      row.importBatchId,
      row.importedAt,
    );
}

function fuelingInsertStatement(d1: D1Database, row: DbFueling) {
  return d1
    .prepare(
      `INSERT INTO fueling (
        id, analysis_id, datetime, owner, plate, vehicle_id, prefix, vehicle_type, km_previous,
        km_current, liters, unit_price, total, consumption, standard_consumption, operator, obra,
        status, import_batch_id, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.analysisId,
      row.datetime,
      row.owner,
      row.plate,
      row.vehicleId,
      row.prefix,
      row.vehicleType,
      row.kmPrevious,
      row.kmCurrent,
      row.liters,
      row.unitPrice,
      row.total,
      row.consumption,
      row.standardConsumption,
      row.operator,
      row.obra,
      row.status,
      row.importBatchId,
      row.importedAt,
    );
}

function dailyPartInsertStatement(d1: D1Database, row: DbEquipmentDailyPart) {
  return d1
    .prepare(
      `INSERT INTO equipment_daily_parts (
        id, analysis_id, fleet, fleet_label, date, obra, hours, horim_inicial, horim_final,
        source_sheet, status, used_in_analysis, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.analysisId,
      row.fleet,
      row.fleetLabel,
      row.date,
      row.obra,
      row.hours,
      row.horimInicial,
      row.horimFinal,
      row.sourceSheet,
      row.status,
      row.usedInAnalysis ? 1 : 0,
      row.importedAt,
    );
}

async function insertAnalysisRows(d1: D1Database, rows: DbTrip[], analysisId: string) {
  try {
    await runD1Batch(
      d1,
      rows.map((row) => tripInsertStatement(d1, row)),
    );
  } catch (err) {
    throw createAnalysisFailure(`viagens da analise ${analysisId}`, err);
  }
}

async function insertFuelingRows(d1: D1Database, rows: DbFueling[], analysisId: string) {
  try {
    await runD1Batch(
      d1,
      rows.map((row) => fuelingInsertStatement(d1, row)),
    );
  } catch (err) {
    throw createAnalysisFailure(`abastecimentos da analise ${analysisId}`, err);
  }
}

async function insertDailyPartRows(
  d1: D1Database,
  rows: DbEquipmentDailyPart[],
  analysisId: string,
) {
  try {
    await runD1Batch(
      d1,
      rows.map((row) => dailyPartInsertStatement(d1, row)),
    );
  } catch (err) {
    throw createAnalysisFailure(`apontamentos PDE da analise ${analysisId}`, err);
  }
}

async function cleanupCreatedAnalysis(db: Db, analysisId: string) {
  await db.delete(equipmentDailyParts).where(eq(equipmentDailyParts.analysisId, analysisId));
  await db.delete(fueling).where(eq(fueling.analysisId, analysisId));
  await db.delete(trips).where(eq(trips.analysisId, analysisId));
  await db.delete(productionAnalyses).where(eq(productionAnalyses.id, analysisId));
}

function normalizeLinkedFleet(row: {
  prefix?: string;
  vehicleId?: string;
  plate?: string;
  fleet?: string;
}) {
  return normalizeFleet(row.fleet || row.prefix || row.vehicleId || row.plate || "");
}

function collectRcoObras(data: CreateAnalysisInput) {
  const names = new Map<string, string>();
  const add = (obra: string | null | undefined) => {
    const label = displayObraName(obra);
    if (!label || label === "Sem obra") return;
    const key = normalizeObraKey(label);
    if (!names.has(key)) names.set(key, label);
  };
  data.tripsRows.forEach((row) => add(row.obra));
  return Array.from(names.values()).sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function analysisObraLabel(rcoObras: string[], fallback: string) {
  if (rcoObras.length === 1) return rcoObras[0];
  if (rcoObras.length > 1) return rcoObras.join(" | ");
  return fallback.trim();
}

function makeTripRow(
  row: ParsedTrip,
  analysisId: string,
  batchId: string,
  now: string,
  factor: number,
  scopedId = analysisScopedId(analysisId, row.id),
): DbTrip {
  const compactedM3 = calculateCompactedM3(row.cubicMLoose, factor);
  return {
    id: scopedId,
    analysisId,
    datetime: row.datetime,
    operator: row.operator,
    operation: row.operation,
    owner: row.owner,
    plate: row.plate,
    vehicleId: row.vehicleId,
    prefix: row.prefix,
    driver: row.driver,
    obra: row.obra,
    origin: row.origin,
    destination: row.destination,
    km: row.km,
    material: row.material,
    weight: row.weight,
    cubicMLoose: row.cubicMLoose,
    swellFactorApplied: factor,
    cubicMCompacted: compactedM3,
    unitPrice: row.unitPrice,
    total: row.total || compactedM3 * row.unitPrice,
    status: row.status ?? null,
    importBatchId: batchId,
    importedAt: now,
  };
}

function makeFuelRow(
  row: ParsedFueling,
  analysisId: string,
  batchId: string,
  now: string,
  scopedId = analysisScopedId(analysisId, row.id),
): DbFueling {
  const total = row.total || row.liters * row.unitPrice;
  return {
    id: scopedId,
    analysisId,
    datetime: row.datetime,
    owner: row.owner,
    plate: row.plate,
    vehicleId: row.vehicleId,
    prefix: row.prefix,
    vehicleType: row.vehicleType,
    kmPrevious: row.kmPrevious,
    kmCurrent: row.kmCurrent,
    liters: row.liters,
    unitPrice: row.unitPrice,
    total,
    consumption: row.consumption,
    standardConsumption: row.standardConsumption,
    operator: row.operator,
    obra: row.obra,
    status: row.status ?? null,
    importBatchId: batchId,
    importedAt: now,
  };
}

function makeDailyPartRow(
  row: ParsedDailyPart,
  analysisId: string,
  now: string,
  status: string,
  usedInAnalysis: boolean,
  scopedId = analysisScopedId(analysisId, `${row.fleet}:${row.date}:${row.sourceSheet}`),
): DbEquipmentDailyPart {
  return {
    id: scopedId,
    analysisId,
    fleet: row.fleet,
    fleetLabel: row.fleetLabel,
    date: row.date,
    obra: row.obra,
    hours: row.hours,
    horimInicial: row.horimInicial ?? 0,
    horimFinal: row.horimFinal ?? 0,
    sourceSheet: row.sourceSheet,
    status,
    usedInAnalysis,
    importedAt: now,
  };
}

function importedDateRange(rows: Array<{ datetime?: string }>) {
  const dates = rows
    .map((row) => normalizeDateKey(row.datetime))
    .filter(Boolean)
    .sort();
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
}

function buildAnalysisFromImports(data: CreateAnalysisInput, id: string, now: string) {
  const batchId = `BATCH-${Date.now()}`;
  const factor = Number.isFinite(data.swellFactor) ? data.swellFactor : 0.3;
  const range = importedDateRange([...data.tripsRows, ...data.fuelingRows]);
  const rcoObras = collectRcoObras(data);
  const isMultiObra = rcoObras.length > 1;
  const visibleObra = analysisObraLabel(rcoObras, data.obra);
  const analysis: DbProductionAnalysis = {
    id,
    name: data.name.trim(),
    obra: visibleObra,
    material: data.material.trim(),
    tipoAnalise: data.tipoAnalise?.trim() || "operacional",
    dateStart: data.dateStart || range?.start || now.slice(0, 10),
    dateEnd: data.dateEnd || range?.end || data.dateStart || now.slice(0, 10),
    swellFactor: factor,
    metrics: {},
    aggregateMetrics: [],
    machineMetrics: [],
    charts: {},
    audit: [],
    context: {
      ...(data.context ?? {}),
      isMultiObra,
      obras: rcoObras,
      obraMode: isMultiObra ? "multiobra" : "single",
      obraLabel: data.obra.trim(),
      obraSource: "rco",
    },
    createdAt: now,
    createdBy: data.createdBy ?? "",
  };

  const nextTripId = uniqueScopedIdFactory(id);
  const nextFuelId = uniqueScopedIdFactory(id);
  const nextDailyPartId = uniqueScopedIdFactory(id);
  const tripRows = data.tripsRows.map((row) =>
    makeTripRow(row, id, batchId, now, factor, nextTripId(row.id)),
  );
  const fuelRows = data.fuelingRows.map((row) =>
    makeFuelRow(row, id, batchId, now, nextFuelId(row.id)),
  );
  const fueledFleets = new Set(
    fuelRows.map((row) => normalizeFleet(row.prefix || row.vehicleId || row.plate)).filter(Boolean),
  );
  const fueledDates = new Set(
    fuelRows.map((row) => normalizeDateKey(row.datetime)).filter(Boolean),
  );

  const dailyRows = data.dailyPartRows.map((row) => {
    let status = "OK";
    let used = true;
    if (fueledFleets.size > 0 && !fueledFleets.has(row.fleet)) {
      status = "Sem abastecimento";
      used = false;
    } else if (!row.obra.trim()) {
      status = "Sem obra informada";
    } else if (fueledDates.size > 0 && !fueledDates.has(row.date)) {
      status = "OK";
    }
    return makeDailyPartRow(
      row,
      id,
      now,
      status,
      used,
      nextDailyPartId(`${row.fleet}:${row.date}:${row.sourceSheet}`),
    );
  });

  const dailyKeys = new Set(
    dailyRows
      .filter((row) => row.usedInAnalysis)
      .map((row) => `${row.fleet}|${row.date}|${normalizeObraKey(row.obra)}`),
  );
  const missingRows: DbEquipmentDailyPart[] = [];
  fuelRows.forEach((row) => {
    const fleet = normalizeFleet(row.prefix || row.vehicleId || row.plate);
    const date = normalizeDateKey(row.datetime);
    if (!fleet || !date || dailyKeys.has(`${fleet}|${date}|${normalizeObraKey(row.obra)}`)) return;
    missingRows.push({
      id: analysisScopedId(id, `missing:${fleet}:${date}:${row.id}`),
      analysisId: id,
      fleet,
      fleetLabel: row.prefix || row.vehicleId || row.plate,
      date,
      obra: row.obra,
      hours: 0,
      horimInicial: 0,
      horimFinal: 0,
      sourceSheet: "",
      status: "Sem horas na PDE",
      usedInAnalysis: false,
      importedAt: now,
    });
  });
  const dailyPartRows = [...dailyRows, ...missingRows];
  const snapshot = buildAnalysisSnapshot({
    analysis,
    trips: tripRows,
    fueling: fuelRows,
    dailyParts: dailyPartRows,
  });
  const analysisWithSnapshot: DbProductionAnalysis = {
    ...analysis,
    metrics: snapshot.metrics as unknown as JsonObject,
    aggregateMetrics: snapshot.aggregateMetrics as unknown as JsonObject[],
    machineMetrics: snapshot.machineMetrics as unknown as JsonObject[],
    charts: snapshot.charts as unknown as JsonObject,
    audit: snapshot.audit as unknown as JsonObject[],
    context: {
      ...(snapshot.context as unknown as JsonObject),
      ...(analysis.context as unknown as JsonObject),
      obras: rcoObras,
      isMultiObra,
      obraMode: isMultiObra ? "multiobra" : "single",
      obraLabel: data.obra.trim(),
      obraSource: "rco",
    },
  };
  const productionRows = tripRows;
  const consumptionRows = fuelRows;
  const equipmentRows = dailyPartRows.filter((row) => row.usedInAnalysis);
  const trucks = [
    ...new Set(
      productionRows.map((row) => row.prefix || row.vehicleId || row.plate).filter(Boolean),
    ),
  ];
  const metrics = snapshot.metrics;

  return {
    id,
    name: analysis.name,
    dateStart: analysis.dateStart,
    dateEnd: analysis.dateEnd,
    obra: analysis.obra,
    material: analysis.material,
    equipment: equipmentRows,
    trucks,
    metrics,
    productionRows,
    consumptionRows,
    equipmentRows,
    truckRows: productionRows,
    auditRows: dailyPartRows,
    createdAt: now,
    analysis: analysisWithSnapshot,
    tripRows,
    fuelRows,
    dailyPartRows,
  };
}

function filterByDate<T extends { datetime: string }>(rows: T[], filters: DateFilters): T[] {
  return rows.filter((r) => {
    if (filters.dateFrom && r.datetime < filters.dateFrom) return false;
    if (filters.dateTo && r.datetime > `${filters.dateTo}T23:59:59.999Z`) return false;
    return true;
  });
}

export const listDailyParts = createServerFn({ method: "POST" })
  .inputValidator((data: DateFilters) => data)
  .handler(async ({ data }): Promise<DbEquipmentDailyPart[]> => {
    const d1 = getOptionalD1();
    if (!d1) {
      const ids = data.analysisIds?.filter(Boolean);
      return localDailyParts.filter((row) => {
        if (data.analysisId && row.analysisId !== data.analysisId) return false;
        if (ids?.length && !ids.includes(row.analysisId)) return false;
        if (data.dateFrom && row.date < data.dateFrom) return false;
        if (data.dateTo && row.date > data.dateTo) return false;
        return true;
      });
    }
    const db = getDb(d1);
    const conditions: SQL[] = [];
    const ids = data.analysisIds?.filter(Boolean);
    if (data.analysisId) conditions.push(eq(equipmentDailyParts.analysisId, data.analysisId));
    if (ids?.length) conditions.push(inArray(equipmentDailyParts.analysisId, ids));
    if (data.dateFrom) conditions.push(gte(equipmentDailyParts.date, data.dateFrom));
    if (data.dateTo) conditions.push(lte(equipmentDailyParts.date, data.dateTo));
    return paginatedSelect<DbEquipmentDailyPart>((limit, offset) =>
      conditions.length
        ? db
            .select()
            .from(equipmentDailyParts)
            .where(and(...conditions))
            .orderBy(asc(equipmentDailyParts.id))
            .limit(limit)
            .offset(offset)
            .all()
        : db
            .select()
            .from(equipmentDailyParts)
            .orderBy(asc(equipmentDailyParts.id))
            .limit(limit)
            .offset(offset)
            .all(),
    );
  });

export const listAnalyses = createServerFn({ method: "POST" })
  .inputValidator((data: AnalysisFilters) => data)
  .handler(async ({ data }): Promise<DbProductionAnalysis[]> => {
    const d1 = getOptionalD1();
    if (!d1) {
      return localAnalyses
        .filter((analysis) => {
          if (data.obra && analysis.obra !== data.obra) return false;
          if (data.material && analysis.material !== data.material) return false;
          if (data.dateFrom && analysis.dateEnd < data.dateFrom) return false;
          if (data.dateTo && analysis.dateStart > data.dateTo) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    const db = getDb(d1);
    const conditions = [];
    if (data.obra) conditions.push(eq(productionAnalyses.obra, data.obra));
    if (data.material) conditions.push(eq(productionAnalyses.material, data.material));
    if (data.dateFrom) conditions.push(gte(productionAnalyses.dateEnd, data.dateFrom));
    if (data.dateTo) conditions.push(lte(productionAnalyses.dateStart, data.dateTo));
    const rows = conditions.length
      ? await db
          .select()
          .from(productionAnalyses)
          .where(and(...conditions))
          .orderBy(desc(productionAnalyses.createdAt))
          .all()
      : await db
          .select()
          .from(productionAnalyses)
          .orderBy(desc(productionAnalyses.createdAt))
          .all();
    return rows;
  });

export const getAnalysis = createServerFn({ method: "POST" })
  .inputValidator((data: { analysisId: string }) => data)
  .handler(async ({ data }): Promise<DbProductionAnalysis | null> => {
    const d1 = getOptionalD1();
    if (!d1) return localAnalyses.find((analysis) => analysis.id === data.analysisId) ?? null;
    const db = getDb(d1);
    return (
      (await db
        .select()
        .from(productionAnalyses)
        .where(eq(productionAnalyses.id, data.analysisId))
        .get()) ?? null
    );
  });

export const listTrips = createServerFn({ method: "POST" })
  .inputValidator((data: DateFilters) => data)
  .handler(async ({ data }): Promise<DbTrip[]> => {
    const d1 = getOptionalD1();
    if (!d1) {
      const scoped = data.analysisId
        ? localTrips.filter((r) => r.analysisId === data.analysisId)
        : data.analysisIds?.length
          ? localTrips.filter((r) => data.analysisIds?.includes(r.analysisId))
          : localTrips;
      return filterByDate(scoped, data);
    }

    const db = getDb(d1);
    const conditions: SQL[] = [];
    if (data.analysisId) conditions.push(eq(trips.analysisId, data.analysisId));
    if (data.analysisIds?.length) conditions.push(inArray(trips.analysisId, data.analysisIds));
    if (data.dateFrom) conditions.push(gte(trips.datetime, data.dateFrom));
    if (data.dateTo) conditions.push(lte(trips.datetime, `${data.dateTo}T23:59:59.999Z`));
    return paginatedSelect<DbTrip>((limit, offset) =>
      conditions.length
        ? db
            .select()
            .from(trips)
            .where(and(...conditions))
            .orderBy(asc(trips.id))
            .limit(limit)
            .offset(offset)
            .all()
        : db.select().from(trips).orderBy(asc(trips.id)).limit(limit).offset(offset).all(),
    );
  });

export const listFueling = createServerFn({ method: "POST" })
  .inputValidator((data: DateFilters) => data)
  .handler(async ({ data }): Promise<DbFueling[]> => {
    const d1 = getOptionalD1();
    if (!d1) {
      const scoped = data.analysisId
        ? localFueling.filter((r) => r.analysisId === data.analysisId)
        : data.analysisIds?.length
          ? localFueling.filter((r) => data.analysisIds?.includes(r.analysisId))
          : localFueling;
      return filterByDate(scoped, data);
    }

    const db = getDb(d1);
    const conditions: SQL[] = [];
    if (data.analysisId) conditions.push(eq(fueling.analysisId, data.analysisId));
    if (data.analysisIds?.length) conditions.push(inArray(fueling.analysisId, data.analysisIds));
    if (data.dateFrom) conditions.push(gte(fueling.datetime, data.dateFrom));
    if (data.dateTo) conditions.push(lte(fueling.datetime, `${data.dateTo}T23:59:59.999Z`));
    return paginatedSelect<DbFueling>((limit, offset) =>
      conditions.length
        ? db
            .select()
            .from(fueling)
            .where(and(...conditions))
            .orderBy(asc(fueling.id))
            .limit(limit)
            .offset(offset)
            .all()
        : db.select().from(fueling).orderBy(asc(fueling.id)).limit(limit).offset(offset).all(),
    );
  });

export const listSwellFactors = createServerFn({ method: "GET" }).handler(
  async (): Promise<DbSwellFactor[]> => {
    const d1 = getOptionalD1();
    if (!d1) return localSwellFactors;
    const db = getDb(d1);
    return db.select().from(swellFactors).all();
  },
);

export const upsertSwellFactor = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { obra: string; material: string; factor: number; updatedBy?: string }) => data,
  )
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    const row: DbSwellFactor = {
      obra: data.obra,
      material: data.material,
      factor: data.factor,
      updatedAt: now,
      updatedBy: data.updatedBy ?? "",
    };
    const d1 = getOptionalD1();
    if (!d1) {
      const idx = localSwellFactors.findIndex(
        (sf) => sf.obra === data.obra && sf.material === data.material,
      );
      if (idx >= 0) localSwellFactors[idx] = row;
      else localSwellFactors.push(row);
      return { ok: true };
    }

    const db = getDb(d1);
    await db
      .insert(swellFactors)
      .values(row)
      .onConflictDoUpdate({
        target: [swellFactors.obra, swellFactors.material],
        set: { factor: data.factor, updatedAt: now, updatedBy: data.updatedBy ?? "" },
      });
    return { ok: true };
  });

export const previewImport = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      rows: Array<{
        id: string;
        obra?: string;
        datetime?: string;
        material?: string;
        cubicMLoose?: number;
        liters?: number;
      }>;
      type: "trips" | "fueling";
      analysisId?: string;
    }) => data,
  )
  .handler(async ({ data }): Promise<PreviewResult> => {
    const ids = data.rows
      .map((r) => (data.analysisId ? analysisScopedId(data.analysisId, r.id) : r.id))
      .filter(Boolean);
    const d1 = getOptionalD1();
    let existingCount = 0;

    if (d1) {
      const db = getDb(d1);
      const table = data.type === "trips" ? trips : fueling;
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const existing = await db
          .select({ id: table.id })
          .from(table)
          .where(inArray(table.id, chunk))
          .all();
        existingCount += existing.length;
      }
    } else {
      const localArr = data.type === "trips" ? localTrips : localFueling;
      const idSet = new Set(ids);
      existingCount = localArr.filter((r) => idSet.has(r.id)).length;
    }

    const totalRows = data.rows.length;
    const willInsert = totalRows - existingCount;
    const sampleNew: SamplePreviewRow[] = data.rows.slice(0, 3).map((r) => ({
      id: String(r.id ?? ""),
      obra: String(r.obra ?? ""),
      datetime: String(r.datetime ?? ""),
      material: String(r.material ?? ""),
      cubicMLoose: Number(r.cubicMLoose ?? 0),
      liters: Number(r.liters ?? 0),
    }));

    return { totalRows, alreadyExists: existingCount, willInsert, sampleNew };
  });

export const createAnalysis = createServerFn({ method: "POST" })
  .inputValidator((data: CreateAnalysisInput) => data)
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    const id = createAnalysisId();
    const built = buildAnalysisFromImports(data, id, now);
    const { analysis, tripRows, fuelRows, dailyPartRows, metrics } = built;

    const d1 = getOptionalD1();
    if (!d1) {
      localAnalyses.unshift(analysis);
      localTrips.push(...tripRows);
      localFueling.push(...fuelRows);
      localDailyParts.push(...dailyPartRows);
      return {
        analysisId: id,
        trips: tripRows.length,
        fueling: fuelRows.length,
        dailyParts: dailyPartRows.filter((row) => row.usedInAnalysis).length,
        compactedM3: metrics.compactedM3,
        liters: metrics.liters,
        metrics,
      };
    }

    const db = getDb(d1);
    try {
      await db.insert(productionAnalyses).values(analysis);
    } catch (err) {
      throw createAnalysisFailure("cadastro da analise", err);
    }

    try {
      await insertAnalysisRows(d1, tripRows, id);
      await insertFuelingRows(d1, fuelRows, id);
      await insertDailyPartRows(d1, dailyPartRows, id);
    } catch (err) {
      try {
        await cleanupCreatedAnalysis(db, id);
      } catch (cleanupErr) {
        console.error("[production-consumption] cleanup on createAnalysis failed", cleanupErr);
      }
      throw err;
    }

    const affectedFleets = Array.from(
      new Set(
        [
          ...fuelRows.map((r) => normalizeFleet(r.prefix || r.vehicleId || r.plate)),
          ...dailyPartRows.map((r) => normalizeFleet(r.fleet)),
        ].filter(Boolean),
      ),
    );
    if (affectedFleets.length > 0) {
      try {
        await recalculateFuelAttribution(db, {
          fleets: affectedFleets,
          analysisIds: [id],
          deleteFirst: false,
        });
      } catch (err) {
        console.error("[fuel-attribution] recalc on createAnalysis failed", err);
      }
    }

    return {
      analysisId: id,
      trips: tripRows.length,
      fueling: fuelRows.length,
      dailyParts: dailyPartRows.filter((row) => row.usedInAnalysis).length,
      compactedM3: metrics.compactedM3,
      liters: metrics.liters,
      metrics,
    };
  });

export const deleteAnalysis = createServerFn({ method: "POST" })
  .inputValidator((data: { analysisId: string }) => data)
  .handler(async ({ data }) => {
    const analysisId = data.analysisId?.trim();
    if (!analysisId) throw new Error("Informe a analise que sera excluida.");

    const d1 = getOptionalD1();
    if (!d1) {
      const analysisIndex = localAnalyses.findIndex((analysis) => analysis.id === analysisId);
      if (analysisIndex < 0) throw new Error("Analise nao encontrada.");
      localAnalyses.splice(analysisIndex, 1);

      const removeLocalRows = <T extends { analysisId: string }>(rows: T[]) => {
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (rows[i].analysisId === analysisId) rows.splice(i, 1);
        }
      };
      removeLocalRows(localTrips);
      removeLocalRows(localFueling);
      removeLocalRows(localDailyParts);
      return { ok: true, analysisId };
    }

    const db = getDb(d1);
    const existing = await db
      .select({ id: productionAnalyses.id })
      .from(productionAnalyses)
      .where(eq(productionAnalyses.id, analysisId))
      .get();
    if (!existing) throw new Error("Analise nao encontrada.");

    const [linkedFuelRows, linkedDailyRows] = await Promise.all([
      db
        .select({
          prefix: fueling.prefix,
          vehicleId: fueling.vehicleId,
          plate: fueling.plate,
        })
        .from(fueling)
        .where(eq(fueling.analysisId, analysisId))
        .all(),
      db
        .select({ fleet: equipmentDailyParts.fleet })
        .from(equipmentDailyParts)
        .where(eq(equipmentDailyParts.analysisId, analysisId))
        .all(),
    ]);

    const affectedFleets = Array.from(
      new Set([...linkedFuelRows, ...linkedDailyRows].map(normalizeLinkedFleet).filter(Boolean)),
    );

    try {
      await db.delete(equipmentDailyParts).where(eq(equipmentDailyParts.analysisId, analysisId));
      await db.delete(fueling).where(eq(fueling.analysisId, analysisId));
      await db.delete(trips).where(eq(trips.analysisId, analysisId));
      await db.delete(productionAnalyses).where(eq(productionAnalyses.id, analysisId));
    } catch (err) {
      throw new Error(`Nao foi possivel excluir a analise: ${errorMessage(err)}`);
    }

    if (affectedFleets.length > 0) {
      try {
        await recalculateFuelAttribution(db, { fleets: affectedFleets, deleteFirst: true });
      } catch (err) {
        console.error("[fuel-attribution] recalc on deleteAnalysis failed", err);
      }
    }

    return { ok: true, analysisId };
  });

export const importTrips = createServerFn({ method: "POST" })
  .inputValidator((data: { rows: ParsedTrip[]; batchId: string; analysisId?: string }) => data)
  .handler(async ({ data }): Promise<ImportResult> => {
    const now = new Date().toISOString();
    const analysisId = data.analysisId ?? "legacy";
    const d1 = getOptionalD1();

    if (!d1) {
      const sfMap = new Map(
        localSwellFactors.map((sf) => [`${sf.obra}|${sf.material}`, sf.factor]),
      );
      let inserted = 0;
      let updated = 0;
      for (const row of data.rows) {
        const factor = sfMap.get(`${row.obra}|${row.material}`) ?? 0.3;
        const tripRow = makeTripRow(row, analysisId, data.batchId, now, factor);
        const idx = localTrips.findIndex((t) => t.id === tripRow.id);
        if (idx >= 0) {
          localTrips[idx] = tripRow;
          updated++;
        } else {
          localTrips.push(tripRow);
          inserted++;
        }
      }
      return { inserted, updated, total: data.rows.length, batchId: data.batchId };
    }

    const db = getDb(d1);
    const allSf = await db.select().from(swellFactors).all();
    const sfMap = new Map(allSf.map((sf) => [`${sf.obra}|${sf.material}`, sf.factor]));
    const tripRows = data.rows.map((row) =>
      makeTripRow(
        row,
        analysisId,
        data.batchId,
        now,
        sfMap.get(`${row.obra}|${row.material}`) ?? 0.3,
      ),
    );

    const ids = tripRows.map((r) => r.id);
    const existingSet = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
      const existing = await db
        .select({ id: trips.id })
        .from(trips)
        .where(inArray(trips.id, ids.slice(i, i + 500)))
        .all();
      existing.forEach((e) => existingSet.add(e.id));
    }

    for (let i = 0; i < tripRows.length; i += 50) {
      await db
        .insert(trips)
        .values(tripRows.slice(i, i + 50))
        .onConflictDoUpdate({
          target: trips.id,
          set: {
            analysisId: sql`excluded.analysis_id`,
            datetime: sql`excluded.datetime`,
            operator: sql`excluded.operator`,
            operation: sql`excluded.operation`,
            owner: sql`excluded.owner`,
            plate: sql`excluded.plate`,
            vehicleId: sql`excluded.vehicle_id`,
            prefix: sql`excluded.prefix`,
            driver: sql`excluded.driver`,
            obra: sql`excluded.obra`,
            origin: sql`excluded.origin`,
            destination: sql`excluded.destination`,
            km: sql`excluded.km`,
            material: sql`excluded.material`,
            weight: sql`excluded.weight`,
            cubicMLoose: sql`excluded.cubic_m_loose`,
            swellFactorApplied: sql`excluded.swell_factor_applied`,
            cubicMCompacted: sql`excluded.cubic_m_compacted`,
            unitPrice: sql`excluded.unit_price`,
            total: sql`excluded.total`,
            status: sql`excluded.status`,
            importBatchId: sql`excluded.import_batch_id`,
            importedAt: sql`excluded.imported_at`,
          },
        });
    }

    return {
      inserted: data.rows.length - existingSet.size,
      updated: existingSet.size,
      total: data.rows.length,
      batchId: data.batchId,
    };
  });

export const importFueling = createServerFn({ method: "POST" })
  .inputValidator((data: { rows: ParsedFueling[]; batchId: string; analysisId?: string }) => data)
  .handler(async ({ data }): Promise<ImportResult> => {
    const now = new Date().toISOString();
    const analysisId = data.analysisId ?? "legacy";
    const d1 = getOptionalD1();

    if (!d1) {
      let inserted = 0;
      let updated = 0;
      for (const row of data.rows) {
        const fuelRow = makeFuelRow(row, analysisId, data.batchId, now);
        const idx = localFueling.findIndex((f) => f.id === fuelRow.id);
        if (idx >= 0) {
          localFueling[idx] = fuelRow;
          updated++;
        } else {
          localFueling.push(fuelRow);
          inserted++;
        }
      }
      return { inserted, updated, total: data.rows.length, batchId: data.batchId };
    }

    const db = getDb(d1);
    const fuelRows = data.rows.map((row) => makeFuelRow(row, analysisId, data.batchId, now));
    const ids = fuelRows.map((r) => r.id);
    const existingSet = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
      const existing = await db
        .select({ id: fueling.id })
        .from(fueling)
        .where(inArray(fueling.id, ids.slice(i, i + 500)))
        .all();
      existing.forEach((e) => existingSet.add(e.id));
    }

    for (let i = 0; i < fuelRows.length; i += 50) {
      await db
        .insert(fueling)
        .values(fuelRows.slice(i, i + 50))
        .onConflictDoUpdate({
          target: fueling.id,
          set: {
            analysisId: sql`excluded.analysis_id`,
            datetime: sql`excluded.datetime`,
            owner: sql`excluded.owner`,
            plate: sql`excluded.plate`,
            vehicleId: sql`excluded.vehicle_id`,
            prefix: sql`excluded.prefix`,
            vehicleType: sql`excluded.vehicle_type`,
            kmPrevious: sql`excluded.km_previous`,
            kmCurrent: sql`excluded.km_current`,
            liters: sql`excluded.liters`,
            unitPrice: sql`excluded.unit_price`,
            total: sql`excluded.total`,
            consumption: sql`excluded.consumption`,
            standardConsumption: sql`excluded.standard_consumption`,
            operator: sql`excluded.operator`,
            obra: sql`excluded.obra`,
            status: sql`excluded.status`,
            importBatchId: sql`excluded.import_batch_id`,
            importedAt: sql`excluded.imported_at`,
          },
        });
    }

    const affectedFleets = Array.from(
      new Set(
        fuelRows.map((r) => normalizeFleet(r.prefix || r.vehicleId || r.plate)).filter(Boolean),
      ),
    );
    if (affectedFleets.length > 0) {
      try {
        await recalculateFuelAttribution(db, { fleets: affectedFleets, deleteFirst: true });
      } catch (err) {
        console.error("[fuel-attribution] recalc on importFueling failed", err);
      }
    }

    return {
      inserted: data.rows.length - existingSet.size,
      updated: existingSet.size,
      total: data.rows.length,
      batchId: data.batchId,
    };
  });
