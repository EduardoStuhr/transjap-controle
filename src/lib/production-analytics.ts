import { normalizeDateKey, normalizeFleet } from "@/lib/carcara-parser";
import type { DbEquipmentDailyPart, DbFueling, DbProductionAnalysis, DbTrip } from "@/db/schema";

export const AGGREGATE_TRIP_PRICE = 1.65;

const MORNING_END_MINUTES = 11 * 60 + 59;
const AFTERNOON_START_MINUTES = 12 * 60;

export type OperationalScope = "daily" | "weekly" | "monthly" | "worksite" | "global";
export type BubbleMode = "obra" | "equipment" | "analysis" | "period";
export type EfficiencyStatus = "efficient" | "attention" | "critical";

export type OperationalFilters = {
  analysisIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  obra?: string;
  material?: string;
  aggregate?: string;
  equipment?: string;
  operator?: string;
  shift?: "morning" | "afternoon" | "all";
  materialType?: string;
  supplier?: string;
  serviceFront?: string;
};

export type ShiftHours = {
  horasMatutino: number;
  horasVespertino: number;
  horasTotal: number;
  firstMorning?: string;
  lastMorning?: string;
  firstAfternoon?: string;
  lastAfternoon?: string;
};

export type AggregateMetric = {
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
  firstTrip?: string;
  lastTrip?: string;
};

export type MachineMetric = {
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
};

export type HistoricalPoint = {
  date: string;
  label: string;
  looseM3: number;
  compactedM3: number;
  liters: number;
  fuelCost: number;
  trips: number;
  revenue: number;
  aggregateCost: number;
  operationalCost: number;
  margin: number;
  hours: number;
  fuelPerM3: number;
  fuelPerHour: number;
  productionPerHour: number;
  tripsPerHour: number;
  operationalCostPerM3: number;
  efficiencyPercent: number;
};

export type ObraRankingRow = {
  obra: string;
  compactedM3: number;
  looseM3: number;
  liters: number;
  hours: number;
  trips: number;
  fuelCost: number;
  aggregateCost: number;
  operationalCost: number;
  revenue: number;
  margin: number;
  fuelPerM3: number;
  productionPerHour: number;
  fuelPerHour: number;
  tripsPerHour: number;
  operationalCostPerM3: number;
  efficiencyPercent: number;
};

export type OperationalBubble = {
  id: string;
  label: string;
  obra: string;
  equipment?: string;
  period?: string;
  hours: number;
  liters: number;
  compactedM3: number;
  fuelPerHour: number;
  productionPerHour: number;
  fuelPerM3: number;
  costPerM3: number;
  costPerHour: number;
  efficiencyPercent: number;
  status: EfficiencyStatus;
  color: string;
  z: number;
};

export type AccumulatedMetrics = {
  analysisCount: number;
  obraCount: number;
  materialCount: number;
  looseM3: number;
  compactedM3: number;
  trips: number;
  liters: number;
  fuelCost: number;
  aggregateCost: number;
  operationalCost: number;
  revenue: number;
  operationalMargin: number;
  hours: number;
  fuelPerM3: number;
  fuelPerHour: number;
  productionPerHour: number;
  tripsPerHour: number;
  aggregateCostPerM3: number;
  operationalCostPerM3: number;
  operationalCostPerHour: number;
  avgCostPerLiter: number;
  efficiencyPercent: number;
  productivityIndex: number;
};

export type AuditIssue = {
  severity: "info" | "warning" | "critical";
  type:
    | "PDE_SEM_CMB"
    | "CMB_SEM_PDE"
    | "PRODUCAO_SEM_MAQUINA"
    | "HORARIO_INCONSISTENTE"
    | "EQUIPAMENTO_IMPRODUTIVO"
    | "AGREGADO_IMPRODUTIVO"
    | "UNIVERSOS_SEPARADOS";
  message: string;
  entity?: string;
  date?: string;
};

export type ProductionAnalytics = {
  version: number;
  createdAt: string;
  filters: OperationalFilters;
  aggregateMetrics: AggregateMetric[];
  machineMetrics: MachineMetric[];
  accumulatedMetrics: AccumulatedMetrics;
  historicalSeries: HistoricalPoint[];
  obraRanking: ObraRankingRow[];
  operationalBubbles: Record<BubbleMode, OperationalBubble[]>;
  alerts: string[];
  audit: AuditIssue[];
  charts: {
    productionConsumption: HistoricalPoint[];
    dieselHoursProduction: OperationalBubble[];
    obraComparison: ObraRankingRow[];
    aggregateProduction: AggregateMetric[];
    machineEfficiency: MachineMetric[];
  };
  context: {
    scopes: OperationalScope[];
    obras: string[];
    materials: string[];
    aggregates: string[];
    equipment: string[];
    analysisIds: string[];
  };
};

type AnalyticsRows = {
  analyses: DbProductionAnalysis[];
  trips: DbTrip[];
  fueling: DbFueling[];
  dailyParts: DbEquipmentDailyPart[];
  filters?: OperationalFilters;
};

type ProductionTripLike = Pick<
  DbTrip,
  | "analysisId"
  | "datetime"
  | "prefix"
  | "vehicleId"
  | "plate"
  | "obra"
  | "material"
  | "driver"
  | "operator"
  | "cubicMLoose"
  | "cubicMCompacted"
  | "swellFactorApplied"
  | "total"
