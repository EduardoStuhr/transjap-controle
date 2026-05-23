/**
 * Dashboard Produção × Consumo (VIZ-1)
 * Template app_transjap aplicado — paleta OKLCH + 8 gráficos do template
 * em 8 abas dedicadas.
 */

import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import {
  listAnalyses,
  listDailyParts,
  listFueling,
  listTrips,
} from "@/lib/api/production-consumption";
import {
  listFuelAttributionFn,
  recalculateFuelFn,
} from "@/lib/api/fuel-attribution";

import { ChartCard } from "@/components/charts/ChartCard";
import {
  ChartBars,
  ChartBubble,
  ChartDonut,
  ChartFatCusto,
  ChartHBars,
  ChartLine,
  ChartProdConsumo,
  ChartProdStack,
  fmt,
  type BubblePoint,
} from "@/components/charts/Charts";
import { EmptyChartState } from "@/components/charts/ProductionConsumptionCharts";

import {
  DashboardFilters,
  DashboardTabs,
  KpiCardCompact,
} from "@/components/charts/DashboardFilters";
import { MyAnalysesDialog, AnalysisHistoryPanel } from "@/components/charts/AnalysisSelector";
import {
  useDashboardFilters,
  useAnalysisSelection,
  useFilteredData,
  useDashboardTabs,
  useAnalysesModal,
  usePagination,
} from "@/hooks/useProductionConsumption";
import {
  calculateDailyMetrics,
  calculateOperationalKPIs,
  calculateAggregateMetrics,
  calculateEquipmentMetrics,
  calculateObraDistribution,
  detectOperationalAlerts,
} from "@/lib/production-consumption-calculations";
import {
  formatDate,
  formatBRL,
  formatM3,
  formatLiters,
  formatNumber,
  uniqueValues,
} from "@/lib/production-consumption-utils";
import type {
  DbProductionAnalysis,
  DbTrip,
  DbFueling,
  DbEquipmentDailyPart,
  DbFuelAttribution,
} from "@/db/schema";

const CarcaraImportDialog = lazy(() =>
  import("@/components/CarcaraImportDialog").then((m) => ({ default: m.CarcaraImportDialog })),
);

export const Route = createFileRoute("/producao-consumo")({
  component: ProducaoConsumo,
});

function ProducaoConsumo() {
  return <ProducaoConsumoRefactored />;
}

const PAGE_SIZE = 12;

const TAB_IDS_VISIBLE = [
  "overview",
  "production",
  "consumption",
  "trucks",
  "equipment",
  "efficiency",
  "financial",
  "audit",
] as const;

