import { useSyncExternalStore } from "react";
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

const STORAGE_KEY = "transjap:fleet-command:inventory:v1";

const EMPTY_STATE: InventoryState = {
  items: [],
  locations: [],
  movements: [],
  offlineQueue: [],
  currentRole: "administrador",
};

let state: InventoryState = EMPTY_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

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

function writeStorage(nextState: InventoryState) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function ensureHydrated() {
  if (hydrated || !isBrowser()) return;
  hydrated = true;
  state = readStorage();
}

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(updater: (current: InventoryState) => InventoryState) {
  ensureHydrated();
  state = updater(state);
  writeStorage(state);
  emit();
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

export const inventoryActions = {
  setRole(role: InventoryState["currentRole"]) {
    setState((current) => ({ ...current, currentRole: role }));
  },

  saveItem(draft: InventoryDraft, id?: string) {
    const code = draft.internalCode.trim() || draft.sku.trim() || newId("ITEM");

    setState((current) => {
      const existing = current.items.find((item) => item.id === id);
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

      return {
        ...current,
        items: existing
          ? current.items.map((currentItem) => (currentItem.id === id ? item : currentItem))
          : [item, ...current.items],
      };
    });
  },

  saveLocation(draft: LocationDraft, id?: string) {
    const code = draft.code.trim() || newId("LOC");

    setState((current) => {
      const existing = current.locations.find((location) => location.id === id);
      const location: StockLocation = {
        ...draft,
        id: id || newId("LC"),
        name: draft.name.trim(),
        code,
        qrCode: existing?.qrCode || qrPayload("LOC", code),
        description: draft.description.trim(),
        updatedAt: nowIso(),
      };

      return {
        ...current,
        locations: existing
          ? current.locations.map((currentLocation) =>
              currentLocation.id === id ? location : currentLocation,
            )
          : [location, ...current.locations],
      };
    });
  },

  applyMovement(draft: MovementDraft) {
    let movement: StockMovement | null = null;

    setState((current) => {
      const item = current.items.find((currentItem) => currentItem.id === draft.itemId);
      if (!item) return current;

      movement = makeMovement(item, draft);

      return {
        ...current,
        items: current.items.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                currentStock: movement!.nextStock,
                locationId: draft.toLocationId || currentItem.locationId,
                physicalLocation:
                  current.locations.find((location) => location.id === draft.toLocationId)?.name ||
                  currentItem.physicalLocation,
                updatedAt: nowIso(),
              }
            : currentItem,
        ),
        movements: [movement, ...current.movements],
        offlineQueue:
          movement.syncStatus === "pending"
            ? [movement, ...current.offlineQueue]
            : current.offlineQueue,
      };
    });

    return movement;
  },

  resolveScan(value: string) {
    const needle = value.trim().toLowerCase();
    if (!needle) return null;

    ensureHydrated();

    const item = state.items.find((candidate) =>
      [
        candidate.qrCode,
        candidate.barcode,
        candidate.internalCode,
        candidate.sku,
        candidate.name,
      ].some((field) => field.toLowerCase() === needle),
    );

    if (item) return { type: "item" as const, item };

    const location = state.locations.find((candidate) =>
      [candidate.qrCode, candidate.code, candidate.name].some(
        (field) => field.toLowerCase() === needle,
      ),
    );

    if (location) return { type: "location" as const, location };

    return null;
  },

  syncPending() {
    setState((current) => ({
      ...current,
      movements: current.movements.map((movement) => ({ ...movement, syncStatus: "synced" })),
      offlineQueue: [],
    }));
  },
};

export function useInventoryStore<T>(selector: (state: InventoryState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);

      if (!hydrated && isBrowser()) {
        queueMicrotask(() => {
          ensureHydrated();
          emit();
        });
      }

      if (isBrowser()) {
        window.addEventListener("storage", handleStorageEvent);
        window.addEventListener("online", handleOnline);
      }

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && isBrowser()) {
          window.removeEventListener("storage", handleStorageEvent);
          window.removeEventListener("online", handleOnline);
        }
      };
    },
    () => selector(state),
    () => selector(EMPTY_STATE),
  );
}

function handleStorageEvent(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  state = readStorage();
  emit();
}

function handleOnline() {
  inventoryActions.syncPending();
}
