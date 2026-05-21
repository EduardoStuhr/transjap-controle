import { AUTH_USER_OPTIONS } from "@/lib/auth-store";
import type { Equipment } from "@/lib/equipment-store";

export const ASSIGNMENT_OPTIONS = ["Todos", ...AUTH_USER_OPTIONS.map((user) => user.name)] as const;

const ALL_USER_NAMES = AUTH_USER_OPTIONS.map((user) => user.name);

/**
 * Resolve a tasks's assignedTo list into the actual recipient names.
 * "Todos" expands to every registered auth user.
 */
export function resolveRecipients(assignedTo: readonly string[]): string[] {
  if (assignedTo.includes("Todos")) return ALL_USER_NAMES;
  return assignedTo.filter((name) => name && name !== "Todos");
}

export const SECTOR_OPTIONS = [
  "Operacional",
  "Manutenção",
  "Almoxarifado",
  "Administrativo",
  "Compras",
  "Estoque",
  "Oficina",
  "Financeiro",
  "Segurança",
  "Diretoria",
] as const;

export const EQUIPMENT_OPTIONS = [
  "Escavadeira CAT 320",
  "Caminhão Volvo FH-540",
  "Trator Komatsu D61",
  "Pá Carregadeira CAT 950",
  "Empilhadeira Hyster H80",
  "Gerador Stemac 180kVA",
  "Compressor Atlas Copco",
  "Bomba Hidráulica Principal",
] as const;

export type EquipmentOption = {
  value: string;
  label: string;
};

export function normalizeFleetId(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return "";

  const withoutPrefix = trimmed.replace(/^FROTA\s*/, "").replace(/^FR[-\s]*/, "");
  const compact = withoutPrefix.replace(/[^A-Z0-9]/g, "");
  if (!compact) return "";

  if (/^\d+$/.test(compact)) {
    return `FR-${compact.padStart(3, "0")}`;
  }

  return `FR-${compact}`;
}

export function formatEquipmentLabel(equipment: Pick<Equipment, "id" | "model">): string {
  return `FROTA ${equipment.id} - ${equipment.model}`;
}

export function buildEquipmentOptions(
  equipments: Pick<Equipment, "id" | "model">[],
): EquipmentOption[] {
  if (equipments.length > 0) {
    return equipments.map((equipment) => ({
      value: equipment.id,
      label: formatEquipmentLabel(equipment),
    }));
  }

  return EQUIPMENT_OPTIONS.map((equipment) => ({
    value: equipment,
    label: equipment,
  }));
}

export function formatEquipmentReference(
  value: string | undefined,
  equipments: Pick<Equipment, "id" | "model">[],
): string {
  if (!value) return "";
  const normalized = normalizeFleetId(value);
  const match = equipments.find(
    (equipment) =>
      equipment.id === value ||
      equipment.id === normalized ||
      equipment.model === value ||
      formatEquipmentLabel(equipment) === value,
  );

  return match ? formatEquipmentLabel(match) : value;
}

export const MAINTENANCE_TYPE_OPTIONS = [
  "Preventiva",
  "Corretiva",
  "Inspeção",
  "Troca de óleo",
  "Hidráulica",
  "Mecânica",
] as const;

export function normalizeOption<T extends readonly string[]>(
  value: string | undefined,
  options: T,
  fallback: T[number],
): T[number] {
  return options.includes(value || "") ? (value as T[number]) : fallback;
}
