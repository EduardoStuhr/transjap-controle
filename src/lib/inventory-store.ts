import { useEffect, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createInventoryItem,
  createInventoryLocation,
  createInventoryMovement,
  deleteInventoryItem,
  deleteInventoryLocation,
  deleteInventoryMovement,
  listInventory,
  updateInventoryItem,
  updateInventoryLocation,
  updateInventoryMovement,
} from "@/lib/api/inventory";
import type {
  InventoryAlert,
  InventoryDraft,
  InventoryItem,
  LocationDraft,
  MovementDraft,
  StockLocation,
  StockMovement,
} from "@/lib/inventory-types";
import { getCurrentUser } from "@/lib/auth-store";

type InventoryState = {
  items: InventoryItem[];
  locations: StockLocation[];
  movements: StockMovement[];
  offlineQueue: StockMovement[];
  currentRole:
    | "administrador"
    | "gestor"
    | "almoxarifado"
    | "mecânico"
    | "operador"
    | "visualização";
};

type InventoryData = Omit<InventoryState, "currentRole" | "offlineQueue">;
type InventorySelector<T> = (state: InventoryState) => T;

const QK = ["inventory"] as const;
const STORAGE_KEY = "transjap:fleet-command:inventory:v1";

const EMPTY_STATE: InventoryState = {
  items: [],
  locations: [],
  movements: [],
  offlineQueue: [],
  currentRole: "administrador",
};

let localMigrationStarted = false;
let roleHydrated = false;
let currentRole: InventoryState["currentRole"] = "administrador";
const roleListeners = new Set<() => void>();

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function qrPayload(kind: "ITEM" | "LOC", code: string) {
  return `TRANSJAP:${kind}:${code}`;
}

function normalizeState(value: unknown): InventoryState {
  if (!value || typeof value !== "object") return EMPTY_STATE;
  const stored = value as Partial<InventoryState>;

  return {
    items: Array.isArray(stored.items) ? stored.items : [],
    locations: Array.isArray(stored.locations) ? stored.locations : [],
    movements: Array.isArray(stored.movements) ? stored.movements : [],
    offlineQueue: Array.isArray(stored.offlineQueue) ? stored.offlineQueue : [],
    currentRole: stored.currentRole || "administrador",
  };
}

function readStorage(): InventoryState {
  if (!isBrowser()) return EMPTY_STATE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

function getRoleSnapshot() {
  if (!roleHydrated && isBrowser()) {
    roleHydrated = true;
    currentRole = readStorage().currentRole;
  }

  return currentRole;
}

function writeStorage(nextState: Omit<InventoryState, "currentRole">) {
  if (!isBrowser()) return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...nextState, currentRole: getRoleSnapshot() }),
  );
}

function setRoleSnapshot(role: InventoryState["currentRole"]) {
  currentRole = role;
  roleHydrated = true;
  const snapshot = readStorage();
  const { currentRole: _storedRole, ...data } = snapshot;
  writeStorage(data);
  roleListeners.forEach((listener) => listener());
}

function useInventoryRole() {
  return useSyncExternalStore(
    (listener) => {
      roleListeners.add(listener);
      return () => roleListeners.delete(listener);
    },
    getRoleSnapshot,
    () => "administrador" as InventoryState["currentRole"],
  );
}

