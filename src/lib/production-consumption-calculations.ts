/**
 * Lógica de cálculo de métricas e KPIs para o dashboard
 * Refatoração - Dashboard Produção x Consumo
 */

import type { DbTrip, DbFueling, DbEquipmentDailyPart } from "@/db/schema";
import {
  safeDivide,
  calculateCompactedM3,
  calculateEfficiencyIndex,
  calculateProductivityIndex,
  extractDateKey,
  getWeekdayIndex,
} from "@/lib/production-consumption-utils";
import { AGGREGATE_TRIP_PRICE } from "@/lib/production-analytics";
import type { DailyMetrics, OperationalKPIs } from "@/lib/production-consumption-types";
import {
  displayEquipmentLabel,
  normalizeEquipmentKey,
  type EquipmentContext,
} from "@/lib/equipment-normalization";

/**
 * Calcula volume compactado a partir do volume solto
 */
export function calculateCompactedVolume(
  looseM3: number,
  swellFactor: number | null | undefined = 0.3,
): number {
  return calculateCompactedM3(looseM3, swellFactor);
}

function compactedTripVolume(trip: Pick<DbTrip, "cubicMLoose" | "swellFactorApplied">): number {
  return calculateCompactedVolume(trip.cubicMLoose || 0, trip.swellFactorApplied);
}

function fuelingEquipmentContext(
  fuel: Pick<DbFueling, "analysisId" | "vehicleType" | "owner" | "operator">,
): EquipmentContext {
  if (fuel.analysisId === "allocated") return "fuelAllocation";
  if (fuel.analysisId === "attributed") return "fuelAttribution";
  return {
    source: "fueling",
    description: [fuel.vehicleType, fuel.owner, fuel.operator].filter(Boolean).join(" "),
  };
}

/**
 * Calcula métricas diárias agregadas
 */
export function calculateDailyMetrics(
  trips: DbTrip[],
  fueling: DbFueling[],
): Map<string, DailyMetrics> {
  const metricsMap = new Map<string, DailyMetrics>();

  // Processa viagens (produção)
  trips.forEach((trip) => {
    const date = extractDateKey(trip.datetime);
    if (!date) return;

    const short = `${date.split("-")[2]}/${date.split("-")[1]}`;
    const current = metricsMap.get(date) ?? {
      date,
      label: short,
      compactedM3: 0,
      looseM3: 0,
      diesel: 0,
      cost: 0,
      trips: 0,
      revenue: 0,
      margin: 0,
      fuelPerM3: 0,
      costPerM3: 0,
    };

    current.compactedM3 += compactedTripVolume(trip);
    current.looseM3 += trip.cubicMLoose || 0;
    current.trips += 1;
    current.revenue += trip.total || 0;
    metricsMap.set(date, current);
  });

  // Processa abastecimentos (consumo)
  fueling.forEach((fuel) => {
    const date = extractDateKey(fuel.datetime);
    if (!date) return;

    const short = `${date.split("-")[2]}/${date.split("-")[1]}`;
    const current = metricsMap.get(date) ?? {
      date,
      label: short,
      compactedM3: 0,
      looseM3: 0,
      diesel: 0,
      cost: 0,
      trips: 0,
      revenue: 0,
      margin: 0,
      fuelPerM3: 0,
      costPerM3: 0,
    };

    current.diesel += fuel.liters || 0;
    current.cost += fuel.total || 0;
    metricsMap.set(date, current);
  });

  // Calcula métricas derivadas
  metricsMap.forEach((metrics) => {
    const aggregateCost = metrics.trips * AGGREGATE_TRIP_PRICE;
    metrics.margin = metrics.revenue - metrics.cost - aggregateCost;
    metrics.fuelPerM3 = safeDivide(metrics.compactedM3, metrics.diesel);
    metrics.costPerM3 = safeDivide(metrics.cost, metrics.compactedM3);
  });

  return metricsMap;
}

/**
 * Calcula KPIs operacionais
 */
