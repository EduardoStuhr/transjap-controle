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
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
};
function isEmptyValue(v: unknown) {
  return v == null || String(v).trim() === "";
}
function safeIsoDateTimeFromDate(date: Date): string {
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
const dt = (v: unknown): string => {
  if (!v) return "";
  if (v instanceof Date) return safeIsoDateTimeFromDate(v);
  if (typeof v === "number") {
    const ms = (v - 25569) * 86400 * 1000;
    return safeIsoDateTimeFromDate(new Date(ms));
  }
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

export async function parsePdeFile(
  file: File,
  mapping?: PdeColumnMapping,
): Promise<PdeParseResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb: WorkBook = XLSX.read(buf, { type: "array", cellDates: true });
  const rows: ParsedDailyPart[] = [];
  const warnings: PdeWarning[] = [];

  for (const sheetName of wb.SheetNames) {
    if (mapping?.sheetName && mapping.sheetName !== sheetName) continue;
    const sheet = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
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
    aoa.slice(headerRow + 1).forEach((row, lineIndex) => {
      const rowNumber = headerRow + lineIndex + 2;
      if (!row || isSeparatorRow(row)) return;
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
          return;
        }
        validDatesInSheet++;
        if (!frota) {
          warnings.push({
            sheet: sheetName,
            row: rowNumber,
            value: rawFleet,
            reason: "Frota não identificada.",
          });
          return;
        }
        if (horas == null || horas <= 0) {
          warnings.push({
            sheet: sheetName,
            row: rowNumber,
            value: row[hoursIdx],
            reason: "Horas inválidas ou ausentes.",
          });
          return;
        }

        console.log({
          aba: sheetName,
          linha: rowNumber,
          dataOriginal,
          dataConvertida,
          horas,
          frota,
        });

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
    });

    if (validDatesInSheet === 0) {
      warnings.push({
        sheet: sheetName,
        row: 0,
        value: "",
        reason: "Não foi possível identificar datas válidas nesta aba.",
      });
    }
  }

  return { rows, warnings };
}
