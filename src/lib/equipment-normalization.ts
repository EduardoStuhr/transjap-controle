import { normalizeFleet } from "@/lib/carcara-parser";
import { FLEET_EQUIPMENT_CATALOG } from "@/lib/fleet-equipment-catalog";

export type EquipmentSource =
  | "dailyPart"
  | "fueling"
  | "fuelAllocation"
  | "fuelAttribution"
  | "trip"
  | "aggregate"
  | "ownFleet";

export type EquipmentKind = "ownFleet" | "aggregate";

export type EquipmentContext =
  | EquipmentSource
  | {
      source?: EquipmentSource;
      kind?: EquipmentKind;
      description?: string | null;
    };

const aggregateModelByFleet = new Set(
  FLEET_EQUIPMENT_CATALOG.filter((item) =>
    /basculante|truck|truk|carreta|rodotrem/i.test(item.model),
  ).map((item) => normalizeFleet(item.id)),
);

const ownFleetCatalogByFleet = new Set(FLEET_EQUIPMENT_CATALOG.map((item) => normalizeFleet(item.id)));

function contextSource(context?: EquipmentContext) {
  return typeof context === "string" ? context : context?.source;
}

function contextKind(context?: EquipmentContext) {
  return typeof context === "string" ? undefined : context?.kind;
}

function contextDescription(context?: EquipmentContext) {
  return typeof context === "string" ? "" : context?.description ?? "";
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function extractCbNumber(text: string) {
  const match = text.match(/\bC\s*B\s*0*([0-9]+)\b/) ?? text.match(/\bCB\s*0*([0-9]+)\b/);
  return match?.[1] ?? "";
}

function extractFleetNumber(text: string) {
  const withoutCb = text.replace(/\bC\s*B\s*0*[0-9]+\b/g, " ");
  const explicit =
    withoutCb.match(/\bFROTA\s*0*([0-9]+)\b/) ??
    withoutCb.match(/\bPATROL\s*0*([0-9]+)\b/) ??
    withoutCb.match(/\bMOTONIVELADORA\s*0*([0-9]+)\b/) ??
    withoutCb.match(/\bMAQUINA\s*0*([0-9]+)\b/) ??
    withoutCb.match(/\bAGREGADO\s*0*([0-9]+)\b/) ??
    withoutCb.match(/\bCAMINHAO\s*0*([0-9]+)\b/) ??
    withoutCb.match(/\bBASCULANTE\s*0*([0-9]+)\b/) ??
    withoutCb.match(/\bTRUCK\s*0*([0-9]+)\b/) ??
    withoutCb.match(/\bTRUK\s*0*([0-9]+)\b/);
  if (explicit?.[1]) return explicit[1];

  const compact = normalizeFleet(withoutCb);
  if (/^[0-9]+$/.test(compact)) return String(Number(compact));
  return "";
}

function explicitAggregateText(text: string) {
  if (/\b(C\s*B|CB|AGREGADO)\b/.test(text)) return true;
  if (/\b(PIPA|WATER\s*TRUCK|MOTONIVELADORA|MOTO\s*NIVELADORA|PATROL|TRATOR|ESTEIRA|ROLO|COMPACTADOR|ESCAVADEIRA|CARREGADEIRA)\b/.test(text)) {
    return false;
  }
  return /\b(CAMINHAO|BASCULANTE|TRUCK|TRUK|CARRETA|RODOTREM)\b/.test(text);
}

function isAggregateContext(context?: EquipmentContext) {
  const source = contextSource(context);
  return (
    contextKind(context) === "aggregate" ||
    source === "trip" ||
    source === "aggregate"
  );
}

function isOwnFleetContext(context?: EquipmentContext) {
  const source = contextSource(context);
  return (
    contextKind(context) === "ownFleet" ||
    source === "dailyPart" ||
    source === "fuelAllocation" ||
    source === "fuelAttribution" ||
    source === "ownFleet"
  );
}

export function resolveEquipmentKind(
  value: string | null | undefined,
  context?: EquipmentContext,
): EquipmentKind {
  const text = normalizeText([value, contextDescription(context)].filter(Boolean).join(" "));
  const fleet = extractFleetNumber(text);

  if (isOwnFleetContext(context)) return "ownFleet";
  if (fleet && ownFleetCatalogByFleet.has(fleet)) return "ownFleet";
  if (explicitAggregateText(text)) return "aggregate";
  if (isAggregateContext(context)) return "aggregate";
  if (fleet && aggregateModelByFleet.has(fleet)) return "aggregate";

  return "ownFleet";
}

export function normalizeEquipmentKey(
  value: string | null | undefined,
  context?: EquipmentContext,
): string {
  const text = normalizeText(value);
  if (!text) return "";

  const cb = extractCbNumber(text);
  if (cb) return `CB:${String(Number(cb))}`;

  const fleet = extractFleetNumber(text);
  if (fleet) {
    return resolveEquipmentKind(value, context) === "aggregate" ? `CB:${fleet}` : `FROTA:${fleet}`;
  }

  return normalizeFleet(text) || text.replace(/\s+/g, "_");
}

export function displayEquipmentLabel(
  value: string | null | undefined,
  context?: EquipmentContext,
): string {
  const key = normalizeEquipmentKey(value, context);
  if (key.startsWith("CB:")) return `CB ${key.slice(3)}`;
  if (key.startsWith("FROTA:")) return `FROTA ${key.slice(6)}`;
  return String(value ?? "").trim() || "SEM EQUIPAMENTO";
}

export function equipmentMatches(
  left: string | null | undefined,
  right: string | null | undefined,
  context?: EquipmentContext,
) {
  const leftKey = normalizeEquipmentKey(left, context);
  const rightKey = normalizeEquipmentKey(right, context);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function isAggregateEquipment(value: string | null | undefined, context?: EquipmentContext) {
  return normalizeEquipmentKey(value, context).startsWith("CB:");
}

export function sortEquipmentLabels(values: string[]) {
  return [...values].sort((left, right) => {
    const leftKey = normalizeEquipmentKey(left);
    const rightKey = normalizeEquipmentKey(right);
    const leftIsFleet = leftKey.startsWith("FROTA:");
    const rightIsFleet = rightKey.startsWith("FROTA:");
    const leftIsCb = leftKey.startsWith("CB:");
    const rightIsCb = rightKey.startsWith("CB:");
    if (leftIsFleet !== rightIsFleet) return leftIsFleet ? -1 : 1;
    if (leftIsCb !== rightIsCb) return leftIsCb ? -1 : 1;
    const leftNumber = Number(leftKey.split(":")[1]);
    const rightNumber = Number(rightKey.split(":")[1]);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }
    return left.localeCompare(right, "pt-BR", { numeric: true });
  });
}
