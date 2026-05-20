import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { equipmentDailyParts, fueling, productionAnalyses, swellFactors, trips } from "@/db/schema";
import { getOptionalD1 } from "@/lib/cf-env";
import { normalizeDateKey, normalizeFleet } from "@/lib/carcara-parser";
import type { ParsedDailyPart, ParsedFueling, ParsedTrip } from "@/lib/carcara-parser";
import type {
  DbEquipmentDailyPart,
  DbFueling,
  DbProductionAnalysis,
  DbSwellFactor,
  DbTrip,
} from "@/db/schema";

type DateFilters = { dateFrom?: string; dateTo?: string; analysisId?: string };
type AnalysisFilters = { obra?: string; material?: string; dateFrom?: string; dateTo?: string };
type ImportResult = { inserted: number; updated: number; total: number; batchId: string };

export type CreateAnalysisInput = {
  name: string;
  obra: string;
  material: string;
  dateStart: string;
  dateEnd: string;
  swellFactor: number;
  createdBy?: string;
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

const localAnalyses: DbProductionAnalysis[] = [];
const localTrips: DbTrip[] = [];
const localFueling: DbFueling[] = [];
const localDailyParts: DbEquipmentDailyPart[] = [];
const localSwellFactors: DbSwellFactor[] = [];

function analysisScopedId(analysisId: string, sourceId: string) {
  return `${analysisId}:${sourceId}`;
}

function makeTripRow(
  row: ParsedTrip,
  analysisId: string,
  batchId: string,
  now: string,
  factor: number,
): DbTrip {
  const compactedM3 = row.cubicMLoose > 0 ? row.cubicMLoose / (1 + factor) : 0;
  return {
    id: analysisScopedId(analysisId, row.id),
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
): DbFueling {
  const total = row.total || row.liters * row.unitPrice;
  return {
    id: analysisScopedId(analysisId, row.id),
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
): DbEquipmentDailyPart {
  return {
    id: analysisScopedId(analysisId, `${row.fleet}:${row.date}:${row.sourceSheet}`),
    analysisId,
    fleet: row.fleet,
    fleetLabel: row.fleetLabel,
    date: row.date,
    obra: row.obra,
    hours: row.hours,
    sourceSheet: row.sourceSheet,
    status,
    usedInAnalysis,
    importedAt: now,
  };
}

function obraMatches(rowObra: string, analysisObra: string) {
  if (!analysisObra || !rowObra) return true;
  return rowObra.trim().toLowerCase() === analysisObra.trim().toLowerCase();
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
  const analysis: DbProductionAnalysis = {
    id,
    name: data.name.trim(),
    obra: data.obra.trim(),
    material: data.material.trim(),
    dateStart: data.dateStart || range?.start || now.slice(0, 10),
    dateEnd: data.dateEnd || range?.end || data.dateStart || now.slice(0, 10),
    swellFactor: factor,
    createdAt: now,
    createdBy: data.createdBy ?? "",
  };

  const tripRows = data.tripsRows.map((row) => makeTripRow(row, id, batchId, now, factor));
  const fuelRows = data.fuelingRows.map((row) => makeFuelRow(row, id, batchId, now));
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
    } else if (!obraMatches(row.obra, analysis.obra)) {
      status = "Obra divergente";
      used = false;
    } else if (fueledDates.size > 0 && !fueledDates.has(row.date)) {
      status = "OK";
    }
    return makeDailyPartRow(row, id, now, status, used);
  });

  const dailyKeys = new Set(
    dailyRows.filter((row) => row.usedInAnalysis).map((row) => `${row.fleet}|${row.date}`),
  );
  const missingRows: DbEquipmentDailyPart[] = [];
  fuelRows.forEach((row) => {
    const fleet = normalizeFleet(row.prefix || row.vehicleId || row.plate);
    const date = normalizeDateKey(row.datetime);
    if (!fleet || !date || dailyKeys.has(`${fleet}|${date}`)) return;
    missingRows.push({
      id: analysisScopedId(id, `missing:${fleet}:${date}:${row.id}`),
      analysisId: id,
      fleet,
      fleetLabel: row.prefix || row.vehicleId || row.plate,
      date,
      obra: row.obra,
      hours: 0,
      sourceSheet: "",
      status: "Sem horas na PDE",
      usedInAnalysis: false,
      importedAt: now,
    });
  });
  const dailyPartRows = [...dailyRows, ...missingRows];
  const productionRows = tripRows;
  const consumptionRows = fuelRows;
  const equipmentRows = dailyPartRows.filter((row) => row.usedInAnalysis);
  const trucks = [
    ...new Set(
      productionRows.map((row) => row.prefix || row.vehicleId || row.plate).filter(Boolean),
    ),
  ];
  const looseM3 = productionRows.reduce((sum, row) => sum + row.cubicMLoose, 0);
  const compactedM3 = productionRows.reduce((sum, row) => sum + row.cubicMCompacted, 0);
  const dieselLiters = consumptionRows.reduce((sum, row) => sum + row.liters, 0);
  const fuelCost = consumptionRows.reduce((sum, row) => sum + row.total, 0);
  const revenue = productionRows.reduce((sum, row) => sum + row.total, 0);
  const hours = equipmentRows.reduce((sum, row) => sum + row.hours, 0);
  const metrics = {
    viagensTotais: productionRows.length,
    dieselConsumidoLitros: dieselLiters,
    horasEquipamentos: hours,
    producaoSoltaM3: looseM3,
    producaoCompactadaM3: compactedM3,
    custoTotalCombustivel: fuelCost,
    consumoMedioLitroPorM3: compactedM3 > 0 ? dieselLiters / compactedM3 : 0,
    custoMedioRsPorLitro: dieselLiters > 0 ? fuelCost / dieselLiters : 0,
    faturamento: revenue,
    margemBruta: revenue - fuelCost,
  };

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
    analysis,
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
  .inputValidator((data: { analysisId: string }) => data)
  .handler(async ({ data }): Promise<DbEquipmentDailyPart[]> => {
    const d1 = getOptionalD1();
    if (!d1) return localDailyParts.filter((row) => row.analysisId === data.analysisId);
    const db = getDb(d1);
    return db
      .select()
      .from(equipmentDailyParts)
      .where(eq(equipmentDailyParts.analysisId, data.analysisId))
      .all();
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
          .all()
      : await db.select().from(productionAnalyses).all();
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
        : localTrips;
      return filterByDate(scoped, data);
    }

    const db = getDb(d1);
    const conditions = [];
    if (data.analysisId) conditions.push(eq(trips.analysisId, data.analysisId));
    if (data.dateFrom) conditions.push(gte(trips.datetime, data.dateFrom));
    if (data.dateTo) conditions.push(lte(trips.datetime, `${data.dateTo}T23:59:59.999Z`));
    return conditions.length
      ? db
          .select()
          .from(trips)
          .where(and(...conditions))
          .all()
      : db.select().from(trips).all();
  });

