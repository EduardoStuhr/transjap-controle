import { createServerFn } from "@tanstack/react-start";
import { requireServerAuthUser } from "@/lib/api/auth";
import {
  deleteStoreDocument,
  getStoreDocument,
  listStoreDocuments,
  upsertStoreDocument,
} from "@/lib/api/store-documents";
import { isAdminUser } from "@/lib/auth-users";
import type { MaintenanceRecord } from "@/lib/maintenance-store";

const MAINTENANCE_MODULE = "maintenance-records";
const DELETE_FORBIDDEN = "Apenas administradores podem excluir manutencao.";

export const listMaintenance = createServerFn({ method: "GET" }).handler(async () => ({
  records: await listStoreDocuments<MaintenanceRecord>(MAINTENANCE_MODULE),
}));

export const createMaintenanceRecord = createServerFn({ method: "POST" })
  .inputValidator((record: MaintenanceRecord) => record)
  .handler(async ({ data }) => upsertStoreDocument(MAINTENANCE_MODULE, data.id, data));

export const updateMaintenanceRecord = createServerFn({ method: "POST" })
  .inputValidator((record: MaintenanceRecord) => record)
  .handler(async ({ data }) => upsertStoreDocument(MAINTENANCE_MODULE, data.id, data));

export const deleteMaintenanceRecord = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => {
    const user = await requireServerAuthUser();
    if (!isAdminUser(user)) {
      throw new Response(DELETE_FORBIDDEN, { status: 403 });
    }

    const existing = await getStoreDocument<MaintenanceRecord>(MAINTENANCE_MODULE, data);
    if (!existing) {
      throw new Response("Manutencao nao encontrada ou ja excluida.", { status: 404 });
    }

    await deleteStoreDocument(MAINTENANCE_MODULE, data);
    return { success: true, error: null };
  });
