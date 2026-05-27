import type { WorkBook } from "xlsx";

export type ParsedTrip = {
  id: string;
  datetime: string;
  operation: string;
  operator: string;
  owner: string;
  plate: string;
  vehicleId: string;
  prefix: string;
  driver: string;
  obra: string;
  origin: string;
  destination: string;
  km: number;
  material: string;
  weight: number;
  cubicMLoose: number;
  unitPrice: number;
  total: number;
  status?: string;
};

export type ParsedFueling = {
  id: string;
  datetime: string;
  owner: string;
  plate: string;
  vehicleId: string;
  prefix: string;
  vehicleType: string;
  kmPrevious: number;
  kmCurrent: number;
  liters: number;
  unitPrice: number;
  total: number;
  consumption: number;
  standardConsumption: number;
  operator: string;
  obra: string;
  status?: string;
};

export type ParsedDailyPart = {
  fleet: string;
  fleetLabel: string;
  date: string;
  obra: string;
  hours: number;
  horimInicial?: number;
  horimFinal?: number;
  sourceSheet: string;
};

export type PdeWarning = {
  sheet: string;
  row: number;
  value: unknown;
  reason: string;
};

export type PdeParseResult = {
  rows: ParsedDailyPart[];
  warnings: PdeWarning[];
};

export type PdeColumnMapping = {
  startRow: number;
  dateColumn: string;
  hoursColumn: string;
  fleetColumn?: string;
  obraColumn?: string;
  sheetName?: string;
};

export type ParseResult =
  | { type: "trips"; rows: ParsedTrip[] }
  | { type: "fueling"; rows: ParsedFueling[] }
  | { type: "unknown"; message: string };

export type CarcaraFileType = "trips" | "fueling";

const trim = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const text = String(v)
    .replace(/[^\d,.-]/g, "")
    .trim();
  const normalized =
    text.includes(",") && text.includes(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
};
function isEmptyValue(v: unknown) {
  return v == null || String(v).trim() === "";
}
function safeIsoDateTimeFromDate(date: Date): string {
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
function parseBrazilianDateTime(value: string): string {
  const match = value
    .trim()
    .match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return "";
  const [, d, m, y, h = "0", min = "0", s = "0"] = match;
  const year = Number(y.length === 2 ? `20${y}` : y);
  const date = new Date(
    Date.UTC(year, Number(m) - 1, Number(d), Number(h), Number(min), Number(s)),
  );
  return safeIsoDateTimeFromDate(date);
}
const dt = (v: unknown): string => {
  if (!v) return "";
  if (v instanceof Date) return safeIsoDateTimeFromDate(v);
  if (typeof v === "number") {
    const ms = (v - 25569) * 86400 * 1000;
    return safeIsoDateTimeFromDate(new Date(ms));
  }
  const br = parseBrazilianDateTime(String(v));
  if (br) return br;
  return safeIsoDateTimeFromDate(new Date(String(v)));
};

export function normalizeFleet(v: unknown): string {
  const text = String(v ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const number = text.match(/\d+/)?.[0];
  return number ? String(Number(number)) : text.replace(/[^A-Z0-9]/g, "");
}

function dateKeyFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function safeParseDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return dateKeyFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return null;
    return dateKeyFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = trim(value);
  if (!text) return null;
  const br = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (br) {
    const [, d, m, y] = br;
    const year = Number(y.length === 2 ? `20${y}` : y);
    return dateKeyFromParts(year, Number(m), Number(d));
  }
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return dateKeyFromParts(Number(y), Number(m), Number(d));
  }
  return null;
}

export function normalizeDateKey(v: unknown): string {
  return safeParseDate(v) ?? "";
}

function parsePdeHours(value: unknown): number | null {
  if (isEmptyValue(value)) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    if (value > 0 && value < 1) return value * 24;
    return value;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.getUTCHours() + value.getUTCMinutes() / 60 + value.getUTCSeconds() / 3600;
  }
  const text = trim(value).toLowerCase();
  const hourMinute = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hourMinute) {
    const [, h, m, s] = hourMinute;
    return Number(h) + Number(m) / 60 + Number(s ?? 0) / 3600;
  }
  const decimal = Number.parseFloat(text.replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(decimal) || decimal <= 0) return null;
  return decimal > 0 && decimal < 1 ? decimal * 24 : decimal;
}

/**
 * Parses PDE meter cells such as numbers, "1234" and "1.234,56".
 * Returns null for empty or non-numeric status cells.
 */
function parsePdeNumeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  if (/[a-zA-ZçÇãÃõÕáÁéÉíÍóÓúÚ]/.test(text)) return null;
  const normalized = text.replace(/\./g, "").replace(",", ".");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeHeader(s: unknown): string {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const RCO_KEY = normalizeHeader("NºColeta");
const RCO_FALLBACKS = [
  normalizeHeader("Nº Coleta"),
  normalizeHeader("NoColeta"),
  normalizeHeader("N°Coleta"),
];
const CMB_KEY = normalizeHeader("NºAbastecimento");
const CMB_FALLBACKS = [
  normalizeHeader("Nº Abastecimento"),
  normalizeHeader("NoAbastecimento"),
  normalizeHeader("N°Abastecimento"),
];

const RCO_INDICATORS = [
  RCO_KEY,
  ...RCO_FALLBACKS,
  normalizeHeader("Prefixo"),
  normalizeHeader("Volume"),
  normalizeHeader("Cap.m³"),
  normalizeHeader("Material"),
];
const CMB_INDICATORS = [
  CMB_KEY,
  ...CMB_FALLBACKS,
  normalizeHeader("Litros"),
  normalizeHeader("Qt.Litros"),
  normalizeHeader("Combustível"),
  normalizeHeader("Equipamento"),
  normalizeHeader("Tipo Veículo"),
];

function scoreHeaders(normRow: string[], indicators: string[]) {
  return indicators.reduce((score, indicator) => {
    if (normRow.includes(indicator)) return score + 1;
    if (normRow.some((header) => header.includes(indicator) || indicator.includes(header))) {
      return score + 1;
    }
    return score;
  }, 0);
}

function findHeaderRow(aoa: unknown[][]): { rowIndex: number; type: CarcaraFileType } | null {
  const limit = Math.min(15, aoa.length);
  for (let i = 0; i < limit; i++) {
    const row = aoa[i] || [];
    const normRow = row.map(normalizeHeader);
    const hasRco = normRow.includes(RCO_KEY) || RCO_FALLBACKS.some((k) => normRow.includes(k));
    const hasCmb = normRow.includes(CMB_KEY) || CMB_FALLBACKS.some((k) => normRow.includes(k));
    if (hasRco) return { rowIndex: i, type: "trips" };
    if (hasCmb) return { rowIndex: i, type: "fueling" };
    const rcoScore = scoreHeaders(normRow, RCO_INDICATORS);
    const cmbScore = scoreHeaders(normRow, CMB_INDICATORS);
    if (rcoScore >= 3 && rcoScore > cmbScore) return { rowIndex: i, type: "trips" };
    if (cmbScore >= 3 && cmbScore > rcoScore) return { rowIndex: i, type: "fueling" };
  }
  return null;
}

function findBestHeaderRow(aoa: unknown[][], type: CarcaraFileType): number | null {
  const expected =
    type === "trips"
      ? ["Data/Hora", "Operação", "Placa", "Prefixo", "Obra", "Material", "Cap.m³", "Total"]
      : [
          "Data/Hora",
          "Placa",
          "Prefixo",
          "Tipo Veículo",
          "Qt.Litros",
          "Unitário",
          "Total",
          "Consumo",
        ];
  const keys = expected.map(normalizeHeader);
  let best = { rowIndex: -1, score: 0 };

  for (let i = 0; i < Math.min(15, aoa.length); i++) {
    const row = aoa[i] || [];
    const normRow = row.map(normalizeHeader);
    const score = keys.filter((key) => normRow.includes(key)).length;
    if (score > best.score) best = { rowIndex: i, score };
  }

  return best.score >= 3 ? best.rowIndex : null;
}

export async function parseCarcaraFile(
  file: File,
  forcedType?: CarcaraFileType,
): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb: WorkBook = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

  const detected = findHeaderRow(aoa);
  const forcedRow = forcedType ? findBestHeaderRow(aoa, forcedType) : null;
  const found = forcedType
    ? { rowIndex: forcedRow ?? detected?.rowIndex ?? 4, type: forcedType }
    : detected;
  if (!found) {
    const firstHeaders = (aoa[4] || aoa[5] || aoa[6] || []).map(trim).filter(Boolean).slice(0, 8);
    const sample = firstHeaders.length ? ` Headers encontrados: ${firstHeaders.join(", ")}` : "";
    return {
      type: "unknown",
      message: `Formato não reconhecido. Esperado RCO (NºColeta) ou CMB (NºAbastecimento) do Carcara.${sample}`,
    };
  }

  const rawHeaders = (aoa[found.rowIndex] || []).map((h) => trim(h));
  const normHeaders = rawHeaders.map(normalizeHeader);
  const idx = (...names: string[]) => {
    const keys = names.map(normalizeHeader);
    return normHeaders.findIndex((h) => keys.includes(h));
  };
  const data = aoa.slice(found.rowIndex + 1).filter((r) => r && r[0] != null && r[0] !== "");

  if (found.type === "trips") {
    const rows: ParsedTrip[] = data
      .map((r) => ({
        id: trim(r[idx("NºColeta", "Nº Coleta", "NoColeta", "N°Coleta")]),
        datetime: dt(r[idx("Data/Hora")]),
        operation: trim(r[idx("Operação")]),
        operator: trim(r[idx("Operador")]),
        owner: trim(r[idx("Proprietário")]),
        plate: trim(r[idx("Placa")]),
        vehicleId: trim(r[idx("Id")]),
        prefix: trim(r[idx("Prefixo")]),
        driver: trim(r[idx("Motorista")]),
        obra: trim(r[idx("Obra")]),
        origin: trim(r[idx("Origem")]),
        destination: trim(r[idx("Destino")]),
        km: num(r[idx("Km")]),
        material: trim(r[idx("Material")]),
        weight: num(r[idx("Peso")]),
        cubicMLoose: num(r[idx("Cap.m³")]),
        unitPrice: num(r[idx("Unitário")]),
        total: num(r[idx("Total")]),
        status: trim(r[idx("Status")]) || undefined,
      }))
      .filter((row) => row.id);
    return { type: "trips", rows };
  }

  const rows: ParsedFueling[] = data
    .map((r) => ({
      id: trim(r[idx("NºAbastecimento", "Nº Abastecimento", "NoAbastecimento", "N°Abastecimento")]),
      datetime: dt(r[idx("Data/Hora")]),
      owner: trim(r[idx("Proprietário")]),
      plate: trim(r[idx("Placa")]),
      vehicleId: trim(r[idx("Id")]),
      prefix: trim(r[idx("Prefixo")]),
      vehicleType: trim(r[idx("Tipo Veículo")]),
      kmPrevious: num(r[idx("Km Ant")]),
      kmCurrent: num(r[idx("Km/Hs Atual")]),
      liters: num(r[idx("Qt.Litros")]),
      unitPrice: num(r[idx("Unitário")]),
      total: num(r[idx("Total")]),
      consumption: num(r[idx("Consumo")]),
      standardConsumption: num(r[idx("Cons.Padrão")]),
      operator: trim(r[idx("Operador")]),
      obra: trim(r[idx("Obra")]),
      status: trim(r[idx("Status")]) || undefined,
    }))
    .filter((row) => row.id);
  return { type: "fueling", rows };
}