export function calculateOperationalKPIs(
  trips: DbTrip[],
  fueling: DbFueling[],
  dailyParts: DbEquipmentDailyPart[],
): OperationalKPIs {
  const looseM3 = trips.reduce((sum, t) => sum + (t.cubicMLoose || 0), 0);
  const compactedM3 = trips.reduce((sum, t) => sum + compactedTripVolume(t), 0);
  const diesel = fueling.reduce((sum, f) => sum + (f.liters || 0), 0);
  const fuelCost = fueling.reduce((sum, f) => sum + (f.total || 0), 0);
  const revenue = trips.reduce((sum, t) => sum + (t.total || 0), 0);
  const aggregateCost = trips.length * AGGREGATE_TRIP_PRICE;
  const operationalMargin = revenue - fuelCost - aggregateCost;

  const totalHours = dailyParts.reduce((sum, p) => sum + (p.hours || 0), 0);

  const kpis: OperationalKPIs = {
    looseM3,
    compactedM3,
    diesel,
    fuelCost,
    costPerM3: safeDivide(fuelCost, compactedM3),
    trips: trips.length,
    aggregateCost,
    revenue,
    operationalMargin,
    fuelPerM3: safeDivide(compactedM3, diesel),
    avgCostPerLiter: safeDivide(fuelCost, diesel),
    efficiencyPercent: calculateEfficiencyIndex(
      safeDivide(compactedM3, totalHours || 1),
      safeDivide(compactedM3, diesel),
      safeDivide(diesel, totalHours || 1),
    ),
    productivityIndex: calculateProductivityIndex(
      safeDivide(trips.length, totalHours || 1),
      safeDivide(compactedM3, totalHours || 1),
    ),
  };

  return kpis;
}

/**
 * Calcula métricas por agregado/caminhão
 */
export function calculateAggregateMetrics(
  trips: DbTrip[],
  totalCompactedM3: number,
): Array<{
  aggregate: string;
  trips: number;
  looseM3: number;
  compactedM3: number;
  cost: number;
  costPerM3: number;
  participation: number;
}> {
  const map = new Map<
    string,
    {
      aggregate: string;
      trips: number;
      looseM3: number;
      compactedM3: number;
      cost: number;
    }
  >();

  trips.forEach((trip) => {
    const value = trip.prefix || trip.vehicleId || trip.plate;
    const key = normalizeEquipmentKey(value, "trip") || "SEM_PREFIXO";
    const current = map.get(key) ?? {
      aggregate: displayEquipmentLabel(value, "trip"),
      trips: 0,
      looseM3: 0,
      compactedM3: 0,
      cost: 0,
    };

    current.trips += 1;
    current.looseM3 += trip.cubicMLoose || 0;
    current.compactedM3 += compactedTripVolume(trip);
    current.cost += AGGREGATE_TRIP_PRICE;
    map.set(key, current);
  });

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      costPerM3: safeDivide(row.cost, row.compactedM3),
      participation: safeDivide(row.compactedM3, totalCompactedM3) * 100,
    }))
    .sort((a, b) => b.trips - a.trips || b.compactedM3 - a.compactedM3);
}

/**
 * Calcula métricas por equipamento
 */
