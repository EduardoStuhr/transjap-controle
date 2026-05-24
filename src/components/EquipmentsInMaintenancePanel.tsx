import { useMemo } from "react";
import { Icon } from "@/components/AppLayout";
import type { MaintenanceRecord, MaintenanceStatus } from "@/lib/maintenance-store";
import { formatFleetCode } from "@/lib/operational-options";

type Props = {
  records: MaintenanceRecord[];
  onRecordClick: (id: string) => void;
};

const ACTIVE_STATUSES: MaintenanceStatus[] = ["Aberta", "Em andamento", "Atrasada"];

function parseCreatedAt(createdAt: string): number {
  if (!createdAt) return 0;
  if (createdAt.includes("/")) {
    const [d, m, y] = createdAt.split("/").map(Number);
    if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(y)) {
      return new Date(y, m - 1, d).getTime();
    }
    return 0;
  }
  const parsed = new Date(createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysOpen(createdAt: string): number {
  const parsed = parseCreatedAt(createdAt);
  if (!parsed) return 0;
  const ms = Date.now() - parsed;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function displayEquipmentReference(value: string): string {
  const trimmed = value.trim();
  const isFleetCode =
    /^(?:(?:FROTA[-\s]*)?FR[-\s]*|FROTA[-\s]*)[A-Z0-9]+$/i.test(trimmed) || /^\d+$/.test(trimmed);
  return isFleetCode ? formatFleetCode(trimmed) : value;
}

function toneForStatus(status: MaintenanceStatus, days: number) {
  if (status === "Atrasada" || days > 14) {
    return {
      border: "border-status-error/50",
      bg: "bg-status-error/10",
      badge: "bg-status-error/20 text-status-error",
      label: "CRÍTICO",
    };
  }
  if (status === "Em andamento") {
    return {
      border: "border-status-warning/50",
      bg: "bg-status-warning/10",
      badge: "bg-status-warning/20 text-status-warning",
      label: "EM ANDAMENTO",
    };
  }
  return {
    border: "border-status-info/40",
    bg: "bg-status-info/5",
    badge: "bg-status-info/20 text-status-info",
    label: "ABERTA",
  };
}

export function EquipmentsInMaintenancePanel({ records, onRecordClick }: Props) {
  const active = useMemo(
    () =>
      records
        .filter((r) => ACTIVE_STATUSES.includes(r.status))
        .sort((a, b) => {
          if (a.status === "Atrasada" && b.status !== "Atrasada") return -1;
          if (b.status === "Atrasada" && a.status !== "Atrasada") return 1;
          return parseCreatedAt(a.createdAt) - parseCreatedAt(b.createdAt);
        }),
    [records],
  );

  if (active.length === 0) {
    return (
      <section className="rounded-lg p-6 mb-6 border border-status-success/30 bg-status-success/5">
        <div className="flex items-center gap-3">
          <Icon name="check_circle" className="text-status-success text-3xl" />
          <div>
            <h2 className="text-lg font-black text-status-success uppercase">
              Frota 100% operacional
            </h2>
            <p className="text-sm text-on-surface-variant mt-0.5">
              Nenhum equipamento parado em manutenção no momento.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-black uppercase tracking-wider text-on-surface flex items-center gap-2">
          <Icon name="warning" className="text-status-warning" />
          Equipamentos parados
          <span className="text-2xl text-status-warning">{active.length}</span>
        </h2>
        <p className="text-xs text-on-surface-variant">
          Frotas fora de operação · clique no card para detalhes
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {active.map((record) => {
          const days = daysOpen(record.createdAt);
          const tone = toneForStatus(record.status, days);
          const supplier = record.costEntries[0]?.supplierName || record.supplierName;
          return (
            <button
              key={record.id}
              type="button"
              onClick={() => onRecordClick(record.id)}
              className={`cursor-pointer text-left p-4 rounded-lg border ${tone.border} ${tone.bg} hover:bg-opacity-20 transition-colors`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon name="precision_manufacturing" className="text-on-surface flex-shrink-0" />
                  <p className="font-black uppercase text-sm truncate">
                    {displayEquipmentReference(record.equipment)}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded ${tone.badge}`}
                >
                  {tone.label}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mb-1">
                <strong className="text-on-surface">{record.type}</strong>
                {record.item && <> · {record.item}</>}
              </p>
              <p className="text-xs text-on-surface-variant line-clamp-2 mb-2">
                {record.serviceDescription || "Sem descrição"}
              </p>
              <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <Icon name="schedule" className="text-sm" />
                  {days === 0 ? "Hoje" : `${days}d parado`}
                </span>
                {supplier && (
                  <span className="flex items-center gap-1 truncate">
                    <Icon name="business" className="text-sm" />
                    {supplier}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
