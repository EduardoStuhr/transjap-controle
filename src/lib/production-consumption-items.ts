import { FLEET_EQUIPMENT_CATALOG } from "@/lib/fleet-equipment-catalog";
import { normalizeFleet } from "@/lib/carcara-parser";
import {
  displayEquipmentLabel,
  isAggregateEquipment,
  normalizeEquipmentKey,
  type EquipmentContext,
} from "@/lib/equipment-normalization";

export type OperationalItem =
  | "limpeza"
  | "escavacao"
  | "transporte"
  | "tratamento"
  | "compactacao"
  | "outros";

export const OPERATIONAL_ITEM_LABELS: Record<OperationalItem, string> = {
  limpeza: "Limpeza",
  escavacao: "Escavação",
  transporte: "Transporte",
  tratamento: "Tratamento",
  compactacao: "Compactação",
  outros: "Outros",
};

export const OPERATIONAL_ITEM_ORDER: OperationalItem[] = [
  "limpeza",
  "escavacao",
  "transporte",
  "tratamento",
  "compactacao",
  "outros",
];

export type OperationalItemInput = {
  prefix?: string | null;
  fleet?: string | null;
  plate?: string | null;
  equipment?: string | null;
  equipmentLabel?: string | null;
  obra?: string | null;
  vehicleType?: string | null;
  type?: string | null;
  model?: string | null;
  description?: string | null;
  raw?: unknown;
};

export type PipaLikeInput = {
  prefix?: string | null;
  fleet?: string | null;
  plate?: string | null;
  vehicleType?: string | null;
  type?: string | null;
  model?: string | null;
  description?: string | null;
  equipmentLabel?: string | null;
  raw?: unknown;
};

export type EquipmentOperationalClass = {
  key: string;
  label: string;
  item: OperationalItem;
  isAggregate: boolean;
  reason: string;
  classificationSource: "fixed" | "aggregate" | "catalog" | "text" | "fallback";
};

export const FIXED_CLEANING_FLEET = "236";
export const CAMPO_LOG_CLEANING_FLEET = "238";
export const CAMPO_LOG_CLEANING_WORKSITE = "Campo Log 05";

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

function rawStringValues(value: unknown, depth = 0): string[] {
  if (value == null || depth > 2) return [];
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => rawStringValues(item, depth + 1));
  return Object.values(value as Record<string, unknown>).flatMap((item) =>
    rawStringValues(item, depth + 1),
  );
}

function catalogModelsForValues(values: readonly string[]) {
  return values
    .map((value) => catalogByFleet.get(normalizeFleet(value)))
    .filter((model): model is string => Boolean(model));
}

function rawFleetLikeValues(value: unknown): string[] {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  return [
    record.prefix,
    record.fleet,
    record.fleetLabel,
    record.fleet_label,
    record.vehicleId,
    record.vehicle_id,
    record.equipment,
    record.equipmentId,
    record.equipment_id,
    record.equipmentLabel,
    record.equipment_label,
  ].flatMap((item) => rawStringValues(item));
}

function rawWorksiteLikeValues(value: unknown): string[] {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  return [
    record.obra,
    record.worksite,
    record.resolvedObraLabel,
    record.resolved_obra_label,
    record.obraOriginal,
    record.obra_original,
  ].flatMap((item) => rawStringValues(item));
}

function hasFleet(input: OperationalItemInput, fleet: string): boolean {
  const values = [
    input.prefix,
    input.fleet,
    input.equipment,
    input.equipmentLabel,
    ...rawFleetLikeValues(input.raw),
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));

  return values.some(
    (value) => normalizeEquipmentKey(value, { source: "ownFleet" }) === `FROTA:${fleet}`,
  );
}

function normalizeWorksite(value: string | null | undefined) {
  return normalizeText(value).replace(/\b0+([0-9]+)\b/g, "$1");
}

export function isFixedCleaningFleet(input: OperationalItemInput): boolean {
  return hasFleet(input, FIXED_CLEANING_FLEET);
}

