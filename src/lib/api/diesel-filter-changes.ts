import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  dieselFilterChanges,
  type DbDieselFilterChange,
  type DbDieselFilterChangeInsert,
} from "@/db/schema";
import { requireServerAuthUser } from "@/lib/api/auth";
import { getOptionalD1 } from "@/lib/cf-env";
import { isEduardoUser } from "@/lib/auth-users";
import { normalizeFleetId } from "@/lib/operational-options";

export type DieselFilterChange = DbDieselFilterChange;

export type DieselFilterChangeDraft = {
  date: string;
  primaryFilter?: string | null;
  secondaryFilter?: string | null;
  racor?: string | null;
  brand?: string | null;
  fleet: string;
  hourmeter: number;
  obra?: string | null;
  responsible?: string | null;
  notes?: string | null;
};

export type DieselFilterChangePatch = Partial<DieselFilterChangeDraft>;

export type DieselFilterChangeFilters = Partial<{
  fleet: string;
  obra: string;
  date: string;
  dateFrom: string;
  dateTo: string;
  responsible: string;
}>;

const localChanges = new Map<string, DieselFilterChange>();
let dieselFilterSchemaPromise: Promise<void> | null = null;

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `DFC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  return `DFC-${Date.now().toString(36).toUpperCase()}`;
}

function cleanText(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return text || null;
}

function requireEduardo(user: Awaited<ReturnType<typeof requireServerAuthUser>>) {
  if (!isEduardoUser(user)) {
    throw new Response("Modulo restrito ao usuario Eduardo.", { status: 403 });
  }
}

function validateDraft(draft: DieselFilterChangeDraft) {
  const date = draft.date.trim();
  const fleet = normalizeFleetId(draft.fleet);
  const hourmeter = Number(draft.hourmeter);

  if (!date) throw new Error("Informe a data da troca.");
  if (!fleet) throw new Error("Informe a frota.");
  if (!Number.isFinite(hourmeter)) throw new Error("Informe um horimetro valido.");

  return { date, fleet, hourmeter };
}

function buildRow(
  draft: DieselFilterChangeDraft,
  createdBy: string,
  createdAt = new Date().toISOString(),
): DieselFilterChange {
  const { date, fleet, hourmeter } = validateDraft(draft);

  return {
    id: newId(),
    date,
    primaryFilter: cleanText(draft.primaryFilter),
    secondaryFilter: cleanText(draft.secondaryFilter),
    racor: cleanText(draft.racor),
    brand: cleanText(draft.brand),
    fleet,
    hourmeter,
    obra: cleanText(draft.obra),
    responsible: cleanText(draft.responsible),
    notes: cleanText(draft.notes),
    createdBy,
    createdAt,
    updatedAt: null,
  };
}

function buildPatch(patch: DieselFilterChangePatch): Partial<DbDieselFilterChangeInsert> {
  const next: Partial<DbDieselFilterChangeInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (patch.date !== undefined) {
    const date = patch.date.trim();
    if (!date) throw new Error("Informe a data da troca.");
    next.date = date;
  }
  if (patch.fleet !== undefined) {
    const fleet = normalizeFleetId(patch.fleet);
    if (!fleet) throw new Error("Informe a frota.");
    next.fleet = fleet;
  }
  if (patch.hourmeter !== undefined) {
    const hourmeter = Number(patch.hourmeter);
    if (!Number.isFinite(hourmeter)) throw new Error("Informe um horimetro valido.");
    next.hourmeter = hourmeter;
  }

  if (patch.primaryFilter !== undefined) next.primaryFilter = cleanText(patch.primaryFilter);
  if (patch.secondaryFilter !== undefined) next.secondaryFilter = cleanText(patch.secondaryFilter);
  if (patch.racor !== undefined) next.racor = cleanText(patch.racor);
  if (patch.brand !== undefined) next.brand = cleanText(patch.brand);
  if (patch.obra !== undefined) next.obra = cleanText(patch.obra);
  if (patch.responsible !== undefined) next.responsible = cleanText(patch.responsible);
  if (patch.notes !== undefined) next.notes = cleanText(patch.notes);

  return next;
}

function sortRows(rows: DieselFilterChange[]) {
  return [...rows].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.hourmeter - a.hourmeter,
  );
}

function matchesFilters(row: DieselFilterChange, filters: DieselFilterChangeFilters) {
  const fleet = filters.fleet?.trim();
  if (fleet) {
    const normalizedFleet = normalizeFleetId(fleet);
    if (row.fleet !== normalizedFleet && !row.fleet.includes(fleet.toUpperCase())) return false;
  }

  if (filters.obra?.trim()) {
    const needle = filters.obra.trim().toLowerCase();
    if (!(row.obra ?? "").toLowerCase().includes(needle)) return false;
  }

  if (filters.responsible?.trim()) {
    const needle = filters.responsible.trim().toLowerCase();
    if (!(row.responsible ?? "").toLowerCase().includes(needle)) return false;
  }

  if (filters.date && row.date !== filters.date) return false;
  if (filters.dateFrom && row.date < filters.dateFrom) return false;
  if (filters.dateTo && row.date > filters.dateTo) return false;

  return true;
}

async function ensureDieselFilterChangesTable(d1: D1Database) {
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS diesel_filter_changes (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        primary_filter TEXT,
        secondary_filter TEXT,
        racor TEXT,
        brand TEXT,
        fleet TEXT NOT NULL,
        hourmeter REAL NOT NULL,
        obra TEXT,
        responsible TEXT,
        notes TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      )`,
    )
    .run();

  await d1
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_diesel_filter_changes_fleet_date ON diesel_filter_changes (fleet, date)",
    )
    .run();
  await d1
    .prepare("CREATE INDEX IF NOT EXISTS idx_diesel_filter_changes_date ON diesel_filter_changes (date)")
    .run();
  await d1
    .prepare("CREATE INDEX IF NOT EXISTS idx_diesel_filter_changes_obra ON diesel_filter_changes (obra)")
    .run();
  await d1
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_diesel_filter_changes_responsible ON diesel_filter_changes (responsible)",
    )
    .run();
}

