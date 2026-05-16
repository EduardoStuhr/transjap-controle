import { useSyncExternalStore } from "react";

export type EquipmentStatus = "Operação" | "Manutenção" | "Parado";
export type EquipmentTone = "success" | "warning" | "error";

export type Equipment = {
  id: string;
  model: string;
  icon: string;
  hours: number;
  status: EquipmentStatus;
  tone: EquipmentTone;
  location: string;
  lastMaintenance: string;
  seriesNumber?: string;
  acquisitionDate?: string;
  manufacturer?: string;
};

export type EquipmentDraft = Omit<Equipment, "id">;

type EquipmentState = {
  equipments: Equipment[];
};

const STORAGE_KEY = "transjap:fleet-command:equipamentos:v1";

const SEED_EQUIPMENTS: Equipment[] = [
  {
    id: "FR-001",
    model: "Escavadeira CAT 320",
    icon: "snowmobile",
    hours: 8420,
    status: "Operação",
    tone: "success",
    location: "Obra Norte",
    lastMaintenance: "12/05/2026",
    seriesNumber: "CAT320-2019-001",
    acquisitionDate: "01/03/2019",
    manufacturer: "Caterpillar",
  },
  {
    id: "FR-002",
    model: "Caminhão Volvo FH-540",
    icon: "local_shipping",
    hours: 12345,
    status: "Manutenção",
    tone: "warning",
    location: "Oficina",
    lastMaintenance: "10/05/2026",
    seriesNumber: "VOLVO-FH540-2018-002",
    acquisitionDate: "15/08/2018",
    manufacturer: "Volvo",
  },
  {
    id: "FR-003",
    model: "Trator Komatsu D61",
    icon: "agriculture",
    hours: 5210,
    status: "Operação",
    tone: "success",
    location: "Obra Sul",
    lastMaintenance: "08/05/2026",
    seriesNumber: "KOMATSU-D61-2020-003",
    acquisitionDate: "22/11/2020",
    manufacturer: "Komatsu",
  },
  {
    id: "FR-004",
    model: "Pá Carregadeira CAT 950",
    icon: "construction",
    hours: 9876,
    status: "Parado",
    tone: "error",
    location: "Pátio",
    lastMaintenance: "05/05/2026",
    seriesNumber: "CAT950-2017-004",
    acquisitionDate: "10/07/2017",
    manufacturer: "Caterpillar",
  },
  {
    id: "FR-005",
    model: "Empilhadeira Hyster H80",
    icon: "forklift",
    hours: 3210,
    status: "Operação",
    tone: "success",
    location: "Almoxarifado",
    lastMaintenance: "04/05/2026",
    seriesNumber: "HYSTER-H80-2021-005",
    acquisitionDate: "14/02/2021",
    manufacturer: "Hyster",
  },
];

const EMPTY_STATE: EquipmentState = { equipments: [] };
const SEED_STATE: EquipmentState = { equipments: SEED_EQUIPMENTS };

let state: EquipmentState = EMPTY_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeState(value: unknown): EquipmentState {
  if (!value || typeof value !== "object") return SEED_STATE;
  const stored = value as Partial<EquipmentState>;
  return {
    equipments: Array.isArray(stored.equipments) ? stored.equipments : [],
  };
}

function readStorage(): EquipmentState {
  if (!isBrowser()) return SEED_STATE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : SEED_STATE;
  } catch {
    return SEED_STATE;
  }
}

function writeStorage(nextState: EquipmentState) {
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

function setState(updater: (current: EquipmentState) => EquipmentState) {
  ensureHydrated();
  state = updater(state);
  writeStorage(state);
  emit();
}

function nextEquipmentId(equipments: Equipment[]) {
  const maxSuffix = equipments.reduce((acc, equipment) => {
    const match = /^FR-(\d+)$/.exec(equipment.id);
    if (!match) return acc;
    return Math.max(acc, parseInt(match[1], 10));
  }, 0);

  return `FR-${String(maxSuffix + 1).padStart(3, "0")}`;
}

function trim(value?: string) {
  return value?.trim() || undefined;
}

function normalizeDraft(draft: EquipmentDraft): EquipmentDraft {
  return {
    model: draft.model.trim(),
    icon: draft.icon.trim(),
    hours: Number.isFinite(draft.hours) ? Math.max(0, draft.hours) : 0,
    status: draft.status,
    tone: draft.tone,
    location: draft.location.trim(),
    lastMaintenance: draft.lastMaintenance.trim(),
    seriesNumber: trim(draft.seriesNumber),
    acquisitionDate: trim(draft.acquisitionDate),
    manufacturer: trim(draft.manufacturer),
  };
}

export const equipmentActions = {
  add(draft: EquipmentDraft): Equipment {
    ensureHydrated();
    const equipment: Equipment = {
      id: nextEquipmentId(state.equipments),
      ...normalizeDraft(draft),
    };

    setState((current) => ({
      ...current,
      equipments: [equipment, ...current.equipments],
    }));

    return equipment;
  },

  update(id: string, draft: Partial<EquipmentDraft>): void {
    setState((current) => ({
      ...current,
      equipments: current.equipments.map((equipment) => {
        if (equipment.id !== id) return equipment;
        const merged: EquipmentDraft = {
          model: draft.model ?? equipment.model,
          icon: draft.icon ?? equipment.icon,
          hours: draft.hours ?? equipment.hours,
          status: draft.status ?? equipment.status,
          tone: draft.tone ?? equipment.tone,
          location: draft.location ?? equipment.location,
          lastMaintenance: draft.lastMaintenance ?? equipment.lastMaintenance,
          seriesNumber: draft.seriesNumber ?? equipment.seriesNumber,
          acquisitionDate: draft.acquisitionDate ?? equipment.acquisitionDate,
          manufacturer: draft.manufacturer ?? equipment.manufacturer,
        };
        return { id: equipment.id, ...normalizeDraft(merged) };
      }),
    }));
  },

  remove(id: string): void {
    setState((current) => ({
      ...current,
      equipments: current.equipments.filter((equipment) => equipment.id !== id),
    }));
  },
};

export function useEquipmentStore<T>(selector: (state: EquipmentState) => T): T {
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
      }

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && isBrowser()) {
          window.removeEventListener("storage", handleStorageEvent);
        }
      };
    },
    () => selector(state),
    () => selector(SEED_STATE),
  );
}

function handleStorageEvent(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  state = readStorage();
  emit();
}
