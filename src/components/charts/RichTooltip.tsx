import type { CSSProperties } from "react";
import { CHART_TOOLTIP_STYLE } from "@/lib/chart-theme";

type TooltipEntry = {
  name?: string;
  value?: unknown;
  color?: string;
  dataKey?: string | number;
  unit?: string;
  payload?: Record<string, unknown>;
};

type RichTooltipProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  formatters?: Record<string, (v: number) => string>;
  units?: Record<string, string>;
  titleFormatter?: (label: string | undefined, payload: TooltipEntry[]) => string;
};

function entryKey(entry: TooltipEntry) {
  return String(entry.name ?? entry.dataKey ?? "Valor");
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function RichTooltip({
  active,
  payload,
  label,
  formatters = {},
  units = {},
  titleFormatter,
}: RichTooltipProps) {
  if (!active || !payload?.length) return null;
  const fallbackTitle = String(payload[0]?.payload?.name ?? payload[0]?.payload?.label ?? "Dados");
  const title = titleFormatter ? titleFormatter(label, payload) : label || fallbackTitle;

  return (
    <div style={CHART_TOOLTIP_STYLE as CSSProperties}>
      <div className="mb-2 font-bold">{title}</div>
      {payload.map((entry, i) => {
        const name = entryKey(entry);
        const dataKey = String(entry.dataKey ?? name);
        const value = numericValue(entry.value);
        const formatter = formatters[name] ?? formatters[dataKey];
        const formatted =
          value != null && formatter
            ? formatter(value)
            : typeof entry.value === "number"
              ? String(entry.value)
              : String(entry.value ?? "—");
        const unit = units[name] ?? units[dataKey] ?? entry.unit;

        return (
          <div key={`${name}-${i}`} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-2">
              <span
                style={{
                  width: 8,
                  height: 8,
                  background: entry.color,
                  borderRadius: 2,
                  display: "inline-block",
                }}
              />
              {name}
            </span>
            <span style={{ fontFamily: "monospace" }}>
              {formatted}
              {unit && <span className="ml-1 opacity-60">{unit}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