async function ensureSchema(d1: D1Database) {
  dieselFilterSchemaPromise ??= ensureDieselFilterChangesTable(d1).catch((error) => {
    dieselFilterSchemaPromise = null;
    throw error;
  });
  await dieselFilterSchemaPromise;
}

export const listDieselFilterChanges = createServerFn({ method: "POST" })
  .inputValidator((filters: DieselFilterChangeFilters | undefined) => filters ?? {})
  .handler(async ({ data }) => {
    const user = await requireServerAuthUser();
    requireEduardo(user);

    const d1 = getOptionalD1();
    if (!d1) {
      return sortRows(Array.from(localChanges.values()).filter((row) => matchesFilters(row, data)));
    }

    await ensureSchema(d1);
    const db = getDb(d1);
    const conditions = [];
    if (data.fleet?.trim()) conditions.push(eq(dieselFilterChanges.fleet, normalizeFleetId(data.fleet)));
    if (data.obra?.trim()) conditions.push(eq(dieselFilterChanges.obra, data.obra.trim()));
    if (data.responsible?.trim()) {
      conditions.push(eq(dieselFilterChanges.responsible, data.responsible.trim()));
    }
    if (data.date) conditions.push(eq(dieselFilterChanges.date, data.date));
    if (data.dateFrom) conditions.push(gte(dieselFilterChanges.date, data.dateFrom));
    if (data.dateTo) conditions.push(lte(dieselFilterChanges.date, data.dateTo));

    return db
      .select()
      .from(dieselFilterChanges)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dieselFilterChanges.date), desc(dieselFilterChanges.createdAt))
      .all();
  });

export const createDieselFilterChange = createServerFn({ method: "POST" })
  .inputValidator((draft: DieselFilterChangeDraft) => draft)
  .handler(async ({ data }) => {
    const user = await requireServerAuthUser();
    requireEduardo(user);

    const row = buildRow(data, user.name);
    const d1 = getOptionalD1();
    if (!d1) {
      localChanges.set(row.id, row);
      return row;
    }

    await ensureSchema(d1);
    const db = getDb(d1);
    await db.insert(dieselFilterChanges).values(row);
    return row;
  });

export const updateDieselFilterChange = createServerFn({ method: "POST" })
  .inputValidator((args: { id: string; patch: DieselFilterChangePatch }) => args)
  .handler(async ({ data }) => {
    const user = await requireServerAuthUser();
    requireEduardo(user);

    const patch = buildPatch(data.patch);
    const d1 = getOptionalD1();
    if (!d1) {
      const existing = localChanges.get(data.id);
      if (!existing) throw new Error("Troca nao encontrada.");
      const updated = { ...existing, ...patch } as DieselFilterChange;
      localChanges.set(data.id, updated);
      return updated;
    }

    await ensureSchema(d1);
    const db = getDb(d1);
    await db.update(dieselFilterChanges).set(patch).where(eq(dieselFilterChanges.id, data.id));
    const updated = await db
      .select()
      .from(dieselFilterChanges)
      .where(eq(dieselFilterChanges.id, data.id))
      .get();
    if (!updated) throw new Error("Troca nao encontrada.");
    return updated;
  });

export const deleteDieselFilterChange = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => {
    const user = await requireServerAuthUser();
    requireEduardo(user);

    const d1 = getOptionalD1();
    if (!d1) {
      localChanges.delete(data);
      return { ok: true };
    }

    await ensureSchema(d1);
    const db = getDb(d1);
    await db.delete(dieselFilterChanges).where(eq(dieselFilterChanges.id, data));
    return { ok: true };
  });
