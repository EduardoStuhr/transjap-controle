import { createServerFn } from "@tanstack/react-start";
import { getEvent } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { equipment as equipmentTable } from "@/db/schema";
import { seedEquipmentIfEmpty } from "@/db/seed";
import type { DbEquipmentInsert } from "@/db/schema";

function getD1(): D1Database {
  const event = getEvent();
  // @cloudflare/vite-plugin injects bindings at event.context.cloudflare.env
  const env = (event.context as { cloudflare?: { env?: { DB?: D1Database } } }).cloudflare?.env;
  if (!env?.DB) throw new Error("D1 binding 'DB' não disponível — verifique wrangler.jsonc e o binding name");
  return env.DB;
}

type EquipmentPatch = Partial<Omit<DbEquipmentInsert, "id" | "createdAt" | "updatedAt">>;
type EquipmentCreate = Omit<DbEquipmentInsert, "id" | "createdAt" | "updatedAt">;

export const listEquipment = createServerFn({ method: "GET" }).handler(async () => {
  const d1 = getD1();
  await seedEquipmentIfEmpty(d1);
  const db = getDb(d1);
  return db.select().from(equipmentTable).all();
});

export const createEquipment = createServerFn({ method: "POST" })
  .validator((draft: EquipmentCreate) => draft)
  .handler(async ({ data }) => {
    const d1 = getD1();
    const db = getDb(d1);
    const now = new Date().toISOString();

    // Derive next ID from existing max suffix to avoid conflicts
    const rows = await db.select({ id: equipmentTable.id }).from(equipmentTable).all();
    const maxSuffix = rows.reduce((acc, row) => {
      const match = /^FR-(\d+)$/.exec(row.id);
      return match ? Math.max(acc, parseInt(match[1], 10)) : acc;
    }, 0);
    const id = `FR-${String(maxSuffix + 1).padStart(3, "0")}`;

    const row: DbEquipmentInsert = { ...data, id, createdAt: now, updatedAt: now };
    await db.insert(equipmentTable).values(row);
    return row;
  });

export const updateEquipment = createServerFn({ method: "POST" })
  .validator((args: { id: string; patch: EquipmentPatch }) => args)
  .handler(async ({ data }) => {
    const db = getDb(getD1());
    await db
      .update(equipmentTable)
      .set({ ...data.patch, updatedAt: new Date().toISOString() })
      .where(eq(equipmentTable.id, data.id));
    return { ok: true };
  });

export const deleteEquipment = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const db = getDb(getD1());
    await db.delete(equipmentTable).where(eq(equipmentTable.id, id));
    return { ok: true };
  });
