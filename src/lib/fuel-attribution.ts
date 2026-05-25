import { asc, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { equipmentDailyParts, fuelAttribution, fueling } from "@/db/schema";
import type { DbEquipmentDailyPart, DbFueling, DbFuelAttributionInsert } from "@/db/schema";
import { normalizeFleet as parseFleetNumber } from "@/lib/carcara-parser";

const WINDOW_DAYS_MAX = 14;

export async function recalculateFuelAttribution(
  db: Db,
  opts: { fleets?: string[]; analysisIds?: string[]; deleteFirst?: boolean } = {},
) {
  const targetFleets = opts.fleets
    ?.map((f) => normalizeFleet(f))
    .filter((f) => f.length > 0);
  const targetAnalysisIds = opts.analysisIds?.filter(Boolean);

  const fuelings: DbFueling[] =
    targetFleets && targetFleets.length > 0
      ? await fetchFuelingsForFleets(db, targetFleets, targetAnalysisIds)
      : await fetchFuelingsForAnalyses(db, targetAnalysisIds);

  if (opts.deleteFirst) {
    if (targetAnalysisIds && targetAnalysisIds.length > 0) {
      await deleteAttributionsForFuelings(db, fuelings);
    } else {
      const fleetsAffected =
        targetFleets && targetFleets.length > 0
          ? Array.from(new Set(targetFleets))
          : Array.from(
              new Set(
                fuelings
                  .map((f) => normalizeFleet(f.prefix || f.vehicleId || f.plate))
                  .filter((f) => f.length > 0),
              ),
            );
      if (fleetsAffected.length > 0) {
        for (let i = 0; i < fleetsAffected.length; i += 200) {
          await db
            .delete(fuelAttribution)
            .where(inArray(fuelAttribution.fleet, fleetsAffected.slice(i, i + 200)));
        }
      }
    }
  }

  const byFleetAndAnalysis = new Map<
    string,
    { fleet: string; analysisId: string; rows: DbFueling[] }
  >();
  for (const f of fuelings) {
    const fleet = normalizeFleet(f.prefix || f.vehicleId || f.plate);
    if (!fleet) continue;
    const key = `${fleet}|${f.analysisId}`;
    const group = byFleetAndAnalysis.get(key) ?? { fleet, analysisId: f.analysisId, rows: [] };
    group.rows.push(f);
    byFleetAndAnalysis.set(key, group);
  }

  const dailyParts = await fetchDailyPartsForFleets(
    db,
    targetFleets && targetFleets.length > 0 ? targetFleets : undefined,
    targetAnalysisIds,
  );
  const dailyPartsByFleetAndAnalysis = new Map<string, DbEquipmentDailyPart[]>();
  for (const part of dailyParts) {
    const fleet = normalizeFleet(part.fleet);
    if (!fleet) continue;
    const key = `${fleet}|${part.analysisId}`;
    if (!dailyPartsByFleetAndAnalysis.has(key)) dailyPartsByFleetAndAnalysis.set(key, []);
    dailyPartsByFleetAndAnalysis.get(key)!.push(part);
  }
  dailyPartsByFleetAndAnalysis.forEach((parts) =>
    parts.sort((a, b) => a.date.localeCompare(b.date)),
  );

  const attributions: DbFuelAttributionInsert[] = [];
  const calculatedAt = new Date().toISOString();

  for (const { fleet, analysisId, rows: fleetFuelings } of byFleetAndAnalysis.values()) {
    fleetFuelings.sort((a, b) => a.datetime.localeCompare(b.datetime));
    let previousDateISO: string | null = null;

    for (const f of fleetFuelings) {
      const currentDate = (f.datetime || "").slice(0, 10);
      if (!currentDate) continue;

      const fromDate = previousDateISO
        ? addDays(previousDateISO, 1)
        : addDays(currentDate, -WINDOW_DAYS_MAX);

      const scopedParts = dailyPartsByFleetAndAnalysis.get(`${fleet}|${analysisId}`) ?? [];
      const usableParts = scopedParts.filter(
        (p) => p.date >= fromDate && p.date <= currentDate && (p.hours ?? 0) > 0,
      );
      const totalHours = usableParts.reduce((sum, p) => sum + (p.hours || 0), 0);
      const liters = f.liters || 0;
      const cost = f.total || 0;
      const fleetLabel = f.prefix || fleet;

      if (totalHours <= 0) {
        attributions.push({
          id: `${fleet}-${currentDate}-_sem_pde-${f.id}`.slice(0, 200),
          fleet,
          fleetLabel,
          date: currentDate,
          obra: f.obra || "_sem_pde",
          hoursWorked: 0,
          litersAttributed: liters,
          costAttributed: cost,
          sourceFuelingId: f.id,
          calculatedAt,
        });
      } else {
        const litersPerHour = liters / totalHours;
        const costPerLiter = liters > 0 ? cost / liters : 0;
        for (const p of usableParts) {
          const partLiters = (p.hours || 0) * litersPerHour;
          const partCost = partLiters * costPerLiter;
          attributions.push({
            id: `${fleet}-${p.date}-${p.obra || "_no_obra"}-${f.id}`.slice(0, 200),
            fleet,
            fleetLabel,
            date: p.date,
            obra: p.obra || "",
            hoursWorked: p.hours || 0,
            litersAttributed: partLiters,
            costAttributed: partCost,
            sourceFuelingId: f.id,
            calculatedAt,
          });
        }
      }

      previousDateISO = currentDate;
    }
  }

  if (attributions.length > 0) {
    const BATCH = 50;
    for (let i = 0; i < attributions.length; i += BATCH) {
      await db.insert(fuelAttribution).values(attributions.slice(i, i + BATCH));
    }
  }

  return {
    totalAttributions: attributions.length,
    fleetsProcessed: new Set(Array.from(byFleetAndAnalysis.values()).map((group) => group.fleet))
      .size,
  };
}

async function fetchFuelingsForAnalyses(
  db: Db,
  analysisIds?: string[],
): Promise<DbFueling[]> {
  if (analysisIds && analysisIds.length > 0) {
    return db
      .select()
      .from(fueling)
      .where(inArray(fueling.analysisId, analysisIds))
      .orderBy(asc(fueling.prefix), asc(fueling.datetime))
      .all();
  }

  return db.select().from(fueling).orderBy(asc(fueling.prefix), asc(fueling.datetime)).all();
}

async function fetchFuelingsForFleets(
  db: Db,
  fleets: string[],
  analysisIds?: string[],
): Promise<DbFueling[]> {
  const all = await fetchFuelingsForAnalyses(db, analysisIds);
  const wanted = new Set(fleets);
  return all.filter((f) => {
    const n = normalizeFleet(f.prefix || f.vehicleId || f.plate);
    return n && wanted.has(n);
  });
}

async function fetchDailyPartsForFleets(
  db: Db,
  fleets?: string[],
  analysisIds?: string[],
): Promise<DbEquipmentDailyPart[]> {
  if (!fleets || fleets.length === 0) {
    if (analysisIds && analysisIds.length > 0) {
      return db
        .select()
        .from(equipmentDailyParts)
        .where(inArray(equipmentDailyParts.analysisId, analysisIds))
        .all();
    }
    return db.select().from(equipmentDailyParts).all();
  }

  const rows: DbEquipmentDailyPart[] = [];
  const uniqueFleets = Array.from(new Set(fleets));
  if (analysisIds && analysisIds.length > 0) {
    for (let i = 0; i < analysisIds.length; i += 200) {
      const analysisRows = await db
        .select()
        .from(equipmentDailyParts)
        .where(inArray(equipmentDailyParts.analysisId, analysisIds.slice(i, i + 200)))
        .all();
      const wanted = new Set(uniqueFleets);
      rows.push(...analysisRows.filter((row) => wanted.has(normalizeFleet(row.fleet))));
    }
  } else {
    for (let i = 0; i < uniqueFleets.length; i += 200) {
      rows.push(
        ...(await db
          .select()
          .from(equipmentDailyParts)
          .where(inArray(equipmentDailyParts.fleet, uniqueFleets.slice(i, i + 200)))
          .all()),
      );
    }
  }
  return rows;
}

async function deleteAttributionsForFuelings(db: Db, rows: DbFueling[]) {
  const ids = rows.map((row) => row.id).filter(Boolean);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    if (chunk.length > 0) {
      await db.delete(fuelAttribution).where(inArray(fuelAttribution.sourceFuelingId, chunk));
    }
  }
}

export function normalizeFleet(text: string | null | undefined): string {
  const parsed = parseFleetNumber(text ?? "");
  if (parsed) return parsed;
  const m = String(text ?? "").match(/\d+/);
  return m ? m[0] : "";
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
