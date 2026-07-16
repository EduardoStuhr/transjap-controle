import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listEquipment,
  createEquipment,
  updateEquipment,
  updateFleetLocation,
  deleteEquipment,
} from "@/lib/api/equipment";
import { FLEET_EQUIPMENT_CATALOG } from "@/lib/fleet-equipment-catalog";
import { INITIAL_FLEET_LOCATIONS, INITIAL_FLEET_MODELS } from "@/lib/fleet-location-defaults";

// ─── Public types (unchanged) ────────────────────────────────────────────────

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

export type EquipmentDraft = Pick<Equipment, "id" | "model" | "location" | "hours" | "status"> &
  Partial<Omit<Equipment, "id" | "model" | "location" | "hours" | "status">>;

// Seed data exported for reference / other modules
export const SEED_EQUIPMENTS: Equipment[] = [
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
  ...FLEET_EQUIPMENT_CATALOG.map(({ id, model }) => ({
    id,
    model: INITIAL_FLEET_MODELS[id] ?? model,
    icon: "construction",
    hours: 0,
    status: "Operação" as EquipmentStatus,
    tone: "success" as EquipmentTone,
    location: INITIAL_FLEET_LOCATIONS[id] ?? "",
    lastMaintenance: "",
    seriesNumber: "",
    acquisitionDate: "",
    manufacturer: "",
  })),
];

// ─── React Query internals ────────────────────────────────────────────────────

const QK = ["equipment"] as const;

type EquipmentState = { equipments: Equipment[] };
type Selector<T> = (state: EquipmentState) => T;

function statusTone(status: EquipmentStatus): EquipmentTone {
  if (status === "Manutenção") return "warning";
  if (status === "Parado") return "error";
  return "success";
}

function getCachedEquipments(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.getQueryData<Equipment[]>(QK) ?? SEED_EQUIPMENTS;
}

function setCachedEquipments(
  queryClient: ReturnType<typeof useQueryClient>,
  equipments: Equipment[],
) {
  queryClient.setQueryData<Equipment[]>(QK, equipments);
}

function upsertEquipment(equipments: Equipment[], equipment: Equipment, previousId?: string) {
  return [
    ...equipments.filter((current) => current.id !== equipment.id && current.id !== previousId),
    equipment,
  ];
}

function draftToEquipment(draft: EquipmentDraft, previous?: Equipment): Equipment {
  return {
    ...previous,
    id: draft.id,
    model: draft.model,
    icon: draft.icon ?? previous?.icon ?? "construction",
    hours: draft.hours,
    status: draft.status,
    tone: draft.tone ?? statusTone(draft.status),
    location: draft.location,
    lastMaintenance: draft.lastMaintenance ?? previous?.lastMaintenance ?? "",
    seriesNumber: draft.seriesNumber ?? previous?.seriesNumber ?? "",
    acquisitionDate: draft.acquisitionDate ?? previous?.acquisitionDate ?? "",
    manufacturer: draft.manufacturer ?? previous?.manufacturer ?? "",
  };
}

/**
 * Drop-in replacement for the old useSyncExternalStore-based hook.
 * Selector signature is identical — no component changes needed.
 */
export function useEquipmentStore<T>(selector: Selector<T>): T {
  const { data } = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const rows = await listEquipment();
      // Drizzle returns DB rows; cast to the app-level Equipment type.
      // Field names already match (lastMaintenance, seriesNumber, etc.)
      // because the schema uses JS camelCase keys mapped to snake_case columns.
      return rows as unknown as Equipment[];
    },
    staleTime: 0,
    // Show seed data while the real source loads, without treating it as cached data.
    placeholderData: SEED_EQUIPMENTS,
  });

  return selector({ equipments: data ?? SEED_EQUIPMENTS });
}

/**
 * Mutation actions. Call this hook in a component, then use the returned
 * add/update/remove functions in event handlers.
 */
