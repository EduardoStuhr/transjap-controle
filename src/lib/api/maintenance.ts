import { createServerFn } from "@tanstack/react-start";
import {
  deleteStoreDocument,
  listStoreDocuments,
  upsertStoreDocument,
} from "@/lib/api/store-documents";
import type { MaintenanceRecord } from "@/lib/maintenance-store";

const MAINTENANCE_MODULE = "maintenance-records";

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
  .handler(async ({ data }) => deleteStoreDocument(MAINTENANCE_MODULE, data));