type CarcaraPdeLayout = {
  headerRow: number;
  dateCol: number;
  hoursCol: number;
  horimInicialCol: number;
  horimFinalCol: number;
  obraCol: number;
  fleet: string;
  fleetLabel: string;
};

/**
 * Detecta o layout específico da PDE Carcará (TransJap).
 * Assinatura única: linha contendo "DIA" na coluna A e "DATA" na coluna B.
 */
function detectCarcaraPdeLayout(aoa: unknown[][], sheetName: string): CarcaraPdeLayout | null {
  let headerRow = -1;
  for (let i = 0; i < Math.min(20, aoa.length); i++) {
    const row = aoa[i] || [];
    const normalized = row.map(normalizeHeader);
    const colA = normalized[0];
    const colB = normalized[1];
    const hasCarcaraHeader =
      colA === "dia" &&
      colB === "data" &&
      normalized.some((h) => h === "h. inicial" || h === "h inicial") &&
      normalized.some((h) => h === "h. final" || h === "h final") &&
      normalized.includes("total");
    if ((colA === "dia" && colB === "data") || hasCarcaraHeader) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) return null;

  const header = (aoa[headerRow] || []).map(normalizeHeader);
  const groupingRow = headerRow > 0 ? (aoa[headerRow - 1] || []).map(normalizeHeader) : [];

  let hoursCol = -1;
  for (let c = 0; c < groupingRow.length; c++) {
    if (groupingRow[c] && groupingRow[c].includes("horas trabalhadas")) {
      for (let cc = c; cc < Math.min(c + 5, header.length); cc++) {
        if (header[cc] === "total") {
          hoursCol = cc;
          break;
        }
      }
      break;
    }
  }
  if (hoursCol < 0) hoursCol = 4;

  let horimInicialCol = -1;
  let horimFinalCol = -1;
  for (let c = 0; c < header.length; c++) {
    const h = header[c];
    if (h === "h. inicial" || h === "h inicial") horimInicialCol = c;
    if (h === "h. final" || h === "h final") horimFinalCol = c;
  }
  if (horimInicialCol < 0) horimInicialCol = 2;
  if (horimFinalCol < 0) horimFinalCol = 3;

  let obraCol = -1;
  for (let c = 0; c < Math.max(header.length, groupingRow.length); c++) {
    if (header[c] === "obra" || groupingRow[c] === "obra") {
      obraCol = c;
      break;
    }
  }
  if (obraCol < 0) obraCol = 8;

  let fleet = "";
  let fleetLabel = "";
  for (let i = 0; i < Math.min(10, aoa.length); i++) {
    const row = aoa[i] || [];
    for (let c = 0; c < row.length - 1; c++) {
      if (normalizeHeader(row[c]) === "frota") {
        const fleetValue = row[c + 1];
        if (!isEmptyValue(fleetValue)) {
          fleet = normalizeFleet(fleetValue);
          const modelValue = row[c + 2];
          fleetLabel = `${trim(fleetValue)}${modelValue ? ` — ${trim(modelValue)}` : ""}`;
          break;
        }
      }
    }
    if (fleet) break;
  }

  if (!fleet) {
    fleet = normalizeFleet(sheetName);
    fleetLabel = sheetName;
  }
  if (!fleet) return null;

  return {
    headerRow,
    dateCol: 1,
    hoursCol,
    horimInicialCol,
    horimFinalCol,
    obraCol,
    fleet,
    fleetLabel,
  };
}

