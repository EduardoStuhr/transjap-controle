/**
 * Funções utilitárias para cálculos e formatação
 * Dashboard Produção x Consumo - Refatoração
 */

/**
 * Divisão segura que evita divisão por zero
 */
export function safeDivide(numerator: number, denominator: number, defaultValue = 0): number {
  return denominator > 0 ? numerator / denominator : defaultValue;
}

export function calculateCompactedM3(
  looseM3: number,
  swellFactor: number | null | undefined = 0.3,
): number {
  if (!Number.isFinite(looseM3) || looseM3 <= 0) return 0;
  const parsedFactor = Number.isFinite(swellFactor) ? Number(swellFactor) : 0.3;
  const factor = Math.min(1, Math.max(0, parsedFactor));
  return looseM3 * (1 - factor);
}

/**
 * Formatação de números com locale brasileira
 */
export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Formatação de valores em BRL
 */
export function formatBRL(value: number): string {
  return `R$ ${formatNumber(value, 2)}`;
}

/**
 * Formatação de litros
 */
export function formatLiters(value: number): string {
  return `${formatNumber(value, 0)} L`;
}

/**
 * Formatação de metros cúbicos
 */
export function formatM3(value: number): string {
  return `${formatNumber(value, 1)} m³`;
}

/**
 * Formatação de horas
 */
export function formatHours(value: number): string {
  return `${formatNumber(value, 1)} h`;
}

/**
 * Formatação de data ISO para dd/mm/yyyy
 */
