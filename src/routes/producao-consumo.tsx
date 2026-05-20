import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/auth-store";
import {
  listAnalyses,
  listDailyParts,
  listFueling,
  listTrips,
} from "@/lib/api/production-consumption";
import { normalizeFleet } from "@/lib/carcara-parser";
import type { DbEquipmentDailyPart, DbFueling, DbProductionAnalysis, DbTrip } from "@/db/schema";

const CarcaraImportDialog = lazy(() =>
  import("@/components/CarcaraImportDialog").then((m) => ({ default: m.CarcaraImportDialog })),
);

export const Route = createFileRoute("/producao-consumo")({ component: ProducaoConsumo });

type TabId =
  | "overview"
  | "production"
  | "consumption"
  | "equipment"
  | "trucks"
  | "audit"
  | "crossAudit"
  | "data";

const PAGE_SIZE = 12;

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function vehicleKey(row: { prefix: string; vehicleId: string; plate: string }) {
  return row.prefix || row.vehicleId || row.plate || "Sem identificação";
}

function uniq(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

function dateKey(iso: string) {
  return iso.slice(0, 10);
}

function compacted(row: DbTrip) {
  return row.cubicMCompacted || row.cubicMLoose / (1 + row.swellFactorApplied);
}

function KpiCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
}) {
  return (
    <div className="rounded border border-border-low bg-surface-container p-3 min-h-[104px]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          {label}
        </p>
        <Icon name={icon} className="text-lg text-primary" />
      </div>
      <p className="mt-2 text-xl font-black leading-none">{value}</p>
      {sub && <p className="mt-2 text-xs text-on-surface-variant">{sub}</p>}
    </div>
  );
}

