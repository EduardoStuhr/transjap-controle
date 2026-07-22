/**
 * Componentes de filtros para o dashboard de Produção x Consumo
 * Suporta filtros por data, obra, material, equipamento e agregado
 */

import { useId, useState } from "react";
import { Icon } from "@/components/AppLayout";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

function EquipmentMultiSelect({
  options,
  selectedValues,
  onChange,
}: {
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
}) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const selectedSet = new Set(selectedValues);
  const normalizedSearch = optionKey(search);
  const filteredOptions = normalizedSearch
    ? options.filter((option) => optionKey(option).includes(normalizedSearch))
    : options;
  const summary =
    selectedValues.length === 0
      ? "Todos equipamentos"
      : selectedValues.length === 1
        ? selectedValues[0]
        : `${selectedValues.length} equipamentos`;

  const toggle = (value: string) => {
    onChange(
      selectedSet.has(value)
        ? selectedValues.filter((selected) => selected !== value)
        : [...selectedValues, value],
    );
  };

  const selectionMark = (checked: boolean) => (
    <span
      aria-hidden="true"
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
        checked ? "border-primary bg-primary text-on-primary" : "border-border-low"
      }`}
    >
      {checked && <Icon name="check" className="text-xs" />}
    </span>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-h-9 min-w-[190px] max-w-full items-center justify-between gap-2 rounded border border-border-low bg-surface-highest px-3 py-2 text-left text-xs"
          title="Filtrar por um ou mais equipamentos"
          aria-label={`Filtrar por equipamento. ${summary}`}
        >
          <span className="min-w-0 flex-1 truncate">{summary}</span>
          <Icon name="expand_more" className="shrink-0 text-base text-on-surface-variant" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className="z-[70] max-w-[calc(100vw-2rem)] min-w-[260px] p-0"
        style={{ width: "max(260px, var(--radix-popover-trigger-width))" }}
      >
        <div className="border-b border-border-low p-2">
          <label className="sr-only" htmlFor={searchId}>
            Buscar equipamento
          </label>
          <div className="flex min-h-9 items-center gap-2 rounded border border-border-low bg-surface-container px-3">
            <Icon name="search" className="shrink-0 text-base text-on-surface-variant" />
            <input
              id={searchId}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar equipamento"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-on-surface outline-none placeholder:text-on-surface-variant"
            />
          </div>
        </div>
        <div className="max-h-[50vh] overflow-auto overscroll-contain p-2">
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex min-h-11 w-full items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-accent"
            aria-pressed={selectedValues.length === 0}
          >
            {selectionMark(selectedValues.length === 0)}
            <span className="font-semibold">Todos equipamentos</span>
          </button>
          {filteredOptions.map((value) => {
            const checked = selectedSet.has(value);
            return (
              <button
                key={optionKey(value)}
                type="button"
                onClick={() => toggle(value)}
                className="flex min-h-11 w-full items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-accent"
                aria-pressed={checked}
              >
                {selectionMark(checked)}
                <span>{value}</span>
              </button>
            );
          })}
          {filteredOptions.length === 0 && (
            <p className="px-3 py-4 text-sm text-on-surface-variant">
              Nenhum equipamento encontrado.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border-low p-2">
          <span className="px-2 text-[10px] font-bold text-on-surface-variant">{summary}</span>
          <button
            type="button"
            disabled={selectedValues.length === 0}
            onClick={() => onChange([])}
            className="rounded px-3 py-2 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Limpar seleção
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
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

      <EquipmentMultiSelect
        options={equipment}
        selectedValues={state.equipment}
        onChange={(values) => onChange({ equipment: values })}
      />

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
            equipment: [],
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