function parseCarcaraPdeSheet(
  aoa: unknown[][],
  sheetName: string,
  layout: CarcaraPdeLayout,
  rows: ParsedDailyPart[],
  _warnings: PdeWarning[],
  options?: { dateFrom?: string; dateTo?: string },
) {
  let consecutiveEmpty = 0;
  const dataRows = aoa.slice(layout.headerRow + 1);

  for (let lineIndex = 0; lineIndex < dataRows.length; lineIndex++) {
    const row = dataRows[lineIndex];
    const rowNumber = layout.headerRow + lineIndex + 2;

    const rowEmpty = !row || row.every((c) => isEmptyValue(c));
    if (rowEmpty) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 20) break;
      continue;
    }
    consecutiveEmpty = 0;

    if (isSeparatorRow(row)) continue;

    const dataOriginal = row[layout.dateCol];
    const dataConvertida = safeParseDate(dataOriginal);
    if (!dataConvertida) continue;

    if (options?.dateFrom && dataConvertida < options.dateFrom) continue;
    if (options?.dateTo && dataConvertida > options.dateTo) continue;

    const horas = parsePdeHours(row[layout.hoursCol]);
    if (horas == null || horas <= 0) continue;

    const horimInicial = parsePdeNumeric(row[layout.horimInicialCol]) ?? 0;
    const horimFinal = parsePdeNumeric(row[layout.horimFinalCol]) ?? 0;

    rows.push({
      fleet: layout.fleet,
      fleetLabel: layout.fleetLabel,
      date: dataConvertida,
      obra: layout.obraCol >= 0 ? trim(row[layout.obraCol]) : "",
      hours: horas,
      horimInicial,
      horimFinal,
      sourceSheet: `${sheetName}#${rowNumber}`,
    });
  }
}

function findDailyPartHeaderRow(aoa: unknown[][]): number | null {
  let best = { rowIndex: -1, score: 0 };
  for (let i = 0; i < Math.min(25, aoa.length); i++) {
    const normRow = (aoa[i] || []).map(normalizeHeader);
    const score =
      scoreHeaders(normRow, [
        normalizeHeader("Data"),
        normalizeHeader("Dia"),
        normalizeHeader("Frota"),
        normalizeHeader("Equipamento"),
        normalizeHeader("Horas"),
        normalizeHeader("Horas Trabalhadas"),
        normalizeHeader("Obra"),
      ]) + (normRow.some((h) => h.includes("hora")) ? 1 : 0);
    if (score > best.score) best = { rowIndex: i, score };
  }
  return best.score >= 2 ? best.rowIndex : null;
}

