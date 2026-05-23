import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { equipmentDailyParts, fuelAttribution, fueling } from "@/db/schema";
import type { DbEquipmentDailyPart, DbFueling, DbFuelAttributionInsert } from "@/db/schema";
import { normalizeFleet as parseFleetNumber } from "@/lib/carcara-parser";

const WINDOW_DAYS_MAX = 14;

export async function recalculateFuelAttribution(
  db: Db,
  opts: { fleets?: string[]; deleteFirst?: boolean } = {},
) {
  const targetFleets = opts.fleets
    ?.map((f) => normalizeFleet(f))
    .filter((f) => f.length > 0);

  const fuelings: DbFueling[] = targetFleets && targetFleets.length > 0
    ? await fetchFuelingsForFleets(db, targetFleets)
    : await db.select().from(fueling).orderBy(asc(fueling.prefix), asc(fueling.datetime)).all();

  if (opts.deleteFirst) {
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

  const byFleet = new Map<string, DbFueling[]>();
  for (const f of fuelings) {
    const fleet = normalizeFleet(f.prefix || f.vehicleId || f.plate);
    if (!fleet) continue;
    if (!byFleet.has(fleet)) byFleet.set(fleet, []);
    byFleet.get(fleet)!.push(f);
  }

  const attributions: DbFuelAttributionInsert[] = [];
  const calculatedAt = new Date().toISOString();

  for (const [fleet, fleetFuelings] of byFleet) {
    fleetFuelings.sort((a, b) => a.datetime.localeCompare(b.datetime));
    let previousDateISO: string | null = null;

    for (const f of fleetFuelings) {
      const currentDate = (f.datetime || "").slice(0, 10);
      if (!currentDate) continue;

      const fromDate = previousDateISO
        ? addDays(previousDateISO, 1)
        : addDays(currentDate, -WINDOW_DAYS_MAX);

      const dailyParts: DbEquipmentDailyPart[] = await db
        .select()
        .from(equipmentDailyParts)
        .where(
          and(
            eq(equipmentDailyParts.fleet, fleet),
            gte(equipmentDailyParts.date, fromDate),
            lte(equipmentDailyParts.date, currentDate),
          ),
        )
        .all();

      const usableParts = dailyParts.filter((p) => (p.hours ?? 0) > 0);
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

  return { totalAttributions: attributions.length, fleetsProcessed: byFleet.size };
}

async function fetchFuelingsForFleets(db: Db, fleets: string[]): Promise<DbFueling[]> {
  const all = await db
    .select()
    .from(fueling)
    .orderBy(asc(fueling.prefix), asc(fueling.datetime))
    .all();
  const wanted = new Set(fleets);
  return all.filter((f) => {
    const n = normalizeFleet(f.prefix || f.vehicleId || f.plate);
    return n && wanted.has(n);
  });
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
