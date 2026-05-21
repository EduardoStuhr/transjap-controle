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
  const str = String(value);
  return str.slice(0, 10) || "";
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
 * Considera m³/h, L/m³ e L/h
 */
export function calculateEfficiencyIndex(
  m3PerHour: number,
  literPerM3: number,
  literPerHour: number,
): number {
  if (!m3PerHour || !literPerM3 || !literPerHour) return 0;

  // Normaliza cada métrica em uma escala 0-100
  const normalizedProduction = Math.min(100, (m3PerHour / 10) * 100);
  const normalizedConsumption = Math.max(0, Math.min(100, 100 - literPerM3 * 20));
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