function columnToIndex(value?: string): number {
  const text = trim(value).toUpperCase();
  if (!text) return -1;
  const numeric = Number.parseInt(text, 10);
  if (Number.isFinite(numeric) && numeric > 0) return numeric - 1;
  if (!/^[A-Z]+$/.test(text)) return -1;
  return text.split("").reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function isSeparatorRow(row: unknown[]) {
  const text = row.map(trim).filter(Boolean).join(" ").toLowerCase();
  return !text || /\b(total|totais|subtotal|cabecalho|cabeçalho|separador)\b/.test(text);
}

// FIX 2: blacklist de abas que não são equipamento individual
const PDE_SHEET_BLACKLIST = [
  "dados auxiliares",
  "mes",
  "mês",
  "consumo litro diario",
  "consumo litro diário",
  "dias trabalhados",
  "localizacao frotas",
  "localização frotas",
  "comparacao",
  "comparação",
];

function shouldParsePdeSheet(name: string): boolean {
  const n = name
    .normalize("NFKD")
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (PDE_SHEET_BLACKLIST.includes(n)) return false;
  if (n.startsWith("resumo ")) return false;
  return /\d+\s*-\s*\S/.test(n);
}

export async function parsePdeFile(
  file: File,
  mapping?: PdeColumnMapping,
  options?: { dateFrom?: string; dateTo?: string; requiredFleets?: Set<string> },
): Promise<PdeParseResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb: WorkBook = XLSX.read(buf, { type: "array", cellDates: true });
  const rows: ParsedDailyPart[] = [];
  const warnings: PdeWarning[] = [];

  for (const sheetName of wb.SheetNames) {
    if (mapping?.sheetName && mapping.sheetName !== sheetName) continue;
    // FIX 2: ignora abas que não são de equipamento individual
    if (!mapping?.sheetName && !shouldParsePdeSheet(sheetName)) continue;
    const sheet = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

    if (!mapping) {
      const carcaraLayout = detectCarcaraPdeLayout(aoa, sheetName);
      if (carcaraLayout) {
        if (
          options?.requiredFleets &&
          options.requiredFleets.size > 0 &&
          !options.requiredFleets.has(carcaraLayout.fleet)
        ) {
          continue;
        }
        parseCarcaraPdeSheet(aoa, sheetName, carcaraLayout, rows, warnings, options);
        continue;
      }
    }

    // filtra abas genéricas de frotas que não estão no CMB (só frotas próprias operam)
    if (!mapping?.sheetName && options?.requiredFleets && options.requiredFleets.size > 0) {
      const sheetFleetKey = normalizeFleet(sheetName);
      if (!sheetFleetKey || !options.requiredFleets.has(sheetFleetKey)) continue;
    }

    const headerRow = mapping ? Math.max(0, mapping.startRow - 1) : findDailyPartHeaderRow(aoa);
    if (headerRow == null) {
      warnings.push({
        sheet: sheetName,
        row: 0,
        value: "",
        reason: "Não foi possível identificar datas válidas nesta aba.",
      });
      continue;
    }

    const sheetFleet = normalizeFleet(sheetName);
    const headers = (aoa[headerRow] || []).map(normalizeHeader);
    const idx = (...names: string[]) => {
      const keys = names.map(normalizeHeader);
      return headers.findIndex(
        (header) => keys.includes(header) || keys.some((key) => header.includes(key)),
      );
    };
    const dateIdx = mapping ? columnToIndex(mapping.dateColumn) : idx("Data", "Dia", "Dt");
    const fleetIdx = mapping
      ? columnToIndex(mapping.fleetColumn)
      : idx("Frota", "Equipamento", "Máquina", "Maquina", "Prefixo");
    const obraIdx = mapping
      ? columnToIndex(mapping.obraColumn)
      : idx("Obra", "Centro de Custo", "Local");
    const hoursIdx = mapping
      ? columnToIndex(mapping.hoursColumn)
      : idx("Horas Trabalhadas", "Horas", "Hr", "Hrs", "Horímetro", "Horimetro");

    if (dateIdx < 0 || hoursIdx < 0) {
      warnings.push({
        sheet: sheetName,
        row: headerRow + 1,
        value: { dateColumn: mapping?.dateColumn, hoursColumn: mapping?.hoursColumn },
        reason: "Coluna de data ou horas não identificada.",
      });
      continue;
    }

    let validDatesInSheet = 0;
    // FIX 3: parada precoce para linhas vazias consecutivas (células fantasma do Excel)
    let consecutiveEmpty = 0;
    const dataRows = aoa.slice(headerRow + 1);

    for (let lineIndex = 0; lineIndex < dataRows.length; lineIndex++) {
      const row = dataRows[lineIndex];
      const rowNumber = headerRow + lineIndex + 2;

      const rowEmpty = !row || row.every((c) => isEmptyValue(c));
      if (rowEmpty) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 20) break;
        continue;
      }
      consecutiveEmpty = 0;

      if (isSeparatorRow(row)) continue;

      try {
        const dataOriginal = row[dateIdx];
        const dataConvertida = safeParseDate(dataOriginal);
        const rawFleet = fleetIdx >= 0 ? row[fleetIdx] : sheetName;
        const frota = normalizeFleet(rawFleet) || sheetFleet;
        const horas = parsePdeHours(row[hoursIdx]);

        if (!dataConvertida) {
          if (!isEmptyValue(dataOriginal)) {
            warnings.push({
              sheet: sheetName,
              row: rowNumber,
              value: dataOriginal,
              reason: "Data inválida na PDE.",
            });
          }
          continue;
        }
        validDatesInSheet++;

        // FIX 4: descarta linhas fora do período selecionado pelo usuário
        if (options?.dateFrom && dataConvertida < options.dateFrom) continue;
        if (options?.dateTo && dataConvertida > options.dateTo) continue;

        if (!frota) {
          warnings.push({
            sheet: sheetName,
            row: rowNumber,
            value: rawFleet,
            reason: "Frota não identificada.",
          });
          continue;
        }
        if (horas == null || horas <= 0) {
          warnings.push({
            sheet: sheetName,
            row: rowNumber,
            value: row[hoursIdx],
            reason: "Horas inválidas ou ausentes.",
          });
          continue;
        }

        rows.push({
          fleet: frota,
          fleetLabel: trim(rawFleet) || sheetName,
          date: dataConvertida,
          obra: obraIdx >= 0 ? trim(row[obraIdx]) : "",
          hours: horas,
          sourceSheet: `${sheetName}#${rowNumber}`,
        });
      } catch (err) {
        warnings.push({
          sheet: sheetName,
          row: rowNumber,
          value: row,
          reason: err instanceof Error ? err.message : "Erro inesperado na linha PDE.",
        });
      }
    }

    if (validDatesInSheet === 0) {
      warnings.push({
        sheet: sheetName,
        row: 0,
        value: "",
        reason: "Não foi possível identificar datas válidas nesta aba.",
      });
    }
  }

  // avisa sobre frotas do CMB que não têm registro na PDE
  if (options?.requiredFleets && options.requiredFleets.size > 0) {
    const processedFleets = new Set(rows.map((r) => normalizeFleet(r.fleet)));
    for (const required of options.requiredFleets) {
      if (!processedFleets.has(required)) {
        warnings.push({
          sheet: "—",
          row: 0,
          value: required,
          reason: `Frota ${required} foi abastecida (CMB) mas não tem registro na PDE no período.`,
        });
      }
    }
  }

  return { rows, warnings };
}

