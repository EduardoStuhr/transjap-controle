import { FLEET_EQUIPMENT_CATALOG } from "@/lib/fleet-equipment-catalog";
import { normalizeFleet } from "@/lib/carcara-parser";

export type OperationalItem =
  | "escavacao"
  | "transporte"
  | "tratamento"
  | "compactacao"
  | "outros";

export const OPERATIONAL_ITEM_LABELS: Record<OperationalItem, string> = {
  escavacao: "Escavação",
  transporte: "Transporte",
  tratamento: "Tratamento",
  compactacao: "Compactação",
  outros: "Outros",
};

export const OPERATIONAL_ITEM_ORDER: OperationalItem[] = [
  "escavacao",
  "transporte",
  "tratamento",
  "compactacao",
  "outros",
];

export type OperationalItemInput = {
  fleet?: string | null;
  equipment?: string | null;
  type?: string | null;
  model?: string | null;
  description?: string | null;
};

const catalogByFleet = new Map(
  FLEET_EQUIPMENT_CATALOG.map((item) => [normalizeFleet(item.id), item.model]),
);

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function joinedSearchText(input: OperationalItemInput) {
  const fleet = normalizeFleet(input.fleet || input.equipment || "");
  const catalogModel = fleet ? catalogByFleet.get(fleet) : "";
  return normalizeText(
    [input.fleet, input.equipment, input.type, input.model, input.description, catalogModel]
      .filter(Boolean)
      .join(" "),
  );
}

export function resolveOperationalItem(input: OperationalItemInput): OperationalItem {
  const text = joinedSearchText(input);

  if (
    /\b(rolo|compactador|compactacao|hamm|dynapac|muller|cp533|ca\s*25|ca\s*30)\b/.test(text)
  ) {
    return "compactacao";
  }

  if (/\b(caminhao|caminhao|carreta|truck|truk|basculante|cacamba|rodotrem)\b/.test(text)) {
    if (/\b(pipa|comboio|prancha|tanque)\b/.test(text)) return "tratamento";
    return "transporte";
  }

  if (/\b(escavadeira|escavacao|retro escavadeira|retroescavadeira|carregadeira)\b/.test(text)) {
    return "escavacao";
  }

  if (
    /\b(pipa|moto niveladora|motoniveladora|niveladora|patrol|trator|esteira|d6|d5|grade|bomba)\b/.test(
      text,
    )
  ) {
    return "tratamento";
  }

  return "outros";
}

export function operationalItemLabel(item: OperationalItem) {
  return OPERATIONAL_ITEM_LABELS[item];
}

export function operationalItemRank(item: OperationalItem) {
  return OPERATIONAL_ITEM_ORDER.indexOf(item);
}