function sanitizeNumber(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function movementEffect(previous: number, draft: MovementDraft) {
  const quantity = sanitizeNumber(draft.quantity);

  switch (draft.type) {
    case "entrada":
      return previous + quantity;
    case "saída":
    case "perda":
    case "uso em manutenção":
      return Math.max(0, previous - quantity);
    case "ajuste":
      return quantity;
    case "transferência":
      return previous;
  }
}

function makeMovement(item: InventoryItem, draft: MovementDraft): StockMovement {
  const previousStock = item.currentStock;
  const nextStock = movementEffect(previousStock, draft);

  return {
    id: newId("MOV"),
    type: draft.type,
    itemId: item.id,
    itemName: item.name,
    quantity: sanitizeNumber(draft.quantity),
    previousStock,
    nextStock,
    fromLocationId: item.locationId || undefined,
    toLocationId: draft.toLocationId || undefined,
    responsible: draft.responsible.trim() || getCurrentUser()?.name || "Sessão local",
    timestamp: nowIso(),
    note: draft.note.trim(),
    equipment: draft.equipment.trim(),
    maintenanceId: draft.maintenanceId.trim(),
    costImpact: draft.type === "entrada" ? 0 : sanitizeNumber(draft.quantity) * item.cost,
    syncStatus: isOnline() ? "synced" : "pending",
  };
}

function getCachedState(queryClient: ReturnType<typeof useQueryClient>): InventoryState {
  const data = queryClient.getQueryData<InventoryData>(QK);
  if (!data) return readStorage();
  return { ...data, offlineQueue: readStorage().offlineQueue, currentRole: getRoleSnapshot() };
}

function inventoryData(state: InventoryState): InventoryData {
  return {
    items: state.items,
    locations: state.locations,
    movements: state.movements,
  };
}

function setCachedInventory(
  queryClient: ReturnType<typeof useQueryClient>,
  data: InventoryData,
  offlineQueue = readStorage().offlineQueue,
) {
  queryClient.setQueryData<InventoryData>(QK, data);
  writeStorage({ ...data, offlineQueue });
}

function restoreCachedInventory(
  queryClient: ReturnType<typeof useQueryClient>,
  previous: InventoryState,
) {
  setCachedInventory(queryClient, inventoryData(previous), previous.offlineQueue);
}

function upsertById<T extends { id: string }>(values: T[], next: T) {
  return [next, ...values.filter((value) => value.id !== next.id)];
}

function newerByUpdatedAt(remote: { updatedAt: string } | undefined, local: { updatedAt: string }) {
  if (!remote) return true;
  return local.updatedAt.localeCompare(remote.updatedAt) > 0;
}

function useLocalInventoryMigration(remoteData: InventoryData | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !remoteData || localMigrationStarted) return;

    const local = readStorage();
    const remoteItems = new Map(remoteData.items.map((item) => [item.id, item]));
    const remoteLocations = new Map(
      remoteData.locations.map((location) => [location.id, location]),
    );
    const remoteMovements = new Set(remoteData.movements.map((movement) => movement.id));

    const items = local.items.filter((item) => newerByUpdatedAt(remoteItems.get(item.id), item));
    const locations = local.locations.filter((location) =>
      newerByUpdatedAt(remoteLocations.get(location.id), location),
    );
    const movements = [...local.movements, ...local.offlineQueue].filter(
      (movement) => !remoteMovements.has(movement.id),
    );

    if (items.length === 0 && locations.length === 0 && movements.length === 0) {
      writeStorage({ ...remoteData, offlineQueue: [] });
      return;
    }

    localMigrationStarted = true;
    Promise.all([
      ...items.map((item) => createInventoryItem({ data: item })),
      ...locations.map((location) => createInventoryLocation({ data: location })),
      ...movements.map((movement) => {
        const item = local.items.find((candidate) => candidate.id === movement.itemId);
        return item
          ? createInventoryMovement({
              data: { item, movement: { ...movement, syncStatus: "synced" } },
            })
          : updateInventoryMovement({ data: { ...movement, syncStatus: "synced" } });
      }),
    ])
      .then(() => queryClient.invalidateQueries({ queryKey: QK }))
      .catch(() => {
        localMigrationStarted = false;
      });
  }, [enabled, queryClient, remoteData]);
}

export function getInventoryAlerts(snapshot: InventoryState): InventoryAlert[] {
  const alerts: InventoryAlert[] = [];
  const today = new Date();

  snapshot.items.forEach((item) => {
    if (item.currentStock <= item.minStock) {
      alerts.push({
        id: `min-${item.id}`,
        title: "Estoque mínimo",
        description: `${item.name} está com ${item.currentStock} ${item.unit}.`,
        tone: item.critical ? "error" : "warning",
        itemId: item.id,
      });
    }

    if (item.critical) {
      alerts.push({
        id: `critical-${item.id}`,
        title: "Peça crítica",
        description: `${item.name} está marcada como crítica.`,
        tone: "error",
        itemId: item.id,
      });
    }

    if (item.validityDate) {
      const validity = new Date(item.validityDate);
      const days = Math.ceil((validity.getTime() - today.getTime()) / 86_400_000);
      if (days <= 30) {
        alerts.push({
          id: `validity-${item.id}`,
          title: "Validade",
          description: days < 0 ? `${item.name} vencido.` : `${item.name} vence em ${days} dias.`,
          tone: days < 0 ? "error" : "warning",
          itemId: item.id,
        });
      }
    }
  });

  if (snapshot.offlineQueue.length > 0) {
    alerts.push({
      id: "offline-queue",
      title: "Sincronização pendente",
      description: `${snapshot.offlineQueue.length} movimentação(ões) aguardando conexão.`,
      tone: "info",
    });
  }

  return alerts;
}

