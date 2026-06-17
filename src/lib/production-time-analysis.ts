import type { DbTrip } from "@/db/schema";
import {
  displayObraAliasLabel,
  displayObraName,
  normalizeObraName,
} from "@/lib/production-consumption-utils";

export type ProductionShiftKey = "matutino" | "vespertino";

export type HourProductionSummary = {
  hour: number;
  label: string;
  trips: number;
  m3: number;
  materials: string[];
};

export type ShiftProductionSummary = {
  key: ProductionShiftKey;
  label: string;
  firstTrip: string;
  lastTrip: string;
  productiveHours: number;
  trips: number;
  m3: number;
  productionPerHour: number;
  hasSingleTrip: boolean;
};

export type WorksiteTimeSummary = {
  obra: string;
  date: string;
  trips: number;
  m3: number;
  firstTrip: string;
  lastTrip: string;
  productiveHours: number;
  productionPerHour: number;
  aggregates: string[];
  hourly: HourProductionSummary[];
  shifts: Record<ProductionShiftKey, ShiftProductionSummary>;
  bestHour: HourProductionSummary | null;
  bestTripHour: HourProductionSummary | null;
  bestShift: ShiftProductionSummary | null;
};

type TimedTrip = {
  row: DbTrip;
  minutes: number;
  parsed: RcoOperationalDateTime;
};

export type RcoOperationalDateTime = {
  date: string;
  time: string;
  minutes: number;
  hourBucket: number;
  originalValue: string;
};

const RCO_OPERATIONAL_TIME_ZONE = "America/Sao_Paulo";
const operationalInstantFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RCO_OPERATIONAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parsedOperationalDateTime(
  originalValue: string,
  year: string,
  month: string,
  day: string,
  hour: string,
  minute: string,
): RcoOperationalDateTime | null {
  const hours = Number(hour);
  const minutes = Number(minute);
  const normalizedYear = year.length === 2 ? `20${year}` : year;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return {
    date: `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    time: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`,
    minutes: hours * 60 + minutes,
    hourBucket: hours,
    originalValue,
  };
}

/**
 * Interpreta Data/Hora da viagem no horario operacional do RCO.
 *
 * Linhas existentes foram importadas do XLSX como Date e persistidas via toISOString(),
 * portanto timestamps com fuso representam um instante que precisa ser exibido em Sao Paulo.
 * Valores textuais sem fuso ja sao horario operacional e sao preservados literalmente.
 */
export function parseRcoOperationalDateTime(
  timestamp: string | null | undefined,
): RcoOperationalDateTime | null {
  const originalValue = String(timestamp ?? "").trim();
  if (!originalValue) return null;

  const brazilianLocal = originalValue.match(
    /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\s+(\d{1,2}):(\d{2})/,
  );
  if (brazilianLocal) {
    const [, day, month, year, hour, minute] = brazilianLocal;
    return parsedOperationalDateTime(originalValue, year, month, day, hour, minute);
  }

  const isoLocal = originalValue.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T|\s)(\d{1,2}):(\d{2})(?!.*(?:Z|[+-]\d{2}:?\d{2})$)/i,
  );
  if (isoLocal) {
    const [, year, month, day, hour, minute] = isoLocal;
    return parsedOperationalDateTime(originalValue, year, month, day, hour, minute);
  }

  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(originalValue)) {
    const instant = new Date(originalValue);
    if (Number.isNaN(instant.getTime())) return null;
    const parts = Object.fromEntries(
      operationalInstantFormatter
        .formatToParts(instant)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    return parsedOperationalDateTime(
      originalValue,
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
      parts.minute,
    );
  }

  return null;
}

function timeLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00 - ${String(hour).padStart(2, "0")}:59`;
}

function volume(row: DbTrip): number {
  return row.cubicMLoose || 0;
}

function makeShift(
  key: ProductionShiftKey,
  trips: TimedTrip[],
): ShiftProductionSummary {
  const label = key === "matutino" ? "Matutino" : "Vespertino";
  const first = trips[0];
  const last = trips[trips.length - 1];
  const productiveHours =
    first && last && trips.length > 1 ? (last.minutes - first.minutes) / 60 : 0;
  const m3 = trips.reduce((sum, trip) => sum + volume(trip.row), 0);
  return {
    key,
    label,
    firstTrip: first ? timeLabel(first.minutes) : "",
    lastTrip: last ? timeLabel(last.minutes) : "",
    productiveHours,
    trips: trips.length,
    m3,
    productionPerHour: productiveHours > 0 ? m3 / productiveHours : 0,
    hasSingleTrip: trips.length === 1,
  };
}

export function buildWorksiteTimeSummary(
  trips: DbTrip[],
  date: string,
  obra: string,
  opts?: { debug?: boolean },
): WorksiteTimeSummary | null {
  const timedTrips = trips
    .flatMap((row) => {
      const parsed = parseRcoOperationalDateTime(row.datetime);
      return parsed && parsed.date === date ? [{ row, minutes: parsed.minutes, parsed }] : [];
    })
    .sort((left, right) => left.minutes - right.minutes);

  if (opts?.debug && import.meta.env.DEV && timedTrips.length > 0) {
    const examples =
      timedTrips.length === 1 ? timedTrips : [timedTrips[0], timedTrips[timedTrips.length - 1]];
    console.table(
      examples.map(({ row, parsed }) => ({
        rawDatetime: row.datetime,
        parsedDate: parsed.date,
        parsedTime: parsed.time,
        hourBucket: `${String(parsed.hourBucket).padStart(2, "0")}h`,
        originalValue: parsed.originalValue,
      })),
    );
  }

  if (!timedTrips.length) return null;

  const hourlyMap = new Map<number, HourProductionSummary>();
  timedTrips.forEach(({ row, minutes }) => {
    const hour = Math.floor(minutes / 60);
    const current = hourlyMap.get(hour) ?? {
      hour,
      label: hourLabel(hour),
      trips: 0,
      m3: 0,
      materials: [],
    };
    current.trips += 1;
    current.m3 += volume(row);
    if (row.material && !current.materials.includes(row.material)) {
      current.materials.push(row.material);
    }
    hourlyMap.set(hour, current);
  });

  const first = timedTrips[0];
  const last = timedTrips[timedTrips.length - 1];
  const firstHour = Math.floor(first.minutes / 60);
  const lastHour = Math.floor(last.minutes / 60);
  const hourly = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => {
    const hour = firstHour + index;
    return (
      hourlyMap.get(hour) ?? {
        hour,
        label: hourLabel(hour),
        trips: 0,
        m3: 0,
        materials: [],
      }
    );
  });
  const productiveHours = timedTrips.length > 1 ? (last.minutes - first.minutes) / 60 : 0;
  const m3 = timedTrips.reduce((sum, trip) => sum + volume(trip.row), 0);
  const shifts = {
    matutino: makeShift(
      "matutino",
      timedTrips.filter((trip) => trip.minutes < 12 * 60),
    ),
    vespertino: makeShift(
      "vespertino",
      timedTrips.filter((trip) => trip.minutes >= 12 * 60),
    ),
  };

  const byProduction = [...hourly].sort((left, right) => right.m3 - left.m3 || left.hour - right.hour);
  const byTrips = [...hourly].sort((left, right) => right.trips - left.trips || left.hour - right.hour);
  const shiftsWithTrips = Object.values(shifts).filter((shift) => shift.trips > 0);

  return {
    obra,
    date,
    trips: timedTrips.length,
    m3,
    firstTrip: timeLabel(first.minutes),
    lastTrip: timeLabel(last.minutes),
    productiveHours,
    productionPerHour: productiveHours > 0 ? m3 / productiveHours : 0,
    aggregates: [
      ...new Set(
        timedTrips
          .map(({ row }) => row.prefix || row.vehicleId || row.plate)
          .filter(Boolean),
      ),
    ],
    hourly,
    shifts,
    bestHour: byProduction[0] ?? null,
    bestTripHour: byTrips[0] ?? null,
    bestShift:
      shiftsWithTrips.sort(
        (left, right) => right.m3 - left.m3 || right.trips - left.trips,
      )[0] ?? null,
  };
}

export function buildWorksiteTimeSummaries(trips: DbTrip[], date: string): WorksiteTimeSummary[] {
  const rowsByObra = new Map<string, { obra: string; rows: DbTrip[] }>();
  trips
    .filter((trip) => parseRcoOperationalDateTime(trip.datetime)?.date === date)
    .forEach((trip) => {
      const obra = displayObraAliasLabel(trip.obra);
      const key = normalizeObraName(obra);
      const current = rowsByObra.get(key) ?? { obra, rows: [] };
      current.rows.push(trip);
      rowsByObra.set(key, current);
    });

  return Array.from(rowsByObra.values())
    .flatMap(({ obra, rows }) => {
      const summary = buildWorksiteTimeSummary(rows, date, obra);
      return summary ? [summary] : [];
    })
    .sort((left, right) => right.m3 - left.m3 || left.obra.localeCompare(right.obra, "pt-BR"));
}
