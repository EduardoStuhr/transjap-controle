/**
 * Categorizacao deterministica de equipamento para item operacional.
 *
 * A regra independe de data, obra ou contexto de importacao. Combinacoes
 * desconhecidas permanecem sem categoria para revisao de modelo ou subtype.
 */

export const ITEM_KEYS = ["escavacao", "transporte", "tratamento", "compactacao"] as const;

export type Item = (typeof ITEM_KEYS)[number] | "uncategorized";

export const ITEM_LABELS: Record<Item, string> = {
  escavacao: "Escavação",
  transporte: "Transporte",
  tratamento: "Tratamento",
  compactacao: "Compactação",
  uncategorized: "Sem categoria",
};

export type EquipmentForCategorization = {
  model: string;
  subtype?: string | null;
};

function normalize(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function categorizeEquipment(equipment: EquipmentForCategorization): Item {
  const model = normalize(equipment.model);
  const subtype = normalize(equipment.subtype);

  if (model.includes("caminhao")) {
    if (subtype.includes("pipa")) return "tratamento";
    if (subtype.includes("cacamba") || subtype.includes("basculante")) return "transporte";
    return "uncategorized";
  }

  if (model.includes("escavadeira") || model.includes("retroescavadeira")) {
    return "escavacao";
  }

  if (model.includes("rolo")) {
    return "compactacao";
  }

  if (model.includes("trator")) {
    return "tratamento";
  }

  if (
    model.includes("moto niveladora") ||
    model.includes("motoniveladora") ||
    model.includes("patrol")
  ) {
    return "tratamento";
  }

  return "uncategorized";
}

export function categorizeMany<T extends EquipmentForCategorization>(
  list: T[],
): Array<T & { item: Item }> {
  return list.map((equipment) => ({
    ...equipment,
    item: categorizeEquipment(equipment),
  }));
}

export function findUncategorized<T extends EquipmentForCategorization & { id: string }>(
  list: T[],
): T[] {
  return list.filter((equipment) => categorizeEquipment(equipment) === "uncategorized");
}