export function useInventoryStore<T>(selector: InventorySelector<T>): T {
  const role = useInventoryRole();
  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const data = await listInventory();
      return {
        items: data.items,
        locations: data.locations,
        movements: data.movements,
      };
    },
    staleTime: 0,
    retry: 1,
    placeholderData: () => {
      const fallback = readStorage();
      return {
        items: fallback.items,
        locations: fallback.locations,
        movements: fallback.movements,
      };
    },
  });

  useLocalInventoryMigration(query.data, query.isSuccess && !query.isPlaceholderData);

  const data = query.data ?? readStorage();
  return selector({
    items: data.items,
    locations: data.locations,
    movements: data.movements,
    offlineQueue: readStorage().offlineQueue,
    currentRole: role,
  });
}

export function useInventoryActions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.refetchQueries({ queryKey: QK, type: "active" });
  };

  const itemMutation = useMutation({
    mutationFn: ({ item, exists }: { item: InventoryItem; exists: boolean }) =>
      exists ? updateInventoryItem({ data: item }) : createInventoryItem({ data: item }),
  });

  const locationMutation = useMutation({
    mutationFn: ({ location, exists }: { location: StockLocation; exists: boolean }) =>
      exists
        ? updateInventoryLocation({ data: location })
        : createInventoryLocation({ data: location }),
  });

  const movementMutation = useMutation({
    mutationFn: ({ item, movement }: { item: InventoryItem; movement: StockMovement }) =>
      createInventoryMovement({ data: { item, movement } }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => deleteInventoryItem({ data: id }),
  });

  const deleteLocationMutation = useMutation({
    mutationFn: (id: string) => deleteInventoryLocation({ data: id }),
  });

  const deleteMovementMutation = useMutation({
    mutationFn: (id: string) => deleteInventoryMovement({ data: id }),
  });

  return {
    setRole(role: InventoryState["currentRole"]) {
      setRoleSnapshot(role);
    },

    async saveItem(draft: InventoryDraft, id?: string) {
      const current = getCachedState(queryClient);
      const existing = current.items.find((item) => item.id === id);
      const code =
        draft.internalCode.trim() || draft.sku.trim() || existing?.internalCode || newId("ITEM");
      const item: InventoryItem = {
        ...draft,
        id: id || newId("IT"),
        internalCode: code,
        name: draft.name.trim(),
        subcategory: draft.subcategory.trim(),
        manufacturer: draft.manufacturer.trim(),
        sku: draft.sku.trim(),
        barcode: draft.barcode.trim(),
        technicalDescription: draft.technicalDescription.trim(),
        locationId: draft.locationId,
        physicalLocation:
          current.locations.find((location) => location.id === draft.locationId)?.name ||
          draft.physicalLocation.trim(),
        minStock: sanitizeNumber(draft.minStock),
        currentStock: sanitizeNumber(draft.currentStock),
        cost: sanitizeNumber(draft.cost),
        supplier: draft.supplier.trim(),
        images: draft.images.filter(Boolean),
        notes: draft.notes.trim(),
        qrCode: existing?.qrCode || qrPayload("ITEM", code),
        updatedAt: nowIso(),
      };

      setCachedInventory(
        queryClient,
        { ...inventoryData(current), items: upsertById(current.items, item) },
        current.offlineQueue,
      );

      try {
        await itemMutation.mutateAsync({ item, exists: Boolean(existing) });
        invalidate();
        return item;
      } catch (error) {
        restoreCachedInventory(queryClient, current);
        throw error;
      }
    },

    async saveLocation(draft: LocationDraft, id?: string) {
      const current = getCachedState(queryClient);
      const existing = current.locations.find((location) => location.id === id);
      const code = draft.code.trim() || existing?.code || newId("LOC");
      const location: StockLocation = {
        ...draft,
        id: id || newId("LC"),
        name: draft.name.trim(),
        code,
        qrCode: existing?.qrCode || qrPayload("LOC", code),
        description: draft.description.trim(),
        updatedAt: nowIso(),
      };

      setCachedInventory(
        queryClient,
        { ...inventoryData(current), locations: upsertById(current.locations, location) },
        current.offlineQueue,
      );

      try {
        await locationMutation.mutateAsync({ location, exists: Boolean(existing) });
        invalidate();
        return location;
      } catch (error) {
        restoreCachedInventory(queryClient, current);
        throw error;
      }
    },

    async applyMovement(draft: MovementDraft) {
      const current = getCachedState(queryClient);
      const item = current.items.find((currentItem) => currentItem.id === draft.itemId);
      if (!item) return null;

      const movement = makeMovement(item, draft);
      const nextItem: InventoryItem = {
        ...item,
        currentStock: movement.nextStock,
        locationId: draft.toLocationId || item.locationId,
        physicalLocation:
          current.locations.find((location) => location.id === draft.toLocationId)?.name ||
          item.physicalLocation,
        updatedAt: nowIso(),
      };

      const syncedMovement = { ...movement, syncStatus: "synced" as const };
      setCachedInventory(
        queryClient,
        {
          ...inventoryData(current),
          items: upsertById(current.items, nextItem),
          movements: upsertById(current.movements, syncedMovement),
        },
        current.offlineQueue,
      );

      try {
        await movementMutation.mutateAsync({
          item: nextItem,
          movement: syncedMovement,
        });
        invalidate();
        return syncedMovement;
      } catch (error) {
        restoreCachedInventory(queryClient, current);
        throw error;
      }
    },

    resolveScan(value: string) {
      const current = getCachedState(queryClient);
      const needle = value.trim().toLowerCase();
      if (!needle) return null;

      const item = current.items.find((candidate) =>
        [
          candidate.qrCode,
          candidate.barcode,
          candidate.internalCode,
          candidate.sku,
          candidate.name,
        ].some((field) => field.toLowerCase() === needle),
      );

      if (item) return { type: "item" as const, item };

      const location = current.locations.find((candidate) =>
        [candidate.qrCode, candidate.code, candidate.name].some(
          (field) => field.toLowerCase() === needle,
        ),
      );

      if (location) return { type: "location" as const, location };

      return null;
    },

    async syncPending() {
      await queryClient.invalidateQueries({ queryKey: QK });
      const { currentRole: _storedRole, ...data } = getCachedState(queryClient);
      writeStorage({ ...data, offlineQueue: [] });
    },

    async removeItem(id: string) {
      const previous = getCachedState(queryClient);
      setCachedInventory(
        queryClient,
        {
          ...inventoryData(previous),
          items: previous.items.filter((item) => item.id !== id),
        },
        previous.offlineQueue,
      );
      try {
        await deleteItemMutation.mutateAsync(id);
        invalidate();
      } catch (error) {
        restoreCachedInventory(queryClient, previous);
        throw error;
      }
    },

    async removeLocation(id: string) {
      const previous = getCachedState(queryClient);
      setCachedInventory(
        queryClient,
        {
          ...inventoryData(previous),
          locations: previous.locations.filter((location) => location.id !== id),
        },
        previous.offlineQueue,
      );
      try {
        await deleteLocationMutation.mutateAsync(id);
        invalidate();
      } catch (error) {
        restoreCachedInventory(queryClient, previous);
        throw error;
      }
    },

    async removeMovement(id: string) {
      const previous = getCachedState(queryClient);
      setCachedInventory(
        queryClient,
        {
          ...inventoryData(previous),
          movements: previous.movements.filter((movement) => movement.id !== id),
        },
        previous.offlineQueue,
      );
      try {
        await deleteMovementMutation.mutateAsync(id);
        invalidate();
      } catch (error) {
        restoreCachedInventory(queryClient, previous);
        throw error;
      }
    },
  };
}

export const inventoryActions = {
  setRole: (): never => {
    throw new Error(
      "inventoryActions.setRole() foi removido. Use useInventoryActions().setRole().",
    );
  },
  saveItem: (): never => {
    throw new Error(
      "inventoryActions.saveItem() foi removido. Use useInventoryActions().saveItem().",
    );
  },
  saveLocation: (): never => {
    throw new Error(
      "inventoryActions.saveLocation() foi removido. Use useInventoryActions().saveLocation().",
    );
  },
  applyMovement: (): never => {
    throw new Error(
      "inventoryActions.applyMovement() foi removido. Use useInventoryActions().applyMovement().",
    );
  },
  resolveScan: (): never => {
    throw new Error(
      "inventoryActions.resolveScan() foi removido. Use useInventoryActions().resolveScan().",
    );
  },
  syncPending: (): never => {
    throw new Error(
      "inventoryActions.syncPending() foi removido. Use useInventoryActions().syncPending().",
    );
  },
} as const;
