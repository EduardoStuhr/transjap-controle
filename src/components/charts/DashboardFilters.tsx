/**
 * Componentes de filtros para o dashboard de Produção x Consumo
 * Suporta filtros por data, obra, material, equipamento e agregado
 */

import { type DashboardFilterState } from "@/lib/production-consumption-types";
import { useActiveTabScroll } from "@/hooks/useActiveTabScroll";

interface DashboardFiltersProps {
  state: DashboardFilterState;
  onChange: (state: Partial<DashboardFilterState>) => void;
  obras: string[];
  materials: string[];
  equipment: string[];
  aggregates: string[];
  loading?: boolean;
}

function optionKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
}

export function DashboardFilters({
  state,
  onChange,
  obras,
  materials,
  equipment,
  aggregates,
  loading = false,
}: DashboardFiltersProps) {
  return (
    <div className="mb-4 flex flex-wrap gap-2 items-center rounded border border-border-low bg-surface-lowest p-3">
      <input
        type="date"
        value={state.dateFrom}
        onChange={(e) => onChange({ dateFrom: e.target.value })}
        className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
        title="Data inicial"
      />
      <input
        type="date"
        value={state.dateTo}
        onChange={(e) => onChange({ dateTo: e.target.value })}
        className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
        title="Data final"
      />

      <select
        value={state.obra}
        onChange={(e) => onChange({ obra: e.target.value })}
        className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
        title="Filtrar por obra"
      >
        <option value="all">Todas as obras</option>
        {obras.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        value={state.material}
        onChange={(e) => onChange({ material: e.target.value })}
        className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
        title="Filtrar por material"
      >
        <option value="all">Todos materiais</option>
        {materials.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        value={state.equipment}
        onChange={(e) => onChange({ equipment: e.target.value })}
        className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
        title="Filtrar por equipamento"
      >
        <option value="all">Todos equipamentos</option>
        {equipment.map((value) => (
          <option key={optionKey(value)} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        value={state.aggregate}
        onChange={(e) => onChange({ aggregate: e.target.value })}
        className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
        title="Filtrar por agregado"
      >
        <option value="all">Todos agregados</option>
        {aggregates.map((value) => (
          <option key={optionKey(value)} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        value={state.analysisType}
        onChange={(e) =>
          onChange({
            analysisType: e.target.value as "all" | "production-only" | "consumption-only",
          })
        }
        className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
        title="Tipo de análise"
      >
        <option value="all">Tipo: completa</option>
        <option value="production-only">Com produção</option>
        <option value="consumption-only">Com consumo</option>
      </select>

      {loading && (
        <span className="text-xs text-on-surface-variant animate-pulse">Carregando...</span>
      )}

      <button
        onClick={() =>
          onChange({
            dateFrom: "",
            dateTo: "",
            obra: "all",
            material: "all",
            equipment: "all",
            aggregate: "all",
            analysisType: "all",
          })
        }
        className="ml-auto rounded border border-border-low px-3 py-2 text-xs font-semibold hover:bg-surface-highest transition-colors"
        title="Limpar filtros"
      >
        Limpar filtros
      </button>
    </div>
  );
}

/**
 * Tabs compactas para navegação entre seções do dashboard
 */
interface TabsProps {
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onChange: (tabId: string) => void;
}

export function DashboardTabs({ tabs, activeTab, onChange }: TabsProps) {
  const tabsRef = useActiveTabScroll<HTMLDivElement>();

  return (
    <div
      ref={tabsRef}
      className="mb-4 flex gap-2 overflow-x-auto border-b border-border-low scroll-smooth overscroll-x-contain"
    >
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          data-active={activeTab === id}
          className={`px-3 py-2 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors ${
            activeTab === id
              ? "border-primary bg-primary/10 text-primary"
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Card para KPI
 */
interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  tone?: "warning" | "success" | "neutral";
}

export function KpiCardCompact({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: KpiCardProps) {
  const valueClass =
    tone === "warning"
      ? "mt-2 text-xl font-black leading-none text-status-warning"
      : tone === "success"
        ? "mt-2 text-xl font-black leading-none text-[#22c55e]"
        : "mt-2 text-xl font-black leading-none";

  return (
    <div
      className="rounded border border-border-low bg-surface-container p-3 min-h-[104px]"
      title={sub}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          {label}
        </p>
        <span className="text-lg">📊</span>
      </div>
      <p className={valueClass}>{value}</p>
      {sub && <p className="mt-2 text-xs text-on-surface-variant">{sub}</p>}
    </div>
  );
}
