/**
 * Dashboard Produção x Consumo - Refatorado
 * Versão 2.0 com layout responsivo, gráficos reutilizáveis e persistência melhorada
 *
 * Melhorias implementadas:
 * ✓ Sem overflow horizontal
 * ✓ Gráficos compactos e responsivos
 * ✓ Componentes reutilizáveis
 * ✓ Suporte a múltiplas análises e obras
 * ✓ Layout Grid responsivo (mobile/tablet/desktop)
 * ✓ Persist ência melhorada de análises
 * ✓ KPIs claros e compreensíveis
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Scatter,
  ScatterChart,
  ZAxis,
} from "recharts";

import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import {
  listAnalyses,
  listDailyParts,
  listFueling,
  listTrips,
} from "@/lib/api/production-consumption";
import { ChartCard } from "@/components/charts/ChartCard";
import {
  CHART_AXIS_PROPS,
  CHART_COLORS,
  CHART_GRID_PROPS,
  CHART_LEGEND_STYLE,
} from "@/lib/chart-theme";
import {
  DashboardFilters,
  DashboardTabs,
  KpiCardCompact,
} from "@/components/charts/DashboardFilters";
import {
  ProductionConsumptionCompactChart,
  SimpleBarChart,
  DieselHoursProductionScatterChart,
  EmptyChartState,
  ChartGrid,
} from "@/components/charts/ProductionConsumptionCharts";
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
  extractDateKey,
} from "@/lib/production-consumption-utils";
import type { DbProductionAnalysis, DbTrip, DbFueling, DbEquipmentDailyPart } from "@/db/schema";

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

/**
 * Componente principal do dashboard
 */
