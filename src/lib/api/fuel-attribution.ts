import { createServerFn } from "@tanstack/react-start";
import { and, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getOptionalD1 } from "@/lib/cf-env";
import { fuelAttribution } from "@/db/schema";
import type { DbFuelAttribution } from "@/db/schema";
import { recalculateFuelAttribution } from "@/lib/fuel-attribution";

type FuelAttributionFilters = {
  dateFrom?: string;
  dateTo?: string;
  obra?: string;
  fleet?: string;
  analysisIds?: string[];
};

function sourceBelongsToAnalyses(sourceFuelingId: string | null, analysisIds: Set<string>) {
  if (!sourceFuelingId) return false;
  for (const analysisId of analysisIds) {
    if (sourceFuelingId === analysisId || sourceFuelingId.startsWith(`${analysisId}:`)) {
      return true;
    }
  }
  return false;
}

export const recalculateFuelFn = createServerFn({ method: "POST" })
  .inputValidator((data: { fleets?: string[] }) => data)
  .handler(async ({ data }) => {
    const d1 = getOptionalD1();
    if (!d1) {
      return { totalAttributions: 0, fleetsProcessed: 0, skipped: "no-d1" as const };
    }
    const db = getDb(d1);
    return await recalculateFuelAttribution(db, {
      fleets: data?.fleets,
      deleteFirst: true,
    });
  });

export const listFuelAttributionFn = createServerFn({ method: "POST" })
  .inputValidator((data: FuelAttributionFilters) => data)
  .handler(async ({ data }): Promise<DbFuelAttribution[]> => {
    const d1 = getOptionalD1();
    if (!d1) return [];
    const db = getDb(d1);
    const conditions = [];
    if (data?.dateFrom) conditions.push(gte(fuelAttribution.date, data.dateFrom));
    if (data?.dateTo) conditions.push(lte(fuelAttribution.date, data.dateTo));
    let rows = conditions.length
      ? await db.select().from(fuelAttribution).where(and(...conditions)).all()
      : await db.select().from(fuelAttribution).all();
    const analysisIds = new Set(data?.analysisIds?.filter(Boolean) ?? []);
    if (analysisIds.size > 0) {
      rows = rows.filter((row) => sourceBelongsToAnalyses(row.sourceFuelingId, analysisIds));
    }
    if (data?.obra) rows = rows.filter((r) => r.obra === data.obra);
    if (data?.fleet) rows = rows.filter((r) => r.fleet === data.fleet);
    return rows;
  });
