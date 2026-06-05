import { CHART_SERIES_COLORS } from "@/lib/chart-theme";
import { normalizeObraKey } from "@/lib/production-consumption-utils";

const UNINFORMED_OBRA_KEY = "OBRA_NAO_INFORMADA";
const UNINFORMED_OBRA_LABEL_KEY = normalizeObraKey("Obra nao informada");

export type MultiObraDomainEntry = {
  obra: string;
  obraKey: string;
  color: string;
  status?: string | null;
};

export type MultiObraSeries = MultiObraDomainEntry & {
  key: string;
};

export type MultiObraMetric<Row> = {
  id: string;
  label?: string;
  unit?: string;
  getValue: (row: Row) => number | null | undefined;
  outlier?: boolean;
};

export type MultiObraIgnoredRow<Row> = {
  row: Row;
  reason: "INVALID_WORKSITE" | "MISSING_X" | "NO_METRIC_VALUE";
  obraKey: string;
};

export type MultiObraOutlier = {
  x: string;
  obra: string;
  obraKey: string;
  metric: string;
  value: number;
  displayValue: number;
  reason: string;
};

export type MultiObraBuildResult<Row> = {
  chartData: Array<Record<string, unknown>>;
  series: MultiObraSeries[];
  ignoredRows: Array<MultiObraIgnoredRow<Row>>;
  outliers: MultiObraOutlier[];
};

function safeSeriesKey(value: string) {
  const normalized = normalizeObraKey(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase())
    .replace(/^[^a-zA-Z_]/, (char) => `obra_${char}`);
  return normalized || "obra";
}

function uniqueSeriesKey(obra: MultiObraDomainEntry, usedKeys: Set<string>, index: number) {
  const baseKey = safeSeriesKey(obra.obraKey || obra.obra);
  let key = baseKey;
  if (usedKeys.has(key)) {
    const suffix = safeSeriesKey(`${obra.obraKey || obra.obra}_${index + 1}`);
    key = suffix !== baseKey ? suffix : `${baseKey}_${index + 1}`;
  }
  while (usedKeys.has(key)) key = `${baseKey}_${usedKeys.size + 1}`;
  usedKeys.add(key);
  return key;
}

function resolveObraKey(value: string | null | undefined, status?: string | null) {
  if (status === "absent") return UNINFORMED_OBRA_KEY;
  const key = normalizeObraKey(value);
  return key === UNINFORMED_OBRA_LABEL_KEY ? UNINFORMED_OBRA_KEY : key;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const position = (values.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return values[lower] ?? 0;
  const weight = position - lower;
  return (values[lower] ?? 0) * (1 - weight) + (values[upper] ?? 0) * weight;
}

function outlierLimit(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length < 4) return 50;
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  return Math.max(50, q3 + 1.5 * iqr);
}

export function multiObraMetricKey(seriesKey: string, metricId: string) {
  return `${seriesKey}__${metricId}`;
}

export function multiObraMetricDisplayKey(seriesKey: string, metricId: string) {
  return `${multiObraMetricKey(seriesKey, metricId)}__display`;
}

export function multiObraMetricOutlierKey(seriesKey: string, metricId: string) {
  return `${multiObraMetricKey(seriesKey, metricId)}__outlier`;
}

export function buildRcoObraDomain<Row>({
  rows,
  getObra,
  getObraKey,
  getStatus,
}: {
  rows: Row[];
  getObra: (row: Row) => string | null | undefined;
  getObraKey?: (row: Row) => string | null | undefined;
  getStatus?: (row: Row) => string | null | undefined;
}) {
  const entries = new Map<string, MultiObraDomainEntry>();
  rows.forEach((row) => {
    const status = getStatus?.(row);
    const obra = String(getObra(row) ?? "").trim() || "Obra nao informada";
    const obraKey = getObraKey?.(row) || resolveObraKey(obra, status);
    if (!obraKey) return;
    if (!entries.has(obraKey)) {
      entries.set(obraKey, {
        obra,
        obraKey,
        status,
        color: CHART_SERIES_COLORS[entries.size % CHART_SERIES_COLORS.length],
      });
    }
  });
  return [...entries.values()].sort((a, b) => a.obra.localeCompare(b.obra, "pt-BR"));
}