function ProducaoConsumoRefactored() {
  const user = useAuthStore((s) => s.user);
  const canCreate = Boolean(user);
  const isAdmin = Boolean(user);

  const [analyses, setAnalyses] = useState<DbProductionAnalysis[]>([]);
  const [tripRows, setTripRows] = useState<DbTrip[]>([]);
  const [fuelRows, setFuelRows] = useState<DbFueling[]>([]);
  const [dailyPartRows, setDailyPartRows] = useState<DbEquipmentDailyPart[]>([]);
  const [fuelAttrRows, setFuelAttrRows] = useState<DbFuelAttribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const { filters, updateFilters, clearFilters } = useDashboardFilters();
  const analysisSelection = useAnalysisSelection(analyses);
  const { activeTab, setActiveTab, tabs } = useDashboardTabs();
  const analysesModal = useAnalysesModal();
  const {
    page: tripPage,
    nextPage: tripNextPage,
    prevPage: tripPrevPage,
  } = usePagination(tripRows.length, PAGE_SIZE);

  const visibleTabs = useMemo(
    () => tabs.filter((t) => TAB_IDS_VISIBLE.includes(t.id as (typeof TAB_IDS_VISIBLE)[number])),
    [tabs],
  );

  const { filteredTrips, filteredFueling, filteredDailyParts } = useFilteredData(
    tripRows,
    fuelRows,
    dailyPartRows,
    filters,
  );

  const loadAnalyses = useCallback(async (nextSelected?: string | string[]) => {
    const rows = (await listAnalyses({ data: {} })) as DbProductionAnalysis[];
    setAnalyses(rows);
    analysisSelection.setSelectedIds((current) => {
      if (Array.isArray(nextSelected))
        return nextSelected.filter((id) => rows.some((a) => a.id === id));
      if (nextSelected) return [nextSelected];
      const kept = current.filter((id) => rows.some((a) => a.id === id));
      return kept.length ? kept : rows[0]?.id ? [rows[0].id] : [];
    });
  }, []);

  const loadData = useCallback(async () => {
    if (analysisSelection.selectedIds.length === 0) {
      setTripRows([]);
      setFuelRows([]);
      setDailyPartRows([]);
      setFuelAttrRows([]);
      return;
    }
    setLoading(true);
    try {
      const [tripsResult, fuelResult, dailyPartResult, attrResult] = await Promise.all([
        listTrips({ data: { analysisIds: analysisSelection.selectedIds } }),
        listFueling({ data: { analysisIds: analysisSelection.selectedIds } }),
        listDailyParts({ data: { analysisIds: analysisSelection.selectedIds } }),
        listFuelAttributionFn({ data: {} }).catch(() => [] as DbFuelAttribution[]),
      ]);
      setTripRows(tripsResult as DbTrip[]);
      setFuelRows(fuelResult as DbFueling[]);
      setDailyPartRows(dailyPartResult as DbEquipmentDailyPart[]);
      setFuelAttrRows(attrResult as DbFuelAttribution[]);
    } finally {
      setLoading(false);
    }
  }, [analysisSelection.selectedIds]);

  useEffect(() => {
    loadAnalyses();
  }, [loadAnalyses]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const distinctObras = useMemo(
    () =>
      uniqueValues([...filteredTrips.map((t) => t.obra), ...filteredFueling.map((f) => f.obra)]),
    [filteredFueling, filteredTrips],
  );
  const distinctMaterials = useMemo(
    () => uniqueValues(filteredTrips.map((t) => t.material)),
    [filteredTrips],
  );
  const distinctEquipment = useMemo(
    () =>
      uniqueValues([
        ...filteredFueling.map((f) => f.prefix || f.vehicleId || f.plate),
        ...filteredDailyParts.map((p) => p.fleet),
      ]),
    [filteredDailyParts, filteredFueling],
  );
  const distinctAggregates = useMemo(
    () => uniqueValues(filteredTrips.map((t) => t.prefix || t.vehicleId || t.plate)),
    [filteredTrips],
  );

  const filteredAttributions = useMemo(() => {
    return fuelAttrRows.filter((row) => {
      if (filters.dateFrom && row.date < filters.dateFrom) return false;
      if (filters.dateTo && row.date > filters.dateTo) return false;
      if (filters.obra !== "all" && row.obra && row.obra !== filters.obra) return false;
      return true;
    });
  }, [fuelAttrRows, filters.dateFrom, filters.dateTo, filters.obra]);

  const attributedFueling = useMemo<DbFueling[]>(() => {
    if (filteredAttributions.length === 0) return filteredFueling;
    return filteredAttributions.map((a) => ({
      id: a.id,
      analysisId: "attributed",
      datetime: `${a.date}T12:00:00.000Z`,
      owner: "",
      plate: "",
      vehicleId: "",
      prefix: a.fleetLabel || a.fleet,
      vehicleType: "",
      kmPrevious: 0,
      kmCurrent: 0,
      liters: a.litersAttributed || 0,
      unitPrice: 0,
      total: a.costAttributed || 0,
      consumption: 0,
      standardConsumption: 0,
      operator: "",
      obra: a.obra || "",
      status: null,
      importBatchId: a.sourceFuelingId ?? "",
      importedAt: a.calculatedAt,
    }));
  }, [filteredAttributions, filteredFueling]);

  const dailyMetricsMap = useMemo(
    () => calculateDailyMetrics(filteredTrips, attributedFueling),
    [attributedFueling, filteredTrips],
  );
  const dailyData = useMemo(
    () => Array.from(dailyMetricsMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    [dailyMetricsMap],
  );

  const kpis = useMemo(
    () => calculateOperationalKPIs(filteredTrips, filteredFueling, filteredDailyParts),
    [filteredDailyParts, filteredFueling, filteredTrips],
  );

  const aggregateMetrics = useMemo(
    () => calculateAggregateMetrics(filteredTrips, kpis.compactedM3),
    [filteredTrips, kpis.compactedM3],
  );

  const equipmentMetrics = useMemo(
    () => calculateEquipmentMetrics(attributedFueling, filteredDailyParts),
    [filteredDailyParts, attributedFueling],
  );

  const obraDistribution = useMemo(() => calculateObraDistribution(filteredTrips), [filteredTrips]);

  const operationalAlerts = useMemo(
    () =>
      detectOperationalAlerts(
        filteredTrips,
        filteredFueling,
        equipmentMetrics.map((e) => ({
          equipment: e.equipment,
          hours: e.hours,
          liters: e.liters,
        })),
      ),
    [equipmentMetrics, filteredFueling, filteredTrips],
  );

  // ─── Adaptações de shape para o template ─────────────────────────
  const prodConsumoData = useMemo(
    () =>
      dailyData.map((d) => ({
        d: d.label,
        compactada: d.compactedM3,
        solta: d.looseM3,
        diesel: d.diesel,
      })),
    [dailyData],
  );

  const fatCustoData = useMemo(
    () =>
      dailyData.map((d) => ({
        d: d.label,
        faturamento: d.revenue,
        custoOperacional: d.cost,
        margem: d.margin,
      })),
    [dailyData],
  );

  const dieselLineData = useMemo(
    () => dailyData.map((d) => ({ d: d.label, diesel: d.diesel })),
    [dailyData],
  );

  const fuelPerM3LineData = useMemo(
    () =>
      dailyData.map((d) => ({
        d: d.label,
        lpm3: Number((d.fuelPerM3 || 0).toFixed(2)),
      })),
    [dailyData],
  );

  const marginLineData = useMemo(
    () => dailyData.map((d) => ({ d: d.label, margem: d.margin })),
    [dailyData],
  );

  const obraBarsData = useMemo(
    () => obraDistribution.map((o) => ({ obra: o.name, m3: o.value })),
    [obraDistribution],
  );

  const aggregatesTop = useMemo(
    () => aggregateMetrics.map((a) => ({ id: a.aggregate, m3: a.compactedM3, viagens: a.trips })),
    [aggregateMetrics],
  );

  const equipmentHoursData = useMemo(
    () => equipmentMetrics.map((e) => ({ id: e.equipment, horas: e.hours })),
    [equipmentMetrics],
  );

  const equipmentLitersData = useMemo(
    () => equipmentMetrics.map((e) => ({ id: e.equipment, litros: e.liters })),
    [equipmentMetrics],
  );

  const equipmentLPerHourData = useMemo(
    () =>
      equipmentMetrics
        .filter((e) => e.hours > 0)
        .map((e) => ({ equipamento: e.equipment, lph: Number(e.fuelPerHour.toFixed(2)) })),
    [equipmentMetrics],
  );

  // Bubble: agregados — eficiência (m³ × viagens × R$)
  const bubbleData: BubblePoint[] = useMemo(
    () =>
      aggregateMetrics
        .filter((a) => a.compactedM3 > 0)
        .map((a) => {
          // Proxy de "diesel" por agregado: dividir o consumo total proporcional à participação.
          const proxyDiesel = (kpis.diesel * a.participation) / 100;
          return {
            name: a.aggregate,
            tipo: "agregado",
            horas: a.trips,
            m3: a.compactedM3,
            diesel: proxyDiesel,
            lPorM3: proxyDiesel > 0 ? proxyDiesel / a.compactedM3 : 0,
          };
        }),
    [aggregateMetrics, kpis.diesel],
  );

  // Status dos equipamentos para o donut de auditoria
  const auditDonutData = useMemo(() => {
    const tally = new Map<string, number>();
    equipmentMetrics.forEach((e) => {
      const key = e.status || "OK";
      tally.set(key, (tally.get(key) ?? 0) + 1);
    });
    return Array.from(tally.entries()).map(([name, value]) => ({ name, value }));
  }, [equipmentMetrics]);

  const auditDonutTotal = useMemo(
    () => auditDonutData.reduce((s, x) => s + x.value, 0),
    [auditDonutData],
  );

  async function handleCreated(analysisId: string) {
    clearFilters();
    setActiveTab("overview");
    await loadAnalyses(analysisId);
  }

  const empty = analyses.length === 0;

  return (
    <AppLayout>
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
            Análises operacionais
          </span>
          <h1 className="text-3xl font-black uppercase tracking-tighter">Produção × Consumo</h1>
          <p className="text-xs text-on-surface-variant mt-1">{analysisSelection.label}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() =>
              analysisSelection.setSelectedIds(analyses.map((analysis) => analysis.id))
            }
            disabled={empty}
          >
            <Icon name="stacked_line_chart" className="text-base mr-1" />
            Acumulado Geral
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={analysesModal.open}
            disabled={empty}
          >
            <Icon name="folder_open" className="text-base mr-1" />
            Minhas Análises
          </Button>
          {canCreate && (
            <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}>
              <Icon name="add_chart" className="text-base mr-1" />
              Criar Análise
            </Button>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              disabled={recalcLoading}
              onClick={async () => {
                setRecalcLoading(true);
                try {
                  const r = await recalculateFuelFn({ data: {} });
                  toast.success(
                    `Rateio recalculado: ${r.totalAttributions} atribuições, ${r.fleetsProcessed} frotas`,
                  );
                  await loadData();
                } catch (err) {
                  toast.error(
                    `Falha ao recalcular: ${err instanceof Error ? err.message : String(err)}`,
                  );
                } finally {
                  setRecalcLoading(false);
                }
              }}
            >
              <Icon name="autorenew" className="text-base mr-1" />
              {recalcLoading ? "Recalculando…" : "Recalcular rateio"}
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
      ) : analysisSelection.primaryAnalysis ? (
        <>
          <DashboardFilters
            state={filters}
            onChange={updateFilters}
            obras={distinctObras}
            materials={distinctMaterials}
            equipment={distinctEquipment}
            aggregates={distinctAggregates}
            loading={loading}
          />

          <DashboardTabs tabs={visibleTabs} activeTab={activeTab} onChange={setActiveTab} />

          {/* KPI strip */}
          <div className="mb-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KpiCardCompact
              label="Produção m³"
              value={formatM3(kpis.compactedM3)}
              icon="compress"
            />
            <KpiCardCompact
              label="Diesel L"
              value={formatLiters(kpis.diesel)}
              icon="local_gas_station"
            />
            <KpiCardCompact
              label="Custo Diesel"
              value={formatBRL(kpis.fuelCost)}
              icon="payments"
            />
            <KpiCardCompact label="Viagens" value={String(kpis.trips)} icon="local_shipping" />
            <KpiCardCompact label="L/m³" value={formatNumber(kpis.fuelPerM3, 2)} icon="speed" />
            <KpiCardCompact
              label="Eficiência"
              value={`${formatNumber(kpis.efficiencyPercent, 0)}%`}
              tone="success"
              icon="query_stats"
            />
          </div>

          {/* ───────────────────────── TABS ────────────────────────── */}

          {activeTab === "overview" && (
            <>
              {operationalAlerts.length > 0 && (
                <div className="mb-4 rounded border border-status-warning/50 bg-status-warning/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="warning" className="text-status-warning" />
                    <h3 className="font-black uppercase tracking-wider text-sm">Alertas</h3>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {operationalAlerts.slice(0, 3).map((alert) => (
                      <li key={alert} className="text-on-surface-variant">
                        • {alert}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2">
                  <ChartCard
                    title="Produção × Consumo · diário"
                    description="m³ compactado, m³ solto e litros de diesel por dia"
                    height={340}
                    hasData={prodConsumoData.length > 0}
                  >
                    <ChartProdConsumo data={prodConsumoData} />
                  </ChartCard>
                </div>
                <ChartCard
                  title="Distribuição por obra"
                  description="Participação no volume compactado"
                  height={340}
                  hasData={obraDistribution.length > 0}
                >
                  <ChartDonut
                    data={obraDistribution}
                    total={kpis.compactedM3}
                    unit="m³"
                  />
                </ChartCard>
              </div>

              <div className="mt-4">
                <ChartCard
                  title="Top agregados por volume"
                  description="Ranking — m³ compactado por prefixo"
                  height={320}
                  hasData={aggregatesTop.length > 0}
                >
                  <ChartHBars data={aggregatesTop} dataKey="m3" nameKey="id" unit="m³" />
                </ChartCard>
              </div>

              <div className="mt-5 rounded border border-border-low bg-surface-container p-4">
                <AnalysisHistoryPanel
                  analyses={analyses}
                  selectedIds={analysisSelection.selectedIds}
                  onSelect={analysisSelection.setSelectedIds}
                />
              </div>
            </>
          )}

          {activeTab === "production" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ChartCard
                title="Produção empilhada · compactada × solta"
                description="Área stack — volume por dia"
                height={320}
                hasData={prodConsumoData.length > 0}
              >
                <ChartProdStack
                  data={prodConsumoData.map((d) => ({
                    d: d.d,
                    compactada: d.compactada,
                    solta: d.solta,
                  }))}
                />
              </ChartCard>
              <ChartCard
                title="Volume por obra"
                description="m³ compactado total"
                height={320}
                hasData={obraBarsData.length > 0}
              >
                <ChartBars data={obraBarsData} dataKey="m3" nameKey="obra" unit="m³" />
              </ChartCard>
            </div>
          )}

          {activeTab === "consumption" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ChartCard
                title="Diesel consumido por dia"
                description="Total de litros — série temporal"
                height={320}
                hasData={dieselLineData.length > 0}
              >
                <ChartLine
                  data={dieselLineData}
                  dataKey="diesel"
                  name="Diesel"
                  unit="L"
                  fillArea
                />
              </ChartCard>
              <ChartCard
                title="Top equipamentos por consumo"
                description="Litros totais por equipamento"
                height={320}
                hasData={equipmentLitersData.length > 0}
              >
                <ChartHBars
                  data={equipmentLitersData}
                  dataKey="litros"
                  nameKey="id"
                  unit="L"
                />
              </ChartCard>
            </div>
          )}

          {activeTab === "trucks" && (
            <>
              <ChartCard
                title="Frota agregada — eficiência"
                description="Bolha: viagens × m³ compactado · tamanho = litros diesel atribuídos"
                height={420}
                hasData={bubbleData.length > 0}
              >
                <ChartBubble data={bubbleData} />
              </ChartCard>
              <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                <ChartCard
                  title="Ranking de viagens"
                  description="Total de viagens por agregado"
                  height={320}
                  hasData={aggregatesTop.length > 0}
                >
                  <ChartHBars
                    data={aggregatesTop}
                    dataKey="viagens"
                    nameKey="id"
                    unit=""
                    color="oklch(0.74 0.13 220)"
                  />
                </ChartCard>
                <ChartCard
                  title="Volume por agregado"
                  description="m³ compactado por prefixo"
                  height={320}
                  hasData={aggregatesTop.length > 0}
                >
                  <ChartHBars data={aggregatesTop} dataKey="m3" nameKey="id" unit="m³" />
                </ChartCard>
              </div>
            </>
          )}

          {activeTab === "equipment" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ChartCard
                title="Horas trabalhadas · frota própria"
                description="Top 8 — PDE em horas"
                height={360}
                hasData={equipmentHoursData.length > 0}
              >
                <ChartHBars data={equipmentHoursData} dataKey="horas" nameKey="id" unit="h" />
              </ChartCard>
              <ChartCard
                title="Diesel consumido · frota própria"
                description="Top 8 — litros por equipamento"
                height={360}
                hasData={equipmentLitersData.length > 0}
              >
                <ChartHBars
                  data={equipmentLitersData}
                  dataKey="litros"
                  nameKey="id"
                  unit="L"
                  color="oklch(0.74 0.13 220)"
                />
              </ChartCard>
            </div>
          )}

          {activeTab === "efficiency" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ChartCard
                title="Eficiência diária · L/m³"
                description="Consumo específico — menor é melhor"
                height={320}
                hasData={fuelPerM3LineData.length > 0}
              >
                <ChartLine
                  data={fuelPerM3LineData}
                  dataKey="lpm3"
                  name="L/m³"
                  unit="L/m³"
                  color="oklch(0.72 0.13 150)"
                  fillArea
                />
              </ChartCard>
              <ChartCard
                title="Consumo por hora · L/h por equipamento"
                description="Top 10 da frota própria"
                height={320}
                hasData={equipmentLPerHourData.length > 0}
              >
                <ChartHBars
                  data={equipmentLPerHourData.slice(0, 10)}
                  dataKey="lph"
                  nameKey="equipamento"
                  unit="L/h"
                  color="oklch(0.72 0.13 150)"
                />
              </ChartCard>
            </div>
          )}

          {activeTab === "financial" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="xl:col-span-2">
                <ChartCard
                  title="Faturamento × Custo × Margem"
                  description="Diário (R$) — barras + margem linha"
                  height={360}
                  hasData={fatCustoData.length > 0}
                >
                  <ChartFatCusto data={fatCustoData} />
                </ChartCard>
              </div>
              <ChartCard
                title="Margem operacional diária"
                description="Faturamento − custos operacionais"
                height={320}
                hasData={marginLineData.length > 0}
              >
                <ChartLine
                  data={marginLineData}
                  dataKey="margem"
                  name="Margem"
                  unit="R$"
                  fillArea
                />
              </ChartCard>
              <ChartCard
                title="Resumo financeiro"
                description="Acumulado do período"
                height={320}
                hasData={fatCustoData.length > 0}
              >
                <div className="flex h-full flex-col justify-center gap-3 px-3">
                  <SummaryLine label="Faturamento" value={formatBRL(kpis.revenue)} tone="info" />
                  <SummaryLine
                    label="Custo diesel"
                    value={formatBRL(kpis.fuelCost)}
                    tone="warning"
                  />
                  <SummaryLine
                    label="Custo agregados"
                    value={formatBRL(kpis.aggregateCost)}
                    tone="warning"
                  />
                  <SummaryLine
                    label="Margem operacional"
                    value={formatBRL(kpis.operationalMargin)}
                    tone={kpis.operationalMargin >= 0 ? "success" : "danger"}
                    bold
                  />
                  <SummaryLine
                    label="Custo médio · R$/m³"
                    value={`${fmt.dec(kpis.costPerM3, 2)} /m³`}
                  />
                </div>
              </ChartCard>
            </div>
          )}

          {activeTab === "audit" && (
            <>
              {operationalAlerts.length === 0 ? (
                <EmptyChartState
                  title="Sem alertas"
                  message="Nenhuma inconsistência detectada nos dados atuais."
                />
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="xl:col-span-2 rounded-lg border border-status-warning/40 bg-surface-container p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Icon name="warning" className="text-status-warning" />
                      <h3 className="text-sm font-black uppercase tracking-widest">
                        Alertas operacionais ({operationalAlerts.length})
                      </h3>
                    </div>
                    <ul className="space-y-2 text-sm text-on-surface-variant">
                      {operationalAlerts.map((a) => (
                        <li
                          key={a}
                          className="rounded border border-border-low bg-surface-low p-2 leading-relaxed"
                        >
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <ChartCard
                    title="Status da frota"
                    description="Equipamentos por estado de auditoria"
                    height={360}
                    hasData={auditDonutData.length > 0}
                  >
                    <ChartDonut
                      data={auditDonutData}
                      total={auditDonutTotal}
                      unit="equipamentos"
                    />
                  </ChartCard>
                </div>
              )}

              {tripRows.length > 0 && (
                <div className="mt-5 rounded border border-border-low bg-surface-container overflow-hidden">
                  <div className="p-3 border-b border-border-low">
                    <h3 className="text-xs font-black uppercase tracking-widest">
                      Viagens importadas ({tripRows.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border-low bg-surface-low">
                          <th className="px-3 py-2 text-left font-black uppercase">Data</th>
                          <th className="px-3 py-2 text-left font-black uppercase">Agregado</th>
                          <th className="px-3 py-2 text-left font-black uppercase">Obra</th>
                          <th className="px-3 py-2 text-right font-black uppercase">m³ Comp.</th>
                          <th className="px-3 py-2 text-right font-black uppercase">R$</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tripRows
                          .slice(tripPage * PAGE_SIZE, (tripPage + 1) * PAGE_SIZE)
                          .map((trip) => (
                            <tr key={trip.id} className="border-b border-border-low/40">
                              <td className="px-3 py-2">{formatDate(trip.datetime)}</td>
                              <td className="px-3 py-2 tnum">
                                {trip.prefix || trip.vehicleId || trip.plate}
                              </td>
                              <td className="px-3 py-2">{trip.obra}</td>
                              <td className="px-3 py-2 text-right tnum">
                                {formatNumber(trip.cubicMCompacted, 1)}
                              </td>
                              <td className="px-3 py-2 text-right tnum">{formatBRL(trip.total)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center p-3 border-t border-border-low">
                    <span className="text-xs text-on-surface-variant">
                      Página {tripPage + 1} de {Math.ceil(tripRows.length / PAGE_SIZE)}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={tripPage === 0}
                        onClick={tripPrevPage}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={tripPage >= Math.ceil(tripRows.length / PAGE_SIZE) - 1}
                        onClick={tripNextPage}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
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

      {analysesModal.isOpen && (
        <MyAnalysesDialog
          isOpen={analysesModal.isOpen}
          analyses={analyses}
          selectedIds={analysisSelection.selectedIds}
          onClose={analysesModal.close}
          onSelect={(ids) => {
            analysisSelection.setSelectedIds(ids);
            setActiveTab("overview");
          }}
        />
      )}
    </AppLayout>
  );
}

function SummaryLine({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: "info" | "warning" | "success" | "danger";
  bold?: boolean;
}) {
  const color =
    tone === "success"
      ? "var(--ok)"
      : tone === "warning"
        ? "var(--warn)"
        : tone === "danger"
          ? "var(--danger)"
          : tone === "info"
            ? "var(--info)"
            : "var(--fg)";
  return (
    <div
      className="flex items-center justify-between border-b border-border-low/40 pb-2"
      style={{ fontSize: 13 }}
    >
      <span className="text-on-surface-variant">{label}</span>
      <span
        className="mono tnum"
        style={{ color, fontWeight: bold ? 700 : 600, fontSize: bold ? 15 : 13 }}
      >
        {value}
      </span>
    </div>
  );
}