export const listFueling = createServerFn({ method: "POST" })
  .inputValidator((data: DateFilters) => data)
  .handler(async ({ data }): Promise<DbFueling[]> => {
    const d1 = getOptionalD1();
    if (!d1) {
      const scoped = data.analysisId
        ? localFueling.filter((r) => r.analysisId === data.analysisId)
        : localFueling;
      return filterByDate(scoped, data);
    }

    const db = getDb(d1);
    const conditions = [];
    if (data.analysisId) conditions.push(eq(fueling.analysisId, data.analysisId));
    if (data.dateFrom) conditions.push(gte(fueling.datetime, data.dateFrom));
    if (data.dateTo) conditions.push(lte(fueling.datetime, `${data.dateTo}T23:59:59.999Z`));
    return conditions.length
      ? db
          .select()
          .from(fueling)
          .where(and(...conditions))
          .all()
      : db.select().from(fueling).all();
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
    const id = `ANL-${Date.now().toString(36).toUpperCase()}`;
    const built = buildAnalysisFromImports(data, id, now);
    const { analysis, tripRows, fuelRows, dailyPartRows, metrics } = built;
    console.log("metrics", metrics);

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
        compactedM3: metrics.producaoCompactadaM3,
        liters: metrics.dieselConsumidoLitros,
        metrics,
      };
    }

    const db = getDb(d1);
    await db.insert(productionAnalyses).values(analysis);

    const INSERT_CHUNK = 50;
    for (let i = 0; i < tripRows.length; i += INSERT_CHUNK) {
      await db.insert(trips).values(tripRows.slice(i, i + INSERT_CHUNK));
    }
    for (let i = 0; i < fuelRows.length; i += INSERT_CHUNK) {
      await db.insert(fueling).values(fuelRows.slice(i, i + INSERT_CHUNK));
    }
    for (let i = 0; i < dailyPartRows.length; i += INSERT_CHUNK) {
      await db.insert(equipmentDailyParts).values(dailyPartRows.slice(i, i + INSERT_CHUNK));
    }

    return {
      analysisId: id,
      trips: tripRows.length,
      fueling: fuelRows.length,
      dailyParts: dailyPartRows.filter((row) => row.usedInAnalysis).length,
      compactedM3: metrics.producaoCompactadaM3,
      liters: metrics.dieselConsumidoLitros,
      metrics,
    };
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

    return {
      inserted: data.rows.length - existingSet.size,
      updated: existingSet.size,
      total: data.rows.length,
      batchId: data.batchId,
    };
  });
