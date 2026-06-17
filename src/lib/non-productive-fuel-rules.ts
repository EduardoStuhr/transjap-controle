import { normalizeFleet } from "@/lib/carcara-parser";
import { FLEET_EQUIPMENT_CATALOG } from "@/lib/fleet-equipment-catalog";
import type { OperationalItem } from "@/lib/production-consumption-items";
import { extractDateKey, normalizeObraKey } from "@/lib/production-consumption-utils";

export type NonProductiveFuelRule = {
  obraKey: string;
  item: OperationalItem;
  equipmentCategory: "escavadeira";
  dateEnd: string;
  dateStartProductive: string;
  reason: string;
};

export const nonProductiveFuelRules: readonly NonProductiveFuelRule[] = [
  {
    obraKey: "rdg_flecha",
    item: "escavacao",
    equipmentCategory: "escavadeira",
    dateEnd: "2026-05-07",
    dateStartProductive: "2026-05-08",
    reason: "Diesel de escavadeira anterior à produção TransJap; custo/serviço de outra empresa.",
  },
];

export type NonProductiveFuelInput = {
  obra?: string | null;
  obraKey?: string | null;
  date?: string | Date | null;
  item: OperationalItem;
  equipmentKey?: string | null;
  equipmentLabel?: string | null;
  rawEquipment?: string | null;
  vehicleType?: string | null;
  description?: string | null;
};

const catalogModelByFleet = new Map(
  FLEET_EQUIPMENT_CATALOG.map((equipment) => [normalizeFleet(equipment.id), equipment.model]),
);

function normalizeSearchText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function catalogModelForEquipment(value: string | null | undefined) {
  const normalized = normalizeSearchText(value);
  const keyFleet = normalized.match(/\b(?:FROTA|FR)\s*0*([0-9]+)\b/)?.[1];
  const rawFleet = normalizeFleet(value);
  const fleet = keyFleet || (/^[0-9]+$/.test(rawFleet) ? rawFleet : "");
  return fleet ? (catalogModelByFleet.get(String(Number(fleet))) ?? "") : "";
}

function matchesEquipmentCategory(
  category: NonProductiveFuelRule["equipmentCategory"],
  input: NonProductiveFuelInput,
) {
  const searchText = normalizeSearchText(
    [
      input.equipmentKey,
      input.equipmentLabel,
      input.rawEquipment,
      input.vehicleType,
      input.description,
      catalogModelForEquipment(input.equipmentKey),
      catalogModelForEquipment(input.equipmentLabel),
      catalogModelForEquipment(input.rawEquipment),
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (category === "escavadeira") {
    return /\b(?:MINI\s+)?(?:RETRO\s+)?ESCAVADEIRA\b/.test(searchText);
  }

  return false;
}

export function excludedFuelFromProductionRule(input: NonProductiveFuelInput) {
  const date = extractDateKey(input.date);
  const obraKey = normalizeObraKey(input.obraKey || input.obra);
  if (!date || !obraKey) return null;

  return (
    nonProductiveFuelRules.find((rule) => {
      if (normalizeObraKey(rule.obraKey) !== obraKey) return false;
      if (input.item !== rule.item) return false;
      if (date > rule.dateEnd) return false;
      return matchesEquipmentCategory(rule.equipmentCategory, input);
    }) ?? null
  );
}
