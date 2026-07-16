import type { Equipment } from "@/lib/equipment-store";
import type { MaintenanceRecord, MaintenanceStatus } from "@/lib/maintenance-store";
import { formatEquipmentLabel, normalizeFleetId } from "@/lib/operational-options";

export const ACTIVE_MAINTENANCE_STATUSES: MaintenanceStatus[] = [
  "Aberta",
  "Em andamento",
  "Atrasada",
];

function parseCreatedAt(createdAt: string): number {
  if (!createdAt) return 0;
  if (createdAt.includes("/")) {
    const [datePart] = createdAt.split(",");
    const [d, m, y] = datePart.trim().split("/").map(Number);
    if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(y)) {
      return new Date(y, m - 1, d).getTime();
    }
    return 0;
  }

  const parsed = new Date(createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function activePriority(status: MaintenanceStatus): number {
  if (status === "Atrasada") return 0;
  if (status === "Em andamento") return 1;
  return 2;
}

export function isActiveMaintenanceRecord(record: Pick<MaintenanceRecord, "status">) {
  return ACTIVE_MAINTENANCE_STATUSES.includes(record.status);
}

export function sortActiveMaintenanceRecords(records: MaintenanceRecord[]) {
  return [...records].sort((a, b) => {
    const priority = activePriority(a.status) - activePriority(b.status);
    if (priority !== 0) return priority;
    return parseCreatedAt(a.createdAt) - parseCreatedAt(b.createdAt);
  });
}

export function findEquipmentForMaintenanceRecord(
  record: Pick<MaintenanceRecord, "equipment">,
  equipments: Equipment[],
) {
  const normalized = normalizeFleetId(record.equipment);
  return (
    equipments.find(
      (equipment) =>
        equipment.id === record.equipment ||
        equipment.id === normalized ||
        equipment.model === record.equipment ||
        formatEquipmentLabel(equipment) === record.equipment,
    ) ?? null
  );
}

function equipmentKey(record: Pick<MaintenanceRecord, "equipment">, equipment: Equipment) {
  return normalizeFleetId(equipment.id || record.equipment).toLocaleLowerCase("pt-BR");
}

export function getStoppedMaintenanceRecords(
  records: MaintenanceRecord[],
  equipments: Equipment[],
): MaintenanceRecord[] {
  const byEquipment = new Map<string, MaintenanceRecord>();
  const activeRecords = sortActiveMaintenanceRecords(records.filter(isActiveMaintenanceRecord));

  activeRecords.forEach((record) => {
    const equipment = findEquipmentForMaintenanceRecord(record, equipments);
    if (!equipment || equipment.status !== "Parado") return;

    const key = equipmentKey(record, equipment);
    if (!byEquipment.has(key)) byEquipment.set(key, record);
  });

  return Array.from(byEquipment.values());
}
