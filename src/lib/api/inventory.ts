import { createServerFn } from "@tanstack/react-start";
import {
  deleteStoreDocument,
  listStoreDocuments,
  upsertStoreDocument,
} from "@/lib/api/store-documents";
import type { InventoryItem, StockLocation, StockMovement } from "@/lib/inventory-types";

const INVENTORY_ITEMS_MODULE = "inventory-items";
const INVENTORY_LOCATIONS_MODULE = "inventory-locations";
const INVENTORY_MOVEMENTS_MODULE = "inventory-movements";

export type InventoryListResult = {
  items: InventoryItem[];
  locations: StockLocation[];
  movements: StockMovement[];
};

export const listInventory = createServerFn({ method: "GET" }).handler(async () => ({
  items: await listStoreDocuments<InventoryItem>(INVENTORY_ITEMS_MODULE),
  locations: await listStoreDocuments<StockLocation>(INVENTORY_LOCATIONS_MODULE),
  movements: await listStoreDocuments<StockMovement>(INVENTORY_MOVEMENTS_MODULE),
}));

export const createInventoryItem = createServerFn({ method: "POST" })
  .inputValidator((item: InventoryItem) => item)
  .handler(async ({ data }) => upsertStoreDocument(INVENTORY_ITEMS_MODULE, data.id, data));

export const updateInventoryItem = createServerFn({ method: "POST" })
  .inputValidator((item: InventoryItem) => item)
  .handler(async ({ data }) => upsertStoreDocument(INVENTORY_ITEMS_MODULE, data.id, data));

export const deleteInventoryItem = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => deleteStoreDocument(INVENTORY_ITEMS_MODULE, data));

export const createInventoryLocation = createServerFn({ method: "POST" })
  .inputValidator((location: StockLocation) => location)
  .handler(async ({ data }) => upsertStoreDocument(INVENTORY_LOCATIONS_MODULE, data.id, data));

export const updateInventoryLocation = createServerFn({ method: "POST" })
  .inputValidator((location: StockLocation) => location)
  .handler(async ({ data }) => upsertStoreDocument(INVENTORY_LOCATIONS_MODULE, data.id, data));

export const deleteInventoryLocation = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => deleteStoreDocument(INVENTORY_LOCATIONS_MODULE, data));

export const createInventoryMovement = createServerFn({ method: "POST" })
  .inputValidator((args: { item: InventoryItem; movement: StockMovement }) => args)
  .handler(async ({ data }) => {
    await upsertStoreDocument(INVENTORY_ITEMS_MODULE, data.item.id, data.item);
    return upsertStoreDocument(INVENTORY_MOVEMENTS_MODULE, data.movement.id, data.movement);
  });

export const updateInventoryMovement = createServerFn({ method: "POST" })
  .inputValidator((movement: StockMovement) => movement)
  .handler(async ({ data }) => upsertStoreDocument(INVENTORY_MOVEMENTS_MODULE, data.id, data));

export const deleteInventoryMovement = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => deleteStoreDocument(INVENTORY_MOVEMENTS_MODULE, data));
