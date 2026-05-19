import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { equipment as equipmentTable } from "@/db/schema";
import { SEED_EQUIPMENT_ROWS, seedEquipmentIfEmpty } from "@/db/seed";
import { getOptionalD1 } from "@/lib/cf-env";
import { normalizeFleetId } from "@/lib/operational-options";
import type { DbEquipmentInsert } from "@/db/schema";

type EquipmentPatch = Partial<Omit<DbEquipmentInsert, "createdAt" | "updatedAt">>;
type EquipmentCreate = Pick<DbEquipmentInsert, "id" | "model" | "location"> &
  Partial<Omit<DbEquipmentInsert, "id" | "model" | "location" | "createdAt" | "updatedAt">>;

const DEFAULT_ICON = "construction";
const STATUS_TONE = {
  Operação: "success",
  Manutenção: "warning",
  Parado: "error",
} as const;

let localEquipmentRows: DbEquipmentInsert[] | undefined;

function getEquipmentD1() {
  const d1 = getOptionalD1();
  if (d1 || import.meta.env.DEV) return d1;

  throw new Error(
    "D1 binding 'DB' não disponível. Verifique wrangler.jsonc e o binding name em produção.",
  );
}

function getTone(status: string): DbEquipmentInsert["tone"] {
  return STATUS_TONE[status as keyof typeof STATUS_TONE] ?? "success";
}

function getLocalEquipmentRows() {
  if (!localEquipmentRows) {
    const now = new Date().toISOString();
    localEquipmentRows = SEED_EQUIPMENT_ROWS.map((row) => ({
      ...row,
      createdAt: now,
      updatedAt: now,
    }));
  }

  return localEquipmentRows;
}

function assertFleetId(id: string) {
  if (!id) {
    throw new Error("Informe a frota do equipamento.");
  }
}

function buildEquipmentRow(data: EquipmentCreate, id: string, now: string): DbEquipmentInsert {
  const status = data.status ?? "Operação";

  return {
    id,
    model: data.model.trim(),
    icon: data.icon?.trim() || DEFAULT_ICON,
    hours: Number.isFinite(data.hours) ? Number(data.hours) : 0,
    status,
    tone: data.tone ?? getTone(status),
    location: data.location.trim(),
    lastMaintenance: data.lastMaintenance ?? "",
    seriesNumber: data.seriesNumber?.trim() || "",
    acquisitionDate: data.acquisitionDate ?? "",
    manufacturer: data.manufacturer ?? "",
    createdAt: now,
    updatedAt: now,
  };
}

function buildEquipmentPatch(data: EquipmentPatch): EquipmentPatch & { updatedAt: string } {
  const id = data.id ? normalizeFleetId(data.id) : undefined;
  const { id: _rawId, ...rest } = data;
  return {
    ...rest,
    ...(id ? { id } : {}),
    ...(data.tone || !data.status ? {} : { tone: getTone(data.status) }),
    updatedAt: new Date().toISOString(),
  };
}

export const listEquipment = createServerFn({ method: "GET" }).handler(async () => {
  const d1 = getEquipmentD1();
  if (!d1) {
    return getLocalEquipmentRows();
  }

  await seedEquipmentIfEmpty(d1);
  const db = getDb(d1);
  return db.select().from(equipmentTable).all();
});

export const createEquipment = createServerFn({ method: "POST" })
  .inputValidator((draft: EquipmentCreate) => draft)
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    const d1 = getEquipmentD1();
    const id = normalizeFleetId(data.id ?? "");
    assertFleetId(id);

    if (!d1) {
      const rows = getLocalEquipmentRows();
      if (rows.some((row) => row.id === id)) {
        throw new Error(`A frota ${id} já está cadastrada.`);
      }

      const row = buildEquipmentRow(data, id, now);
      rows.push(row);
      return row;
    }

    const db = getDb(d1);
    const existing = await db
      .select({ id: equipmentTable.id })
      .from(equipmentTable)
      .where(eq(equipmentTable.id, id))
      .get();
    if (existing) {
      throw new Error(`A frota ${id} já está cadastrada.`);
    }

    const row = buildEquipmentRow(data, id, now);
    await db.insert(equipmentTable).values(row);
    return row;
  });

export const updateEquipment = createServerFn({ method: "POST" })
  .inputValidator((args: { id: string; patch: EquipmentPatch }) => args)
  .handler(async ({ data }) => {
    const d1 = getEquipmentD1();
    const patch = buildEquipmentPatch(data.patch);

    if (!d1) {
      const rows = getLocalEquipmentRows();
      const index = rows.findIndex((row) => row.id === data.id);
      if (index === -1) throw new Error(`Equipamento ${data.id} não encontrado.`);
      if (patch.id && patch.id !== data.id && rows.some((row) => row.id === patch.id)) {
        throw new Error(`A frota ${patch.id} já está cadastrada.`);
      }
      rows[index] = { ...rows[index], ...patch };
      return { ok: true };
    }

    const db = getDb(d1);
    if (patch.id && patch.id !== data.id) {
      const existing = await db
        .select({ id: equipmentTable.id })
        .from(equipmentTable)
        .where(eq(equipmentTable.id, patch.id))
        .get();
      if (existing) {
        throw new Error(`A frota ${patch.id} já está cadastrada.`);
      }
    }

    await db
      .update(equipmentTable)
      .set(patch)
      .where(eq(equipmentTable.id, data.id));
    return { ok: true };
  });

export const deleteEquipment = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const d1 = getEquipmentD1();
    if (!d1) {
      localEquipmentRows = getLocalEquipmentRows().filter((row) => row.id !== id);
      return { ok: true };
    }

    const db = getDb(d1);
    await db.delete(equipmentTable).where(eq(equipmentTable.id, id));
    return { ok: true };
  });