export function formatDate(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Formatação simplificada de data para dd/mm
 */
export function formatShortDate(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return "—";
  const [, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/**
 * Extrai chave de data de timestamp (YYYY-MM-DD)
 */
export function extractDateKey(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }

  const str = String(value);
  const trimmed = str.trim();
  if (!trimmed) return "";

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, "0");
    const month = brMatch[2].padStart(2, "0");
    const year = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

/**
 * Obtém índice do dia da semana (0 = domingo, 6 = sábado)
 */
export function getWeekdayIndex(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return 0;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Obtém hora de um timestamp
 */
export function getHourFromTimestamp(timestamp: string): number {
  const match = String(timestamp).match(/(?:T|\s)(\d{2}):/);
  return match ? Math.min(23, Math.max(0, Number(match[1]))) : 0;
}

/**
 * Verifica se string está vazia ou é apenas espaços
 */
export function isEmpty(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/**
 * Extrai valores únicos de um array
 */
export function uniqueValues<T>(values: (T | null | undefined)[]): T[] {
  return [...new Set(values.filter(Boolean))] as T[];
}

export function displayObraName(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") || "Sem obra";
}

export const WORKSITE_ALIASES = {
  FLECHA: [
    "FLECHA",
    "RDG FLECHA",
    "RDG-FLECHA",
    "RDG_FLECHA",
    "RDG FLECHA LTDA",
    "FLECHA TRANSPORTES",
    "RDG VIANA",
    "RDG-VIANA",
    "RDG_VIANA",
    "VIANA",
    "RDG VIANA LTDA",
  ],
  CAMPO_LOG_05: ["CAMPO LOG 05", "CAMPO LOG05", "CAMPO LOG 5", "CPL5", "CPL 5"],
  ROAMA: ["ROAMA", "ROAMA LTDA"],
  ULIHORTE: [
    "ULIHORTE",
    "ULI HORTE",
    "ULI-HORTE",
    "ULI_HORTE",
    "ULIHORT",
    "ULI HORT",
    "ULI-HORT",
    "ULI_HORT",
    "ULIHORTE OBRA",
    "ULI HORTE OBRA",
    "ULIHORT OBRA",
    "OBRA ULIHORTE",
    "OBRA ULI HORTE",
    "OBRA ULIHORT",
  ],
} as const;

const WORKSITE_ALIAS_LABELS: Record<keyof typeof WORKSITE_ALIASES, string> = {
  FLECHA: "FLECHA",
  CAMPO_LOG_05: "CAMPO LOG 05",
  ROAMA: "ROAMA",
  ULIHORTE: "Ulihorte",
};

function normalizeWorksiteText(value: string | null | undefined): string {
  return displayObraName(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\b\d+\b/g, (token) => String(Number(token)).padStart(token.length, "0"))
    .replace(/\s+/g, " ")
    .trim();
}

const WORKSITE_ALIAS_LOOKUP = new Map<string, keyof typeof WORKSITE_ALIASES>();
Object.entries(WORKSITE_ALIASES).forEach(([key, aliases]) => {
  aliases.forEach((alias) => {
    WORKSITE_ALIAS_LOOKUP.set(normalizeWorksiteText(alias), key as keyof typeof WORKSITE_ALIASES);
  });
});

function matchesUlihorteVariant(normalized: string): boolean {
  return /\bULI\s*HORT(?:E)?\b/.test(normalized);
}

export function normalizeObraAlias(value: string | null | undefined): string {
  const normalized = normalizeWorksiteText(value);
  const alias = WORKSITE_ALIAS_LOOKUP.get(normalized);
  if (alias) return alias;
  if (matchesUlihorteVariant(normalized)) return "ULIHORTE";
  return normalized;
}

export function displayObraAliasLabel(value: string | null | undefined): string {
  const alias = normalizeObraAlias(value);
  return WORKSITE_ALIAS_LABELS[alias as keyof typeof WORKSITE_ALIAS_LABELS] ?? displayObraName(value);
}

export function normalizeObraName(value: string | null | undefined): string {
  return normalizeObraAlias(value).replace(/[^A-Z0-9]+/g, "");
}

export function normalizeObraKey(value: string | null | undefined): string {
  return normalizeObraAlias(value);
}

export function obraMatches(
  value: string | null | undefined,
  selected: string | null | undefined,
): boolean {
  return normalizeObraKey(value) === normalizeObraKey(selected);
}

export function uniqueNormalizedObras(values: (string | null | undefined)[]): string[] {
  const names = new Map<string, string>();
  values.forEach((value) => {
    const label = displayObraName(value);
    const key = normalizeObraKey(label);
    if (!names.has(key)) names.set(key, displayObraAliasLabel(label));
  });
  return Array.from(names.values()).sort((left, right) => left.localeCompare(right, "pt-BR"));
}

/**
 * Calcula estatísticas de um array de números
 */
export function calculateStats(values: number[]) {
  if (values.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
      p25: 0,
      p75: 0,
      sum: 0,
      count: 0,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const avg = sum / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const p25Index = Math.floor(sorted.length * 0.25);
  const p75Index = Math.floor(sorted.length * 0.75);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg,
    median,
    p25: sorted[p25Index],
    p75: sorted[p75Index],
    sum,
    count: sorted.length,
  };
}

/**
 * Agrupa dados por chave
 */
export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  items.forEach((item) => {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  });
  return result;
}

/**
 * Determina status de eficiência baseado em percentual
 */
export function getEfficiencyStatus(percent: number): "efficient" | "attention" | "critical" {
  if (percent >= 80) return "efficient";
  if (percent >= 60) return "attention";
  return "critical";
}

/**
 * Cores de eficiência
 */
export function getEfficiencyColor(status: "efficient" | "attention" | "critical"): string {
  switch (status) {
    case "efficient":
      return "#22c55e"; // green
    case "attention":
      return "#f4c430"; // yellow
    case "critical":
      return "#ef4444"; // red
  }
}

/**
 * Calcula índice de eficiência ponderado
 * Considera m³/h, m³/L e L/h
 */
export function calculateEfficiencyIndex(
  m3PerHour: number,
  m3PerLiter: number,
  literPerHour: number,
): number {
  if (!m3PerHour || !m3PerLiter || !literPerHour) return 0;

  // Normaliza cada métrica em uma escala 0-100
  const normalizedProduction = Math.min(100, (m3PerHour / 10) * 100);
  const normalizedConsumption = Math.max(0, Math.min(100, (m3PerLiter / 20) * 100));
  const normalizedFuelHour = Math.max(0, Math.min(100, 100 - (literPerHour / 5) * 100));

  // Média ponderada: 50% produção, 25% consumo, 25% combustível/hora
  return normalizedProduction * 0.5 + normalizedConsumption * 0.25 + normalizedFuelHour * 0.25;
}

/**
 * Calcula índice de produtividade
 * Baseia-se em viagens/hora e m³/hora
 */
export function calculateProductivityIndex(
  tripsPerHour: number,
  m3PerHour: number,
  baselineTripsPerHour = 8,
  baselineM3PerHour = 80,
): number {
  const tripScore = Math.min(100, (tripsPerHour / baselineTripsPerHour) * 100);
  const m3Score = Math.min(100, (m3PerHour / baselineM3PerHour) * 100);
  return tripScore * 0.4 + m3Score * 0.6;
}

/**
 * Valida se uma data está dentro de um intervalo
 */
export function isDateInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

/**
 * Retorna dias entre duas datas
 */
export function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