export function isCampoLogCleaningFleet(input: OperationalItemInput): boolean {
  if (!hasFleet(input, CAMPO_LOG_CLEANING_FLEET)) return false;
  const targetWorksite = normalizeWorksite(CAMPO_LOG_CLEANING_WORKSITE);
  return [input.obra, ...rawWorksiteLikeValues(input.raw)].some(
    (value) => normalizeWorksite(value) === targetWorksite,
  );
}

export function isPipaLike(input: PipaLikeInput): boolean {
  const directValues = [
    input.prefix,
    input.fleet,
    input.plate,
    input.vehicleType,
    input.type,
    input.model,
    input.description,
    input.equipmentLabel,
    ...rawStringValues(input.raw),
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const catalogValues = [
    input.prefix,
    input.fleet,
    input.equipmentLabel,
    ...rawFleetLikeValues(input.raw),
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const text = normalizeText([...directValues, ...catalogModelsForValues(catalogValues)].join(" "));
  return /\b(pipa|caminhao\s+pipa|tanque|irrigacao|water\s+truck)\b/.test(text);
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
  if (/\b(rolo|compactador|hamm|dynapac|muller|cp533|ca\s*25|ca\s*30)\b/.test(text)) {
    return { item: "compactacao", reason: "texto/modelo indica rolo ou compactador" };
  }

  if (/\b(caminhao|caminhao|carreta|truck|truk|basculante|cacamba|rodotrem)\b/.test(text)) {
    if (/\b(pipa|comboio|prancha|tanque|irrigacao|water\s+truck)\b/.test(text)) {
      return { item: "tratamento", reason: "texto/modelo indica caminhao pipa/comboio/prancha" };
    }
    return { item: "transporte", reason: "texto/modelo indica caminhao/agregado de transporte" };
  }

  if (/\b(escavadeira|retro escavadeira|retroescavadeira|carregadeira)\b/.test(text)) {
    return { item: "escavacao", reason: "texto/modelo indica escavadeira ou carregadeira" };
  }

  if (
    /\b(pipa|tanque|irrigacao|water\s+truck|moto niveladora|motoniveladora|niveladora|patrol|trator|esteira|d6|d5|grade|bomba)\b/.test(
      text,
    )
  ) {
    return {
      item: "tratamento",
      reason: "texto/modelo indica tratamento, patrol, trator ou apoio",
    };
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
  const value = input.fleet || input.equipment || input.prefix || input.equipmentLabel || "";
  const context: EquipmentContext = {
    description: [input.type, input.model, input.description].filter(Boolean).join(" "),
  };
  const key = normalizeEquipmentKey(value, context);
  const aggregate = isAggregateEquipment(value, context);
  const label = displayEquipmentLabel(value, context);

  const fixedCleaningFleet = isFixedCleaningFleet(input)
    ? FIXED_CLEANING_FLEET
    : isCampoLogCleaningFleet(input)
      ? CAMPO_LOG_CLEANING_FLEET
      : null;

  if (fixedCleaningFleet) {
    return {
      key: `FROTA:${fixedCleaningFleet}`,
      label: `FROTA ${fixedCleaningFleet}`,
      item: "limpeza",
      isAggregate: false,
      reason:
        fixedCleaningFleet === FIXED_CLEANING_FLEET
          ? `regra fixa da frota ${FIXED_CLEANING_FLEET}: classificada como Limpeza`
          : `regra da frota ${CAMPO_LOG_CLEANING_FLEET} em ${CAMPO_LOG_CLEANING_WORKSITE}: classificada como Limpeza`,
      classificationSource: "fixed",
    };
  }

  if (
    isPipaLike({
      prefix: input.prefix,
      fleet: input.fleet || input.equipment,
      plate: input.plate,
      vehicleType: input.vehicleType,
      type: input.type,
      model: input.model,
      description: input.description,
      equipmentLabel: input.equipmentLabel || label,
      raw: input.raw,
    })
  ) {
    return {
      key,
      label,
      item: "tratamento",
      isAggregate: false,
      reason: "Pipa redirecionado para Tratamento",
      classificationSource: "text",
    };
  }

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