export function useEquipmentActions() {
  const qc = useQueryClient();

  const addMut = useMutation({
    mutationFn: (draft: EquipmentDraft) =>
      createEquipment({ data: draft as Parameters<typeof createEquipment>[0]["data"] }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<EquipmentDraft> }) =>
      updateEquipment({
        data: { id, patch: patch as Parameters<typeof updateEquipment>[0]["data"]["patch"] },
      }),
  });

  const updateLocationMut = useMutation({
    mutationFn: ({
      id,
      obraAtual,
      status,
    }: {
      id: string;
      obraAtual: string;
      status: EquipmentStatus;
    }) => updateFleetLocation({ data: { id, obraAtual, status } }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteEquipment({ data: id }),
  });

  return {
    async add(draft: EquipmentDraft) {
      await qc.cancelQueries({ queryKey: QK });
      const previous = getCachedEquipments(qc);
      const optimistic = draftToEquipment(draft);
      setCachedEquipments(qc, upsertEquipment(previous, optimistic));

      try {
        const saved = (await addMut.mutateAsync(draft)) as unknown as Equipment;
        setCachedEquipments(qc, upsertEquipment(getCachedEquipments(qc), saved, optimistic.id));
        return saved;
      } catch (error) {
        setCachedEquipments(qc, previous);
        throw error;
      }
    },
    async update(id: string, patch: Partial<EquipmentDraft>) {
      await qc.cancelQueries({ queryKey: QK });
      const previous = getCachedEquipments(qc);
      const existing = previous.find((equipment) => equipment.id === id);
      const optimistic =
        existing &&
        draftToEquipment(
          {
            ...existing,
            ...patch,
            id: patch.id ?? existing.id,
            model: patch.model ?? existing.model,
            location: patch.location ?? existing.location,
            hours: patch.hours ?? existing.hours,
            status: patch.status ?? existing.status,
          },
          existing,
        );

      if (optimistic) {
        setCachedEquipments(qc, upsertEquipment(previous, optimistic, id));
      }

      try {
        const saved = (await updateMut.mutateAsync({ id, patch })) as unknown as Equipment;
        setCachedEquipments(qc, upsertEquipment(getCachedEquipments(qc), saved, id));
        return saved;
      } catch (error) {
        setCachedEquipments(qc, previous);
        throw error;
      }
    },
    async updateLocation(id: string, obraAtual: string, status: EquipmentStatus) {
      await qc.cancelQueries({ queryKey: QK });
      const previous = getCachedEquipments(qc);
      const existing = previous.find((equipment) => equipment.id === id);
      const optimistic =
        existing &&
        draftToEquipment(
          {
            ...existing,
            location: obraAtual,
            status,
            tone: statusTone(status),
          },
          existing,
        );

      if (optimistic) {
        setCachedEquipments(qc, upsertEquipment(previous, optimistic, id));
      }

      try {
        const saved = (await updateLocationMut.mutateAsync({
          id,
          obraAtual,
          status,
        })) as unknown as Equipment;
        setCachedEquipments(qc, upsertEquipment(getCachedEquipments(qc), saved, id));
        return saved;
      } catch (error) {
        setCachedEquipments(qc, previous);
        throw error;
      }
    },
    async remove(id: string) {
      await qc.cancelQueries({ queryKey: QK });
      const previous = getCachedEquipments(qc);
      setCachedEquipments(
        qc,
        previous.filter((equipment) => equipment.id !== id),
      );

      try {
        const result = await removeMut.mutateAsync(id);
        return result;
      } catch (error) {
        setCachedEquipments(qc, previous);
        throw error;
      }
    },
  };
}

/**
 * Shim kept for backwards-compatibility.
 * Any remaining direct call to equipmentActions.* will throw at runtime
 * with a clear message pointing to the hook-based replacement.
 * Migrate callers to useEquipmentActions() inside their component.
 */
export const equipmentActions = {
  add: (): never => {
    throw new Error(
      "equipmentActions.add() foi removido. Use useEquipmentActions().add() dentro de um componente React.",
    );
  },
  update: (): never => {
    throw new Error(
      "equipmentActions.update() foi removido. Use useEquipmentActions().update() dentro de um componente React.",
    );
  },
  remove: (): never => {
    throw new Error(
      "equipmentActions.remove() foi removido. Use useEquipmentActions().remove() dentro de um componente React.",
    );
  },
} as const;
