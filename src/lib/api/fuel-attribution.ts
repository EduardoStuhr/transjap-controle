import { createServerFn } from "@tanstack/react-start";
import { and, asc, gte, lte } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getOptionalD1 } from "@/lib/cf-env";
import { fuelAttribution } from "@/db/schema";
import type { DbFuelAttribution } from "@/db/schema";
import { recalculateFuelAttribution } from "@/lib/fuel-attribution";
import { normalizeObraKey } from "@/lib/production-consumption-utils";

type FuelAttributionFilters = {
  dateFrom?: string;
  dateTo?: string;
  obra?: string;
  fleet?: string;
  analysisIds?: string[];
};

const D1_SELECT_PAGE_SIZE = 2_000;

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
    const conditions: SQL[] = [];
    if (data?.dateFrom) conditions.push(gte(fuelAttribution.date, data.dateFrom));
    if (data?.dateTo) conditions.push(lte(fuelAttribution.date, data.dateTo));
    let rows = await paginatedSelect<DbFuelAttribution>((limit, offset) =>
      conditions.length
        ? db
            .select()
            .from(fuelAttribution)
            .where(and(...conditions))
            .orderBy(asc(fuelAttribution.id))
            .limit(limit)
            .offset(offset)
            .all()
        : db
            .select()
            .from(fuelAttribution)
            .orderBy(asc(fuelAttribution.id))
            .limit(limit)
            .offset(offset)
            .all(),
    );
    const analysisIds = new Set(data?.analysisIds?.filter(Boolean) ?? []);
    if (analysisIds.size > 0) {
      rows = rows.filter((row) => sourceBelongsToAnalyses(row.sourceFuelingId, analysisIds));
    }
    if (data?.obra) {
      rows = rows.filter((r) => normalizeObraKey(r.obra) === normalizeObraKey(data.obra));
    }
    if (data?.fleet) rows = rows.filter((r) => r.fleet === data.fleet);
    return rows;
  });