export function buildMultiObraChartData<Row>({
  rows,
  xKey,
  xLabelKey,
  getX,
  getXLabel,
  getObra,
  getObraKey,
  getObraStatus,
  metrics,
  validObras,
  outlierPolicy = "mark-and-limit",
}: {
  rows: Row[];
  xKey?: keyof Row;
  xLabelKey?: keyof Row;
  getX?: (row: Row) => string | null | undefined;
  getXLabel?: (row: Row) => string | null | undefined;
  getObra: (row: Row) => string | null | undefined;
  getObraKey?: (row: Row) => string | null | undefined;
  getObraStatus?: (row: Row) => string | null | undefined;
  metrics: Array<MultiObraMetric<Row>>;
  validObras: Array<MultiObraDomainEntry>;
  outlierPolicy?: "none" | "mark" | "mark-and-limit";
}): MultiObraBuildResult<Row> {
  const validByKey = new Map(validObras.map((obra) => [obra.obraKey, obra]));
  const usedSeriesKeys = new Set<string>();
  const series = validObras.map((obra, index) => ({
    ...obra,
    key: uniqueSeriesKey(obra, usedSeriesKeys, index),
  }));
  const seriesByObraKey = new Map(series.map((obra) => [obra.obraKey, obra]));
  const rowsByX = new Map<string, Record<string, unknown>>();
  const ignoredRows: Array<MultiObraIgnoredRow<Row>> = [];
  const rawMetricValues = new Map<string, number[]>();

  rows.forEach((row) => {
    const status = getObraStatus?.(row);
    const obraKey = getObraKey?.(row) || resolveObraKey(getObra(row), status);
    const obra = seriesByObraKey.get(obraKey);
    if (!obra || !validByKey.has(obraKey)) {
      ignoredRows.push({ row, reason: "INVALID_WORKSITE", obraKey });
      return;
    }

    const x = String(getX?.(row) ?? (xKey ? row[xKey] : "") ?? "").trim();
    if (!x) {
      ignoredRows.push({ row, reason: "MISSING_X", obraKey });
      return;
    }

    const label = String(getXLabel?.(row) ?? (xLabelKey ? row[xLabelKey] : "") ?? x);
    const target = rowsByX.get(x) ?? { x, date: x, d: label };
    let hasMetricValue = false;
    metrics.forEach((metric) => {
      const value = metric.getValue(row);
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      hasMetricValue = true;
      const key = multiObraMetricKey(obra.key, metric.id);
      target[key] = (Number(target[key] ?? 0) || 0) + value;
      if (metric.outlier && value > 0) {
        const metricValuesKey = metric.id;
        rawMetricValues.set(metricValuesKey, [...(rawMetricValues.get(metricValuesKey) ?? []), value]);
      }
    });
    if (!hasMetricValue) {
      ignoredRows.push({ row, reason: "NO_METRIC_VALUE", obraKey });
      return;
    }
    rowsByX.set(x, target);
  });

  const outlierLimits = new Map(
    metrics
      .filter((metric) => metric.outlier)
      .map((metric) => [metric.id, outlierLimit(rawMetricValues.get(metric.id) ?? [])]),
  );
  const outliers: MultiObraOutlier[] = [];
  rowsByX.forEach((row) => {
    series.forEach((obra) => {
      metrics.forEach((metric) => {
        const key = multiObraMetricKey(obra.key, metric.id);
        const displayKey = multiObraMetricDisplayKey(obra.key, metric.id);
        const outlierKey = multiObraMetricOutlierKey(obra.key, metric.id);
        const value = Number(row[key] ?? 0);
        const limit = outlierLimits.get(metric.id);
        const isOutlier = Boolean(metric.outlier && limit && value > limit);
        row[displayKey] =
          isOutlier && outlierPolicy === "mark-and-limit" ? limit : value;
        row[outlierKey] = isOutlier;
        if (isOutlier) {
          outliers.push({
            x: String(row.x ?? ""),
            obra: obra.obra,
            obraKey: obra.obraKey,
            metric: metric.id,
            value,
            displayValue: Number(row[displayKey] ?? value),
            reason: `valor acima do limite visual ${limit}`,
          });
        }
      });
    });
  });

  return {
    chartData: [...rowsByX.values()].sort((a, b) => String(a.x).localeCompare(String(b.x))),
    series,
    ignoredRows,
    outliers,
  };
}