export function calculateEquipmentMetrics(
  fueling: DbFueling[],
  dailyParts: DbEquipmentDailyPart[],
): Array<{
  equipment: string;
  liters: number;
  cost: number;
  hours: number;
  fuelPerHour: number;
  costPerHour: number;
  status: string;
}> {
  const map = new Map<
    string,
    {
      equipment: string;
      liters: number;
      cost: number;
      hours: number;
      statuses: Set<string>;
    }
  >();

  // Processa abastecimentos
  fueling.forEach((fuel) => {
    const value = fuel.prefix || fuel.vehicleId || fuel.plate;
    const context = fuelingEquipmentContext(fuel);
    const key = normalizeEquipmentKey(value, context) || "SEM_EQUIPAMENTO";
    const current = map.get(key) ?? {
      equipment: displayEquipmentLabel(value, context),
      liters: 0,
      cost: 0,
      hours: 0,
      statuses: new Set<string>(),
    };

    current.liters += fuel.liters || 0;
    current.cost += fuel.total || 0;
    map.set(key, current);
  });

  // Processa partes diárias (horas)
  dailyParts.forEach((part) => {
    const value = part.fleet || part.fleetLabel;
    const key = normalizeEquipmentKey(value, "dailyPart") || part.fleet;
    const current = map.get(key) ?? {
      equipment: displayEquipmentLabel(value, "dailyPart"),
      liters: 0,
      cost: 0,
      hours: 0,
      statuses: new Set<string>(),
    };

    current.hours += part.hours || 0;
    if (part.status) current.statuses.add(part.status);
    map.set(key, current);
  });

  return Array.from(map.values())
    .map((row) => ({
      equipment: row.equipment,
      liters: row.liters,
      cost: row.cost,
      hours: row.hours,
      fuelPerHour: safeDivide(row.liters, row.hours),
      costPerHour: safeDivide(row.cost, row.hours),
      status:
        row.liters > 0 && row.hours <= 0
          ? "CMB sem PDE"
          : row.hours > 0 && row.liters <= 0
            ? "PDE sem CMB"
            : row.statuses.size
              ? [...row.statuses].join(", ")
              : "OK",
    }))
    .sort((a, b) => b.liters - a.liters);
}

/**
 * Calcula distribuição de produção por obra
 */
export function calculateObraDistribution(trips: DbTrip[]) {
  const map = new Map<string, number>();

  trips.forEach((trip) => {
    const obra = trip.obra || "Sem obra";
    map.set(obra, (map.get(obra) ?? 0) + compactedTripVolume(trip));
  });

  const sorted = Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const top = sorted.slice(0, 5);
  const other = sorted.slice(5).reduce((sum, row) => sum + row.value, 0);
  return other > 0 ? [...top, { name: "Outros", value: other }] : top;
}

/**
 * Calcula matriz de horas por dia/hora (heatmap)
 */
export function calculateProductionHeatmap(trips: DbTrip[]) {
  const map = new Map<string, { dayIndex: number; hour: number; m3: number; trips: number }>();

  trips.forEach((trip) => {
    const date = extractDateKey(trip.datetime);
    if (!date) return;

    const dayIndex = getWeekdayIndex(date);
    const hour = extractHourFromTimestamp(trip.datetime);
    const key = `${dayIndex}-${hour}`;

    const current = map.get(key) ?? { dayIndex, hour, m3: 0, trips: 0 };
    current.m3 += compactedTripVolume(trip);
    current.trips += 1;
    map.set(key, current);
  });

  return Array.from(map.values());
}

/**
 * Extrai hora de um timestamp
 */
function extractHourFromTimestamp(timestamp: string): number {
  const match = String(timestamp).match(/(?:T|\s)(\d{2}):/);
  return match ? Math.min(23, Math.max(0, Number(match[1]))) : 0;
}

/**
 * Detecta alertas operacionais
 */
export function detectOperationalAlerts(
  trips: DbTrip[],
  fueling: DbFueling[],
  equipment: Array<{ equipment: string; hours: number; liters: number }>,
): string[] {
  const alerts: string[] = [];

  // Alertas de equipamento sem dados
  equipment.forEach((eq) => {
    if (eq.liters > 0 && eq.hours <= 0) {
      alerts.push(`Equipamento ${eq.equipment}: abastecimento sem horas na PDE`);
    }
    if (eq.hours > 0 && eq.liters <= 0) {
      alerts.push(`Equipamento ${eq.equipment}: PDE sem abastecimento registrado`);
    }
  });

  // Alertas de agregados improdutivos
  const aggregateMap = new Map<string, { trips: number; volume: number }>();
  trips.forEach((t) => {
    const key = t.prefix || t.vehicleId || t.plate || "SEM_PREFIXO";
    const curr = aggregateMap.get(key) ?? { trips: 0, volume: 0 };
    curr.trips += 1;
    curr.volume += compactedTripVolume(t);
    aggregateMap.set(key, curr);
  });

  aggregateMap.forEach((metrics, aggregate) => {
    if (metrics.trips > 0 && metrics.volume <= 0) {
      alerts.push(`Agregado ${aggregate} com viagens mas sem volume m³ registrado`);
    }
  });

  return alerts;
}