>;

type FuelLike = Pick<
  DbFueling,
  | "analysisId"
  | "datetime"
  | "prefix"
  | "vehicleId"
  | "plate"
  | "obra"
  | "operator"
  | "liters"
  | "total"
>;

type DailyPartLike = Pick<
  DbEquipmentDailyPart,
  "analysisId" | "fleet" | "fleetLabel" | "date" | "obra" | "hours" | "status" | "usedInAnalysis"
>;

export function safeDivide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function compacted(row: ProductionTripLike) {
  return row.cubicMCompacted || safeDivide(row.cubicMLoose, 1 + row.swellFactorApplied);
}

function shortDate(key: string) {
  if (!key || key.length < 10) return "";
  const [, month, day] = key.split("-");
  return `${day}/${month}`;
}

function periodMonth(key: string) {
  if (!key || key.length < 7) return "Sem data";
  const [year, month] = key.split("-");
  return `${month}/${year}`;
}

function dateHourMinute(datetime: string) {
  if (!datetime) return null;
  const timeMatch = datetime.match(/T(\d{2}):(\d{2})/) ?? datetime.match(/\s(\d{1,2}):(\d{2})/);
  if (timeMatch) return Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
  const date = new Date(datetime);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function firstLast(values: string[]) {
  const sorted = values.filter(Boolean).sort();
  return { first: sorted[0], last: sorted[sorted.length - 1] };
}

function spanHours(datetimes: string[]) {
  if (datetimes.length < 2) return 0;
  const minutes = datetimes
    .map(dateHourMinute)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  if (minutes.length < 2) return 0;
  return Math.max(0, (minutes[minutes.length - 1] - minutes[0]) / 60);
}

function rowMatchesFilters(
  row: {
    analysisId?: string;
    datetime?: string;
    date?: string;
    obra?: string;
    material?: string;
    prefix?: string;
    vehicleId?: string;
    plate?: string;
    fleet?: string;
    operator?: string;
    driver?: string;
  },
  filters?: OperationalFilters,
) {
  if (!filters) return true;
  const ids = filters.analysisIds?.filter(Boolean);
  if (ids?.length && row.analysisId && !ids.includes(row.analysisId)) return false;
  const key = normalizeDateKey(row.datetime ?? row.date);
  if (filters.dateFrom && key && key < filters.dateFrom) return false;
  if (filters.dateTo && key && key > filters.dateTo) return false;
  if (filters.obra && filters.obra !== "all" && row.obra !== filters.obra) return false;
  if (filters.material && filters.material !== "all" && row.material !== filters.material) {
    return false;
  }
  if (filters.aggregate && filters.aggregate !== "all") {
    const aggregate = normalizeAggregatePrefix(row.prefix || row.vehicleId || row.plate);
    if (aggregate !== filters.aggregate) return false;
  }
  if (filters.equipment && filters.equipment !== "all") {
    const equipment = normalizeFleet(row.fleet || row.prefix || row.vehicleId || row.plate);
    if (equipment !== normalizeFleet(filters.equipment)) return false;
  }
  if (filters.operator && filters.operator !== "all") {
    const text = `${row.operator ?? ""} ${row.driver ?? ""}`.toLowerCase();
    if (!text.includes(filters.operator.toLowerCase())) return false;
  }
  if (filters.shift && filters.shift !== "all" && row.datetime) {
    const minutes = dateHourMinute(row.datetime);
    if (minutes == null) return false;
    if (filters.shift === "morning" && minutes > MORNING_END_MINUTES) return false;
    if (filters.shift === "afternoon" && minutes < AFTERNOON_START_MINUTES) return false;
  }
  return true;
}

export function normalizeAggregatePrefix(value: unknown): string {
  const text = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  if (!text) return "Agregado sem identificacao";
  const number = text.match(/\d+/)?.[0];
  if (number && (text.includes("CB") || /^[\d\s.-]+$/.test(text))) return `CB ${Number(number)}`;
  return text.replace(/\s+/g, " ");
}

export function calculateFuelPerM3(liters: number, compactedM3: number) {
  return safeDivide(liters, compactedM3);
}

export function calculateFuelPerHour(liters: number, hours: number) {
  return safeDivide(liters, hours);
}

export function calculateProductionPerHour(compactedM3: number, hours: number) {
  return safeDivide(compactedM3, hours);
}

export function calculateOperationalEfficiency({
  liters,
  hours,
  compactedM3,
}: {
  liters: number;
  hours: number;
  compactedM3: number;
}) {
  if (compactedM3 <= 0 && (liters > 0 || hours > 0)) return 0;
  if (compactedM3 <= 0) return 0;

  const productionPerHour = calculateProductionPerHour(compactedM3, hours);
  const fuelPerM3 = calculateFuelPerM3(liters, compactedM3);
  const fuelPerHour = calculateFuelPerHour(liters, hours);

  const productionScore = hours > 0 ? clamp((productionPerHour / 35) * 100, 0, 120) : 60;
  const fuelM3Score = liters > 0 ? clamp((1.5 / Math.max(fuelPerM3, 0.01)) * 100, 0, 120) : 80;
  const fuelHourScore =
    hours > 0 && liters > 0 ? clamp((18 / Math.max(fuelPerHour, 0.01)) * 100, 0, 120) : 70;

  return clamp(productionScore * 0.45 + fuelM3Score * 0.4 + fuelHourScore * 0.15, 0, 100);
}

function efficiencyStatus(
  efficiencyPercent: number,
  liters: number,
  compactedM3: number,
): EfficiencyStatus {
  if (liters > 0 && compactedM3 <= 0) return "critical";
  if (efficiencyPercent >= 70) return "efficient";
  if (efficiencyPercent >= 45) return "attention";
  return "critical";
}

export function bubbleColor(status: EfficiencyStatus) {
  if (status === "efficient") return "#22c55e";
  if (status === "attention") return "#f4c430";
  return "#ef4444";
}

export function calculateShiftHours(datetimes: string[]): ShiftHours {
  const morning = datetimes.filter((datetime) => {
    const minutes = dateHourMinute(datetime);
    return minutes !== null && minutes <= MORNING_END_MINUTES;
  });
  const afternoon = datetimes.filter((datetime) => {
    const minutes = dateHourMinute(datetime);
    return minutes !== null && minutes >= AFTERNOON_START_MINUTES;
  });
  const morningRange = firstLast(morning);
  const afternoonRange = firstLast(afternoon);

  const horasMatutino = spanHours(morning);
  const horasVespertino = spanHours(afternoon);
  return {
    horasMatutino,
    horasVespertino,
    horasTotal: horasMatutino + horasVespertino,
    firstMorning: morningRange.first,
    lastMorning: morningRange.last,
    firstAfternoon: afternoonRange.first,
    lastAfternoon: afternoonRange.last,
  };
}

export function calculateAggregateMetrics(
  trips: DbTrip[],
  tripPrice = AGGREGATE_TRIP_PRICE,
): AggregateMetric[] {
  const map = new Map<
    string,
    AggregateMetric & { datetimesByDate: Map<string, string[]>; allDatetimes: string[] }
  >();

  trips.forEach((row) => {
    const aggregate = normalizeAggregatePrefix(row.prefix || row.vehicleId || row.plate);
    const current =
      map.get(aggregate) ??
      ({
        aggregate,
        trips: 0,
        looseM3: 0,
        compactedM3: 0,
        hoursMorning: 0,
        hoursAfternoon: 0,
        hoursTotal: 0,
        tripsPerHour: 0,
        m3PerHour: 0,
        aggregateCost: 0,
        aggregateCostPerM3: 0,
        participation: 0,
        datetimesByDate: new Map<string, string[]>(),
        allDatetimes: [],
      } satisfies AggregateMetric & {
        datetimesByDate: Map<string, string[]>;
        allDatetimes: string[];
      });

    const date = normalizeDateKey(row.datetime);
    current.trips += 1;
    current.looseM3 += row.cubicMLoose;
    current.compactedM3 += compacted(row);
    current.aggregateCost = current.trips * tripPrice;
    current.allDatetimes.push(row.datetime);
    if (date) {
      const dayTimes = current.datetimesByDate.get(date) ?? [];
      dayTimes.push(row.datetime);
      current.datetimesByDate.set(date, dayTimes);
    }
    map.set(aggregate, current);
  });

  const totalM3 = [...map.values()].reduce((sum, row) => sum + row.compactedM3, 0);
  const totalTrips = [...map.values()].reduce((sum, row) => sum + row.trips, 0);

  return [...map.values()]
    .map((row) => {
      let hoursMorning = 0;
      let hoursAfternoon = 0;
      row.datetimesByDate.forEach((datetimes) => {
        const shift = calculateShiftHours(datetimes);
        hoursMorning += shift.horasMatutino;
        hoursAfternoon += shift.horasVespertino;
      });
      const hoursTotal = hoursMorning + hoursAfternoon;
      const range = firstLast(row.allDatetimes);
      return {
        aggregate: row.aggregate,
        trips: row.trips,
        looseM3: row.looseM3,
        compactedM3: row.compactedM3,
        hoursMorning,
        hoursAfternoon,
        hoursTotal,
        tripsPerHour: safeDivide(row.trips, hoursTotal),
        m3PerHour: safeDivide(row.compactedM3, hoursTotal),
        aggregateCost: row.aggregateCost,
        aggregateCostPerM3: safeDivide(row.aggregateCost, row.compactedM3),
        participation:
          totalM3 > 0
            ? (row.compactedM3 / totalM3) * 100
            : totalTrips > 0
              ? (row.trips / totalTrips) * 100
              : 0,
        firstTrip: range.first,
        lastTrip: range.last,
      };
    })
    .sort((a, b) => b.compactedM3 - a.compactedM3 || b.trips - a.trips);
}

function productionByDateObra(trips: DbTrip[]) {
  const map = new Map<string, { compactedM3: number; trips: number }>();
  trips.forEach((row) => {
    const date = normalizeDateKey(row.datetime);
    const key = `${date}|${row.obra || "Sem obra"}`;
    const current = map.get(key) ?? { compactedM3: 0, trips: 0 };
    current.compactedM3 += compacted(row);
    current.trips += 1;
    map.set(key, current);
  });
  return map;
}

function dailyHoursByDateObra(dailyParts: DbEquipmentDailyPart[]) {
  const map = new Map<string, number>();
  dailyParts
    .filter((row) => row.usedInAnalysis)
    .forEach((row) => {
      const key = `${row.date}|${row.obra || "Sem obra"}`;
      map.set(key, (map.get(key) ?? 0) + row.hours);
    });
  return map;
}

export function calculateMachineMetrics(
  fueling: DbFueling[],
  dailyParts: DbEquipmentDailyPart[],
  trips: DbTrip[] = [],
): MachineMetric[] {
  const productionMap = productionByDateObra(trips);
  const hoursMap = dailyHoursByDateObra(dailyParts);
  const map = new Map<
    string,
    {
      equipment: string;
      label: string;
      hours: number;
      liters: number;
      cost: number;
      allocatedCompactedM3: number;
      allocatedTrips: number;
      statuses: Set<string>;
    }
  >();

  const ensure = (equipment: string, label = equipment) => {
    const key = normalizeFleet(equipment) || equipment || "SEM_EQUIPAMENTO";
    const current = map.get(key) ?? {
      equipment: key,
      label: label || key,
      hours: 0,
      liters: 0,
      cost: 0,
      allocatedCompactedM3: 0,
      allocatedTrips: 0,
      statuses: new Set<string>(),
    };
    map.set(key, current);
    return current;
  };

  fueling.forEach((row) => {
    const equipment = normalizeFleet(row.prefix || row.vehicleId || row.plate);
    const item = ensure(equipment, row.prefix || row.vehicleId || row.plate);
    item.liters += row.liters;
    item.cost += row.total;
  });

  dailyParts.forEach((row) => {
    const item = ensure(row.fleet, row.fleetLabel || row.fleet);
    item.hours += row.hours;
    if (row.status) item.statuses.add(row.status);
    if (!row.usedInAnalysis || row.hours <= 0) return;
    const key = `${row.date}|${row.obra || "Sem obra"}`;
    const production = productionMap.get(key);
    const totalHours = hoursMap.get(key) ?? 0;
    if (production && totalHours > 0) {
      const share = row.hours / totalHours;
      item.allocatedCompactedM3 += production.compactedM3 * share;
      item.allocatedTrips += production.trips * share;
    }
  });

  return [...map.values()]
    .map((row) => {
      const fuelPerHour = calculateFuelPerHour(row.liters, row.hours);
      const productionPerHour = calculateProductionPerHour(row.allocatedCompactedM3, row.hours);
      const fuelPerM3 = calculateFuelPerM3(row.liters, row.allocatedCompactedM3);
      const efficiencyPercent = calculateOperationalEfficiency({
        liters: row.liters,
        hours: row.hours,
        compactedM3: row.allocatedCompactedM3,
      });
      const status =
        row.liters > 0 && row.hours <= 0
          ? "CMB sem PDE"
          : row.hours > 0 && row.liters <= 0
            ? "PDE sem CMB"
            : row.hours > 0 && row.allocatedCompactedM3 <= 0
              ? "Equipamento improdutivo"
              : row.statuses.size
                ? [...row.statuses].join(", ")
                : "OK";
      return {
        equipment: row.equipment,
        label: row.label,
        hours: row.hours,
        liters: row.liters,
        cost: row.cost,
        fuelPerHour,
        costPerHour: safeDivide(row.cost, row.hours),
        allocatedCompactedM3: row.allocatedCompactedM3,
        allocatedTrips: row.allocatedTrips,
        productionPerHour,
        tripsPerHour: safeDivide(row.allocatedTrips, row.hours),
        fuelPerM3,
        costPerM3: safeDivide(row.cost, row.allocatedCompactedM3),
        efficiencyPercent,
        status,
      };
    })
    .sort((a, b) => b.liters - a.liters || b.hours - a.hours);
}

export function buildHistoricalSeries(
  trips: DbTrip[],
  fueling: DbFueling[],
  dailyParts: DbEquipmentDailyPart[],
): HistoricalPoint[] {
  const map = new Map<string, HistoricalPoint>();
  const ensure = (date: string) => {
    const current =
      map.get(date) ??
      ({
        date,
        label: shortDate(date),
        looseM3: 0,
        compactedM3: 0,
        liters: 0,
        fuelCost: 0,
        trips: 0,
        revenue: 0,
        aggregateCost: 0,
        operationalCost: 0,
        margin: 0,
        hours: 0,
        fuelPerM3: 0,
        fuelPerHour: 0,
        productionPerHour: 0,
        tripsPerHour: 0,
        operationalCostPerM3: 0,
        efficiencyPercent: 0,
      } satisfies HistoricalPoint);
    map.set(date, current);
    return current;
  };

  trips.forEach((row) => {
    const date = normalizeDateKey(row.datetime);
    if (!date) return;
    const current = ensure(date);
    current.looseM3 += row.cubicMLoose;
    current.compactedM3 += compacted(row);
    current.trips += 1;
    current.revenue += row.total;
    current.aggregateCost += AGGREGATE_TRIP_PRICE;
  });

  fueling.forEach((row) => {
    const date = normalizeDateKey(row.datetime);
    if (!date) return;
    const current = ensure(date);
    current.liters += row.liters;
    current.fuelCost += row.total;
  });

  dailyParts
    .filter((row) => row.usedInAnalysis)
    .forEach((row) => {
      const date = normalizeDateKey(row.date);
      if (!date) return;
      const current = ensure(date);
      current.hours += row.hours;
    });

  return [...map.values()]
    .map((row) => {
      const operationalCost = row.fuelCost + row.aggregateCost;
      return {
        ...row,
        operationalCost,
        margin: row.revenue - operationalCost,
        fuelPerM3: calculateFuelPerM3(row.liters, row.compactedM3),
        fuelPerHour: calculateFuelPerHour(row.liters, row.hours),
        productionPerHour: calculateProductionPerHour(row.compactedM3, row.hours),
        tripsPerHour: safeDivide(row.trips, row.hours),
        operationalCostPerM3: safeDivide(operationalCost, row.compactedM3),
        efficiencyPercent: calculateOperationalEfficiency({
          liters: row.liters,
          hours: row.hours,
          compactedM3: row.compactedM3,
        }),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildAccumulatedMetrics({
  analyses,
  trips,
  fueling,
  dailyParts,
}: {
  analyses: DbProductionAnalysis[];
  trips: DbTrip[];
  fueling: DbFueling[];
  dailyParts: DbEquipmentDailyPart[];
}): AccumulatedMetrics {
  const looseM3 = trips.reduce((sum, row) => sum + row.cubicMLoose, 0);
  const compactedM3 = trips.reduce((sum, row) => sum + compacted(row), 0);
  const liters = fueling.reduce((sum, row) => sum + row.liters, 0);
  const fuelCost = fueling.reduce((sum, row) => sum + row.total, 0);
  const revenue = trips.reduce((sum, row) => sum + row.total, 0);
  const hours = dailyParts
    .filter((row) => row.usedInAnalysis)
    .reduce((sum, row) => sum + row.hours, 0);
  const aggregateCost = trips.length * AGGREGATE_TRIP_PRICE;
  const operationalCost = fuelCost + aggregateCost;
  const efficiencyPercent = calculateOperationalEfficiency({ liters, hours, compactedM3 });

  return {
    analysisCount: new Set(analyses.map((row) => row.id)).size,
    obraCount: new Set([
      ...analyses.map((row) => row.obra).filter(Boolean),
      ...trips.map((row) => row.obra).filter(Boolean),
      ...fueling.map((row) => row.obra).filter(Boolean),
    ]).size,
    materialCount: new Set([
      ...analyses.map((row) => row.material).filter(Boolean),
      ...trips.map((row) => row.material).filter(Boolean),
    ]).size,
    looseM3,
    compactedM3,
    trips: trips.length,
    liters,
    fuelCost,
    aggregateCost,
    operationalCost,
    revenue,
    operationalMargin: revenue - operationalCost,
    hours,
    fuelPerM3: calculateFuelPerM3(liters, compactedM3),
    fuelPerHour: calculateFuelPerHour(liters, hours),
    productionPerHour: calculateProductionPerHour(compactedM3, hours),
    tripsPerHour: safeDivide(trips.length, hours),
    aggregateCostPerM3: safeDivide(aggregateCost, compactedM3),
    operationalCostPerM3: safeDivide(operationalCost, compactedM3),
    operationalCostPerHour: safeDivide(operationalCost, hours),
    avgCostPerLiter: safeDivide(fuelCost, liters),
    efficiencyPercent,
    productivityIndex: efficiencyPercent,
  };
}

function buildObraRanking(
  trips: DbTrip[],
  fueling: DbFueling[],
  dailyParts: DbEquipmentDailyPart[],
): ObraRankingRow[] {
  const map = new Map<string, ObraRankingRow>();
  const ensure = (obra: string) => {
    const key = obra || "Sem obra";
    const current =
      map.get(key) ??
      ({
        obra: key,
        compactedM3: 0,
        looseM3: 0,
        liters: 0,
        hours: 0,
        trips: 0,
        fuelCost: 0,
        aggregateCost: 0,
        operationalCost: 0,
        revenue: 0,
        margin: 0,
        fuelPerM3: 0,
        productionPerHour: 0,
        fuelPerHour: 0,
        tripsPerHour: 0,
        operationalCostPerM3: 0,
        efficiencyPercent: 0,
      } satisfies ObraRankingRow);
    map.set(key, current);
    return current;
  };

  trips.forEach((row) => {
    const current = ensure(row.obra);
    current.compactedM3 += compacted(row);
    current.looseM3 += row.cubicMLoose;
    current.trips += 1;
    current.revenue += row.total;
    current.aggregateCost += AGGREGATE_TRIP_PRICE;
  });
  fueling.forEach((row) => {
    const current = ensure(row.obra);
    current.liters += row.liters;
    current.fuelCost += row.total;
  });
  dailyParts
    .filter((row) => row.usedInAnalysis)
    .forEach((row) => {
      const current = ensure(row.obra);
      current.hours += row.hours;
    });

  return [...map.values()]
    .map((row) => {
      const operationalCost = row.fuelCost + row.aggregateCost;
      return {
        ...row,
        operationalCost,
        margin: row.revenue - operationalCost,
        fuelPerM3: calculateFuelPerM3(row.liters, row.compactedM3),
        productionPerHour: calculateProductionPerHour(row.compactedM3, row.hours),
        fuelPerHour: calculateFuelPerHour(row.liters, row.hours),
        tripsPerHour: safeDivide(row.trips, row.hours),
        operationalCostPerM3: safeDivide(operationalCost, row.compactedM3),
        efficiencyPercent: calculateOperationalEfficiency({
          liters: row.liters,
          hours: row.hours,
          compactedM3: row.compactedM3,
        }),
      };
    })
    .sort((a, b) => b.efficiencyPercent - a.efficiencyPercent || b.compactedM3 - a.compactedM3);
}

function bubbleFromTotals({
  id,
  label,
  obra,
  equipment,
  period,
  hours,
  liters,
  compactedM3,
  cost,
}: {
  id: string;
  label: string;
  obra: string;
  equipment?: string;
  period?: string;
  hours: number;
  liters: number;
  compactedM3: number;
  cost: number;
}): OperationalBubble {
  const efficiencyPercent = calculateOperationalEfficiency({ liters, hours, compactedM3 });
  const status = efficiencyStatus(efficiencyPercent, liters, compactedM3);
  return {
    id,
    label,
    obra,
    equipment,
    period,
    hours,
    liters,
    compactedM3,
    fuelPerHour: calculateFuelPerHour(liters, hours),
    productionPerHour: calculateProductionPerHour(compactedM3, hours),
    fuelPerM3: calculateFuelPerM3(liters, compactedM3),
    costPerM3: safeDivide(cost, compactedM3),
    costPerHour: safeDivide(cost, hours),
    efficiencyPercent,
    status,
    color: bubbleColor(status),
    z: Math.max(80, Math.sqrt(Math.max(liters, 0)) * 30),
  };
}

function buildBubbles(
  analyses: DbProductionAnalysis[],
  historicalSeries: HistoricalPoint[],
  obraRanking: ObraRankingRow[],
  machineMetrics: MachineMetric[],
  trips: DbTrip[],
  fueling: DbFueling[],
  dailyParts: DbEquipmentDailyPart[],
): Record<BubbleMode, OperationalBubble[]> {
  const analysisTotals = new Map<
    string,
    { hours: number; liters: number; compactedM3: number; cost: number }
  >();
  const ensureAnalysis = (id: string) => {
    const current = analysisTotals.get(id) ?? { hours: 0, liters: 0, compactedM3: 0, cost: 0 };
    analysisTotals.set(id, current);
    return current;
  };
  trips.forEach((row) => {
    const current = ensureAnalysis(row.analysisId);
    current.compactedM3 += compacted(row);
    current.cost += AGGREGATE_TRIP_PRICE;
  });
  fueling.forEach((row) => {
    const current = ensureAnalysis(row.analysisId);
    current.liters += row.liters;
    current.cost += row.total;
  });
  dailyParts
    .filter((row) => row.usedInAnalysis)
    .forEach((row) => {
      const current = ensureAnalysis(row.analysisId);
      current.hours += row.hours;
    });

  const byAnalysis = analyses.map((analysis) => {
    const totals = analysisTotals.get(analysis.id) ?? {
      hours: 0,
      liters: 0,
      compactedM3: 0,
      cost: 0,
    };
    return bubbleFromTotals({
      id: analysis.id,
      label: analysis.name,
      obra: analysis.obra,
      hours: totals.hours,
      liters: totals.liters,
      compactedM3: totals.compactedM3,
      cost: totals.cost,
    });
  });

  return {
    obra: obraRanking.map((row) =>
      bubbleFromTotals({
        id: row.obra,
        label: row.obra,
        obra: row.obra,
        hours: row.hours,
        liters: row.liters,
        compactedM3: row.compactedM3,
        cost: row.operationalCost,
      }),
    ),
    equipment: machineMetrics.map((row) =>
      bubbleFromTotals({
        id: row.equipment,
        label: `Frota ${row.label || row.equipment}`,
        obra: "",
        equipment: row.equipment,
        hours: row.hours,
        liters: row.liters,
        compactedM3: row.allocatedCompactedM3,
        cost: row.cost,
      }),
    ),
    analysis: byAnalysis,
    period: historicalSeries.map((row) =>
      bubbleFromTotals({
        id: row.date,
        label: row.label,
        obra: "",
        period: row.date,
        hours: row.hours,
        liters: row.liters,
        compactedM3: row.compactedM3,
        cost: row.operationalCost,
      }),
    ),
  };
}

function buildAuditIssues(
  metrics: AccumulatedMetrics,
  aggregateMetrics: AggregateMetric[],
  machineMetrics: MachineMetric[],
  trips: DbTrip[],
  dailyParts: DbEquipmentDailyPart[],
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  machineMetrics.forEach((row) => {
    if (row.liters > 0 && row.hours <= 0) {
      issues.push({
        severity: "critical",
        type: "CMB_SEM_PDE",
        entity: row.equipment,
        message: `CMB sem PDE para equipamento próprio ${row.equipment}.`,
      });
    }
    if (row.hours > 0 && row.liters <= 0) {
      issues.push({
        severity: "warning",
        type: "PDE_SEM_CMB",
        entity: row.equipment,
        message: `PDE sem CMB para equipamento próprio ${row.equipment}.`,
      });
    }
    if (row.hours > 0 && row.allocatedCompactedM3 <= 0) {
      issues.push({
        severity: "critical",
        type: "EQUIPAMENTO_IMPRODUTIVO",
        entity: row.equipment,
        message: `Equipamento ${row.equipment} teve horas PDE sem produção compactada associada.`,
      });
    }
  });

  if (metrics.compactedM3 > 0 && metrics.hours <= 0) {
    issues.push({
      severity: "critical",
      type: "PRODUCAO_SEM_MAQUINA",
      message: "Há produção RCO sem horas PDE válidas para equipamentos próprios.",
    });
  }

  const averageTripsPerHour = safeDivide(
    aggregateMetrics.reduce((sum, row) => sum + row.trips, 0),
    aggregateMetrics.reduce((sum, row) => sum + row.hoursTotal, 0),
  );
  aggregateMetrics.forEach((row) => {
    if (row.trips > 0 && row.compactedM3 <= 0) {
      issues.push({
        severity: "critical",
        type: "AGREGADO_IMPRODUTIVO",
        entity: row.aggregate,
        message: `Agregado ${row.aggregate} registrou viagens sem volume m³ identificado.`,
      });
    } else if (
      averageTripsPerHour > 0 &&
      row.tripsPerHour > 0 &&
      row.tripsPerHour < averageTripsPerHour * 0.65
    ) {
      issues.push({
        severity: "warning",
        type: "AGREGADO_IMPRODUTIVO",
        entity: row.aggregate,
        message: `Agregado ${row.aggregate} abaixo da média de viagens/h.`,
      });
    }
  });

  trips.forEach((row) => {
    const minutes = dateHourMinute(row.datetime);
    if (!normalizeDateKey(row.datetime) || minutes === null) {
      issues.push({
        severity: "warning",
        type: "HORARIO_INCONSISTENTE",
        entity: normalizeAggregatePrefix(row.prefix || row.vehicleId || row.plate),
        message: "Viagem RCO com data ou horário inconsistente.",
      });
    }
  });

  dailyParts
    .filter((row) => row.status && row.status !== "OK")
    .forEach((row) => {
      issues.push({
        severity: row.status === "Sem horas na PDE" ? "critical" : "warning",
        type: row.status === "Sem horas na PDE" ? "CMB_SEM_PDE" : "PDE_SEM_CMB",
        entity: row.fleet,
        date: row.date,
        message: `${row.status} para frota ${row.fleet} em ${row.date}.`,
      });
    });

  issues.push({
    severity: "info",
    type: "UNIVERSOS_SEPARADOS",
    message:
      "RCO representa agregados CB pagos por viagem; PDE/CMB representam equipamentos próprios.",
  });

  return issues;
}

function buildOperationalAlerts(
  metrics: AccumulatedMetrics,
  obraRanking: ObraRankingRow[],
  machineMetrics: MachineMetric[],
  aggregateMetrics: AggregateMetric[],
  historicalSeries: HistoricalPoint[],
) {
  const alerts: string[] = [];
  const avgFuelPerM3 = metrics.fuelPerM3;
  const worstObra = obraRanking
    .filter((row) => row.compactedM3 > 0 && row.fuelPerM3 > 0)
    .sort((a, b) => b.fuelPerM3 - a.fuelPerM3)[0];
  if (worstObra && avgFuelPerM3 > 0 && worstObra.fuelPerM3 > avgFuelPerM3 * 1.25) {
    const diff = ((worstObra.fuelPerM3 / avgFuelPerM3 - 1) * 100).toFixed(0);
    alerts.push(
      `Obra ${worstObra.obra} consumiu ${diff}% mais diesel por m³ que a média filtrada.`,
    );
  }

  const lowMachine = machineMetrics
    .filter((row) => row.hours > 0 && row.liters > 0)
    .sort((a, b) => a.efficiencyPercent - b.efficiencyPercent)[0];
  if (lowMachine && lowMachine.efficiencyPercent < 45) {
    alerts.push(`Equipamento ${lowMachine.equipment} teve baixa produtividade operacional.`);
  }

  const avgTripsPerHour = safeDivide(
    aggregateMetrics.reduce((sum, row) => sum + row.trips, 0),
    aggregateMetrics.reduce((sum, row) => sum + row.hoursTotal, 0),
  );
  const lowAggregate = aggregateMetrics
    .filter((row) => row.trips > 0 && row.tripsPerHour > 0)
    .sort((a, b) => a.tripsPerHour - b.tripsPerHour)[0];
  if (lowAggregate && avgTripsPerHour > 0 && lowAggregate.tripsPerHour < avgTripsPerHour * 0.75) {
    alerts.push(`Agregado ${lowAggregate.aggregate} abaixo da média de viagens/h.`);
  }

  const last = historicalSeries[historicalSeries.length - 1];
  const averageHistoricalFuelM3 = safeDivide(
    historicalSeries.reduce((sum, row) => sum + row.fuelPerM3, 0),
    historicalSeries.filter((row) => row.fuelPerM3 > 0).length,
  );
  if (last && averageHistoricalFuelM3 > 0 && last.fuelPerM3 > averageHistoricalFuelM3 * 1.3) {
    alerts.push("Consumo acima da média histórica no último período carregado.");
  }

  if (alerts.length === 0) {
    alerts.push(
      "Sem alerta crítico no filtro atual; acompanhe Diesel x Horas x Produção para tendência.",
    );
  }
  return alerts.slice(0, 4);
}

export function applyOperationalFilters<T extends DbTrip | DbFueling | DbEquipmentDailyPart>(
  rows: T[],
  filters?: OperationalFilters,
) {
  return rows.filter((row) => rowMatchesFilters(row, filters));
}

export function buildProductionAnalytics({
  analyses,
  trips,
  fueling,
  dailyParts,
  filters,
}: AnalyticsRows): ProductionAnalytics {
  const filteredTrips = applyOperationalFilters(trips, filters);
  const filteredFueling = applyOperationalFilters(fueling, filters);
  const filteredDailyParts = applyOperationalFilters(dailyParts, filters);
  const selectedAnalysisIds = filters?.analysisIds?.filter(Boolean);
  const scopedAnalyses = selectedAnalysisIds?.length
    ? analyses.filter((analysis) => selectedAnalysisIds.includes(analysis.id))
    : analyses;

  const aggregateMetrics = calculateAggregateMetrics(filteredTrips);
  const machineMetrics = calculateMachineMetrics(
    filteredFueling,
    filteredDailyParts,
    filteredTrips,
  );
  const accumulatedMetrics = buildAccumulatedMetrics({
    analyses: scopedAnalyses,
    trips: filteredTrips,
    fueling: filteredFueling,
    dailyParts: filteredDailyParts,
  });
  const historicalSeries = buildHistoricalSeries(
    filteredTrips,
    filteredFueling,
    filteredDailyParts,
  );
  const obraRanking = buildObraRanking(filteredTrips, filteredFueling, filteredDailyParts);
  const operationalBubbles = buildBubbles(
    scopedAnalyses,
    historicalSeries,
    obraRanking,
    machineMetrics,
    filteredTrips,
    filteredFueling,
    filteredDailyParts,
  );
  const audit = buildAuditIssues(
    accumulatedMetrics,
    aggregateMetrics,
    machineMetrics,
    filteredTrips,
    filteredDailyParts,
  );
  const alerts = buildOperationalAlerts(
    accumulatedMetrics,
    obraRanking,
    machineMetrics,
    aggregateMetrics,
    historicalSeries,
  );

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    filters: filters ?? {},
    aggregateMetrics,
    machineMetrics,
    accumulatedMetrics,
    historicalSeries,
    obraRanking,
    operationalBubbles,
    alerts,
    audit,
    charts: {
      productionConsumption: historicalSeries,
      dieselHoursProduction: operationalBubbles.obra.length
        ? operationalBubbles.obra
        : operationalBubbles.equipment,
      obraComparison: obraRanking,
      aggregateProduction: aggregateMetrics,
      machineEfficiency: machineMetrics,
    },
    context: {
      scopes: ["daily", "weekly", "monthly", "worksite", "global"],
      obras: [
        ...new Set(
          [
            ...scopedAnalyses.map((row) => row.obra),
            ...filteredTrips.map((row) => row.obra),
            ...filteredFueling.map((row) => row.obra),
          ].filter(Boolean),
        ),
      ].sort(),
      materials: [
        ...new Set(
          [
            ...scopedAnalyses.map((row) => row.material),
            ...filteredTrips.map((row) => row.material),
          ].filter(Boolean),
        ),
      ].sort(),
      aggregates: [
        ...new Set(
          filteredTrips.map((row) =>
            normalizeAggregatePrefix(row.prefix || row.vehicleId || row.plate),
          ),
        ),
      ].sort(),
      equipment: [
        ...new Set(
          [
            ...filteredFueling.map((row) =>
              normalizeFleet(row.prefix || row.vehicleId || row.plate),
            ),
            ...filteredDailyParts.map((row) => row.fleet),
          ].filter(Boolean),
        ),
      ].sort(),
      analysisIds: scopedAnalyses.map((row) => row.id),
    },
  };
}

export function buildAnalysisSnapshot({
  analysis,
  trips,
  fueling,
  dailyParts,
}: {
  analysis: DbProductionAnalysis;
  trips: DbTrip[];
  fueling: DbFueling[];
  dailyParts: DbEquipmentDailyPart[];
}) {
  const analytics = buildProductionAnalytics({
    analyses: [analysis],
    trips,
    fueling,
    dailyParts,
    filters: { analysisIds: [analysis.id] },
  });
  return {
    metrics: analytics.accumulatedMetrics,
    aggregateMetrics: analytics.aggregateMetrics,
    machineMetrics: analytics.machineMetrics,
    charts: analytics.charts,
    audit: analytics.audit,
    context: analytics.context,
  };
}

export function buildPeriodLabel(date: string, scope: OperationalScope) {
  if (scope === "monthly") return periodMonth(date);
  if (scope === "weekly") return date;
  if (scope === "daily") return shortDate(date);
  return date;
}