function BarChart({
  title,
  data,
  color = "bg-primary",
}: {
  title: string;
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="rounded border border-border-low bg-surface-container p-4">
      <h3 className="text-[10px] font-black uppercase tracking-widest mb-4">{title}</h3>
      <div className="flex items-end gap-2 h-56">
        {data.length === 0 ? (
          <p className="m-auto text-xs text-on-surface-variant">Sem dados</p>
        ) : (
          data.map((d) => (
            <div key={d.label} className="flex-1 min-w-0 flex flex-col items-center gap-2">
              <div className="w-full flex items-end h-48">
                <div
                  className={`w-full rounded-t ${color}`}
                  style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }}
                  title={`${d.label}: ${d.value.toFixed(2)}`}
                />
              </div>
              <span className="text-[10px] text-on-surface-variant truncate w-full text-center">
                {d.label.slice(5).split("-").reverse().join("/")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LineChart({
  title,
  data,
  color = "#f4c430",
}: {
  title: string;
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const points = data
    .map((d, i) => {
      const x = data.length === 1 ? 50 : (i / (data.length - 1)) * 100;
      const y = 92 - (d.value / max) * 82;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="rounded border border-border-low bg-surface-container p-4">
      <h3 className="text-[10px] font-black uppercase tracking-widest mb-4">{title}</h3>
      <svg viewBox="0 0 100 100" className="w-full h-56">
        <polyline fill="none" stroke={color} strokeWidth="2.5" points={points} />
        {data.map((d, i) => {
          const x = data.length === 1 ? 50 : (i / (data.length - 1)) * 100;
          const y = 92 - (d.value / max) * 82;
          return <circle key={d.label} cx={x} cy={y} r="2.5" fill={color} />;
        })}
      </svg>
    </div>
  );
}

function CombinedChart({ data }: { data: { date: string; m3: number; liters: number }[] }) {
  const maxM3 = Math.max(1, ...data.map((d) => d.m3));
  const maxLiters = Math.max(1, ...data.map((d) => d.liters));
  const points = data
    .map((d, i) => {
      const x = data.length === 1 ? 50 : (i / (data.length - 1)) * 100;
      const y = 92 - (d.liters / maxLiters) * 82;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="rounded border border-border-low bg-surface-container p-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="text-sm font-black uppercase tracking-widest">Produção × Consumo</h3>
        <div className="flex gap-4 text-xs text-on-surface-variant">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-primary" />
            m³ compactado
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-status-info" />
            litros
          </span>
        </div>
      </div>
      <div className="relative h-80">
        <div className="absolute inset-0 flex items-end gap-2">
          {data.map((d) => (
            <div key={d.date} className="flex-1 min-w-0 flex items-end h-full">
              <div
                className="w-full rounded-t bg-primary/80"
                style={{ height: `${Math.max(2, (d.m3 / maxM3) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <polyline fill="none" stroke="#4aa3ff" strokeWidth="2" points={points} />
        </svg>
      </div>
    </div>
  );
}

function Ranking({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: Array<Record<string, string | number>>;
  columns: { key: string; label: string; align?: "right" }[];
}) {
  return (
    <div className="rounded border border-border-low bg-surface-container p-4">
      <h3 className="text-[10px] font-black uppercase tracking-widest mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-low text-on-surface-variant">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-2 font-black ${col.align === "right" ? "text-right" : "text-left"}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-4 text-on-surface-variant" colSpan={columns.length}>
                  Sem dados
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-border-low/40">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-2 ${col.align === "right" ? "text-right" : "text-left"}`}
                    >
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalysesDialog({
  analyses,
  selectedId,
  onSelect,
  onClose,
}: {
  analyses: DbProductionAnalysis[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [obra, setObra] = useState("");
  const [material, setMaterial] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const obras = uniq(analyses.map((a) => a.obra));
  const materials = uniq(analyses.map((a) => a.material));
  const filtered = analyses.filter((analysis) => {
    if (obra && analysis.obra !== obra) return false;
    if (material && analysis.material !== material) return false;
    if (dateFrom && analysis.dateEnd < dateFrom) return false;
    if (dateTo && analysis.dateStart > dateTo) return false;
    return true;
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Minhas análises</DialogTitle>
          <DialogDescription>Filtre por obra, período e material.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select
            value={obra}
            onChange={(e) => setObra(e.target.value)}
            className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
          >
            <option value="">Todas as obras</option>
            {obras.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
          >
            <option value="">Todos materiais</option>
            {materials.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
          />
        </div>
        <div className="max-h-96 overflow-y-auto space-y-2">
          {filtered.map((analysis) => (
            <button
              key={analysis.id}
              type="button"
              onClick={() => onSelect(analysis.id)}
              className={`w-full rounded border p-3 text-left transition-colors ${
                selectedId === analysis.id
                  ? "border-primary bg-primary/10"
                  : "border-border-low hover:bg-surface-highest"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black">{analysis.name}</p>
                <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                  {fmtDate(analysis.createdAt)}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-1">
                {analysis.obra} · {analysis.material} · {fmtDate(analysis.dateStart)} a{" "}
                {fmtDate(analysis.dateEnd)}
              </p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-on-surface-variant">
              Nenhuma análise encontrada.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProducaoConsumo() {
  const user = useAuthStore((s) => s.user);
  const canCreate = user?.role === "administrador" || user?.role === "gestor";

  const [analyses, setAnalyses] = useState<DbProductionAnalysis[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string>("");
  const [tripRows, setTripRows] = useState<DbTrip[]>([]);
  const [fuelRows, setFuelRows] = useState<DbFueling[]>([]);
  const [dailyPartRows, setDailyPartRows] = useState<DbEquipmentDailyPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAnalyses, setShowAnalyses] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [obraFilter, setObraFilter] = useState("all");
  const [materialFilter, setMaterialFilter] = useState("all");
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [truckFilter, setTruckFilter] = useState("all");
  const [analysisType, setAnalysisType] = useState("all");
  const [search, setSearch] = useState("");
  const [tripPage, setTripPage] = useState(0);
  const [fuelPage, setFuelPage] = useState(0);

  const selectedAnalysis = analyses.find((analysis) => analysis.id === selectedAnalysisId) ?? null;

  const loadAnalyses = useCallback(
    async (nextSelected?: string) => {
      const rows = (await listAnalyses({ data: {} })) as DbProductionAnalysis[];
      setAnalyses(rows);
      const target = nextSelected || selectedAnalysisId || rows[0]?.id || "";
      setSelectedAnalysisId(target);
    },
    [selectedAnalysisId],
  );

  const loadData = useCallback(async () => {
    if (!selectedAnalysisId) {
      setTripRows([]);
      setFuelRows([]);
      setDailyPartRows([]);
      return;
    }
    setLoading(true);
    try {
      const [tripsResult, fuelResult, dailyPartResult] = await Promise.all([
        listTrips({ data: { analysisId: selectedAnalysisId } }),
        listFueling({ data: { analysisId: selectedAnalysisId } }),
        listDailyParts({ data: { analysisId: selectedAnalysisId } }),
      ]);
      setTripRows(tripsResult as DbTrip[]);
      setFuelRows(fuelResult as DbFueling[]);
      setDailyPartRows(dailyPartResult as DbEquipmentDailyPart[]);
      setTripPage(0);
      setFuelPage(0);
    } finally {
      setLoading(false);
    }
  }, [selectedAnalysisId]);

  useEffect(() => {
    loadAnalyses();
  }, [loadAnalyses]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const distinctObras = useMemo(
    () => uniq([...tripRows.map((t) => t.obra), ...fuelRows.map((f) => f.obra)]),
    [fuelRows, tripRows],
  );
  const distinctMaterials = useMemo(() => uniq(tripRows.map((t) => t.material)), [tripRows]);
  const distinctEquipment = useMemo(() => uniq(fuelRows.map(vehicleKey)), [fuelRows]);
  const distinctTrucks = useMemo(() => uniq(tripRows.map(vehicleKey)), [tripRows]);

  const filteredTrips = useMemo(() => {
    return tripRows.filter((row) => {
      if (dateFrom && dateKey(row.datetime) < dateFrom) return false;
      if (dateTo && dateKey(row.datetime) > dateTo) return false;
      if (obraFilter !== "all" && row.obra !== obraFilter) return false;
      if (materialFilter !== "all" && row.material !== materialFilter) return false;
      if (truckFilter !== "all" && vehicleKey(row) !== truckFilter) return false;
      if (analysisType === "production-only" && row.cubicMLoose <= 0) return false;
      return true;
    });
  }, [analysisType, dateFrom, dateTo, materialFilter, obraFilter, tripRows, truckFilter]);

  const filteredFueling = useMemo(() => {
    return fuelRows.filter((row) => {
      if (dateFrom && dateKey(row.datetime) < dateFrom) return false;
      if (dateTo && dateKey(row.datetime) > dateTo) return false;
      if (obraFilter !== "all" && row.obra !== obraFilter) return false;
      if (equipmentFilter !== "all" && vehicleKey(row) !== equipmentFilter) return false;
      if (analysisType === "consumption-only" && row.liters <= 0) return false;
      return true;
    });
  }, [analysisType, dateFrom, dateTo, equipmentFilter, fuelRows, obraFilter]);

  const kpis = useMemo(() => {
    const looseM3 = filteredTrips.reduce((sum, row) => sum + row.cubicMLoose, 0);
    const compactedM3 = filteredTrips.reduce((sum, row) => sum + compacted(row), 0);
    const liters = filteredFueling.reduce((sum, row) => sum + row.liters, 0);
    const fuelCost = filteredFueling.reduce((sum, row) => sum + row.total, 0);
    const revenue = filteredTrips.reduce((sum, row) => sum + row.total, 0);
    return {
      looseM3,
      compactedM3,
      liters,
      fuelCost,
      costPerM3: compactedM3 > 0 ? fuelCost / compactedM3 : 0,
      trips: filteredTrips.length,
      revenue,
      grossMargin: revenue - fuelCost,
      litersPerM3: compactedM3 > 0 ? liters / compactedM3 : 0,
      avgCostPerLiter: liters > 0 ? fuelCost / liters : 0,
    };
  }, [filteredFueling, filteredTrips]);

  const daily = useMemo(() => {
    const map = new Map<
      string,
      { date: string; m3: number; loose: number; liters: number; cost: number }
    >();
    filteredTrips.forEach((row) => {
      const date = dateKey(row.datetime);
      const curr = map.get(date) ?? { date, m3: 0, loose: 0, liters: 0, cost: 0 };
      curr.m3 += compacted(row);
      curr.loose += row.cubicMLoose;
      map.set(date, curr);
    });
    filteredFueling.forEach((row) => {
      const date = dateKey(row.datetime);
      const curr = map.get(date) ?? { date, m3: 0, loose: 0, liters: 0, cost: 0 };
      curr.liters += row.liters;
      curr.cost += row.total;
      map.set(date, curr);
    });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredFueling, filteredTrips]);

  const costPerM3Daily = daily.map((row) => ({
    label: row.date,
    value: row.m3 > 0 ? row.cost / row.m3 : 0,
  }));
  const productionDaily = daily.map((row) => ({ label: row.date, value: row.m3 }));
  const consumptionDaily = daily.map((row) => ({ label: row.date, value: row.liters }));

  const topTrucks = useMemo(() => {
    const map = new Map<
      string,
      { prefix: string; trips: number; loose: number; m3: number; avg: number }
    >();
    filteredTrips.forEach((row) => {
      const key = vehicleKey(row);
      const curr = map.get(key) ?? { prefix: key, trips: 0, loose: 0, m3: 0, avg: 0 };
      curr.trips++;
      curr.loose += row.cubicMLoose;
      curr.m3 += compacted(row);
      curr.avg = curr.trips > 0 ? curr.m3 / curr.trips : 0;
      map.set(key, curr);
    });
    return [...map.values()].sort((a, b) => b.m3 - a.m3);
  }, [filteredTrips]);

  const topEquipment = useMemo(() => {
    const map = new Map<string, { equipment: string; liters: number; cost: number }>();
    filteredFueling.forEach((row) => {
      const key = vehicleKey(row);
      const curr = map.get(key) ?? { equipment: key, liters: 0, cost: 0 };
      curr.liters += row.liters;
      curr.cost += row.total;
      map.set(key, curr);
    });
    return [...map.values()].sort((a, b) => b.liters - a.liters);
  }, [filteredFueling]);

  const materialDistribution = useMemo(() => {
    const map = new Map<string, number>();
    filteredTrips.forEach((row) =>
      map.set(
        row.material || "Sem material",
        (map.get(row.material || "Sem material") ?? 0) + compacted(row),
      ),
    );
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTrips]);

  const obraCompare = useMemo(() => {
    const map = new Map<
      string,
      { obra: string; m3: number; liters: number; cost: number; revenue: number; costPerM3: number }
    >();
    filteredTrips.forEach((row) => {
      const key = row.obra || "Sem obra";
      const curr = map.get(key) ?? {
        obra: key,
        m3: 0,
        liters: 0,
        cost: 0,
        revenue: 0,
        costPerM3: 0,
      };
      curr.m3 += compacted(row);
      curr.revenue += row.total;
      map.set(key, curr);
    });
    filteredFueling.forEach((row) => {
      const key = row.obra || "Sem obra";
      const curr = map.get(key) ?? {
        obra: key,
        m3: 0,
        liters: 0,
        cost: 0,
        revenue: 0,
        costPerM3: 0,
      };
      curr.liters += row.liters;
      curr.cost += row.total;
      curr.costPerM3 = curr.m3 > 0 ? curr.cost / curr.m3 : 0;
      map.set(key, curr);
    });
    return [...map.values()].map((row) => ({
      ...row,
      costPerM3: row.m3 > 0 ? row.cost / row.m3 : 0,
    }));
  }, [filteredFueling, filteredTrips]);

  const filteredDailyParts = useMemo(() => {
    return dailyPartRows.filter((row) => {
      if (dateFrom && row.date < dateFrom) return false;
      if (dateTo && row.date > dateTo) return false;
      if (obraFilter !== "all" && row.obra && row.obra !== obraFilter) return false;
      if (equipmentFilter !== "all" && row.fleet !== normalizeFleet(equipmentFilter)) return false;
      return true;
    });
  }, [dailyPartRows, dateFrom, dateTo, equipmentFilter, obraFilter]);

  const fleetIndicators = useMemo(() => {
    const map = new Map<
      string,
      {
        fleet: string;
        production: number;
        liters: number;
        cost: number;
        hours: number;
      }
    >();
    const ensure = (fleet: string) => {
      const key = fleet || "SEM_FROTA";
      const current = map.get(key) ?? { fleet: key, production: 0, liters: 0, cost: 0, hours: 0 };
      map.set(key, current);
      return current;
    };
    filteredTrips.forEach((row) => {
      ensure(normalizeFleet(vehicleKey(row))).production += compacted(row);
    });
    filteredFueling.forEach((row) => {
      const item = ensure(normalizeFleet(vehicleKey(row)));
      item.liters += row.liters;
      item.cost += row.total;
    });
    filteredDailyParts
      .filter((row) => row.usedInAnalysis)
      .forEach((row) => {
        ensure(row.fleet).hours += row.hours;
      });
    return [...map.values()]
      .map((row) => ({
        ...row,
        m3h: row.hours > 0 ? row.production / row.hours : 0,
        lh: row.hours > 0 ? row.liters / row.hours : 0,
        lm3: row.production > 0 ? row.liters / row.production : 0,
        costM3: row.production > 0 ? row.cost / row.production : 0,
        costH: row.hours > 0 ? row.cost / row.hours : 0,
      }))
      .sort((a, b) => b.liters - a.liters);
  }, [filteredDailyParts, filteredFueling, filteredTrips]);

  const crossAudit = useMemo(() => {
    return {
      frotasCmb: uniq(filteredFueling.map((row) => normalizeFleet(vehicleKey(row)))),
      frotasPde: uniq(
        filteredDailyParts
          .filter((row) => row.status !== "Sem horas na PDE")
          .map((row) => row.fleet),
      ),
      crossed: uniq(filteredDailyParts.filter((row) => row.usedInAnalysis).map((row) => row.fleet)),
      withFuelNoPde: uniq(
        filteredDailyParts
          .filter((row) => row.status === "Sem horas na PDE")
          .map((row) => row.fleet),
      ),
      withPdeNoFuel: uniq(
        filteredDailyParts
          .filter((row) => row.status === "Sem abastecimento")
          .map((row) => row.fleet),
      ),
      datesOk: uniq(filteredDailyParts.filter((row) => row.usedInAnalysis).map((row) => row.date)),
      missingDates: uniq(
        filteredDailyParts
          .filter((row) => row.status === "Sem horas na PDE")
          .map((row) => row.date),
      ),
    };
  }, [filteredDailyParts, filteredFueling]);

  const searchedTrips = filteredTrips.filter((row) =>
    [row.prefix, row.plate, row.obra, row.material, row.driver]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const searchedFueling = filteredFueling.filter((row) =>
    [row.prefix, row.plate, row.obra, row.vehicleType, row.operator]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const pagedTrips = searchedTrips.slice(tripPage * PAGE_SIZE, (tripPage + 1) * PAGE_SIZE);
  const pagedFueling = searchedFueling.slice(fuelPage * PAGE_SIZE, (fuelPage + 1) * PAGE_SIZE);

  async function handleCreated(analysisId: string) {
    await loadAnalyses(analysisId);
    setSelectedAnalysisId(analysisId);
    setTab("overview");
  }

  function exportXlsx() {
    import("xlsx").then((XLSX) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([kpis]), "KPIs");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredTrips), "Viagens");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredFueling), "Abastecimentos");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredDailyParts), "PDE");
      XLSX.writeFile(wb, `${selectedAnalysis?.name ?? "analise"}-producao-consumo.xlsx`);
    });
  }

  function exportPdf() {
    window.print();
  }

  const empty = analyses.length === 0;

  return (
    <AppLayout>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
            Análises operacionais
          </span>
          <h1 className="text-3xl font-black uppercase tracking-tighter">Produção × Consumo</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            {selectedAnalysis
              ? `${selectedAnalysis.name} · ${selectedAnalysis.obra}`
              : "Crie uma análise para começar"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setShowAnalyses(true)}
            disabled={empty}
          >
            <Icon name="folder_open" className="text-base mr-1" />
            Minhas análises
          </Button>
          {selectedAnalysis && (
            <>
              <Button variant="outline" size="sm" className="text-xs" onClick={exportPdf}>
                <Icon name="picture_as_pdf" className="text-base mr-1" />
                Exportar PDF
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={exportXlsx}>
                <Icon name="download" className="text-base mr-1" />
                Exportar relatório
              </Button>
            </>
          )}
          {canCreate && (
            <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}>
              <Icon name="add_chart" className="text-base mr-1" />
              Criar Análise
            </Button>
          )}
        </div>
      </div>

      {empty ? (
        <div className="rounded border border-border-low bg-surface-container p-10 text-center">
          <Icon name="analytics" className="text-5xl text-on-surface-variant/30" />
          <p className="mt-4 text-lg font-black">Nenhuma análise criada ainda</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Crie a primeira análise com planilhas RCO, CMB e PDE.
          </p>
          {canCreate && (
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              Criar Análise
            </Button>
          )}
        </div>
      ) : selectedAnalysis ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2 items-center">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            />
            <select
              value={obraFilter}
              onChange={(e) => setObraFilter(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            >
              <option value="all">Todas as obras</option>
              {distinctObras.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              value={materialFilter}
              onChange={(e) => setMaterialFilter(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            >
              <option value="all">Todos materiais</option>
              {distinctMaterials.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              value={equipmentFilter}
              onChange={(e) => setEquipmentFilter(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            >
              <option value="all">Todos equipamentos</option>
              {distinctEquipment.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              value={truckFilter}
              onChange={(e) => setTruckFilter(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            >
              <option value="all">Todos caminhões</option>
              {distinctTrucks.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              value={analysisType}
              onChange={(e) => setAnalysisType(e.target.value)}
              className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
            >
              <option value="all">Tipo: completa</option>
              <option value="production-only">Com produção</option>
              <option value="consumption-only">Com consumo</option>
            </select>
            {loading && (
              <span className="text-xs text-on-surface-variant animate-pulse">Carregando...</span>
            )}
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto border-b border-border-low">
            {[
              ["overview", "Visão geral"],
              ["production", "Produção"],
              ["consumption", "Consumo"],
              ["equipment", "Equipamentos"],
              ["trucks", "Caminhões"],
              ["audit", "Auditoria"],
              ["crossAudit", "Auditoria de Cruzamento"],
              ["data", "Dados importados"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id as TabId)}
                className={`px-3 py-2 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-2 ${
                  tab === id
                    ? "border-primary text-primary"
                    : "border-transparent text-on-surface-variant"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <KpiCard
              label="Produção solta na caçamba"
              value={`${kpis.looseM3.toFixed(0)} m³`}
              icon="inventory_2"
            />
            <KpiCard
              label="Produção compactada"
              value={`${kpis.compactedM3.toFixed(0)} m³`}
              icon="compress"
            />
            <KpiCard
              label="Diesel consumido"
              value={`${kpis.liters.toFixed(0)} L`}
              icon="local_gas_station"
            />
            <KpiCard
              label="Custo total combustível"
              value={`R$ ${fmtBRL(kpis.fuelCost)}`}
              icon="payments"
            />
            <KpiCard
              label="Custo R$/m³ compactado"
              value={`R$ ${kpis.costPerM3.toFixed(2)}`}
              icon="monitoring"
            />
            <KpiCard label="Viagens totais" value={String(kpis.trips)} icon="local_shipping" />
            <KpiCard label="Faturamento" value={`R$ ${fmtBRL(kpis.revenue)}`} icon="trending_up" />
            <KpiCard
              label="Margem bruta"
              value={`R$ ${fmtBRL(kpis.grossMargin)}`}
              icon="account_balance"
            />
            <KpiCard label="Consumo médio L/m³" value={kpis.litersPerM3.toFixed(2)} icon="speed" />
            <KpiCard
              label="Custo médio R$/L"
              value={`R$ ${kpis.avgCostPerLiter.toFixed(2)}`}
              icon="local_atm"
            />
          </div>

          {tab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <CombinedChart data={daily} />
              </div>
              <div className="space-y-4">
                <Ranking
                  title="Top caminhões por produção"
                  rows={topTrucks.slice(0, 5).map((r) => ({
                    prefixo: r.prefix,
                    viagens: r.trips,
                    m3: r.m3.toFixed(1),
                  }))}
                  columns={[
                    { key: "prefixo", label: "Prefixo" },
                    { key: "viagens", label: "Viagens", align: "right" },
                    { key: "m3", label: "m³", align: "right" },
                  ]}
                />
                <Ranking
                  title="Top equipamentos por consumo"
                  rows={topEquipment.slice(0, 5).map((r) => ({
                    equipamento: r.equipment,
                    litros: r.liters.toFixed(0),
                    custo: `R$ ${fmtBRL(r.cost)}`,
                  }))}
                  columns={[
                    { key: "equipamento", label: "Equip." },
                    { key: "litros", label: "L", align: "right" },
                    { key: "custo", label: "R$", align: "right" },
                  ]}
                />
              </div>
            </div>
          )}

          {tab === "production" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BarChart title="Produção diária" data={productionDaily} />
              <BarChart
                title="Distribuição por material"
                data={materialDistribution}
                color="bg-status-success"
              />
              {obraCompare.length > 1 && (
                <Ranking
                  title="Comparativo por obra"
                  rows={obraCompare.map((r) => ({
                    obra: r.obra,
                    m3: r.m3.toFixed(1),
                    litros: r.liters.toFixed(0),
                    custo: `R$ ${r.costPerM3.toFixed(2)}`,
                    faturamento: `R$ ${fmtBRL(r.revenue)}`,
                  }))}
                  columns={[
                    { key: "obra", label: "Obra" },
                    { key: "m3", label: "m³", align: "right" },
                    { key: "litros", label: "L", align: "right" },
                    { key: "custo", label: "R$/m³", align: "right" },
                    { key: "faturamento", label: "Faturamento", align: "right" },
                  ]}
                />
              )}
            </div>
          )}

          {tab === "consumption" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <LineChart title="Consumo diário" data={consumptionDaily} color="#4aa3ff" />
              <LineChart title="Custo por m³ ao longo do tempo" data={costPerM3Daily} />
              <BarChart
                title="Abastecimentos por equipamento"
                data={topEquipment.map((r) => ({ label: r.equipment, value: r.liters }))}
                color="bg-status-info"
              />
            </div>
          )}

          {tab === "equipment" && (
            <Ranking
              title="Indicadores por frota"
              rows={fleetIndicators.map((r) => ({
                frota: r.fleet,
                litros: r.liters.toFixed(0),
                custo: `R$ ${fmtBRL(r.cost)}`,
                horas: r.hours.toFixed(1),
                lh: r.lh.toFixed(2),
                custoH: `R$ ${r.costH.toFixed(2)}`,
              }))}
              columns={[
                { key: "frota", label: "Frota" },
                { key: "litros", label: "Litros", align: "right" },
                { key: "custo", label: "Custo", align: "right" },
                { key: "horas", label: "Horas", align: "right" },
                { key: "lh", label: "L/h", align: "right" },
                { key: "custoH", label: "R$/h", align: "right" },
              ]}
            />
          )}

          {tab === "trucks" && (
            <Ranking
              title="Eficiência por caminhão/frota"
              rows={fleetIndicators.map((r) => ({
                frota: r.fleet,
                producao: r.production.toFixed(1),
                horas: r.hours.toFixed(1),
                m3h: r.m3h.toFixed(2),
                lm3: r.lm3.toFixed(2),
                custoM3: `R$ ${r.costM3.toFixed(2)}`,
              }))}
              columns={[
                { key: "frota", label: "Frota" },
                { key: "producao", label: "m³ comp.", align: "right" },
                { key: "horas", label: "Horas", align: "right" },
                { key: "m3h", label: "m³/h", align: "right" },
                { key: "lm3", label: "L/m³", align: "right" },
                { key: "custoM3", label: "R$/m³", align: "right" },
              ]}
            />
          )}

          {tab === "audit" && (
            <div className="rounded border border-border-low bg-surface-container p-5 text-sm space-y-3">
              <h3 className="font-black uppercase tracking-widest text-xs">Auditoria da análise</h3>
              <p>
                <strong>volume_compactado</strong> = volume_caçamba ÷ (1 + fator_empolamento)
              </p>
              <p>
                <strong>custo_combustivel</strong> = litros × preço médio diesel
              </p>
              <p>
                <strong>custo_por_m3</strong> = custo_combustivel ÷ volume_compactado
              </p>
              <p>
                <strong>faturamento</strong> = volume_compactado × preço_unitário_venda
              </p>
              <p>
                <strong>margem_bruta</strong> = faturamento - custo_combustivel
              </p>
              <div className="rounded bg-surface-highest p-3 text-xs text-on-surface-variant">
                Análise: {selectedAnalysis.name} · Fator aplicado na importação:{" "}
                {selectedAnalysis.swellFactor.toFixed(2)} · ID: {selectedAnalysis.id}
              </div>
            </div>
          )}

          {tab === "crossAudit" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label="Frotas encontradas na CMB"
                  value={String(crossAudit.frotasCmb.length)}
                  icon="local_gas_station"
                />
                <KpiCard
                  label="Frotas encontradas na PDE"
                  value={String(crossAudit.frotasPde.length)}
                  icon="assignment"
                />
                <KpiCard
                  label="Frotas cruzadas com sucesso"
                  value={String(crossAudit.crossed.length)}
                  icon="check_circle"
                />
                <KpiCard
                  label="Datas faltantes"
                  value={String(crossAudit.missingDates.length)}
                  icon="event_busy"
                />
              </div>
              <div className="rounded border border-border-low bg-surface-container p-4 text-xs text-on-surface-variant">
                <p>
                  Frotas com abastecimento e sem Parte Diária:{" "}
                  {crossAudit.withFuelNoPde.join(", ") || "Nenhuma"}
                </p>
                <p className="mt-1">
                  Frotas com Parte Diária e sem abastecimento:{" "}
                  {crossAudit.withPdeNoFuel.join(", ") || "Nenhuma"}
                </p>
                <p className="mt-1">
                  Datas cruzadas com sucesso: {crossAudit.datesOk.join(", ") || "Nenhuma"}
                </p>
                <p className="mt-1">
                  Datas faltantes: {crossAudit.missingDates.join(", ") || "Nenhuma"}
                </p>
              </div>
              <DataTable
                title={`Auditoria de cruzamento · ${filteredDailyParts.length}`}
                headers={["Frota", "Data", "Litros CMB", "Horas PDE", "Obra PDE", "Status"]}
                rows={filteredDailyParts.map((row) => {
                  const liters = filteredFueling
                    .filter(
                      (fuel) =>
                        normalizeFleet(vehicleKey(fuel)) === row.fleet &&
                        dateKey(fuel.datetime) === row.date,
                    )
                    .reduce((sum, fuel) => sum + fuel.liters, 0);
                  return [
                    row.fleet,
                    fmtDate(row.date),
                    liters.toFixed(0),
                    row.hours.toFixed(1),
                    row.obra || "—",
                    row.status,
                  ];
                })}
                page={0}
                total={filteredDailyParts.length}
                onPage={() => undefined}
              />
            </div>
          )}

          {tab === "data" && (
            <div className="space-y-4">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setTripPage(0);
                  setFuelPage(0);
                }}
                placeholder="Buscar por prefixo, placa, obra, material..."
                className="w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-sm"
              />
              <DataTable
                title={`Viagens importadas · ${searchedTrips.length}`}
                headers={["Data", "Prefixo", "Obra", "Material", "m³ solto", "m³ comp.", "R$"]}
                rows={pagedTrips.map((row) => [
                  fmtDate(row.datetime),
                  vehicleKey(row),
                  row.obra,
                  row.material,
                  row.cubicMLoose.toFixed(2),
                  compacted(row).toFixed(2),
                  fmtBRL(row.total),
                ])}
                page={tripPage}
                total={searchedTrips.length}
                onPage={setTripPage}
              />
              <DataTable
                title={`Abastecimentos importados · ${searchedFueling.length}`}
                headers={["Data", "Equipamento", "Obra", "Litros", "R$/L", "Total"]}
                rows={pagedFueling.map((row) => [
                  fmtDate(row.datetime),
                  vehicleKey(row),
                  row.obra,
                  row.liters.toFixed(0),
                  row.unitPrice.toFixed(2),
                  fmtBRL(row.total),
                ])}
                page={fuelPage}
                total={searchedFueling.length}
                onPage={setFuelPage}
              />
            </div>
          )}
        </>
      ) : null}

      {showCreate && (
        <Suspense fallback={null}>
          <CarcaraImportDialog
            onClose={() => setShowCreate(false)}
            onSuccess={handleCreated}
            userName={user?.name ?? ""}
          />
        </Suspense>
      )}

      {showAnalyses && (
        <AnalysesDialog
          analyses={analyses}
          selectedId={selectedAnalysisId}
          onClose={() => setShowAnalyses(false)}
          onSelect={(id) => {
            setSelectedAnalysisId(id);
            setShowAnalyses(false);
            setTab("overview");
          }}
        />
      )}
    </AppLayout>
  );
}

function DataTable({
  title,
  headers,
  rows,
  page,
  total,
  onPage,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="rounded border border-border-low bg-surface-container overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border-low p-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest">{title}</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
            className="text-xs"
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages - 1}
            onClick={() => onPage(page + 1)}
            className="text-xs"
          >
            Próxima
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-low bg-surface-low text-on-surface-variant">
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-3 py-2 text-left font-black uppercase tracking-widest"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-3 py-8 text-center text-on-surface-variant"
                >
                  Sem registros
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-border-low/40">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 whitespace-nowrap">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
