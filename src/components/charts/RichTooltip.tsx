/**
 * RichTooltip — tooltip Recharts unificado (VIZ-1)
 * - Tipografia mono nos valores
 * - Unidade exibida ao lado do número
 * - Formatadores por dataKey opcionais
 */

type TooltipEntry = {
  name?: string;
  value?: unknown;
  color?: string;
  fill?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
};

type RichTooltipProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  units?: Record<string, string>;
  format?: Record<string, (v: number) => string>;
};

const defaultFormat = (v: number) =>
  Number.isFinite(v) ? Number(v).toLocaleString("pt-BR") : String(v);

export function RichTooltip({
  active,
  payload,
  label,
  units = {},
  format = {},
}: RichTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 11,
        boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
        minWidth: 140,
      }}
    >
      {label != null && (
        <div
          style={{
            color: "var(--fg-3)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 6,
          }}
        >
          {String(label)}
        </div>
      )}
      {payload.map((p, i) => {
        const key = String(p.dataKey ?? p.name ?? i);
        const fn = format[key] ?? defaultFormat;
        const unit = units[key] ?? "";
        const num = typeof p.value === "number" ? p.value : Number(p.value);
        const formatted = Number.isFinite(num) ? fn(num) : String(p.value ?? "—");
        return (
          <div
            key={`${key}-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              justifyContent: "space-between",
              padding: "2px 0",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "var(--fg-2)",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  background: p.color || p.fill,
                  borderRadius: 2,
                  display: "inline-block",
                }}
              />
              {p.name ?? key}
            </div>
            <div
              style={{
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
                color: "var(--fg)",
                fontWeight: 600,
              }}
            >
              {formatted}
              {unit && (
                <span style={{ color: "var(--fg-3)", fontWeight: 400, marginLeft: 4 }}>
                  {unit}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