// Mantém a API usada pela UI; a leitura robusta da PDE roda pelo parser principal.
export function parsePdeFileInWorker(
  file: File,
  mapping?: PdeColumnMapping,
  options?: { dateFrom?: string; dateTo?: string; requiredFleets?: Set<string> },
): Promise<PdeParseResult> {
  return parsePdeFile(file, mapping, options);
}

/**
 * Extrai frotas próprias a partir do CMB (abastecimento).
 * Não usa o RCO: caminhões do RCO são agregados terceirizados e não têm PDE.
 */
export function extractRequiredFleets(opts: { fueling?: ParsedFueling[] }): Set<string> {
  const fleets = new Set<string>();
  for (const f of opts.fueling ?? []) {
    const key = normalizeFleet(f.prefix) || normalizeFleet(f.vehicleId) || normalizeFleet(f.plate);
    if (key) fleets.add(key);
  }
  return fleets;
}

/**
 * Extrai o intervalo de datas do CMB para filtrar linhas da PDE fora do período.
 */
export function extractDateRangeFromFueling(
  fueling?: ParsedFueling[],
): { dateFrom: string; dateTo: string } | null {
  const dates: string[] = [];
  for (const f of fueling ?? []) if (f.datetime) dates.push(f.datetime.slice(0, 10));
  if (dates.length === 0) return null;
  dates.sort();
  return { dateFrom: dates[0], dateTo: dates[dates.length - 1] };
}
