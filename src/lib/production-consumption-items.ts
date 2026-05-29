import { FLEET_EQUIPMENT_CATALOG } from "@/lib/fleet-equipment-catalog";
import { normalizeFleet } from "@/lib/carcara-parser";
import {
  displayEquipmentLabel,
  isAggregateEquipment,
  normalizeEquipmentKey,
  type EquipmentContext,
} from "@/lib/equipment-normalization";

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

export type EquipmentOperationalClass = {
  key: string;
  label: string;
  item: OperationalItem;
  isAggregate: boolean;
  reason: string;
  classificationSource: "aggregate" | "catalog" | "text" | "fallback";
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
  const value = input.fleet || input.equipment || "";
  const context: EquipmentContext = {
    description: [input.type, input.model, input.description].filter(Boolean).join(" "),
  };
  const equipmentKey = normalizeEquipmentKey(value, context);
  const fleet = equipmentKey.startsWith("FROTA:")
    ? equipmentKey.slice("FROTA:".length)
    : normalizeFleet(input.fleet || input.equipment || "");
  const catalogModel = fleet ? catalogByFleet.get(fleet) : "";
  return normalizeText(
    [
      input.fleet,
      input.equipment,
      displayEquipmentLabel(value, context),
      input.type,
      input.model,
      input.description,
      catalogModel,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function itemFromText(text: string): { item: OperationalItem; reason: string } | null {
  if (
    /\b(rolo|compactador|hamm|dynapac|muller|cp533|ca\s*25|ca\s*30)\b/.test(text)
  ) {
    return { item: "compactacao", reason: "texto/modelo indica rolo ou compactador" };
  }

  if (/\b(caminhao|caminhao|carreta|truck|truk|basculante|cacamba|rodotrem)\b/.test(text)) {
    if (/\b(pipa|comboio|prancha|tanque)\b/.test(text)) {
      return { item: "tratamento", reason: "texto/modelo indica caminhao pipa/comboio/prancha" };
    }
    return { item: "transporte", reason: "texto/modelo indica caminhao/agregado de transporte" };
  }

  if (/\b(escavadeira|retro escavadeira|retroescavadeira|carregadeira)\b/.test(text)) {
    return { item: "escavacao", reason: "texto/modelo indica escavadeira ou carregadeira" };
  }

  if (
    /\b(pipa|moto niveladora|motoniveladora|niveladora|patrol|trator|esteira|d6|d5|grade|bomba)\b/.test(
      text,
    )
  ) {
    return { item: "tratamento", reason: "texto/modelo indica tratamento, patrol, trator ou apoio" };
  }

  return null;
}

function catalogModelForKey(key: string) {
  if (!key.startsWith("FROTA:")) return "";
  return catalogByFleet.get(key.slice("FROTA:".length)) ?? "";
}

export function resolveEquipmentOperationalClass(
  input: OperationalItemInput,
): EquipmentOperationalClass {
  const value = input.fleet || input.equipment || "";
  const context: EquipmentContext = {
    description: [input.type, input.model, input.description].filter(Boolean).join(" "),
  };
  const key = normalizeEquipmentKey(value, context);
  const aggregate = isAggregateEquipment(value, context);
  const label = displayEquipmentLabel(value, context);

  if (aggregate) {
    return {
      key,
      label,
      item: "transporte",
      isAggregate: true,
      reason: "identificador normalizado como CB/agregado",
      classificationSource: "aggregate",
    };
  }

  const catalogModel = catalogModelForKey(key);
  const catalogMatch = itemFromText(normalizeText(catalogModel));
  if (catalogMatch) {
    return {
      key,
      label,
      item: catalogMatch.item,
      isAggregate: false,
      reason: `catalogo: ${catalogModel}`,
      classificationSource: "catalog",
    };
  }

  const directText = normalizeText(
    [input.fleet, input.equipment, displayEquipmentLabel(value, context), input.type, input.model]
      .filter(Boolean)
      .join(" "),
  );
  const directMatch = itemFromText(directText);
  if (directMatch) {
    return {
      key,
      label,
      item: directMatch.item,
      isAggregate: false,
      reason: directMatch.reason,
      classificationSource: "text",
    };
  }

  const fallbackMatch = itemFromText(joinedSearchText(input));
  if (fallbackMatch) {
    return {
      key,
      label,
      item: fallbackMatch.item,
      isAggregate: false,
      reason: `${fallbackMatch.reason}; fallback com descricao`,
      classificationSource: "fallback",
    };
  }

  return {
    key,
    label,
    item: "outros",
    isAggregate: false,
    reason: "sem correspondencia no catalogo ou texto operacional",
    classificationSource: "fallback",
  };
}

export function resolveOperationalItem(input: OperationalItemInput): OperationalItem {
  return resolveEquipmentOperationalClass(input).item;
}

export function operationalItemLabel(item: OperationalItem) {
  return OPERATIONAL_ITEM_LABELS[item];
}

export function operationalItemRank(item: OperationalItem) {
  return OPERATIONAL_ITEM_ORDER.indexOf(item);
}
