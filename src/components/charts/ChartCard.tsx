import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  badge?: { label: string; tone?: "success" | "warning" | "info" };
  height?: number;
  hasData?: boolean;
  emptyMessage?: string;
  children: ReactNode;
};

export function ChartCard({
  title,
  description,
  badge,
  height = 320,
  hasData = true,
  emptyMessage = "Sem dados suficientes para este gráfico.",
  children,
}: Props) {
  const badgeClass =
    badge?.tone === "warning"
      ? "bg-status-warning/15 text-status-warning"
      : badge?.tone === "success"
        ? "bg-status-success/15 text-status-success"
        : "bg-status-info/15 text-status-info";

  return (
    <div className="rounded-lg border border-border-low bg-surface-container p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest">{title}</h3>
          {description && <p className="mt-1 text-xs text-on-surface-variant">{description}</p>}
        </div>
        {badge && (
          <span
            className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${badgeClass}`}
          >
            {badge.label}
          </span>
        )}
      </div>
      <div style={{ width: "100%", height }}>
        {hasData ? (
          children
        ) : (
          <div className="flex h-full items-center justify-center rounded border border-border-low/60 bg-surface-low text-xs text-on-surface-variant">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