function ProducaoConsumoRefactored() {
  const user = useAuthStore((s) => s.user);
  const canCreate = user?.role === "administrador" || user?.role === "gestor";

  // Estado principal
  const [analyses, setAnalyses] = useState<DbProductionAnalysis[]>([]);
  const [tripRows, setTripRows] = useState<DbTrip[]>([]);
  const [fuelRows, setFuelRows] = useState<DbFueling[]>([]);
  const [dailyPartRows, setDailyPartRows] = useState<DbEquipmentDailyPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Hooks customizados
  const { filters, updateFilters, clearFilters } = useDashboardFilters();
  const analysisSelection = useAnalysisSelection(analyses);
  const { activeTab, setActiveTab, tabs } = useDashboardTabs();
  const analysesModal = useAnalysesModal();
  const {
    page: tripPage,
    nextPage: tripNextPage,
    prevPage: tripPrevPage,
  } = usePagination(tripRows.length, PAGE_SIZE);

  // Filtros de dados
  const { filteredTrips, filteredFueling, filteredDailyParts } = useFilteredData(
    tripRows,
    fuelRows,
    dailyPartRows,
    filters,
  );

  // Carregamento de análises
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

  // Carregamento de dados
  const loadData = useCallback(async () => {
    if (analysisSelection.selectedIds.length === 0) {
      setTripRows([]);
      setFuelRows([]);
      setDailyPartRows([]);
      return;
    }
    setLoading(true);
    try {
      const [tripsResult, fuelResult, dailyPartResult] = await Promise.all([
        listTrips({ data: { analysisIds: analysisSelection.selectedIds } }),
        listFueling({ data: { analysisIds: analysisSelection.selectedIds } }),
        listDailyParts({ data: { analysisIds: analysisSelection.selectedIds } }),
      ]);
      setTripRows(tripsResult as DbTrip[]);
      setFuelRows(fuelResult as DbFueling[]);
      setDailyPartRows(dailyPartResult as DbEquipmentDailyPart[]);
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

  // Valores únicos para filtros
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

  // Cálculos de métricas
  const dailyMetricsMap = useMemo(
    () => calculateDailyMetrics(filteredTrips, filteredFueling),
    [filteredFueling, filteredTrips],
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
    () => calculateEquipmentMetrics(filteredFueling, filteredDailyParts),
    [filteredDailyParts, filteredFueling],
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

  // Handlers
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
        </div>
      </div>

      {/* Empty State */}
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
          {/* Filtros */}
          <DashboardFilters
            state={filters}
            onChange={updateFilters}
            obras={distinctObras}
            materials={distinctMaterials}
            equipment={distinctEquipment}
            aggregates={distinctAggregates}
            loading={loading}
          />

          {/* Tabs */}
          <DashboardTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

          {/* KPI Cards */}
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
            <KpiCardCompact label="Custo Diesel" value={formatBRL(kpis.fuelCost)} icon="payments" />
            <KpiCardCompact label="Viagens" value={String(kpis.trips)} icon="local_shipping" />
            <KpiCardCompact label="L/m³" value={formatNumber(kpis.fuelPerM3, 2)} icon="speed" />
            <KpiCardCompact
              label="Eficiência"
              value={`${formatNumber(kpis.efficiencyPercent, 0)}%`}
              tone="success"
              icon="query_stats"
            />
          </div>

          {/* Tabs Content */}
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

              <ChartGrid>
                <ProductionConsumptionCompactChart
                  data={dailyData}
                  hasData={
                    dailyData.length > 0 &&
                    (dailyData.some((d) => d.m3 > 0) || dailyData.some((d) => d.diesel > 0))
                  }
                />

                {aggregateMetrics.length > 0 && (
                  <SimpleBarChart
                    title="Top Agregados"
                    description="Volume produzido por agregado"
                    data={aggregateMetrics.slice(0, 8)}
                    dataKey="compactedM3"
                    nameKey="aggregate"
                    hasData={aggregateMetrics.length > 0}
                    layout="vertical"
                    height={280}
                  />
                )}

                {equipmentMetrics.length > 0 && (
                  <SimpleBarChart
                    title="Consumo Equipamentos"
                    description="Litros consumidos por equipamento"
                    data={equipmentMetrics.slice(0, 8)}
                    dataKey="liters"
                    nameKey="equipment"
                    color={CHART_COLORS.consumption}
                    hasData={equipmentMetrics.length > 0}
                    layout="vertical"
                    height={280}
                  />
                )}

                <DieselHoursProductionScatterChart
                  data={
                    aggregateMetrics.map((agg, i) => ({
                      id: agg.aggregate,
                      label: agg.aggregate,
                      hours: aggregateMetrics.length,
                      compactedM3: agg.compactedM3,
                      liters:
                        ((dailyData.reduce((sum, d) => sum + d.diesel, 0) /
                          aggregateMetrics.length) *
                          agg.participation) /
                        100,
                      z: agg.compactedM3 * 10,
                      color: i % 2 === 0 ? "#22c55e" : "#f4c430",
                      efficiencyPercent: (agg.compactedM3 / Math.max(kpis.compactedM3, 1)) * 100,
                    })) || []
                  }
                  hasData={aggregateMetrics.length > 0}
                />
              </ChartGrid>

              {/* Historical */}
              <div className="mt-5 rounded border border-border-low bg-surface-container p-4">
                <AnalysisHistoryPanel
                  analyses={analyses}
                  selectedIds={analysisSelection.selectedIds}
                  onSelect={analysisSelection.setSelectedIds}
                />
              </div>
            </>
          )}

          {activeTab === "daily" && (
            <ChartGrid>
              <ProductionConsumptionCompactChart data={dailyData} hasData={dailyData.length > 0} />
              {dailyData.length === 0 && (
                <EmptyChartState
                  title="Sem Dados"
                  message="Nenhum dado disponível para o período selecionado"
                />
              )}
            </ChartGrid>
          )}

          {activeTab === "efficiency" && (
            <ChartGrid>
              {equipmentMetrics.length > 0 ? (
                <SimpleBarChart
                  title="L/h por Equipamento"
                  description="Eficiência de consumo"
                  data={equipmentMetrics.slice(0, 10)}
                  dataKey="fuelPerHour"
                  nameKey="equipment"
                  hasData={equipmentMetrics.length > 0}
                  layout="vertical"
                  height={280}
                />
              ) : (
                <EmptyChartState
                  title="Sem Equipamentos"
                  message="Nenhum equipamento com dados disponível"
                />
              )}
            </ChartGrid>
          )}

          {activeTab === "financial" && (
            <ChartGrid>
              {dailyData.length > 0 && (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart
                    data={dailyData}
                    margin={{ top: 10, right: 8, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis dataKey="label" {...CHART_AXIS_PROPS} />
                    <YAxis
                      yAxisId="left"
                      {...CHART_AXIS_PROPS}
                      tickFormatter={(v) => formatBRL(Number(v))}
                    />
                    <YAxis yAxisId="right" orientation="right" {...CHART_AXIS_PROPS} />
                    <Tooltip />
                    <Legend wrapperStyle={CHART_LEGEND_STYLE as CSSProperties} />
                    <Bar
                      yAxisId="left"
                      dataKey="revenue"
                      name="Faturamento"
                      fill={CHART_COLORS.revenue}
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="costPerM3"
                      name="R$/m³"
                      stroke={CHART_COLORS.cost}
                      strokeWidth={3}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </ChartGrid>
          )}

          {/* Paginação de dados brutos se necessário */}
          {activeTab === "data" && tripRows.length > 0 && (
            <div className="mt-5 rounded border border-border-low bg-surface-container overflow-hidden">
              <div className="p-3 border-b border-border-low">
                <h3 className="text-xs font-black uppercase tracking-widest">
                  Viagens Importadas ({tripRows.length})
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
                          <td className="px-3 py-2">
                            {trip.prefix || trip.vehicleId || trip.plate}
                          </td>
                          <td className="px-3 py-2">{trip.obra}</td>
                          <td className="px-3 py-2 text-right">
                            {formatNumber(trip.cubicMCompacted, 1)}
                          </td>
                          <td className="px-3 py-2 text-right">{formatBRL(trip.total)}</td>
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
      ) : null}

      {/* Modals */}
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
