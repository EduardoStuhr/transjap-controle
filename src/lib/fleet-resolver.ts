import type { DbEquipment } from "@/db/schema";
import { categorizeEquipment, ITEM_LABELS, type Item } from "@/lib/equipment-categorization";

/**
 * Extracts the first consecutive fleet-number sequence without changing its display form.
 * Matching normalizes leading zeros separately so both "1" and "FR-001" resolve together.
 */
export function extractFleetNumber(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).match(/\d{1,5}/)?.[0] ?? "";
}

function comparableFleetNumber(text: string | null | undefined): string {
  return extractFleetNumber(text).replace(/^0+(?=\d)/, "");
}

export type ResolvedFleet = {
  fleetNumber: string;
  equipment: DbEquipment | null;
};

export function resolveFleet(fleetFromSheet: string, equipmentList: DbEquipment[]): ResolvedFleet {
  const fleetNumber = extractFleetNumber(fleetFromSheet);
  const matchKey = comparableFleetNumber(fleetFromSheet);
  if (!matchKey) return { fleetNumber: "", equipment: null };

  for (const equipment of equipmentList) {
    if (comparableFleetNumber(equipment.id) === matchKey) {
      return { fleetNumber, equipment };
    }
  }

  for (const equipment of equipmentList) {
    if (comparableFleetNumber(equipment.model) === matchKey) {
      return { fleetNumber, equipment };
    }
  }

  for (const equipment of equipmentList) {
    if (equipment.seriesNumber && comparableFleetNumber(equipment.seriesNumber) === matchKey) {
      return { fleetNumber, equipment };
    }
  }

  return { fleetNumber, equipment: null };
}

export function resolveFleets(
  fleets: string[],
  equipmentList: DbEquipment[],
): Map<string, ResolvedFleet> {
  const seen = new Set<string>();
  const result = new Map<string, ResolvedFleet>();

  for (const fleet of fleets) {
    const matchKey = comparableFleetNumber(fleet);
    if (!matchKey || seen.has(matchKey)) continue;

    seen.add(matchKey);
    const resolved = resolveFleet(fleet, equipmentList);
    result.set(resolved.fleetNumber, resolved);
  }

  return result;
}

export type FleetCategorization = {
  fleetNumber: string;
  equipment: DbEquipment | null;
  item: Item;
  itemLabel: string;
  reason: "ok" | "no_equipment" | "uncategorized";
};

export function categorizeFleet(
  fleetFromSheet: string,
  equipmentList: DbEquipment[],
): FleetCategorization {
  const { fleetNumber, equipment } = resolveFleet(fleetFromSheet, equipmentList);

  if (!equipment) {
    return {
      fleetNumber,
      equipment: null,
      item: "uncategorized",
      itemLabel: ITEM_LABELS.uncategorized,
      reason: "no_equipment",
    };
  }

  const item = categorizeEquipment({
    model: equipment.model,
    subtype: equipment.subtype,
  });

  return {
    fleetNumber,
    equipment,
    item,
    itemLabel: ITEM_LABELS[item],
    reason: item === "uncategorized" ? "uncategorized" : "ok",
  };
}
