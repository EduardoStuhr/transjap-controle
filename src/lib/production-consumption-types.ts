/**
 * Tipos e interfaces para o dashboard de Produção x Consumo
 * Refatoração completa com suporte a múltiplas análises, obras e comparações
 */

export type ChartSize = "small" | "medium" | "large" | "full";

export const INTEGRATION_STATUS_LABELS = {
  OK: "Dados completos",
  NO_PRODUCTION: "Diesel ou horas PDE presentes, mas sem produção RCO",
  NO_DIESEL: "RCO ou PDE presentes, mas sem diesel alocado",
  BLOCKED_SOURCE: "CMB bruto bloqueado porque já possui allocation oficial",
  WORKSITE_ABSENT: "Obra não informada",
  WRONG_WORKSITE: "Obra do CMB/PDE diferente da obra da análise",
  NO_DATA: "Sem RCO, PDE ou diesel",
} as const;

export type IntegrationStatus = keyof typeof INTEGRATION_STATUS_LABELS;

export function integrationStatusLabel(status: string | null | undefined) {
  return status && status in INTEGRATION_STATUS_LABELS
    ? INTEGRATION_STATUS_LABELS[status as IntegrationStatus]
    : String(status ?? "");
}

export function formatIntegrationStatus(status: string | null | undefined) {
  if (!status) return "";
  const label = integrationStatusLabel(status);
  return label && label !== status ? `${status} - ${label}` : status;
}

export interface ChartDimensions {
  height: number;
  width: "half" | "full";
}

export interface DashboardFilterState {
  dateFrom: string;
  dateTo: string;
  obra: string;
  material: string;
  equipment: string;
  aggregate: string;
  analysisType: "all" | "production-only" | "consumption-only";
}

export interface DailyMetrics {
  date: string;
  label: string;
  compactedM3: number;
  looseM3: number;
  diesel: number;
  hours?: number;
  relatedM3?: number;
  m3PerHour?: number;
  litersPerM3?: number;
  status?: IntegrationStatus;
  statusReason?: string;
  cost: number;
  trips: number;
  revenue: number;
  margin: number;
  fuelPerM3: number;
  costPerM3: number;
}

export interface AggregateMetrics {
  aggregate: string;
  trips: number;
  looseM3: number;
  compactedM3: number;
  hoursMorning: number;
  hoursAfternoon: number;
  hoursTotal: number;
  tripsPerHour: number;
  m3PerHour: number;
  aggregateCost: number;
  aggregateCostPerM3: number;
  participation: number;
}

export interface EquipmentMetrics {
  equipment: string;
  label: string;
  hours: number;
  liters: number;
  cost: number;
  fuelPerHour: number;
  costPerHour: number;
  allocatedCompactedM3: number;
  allocatedTrips: number;
  productionPerHour: number;
  tripsPerHour: number;
  fuelPerM3: number;
  costPerM3: number;
  efficiencyPercent: number;
  status: string;
}

export interface OperationalKPIs {
  looseM3: number;
  compactedM3: number;
  diesel: number;
  fuelCost: number;
  costPerM3: number;
  trips: number;
  aggregateCost: number;
  revenue: number;
  operationalMargin: number;
  fuelPerM3: number;
  avgCostPerLiter: number;
  efficiencyPercent: number;
  productivityIndex: number;
}

export interface AccumulatedMetrics {
  analysisCount: number;
  obraCount: number;
  materialCount: number;
  compactedM3: number;
  diesel: number;
  operationalCost: number;
  operationalMargin: number;
  fuelPerHour: number;
  productionPerHour: number;
  tripsPerHour: number;
  operationalCostPerHour: number;
  operationalCostPerM3: number;
  efficiencyPercent: number;
  productivityIndex: number;
}

export interface ObraRankingRow {
  obra: string;
  compactedM3: number;
  looseM3: number;
  diesel: number;
  hours: number;
  trips: number;
  fuelPerM3: number;
  productionPerHour: number;
  operationalCostPerM3: number;
  operationalCost: number;
  fuelCost: number;
  aggregateCost: number;
  margin: number;
  efficiencyPercent: number;
}

export interface OperationalBubble {
  id: string;
  label: string;
  obra?: string;
  equipment?: string;
  hours: number;
  compactedM3: number;
  liters: number;
  z: number;
  fuelPerHour: number;
  productionPerHour: number;
  fuelPerM3: number;
  costPerM3: number;
  efficiencyPercent: number;
  color: string;
}

export interface ComparisonData {
  analysisA: {
    id: string;
    name: string;
    metrics: OperationalKPIs;
    daily: DailyMetrics[];
  };
  analysisB: {
    id: string;
    name: string;
    metrics: OperationalKPIs;
    daily: DailyMetrics[];
  };
  delta: {
    m3: number;
    diesel: number;
    cost: number;
    margin: number;
    efficiency: number;
  };
}

export interface ChartStateConfig {
  title: string;
  description: string;
  height: number;
  showLegend: boolean;
  showTooltip: boolean;
  responsive: boolean;
}

export interface EmptyStateConfig {
  title: string;
  description: string;
  suggestion?: string;
}
