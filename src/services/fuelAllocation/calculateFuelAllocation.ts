import {
  findFallbackPDEs,
  findMatchingPDEs,
  findPDEsWithoutAllocationData,
} from "./findMatchingPDEs";
import {
  invalidIntervalAudit,
  multiplePdeMatchesAudit,
  noMatchingPdeAudit,
  noPreviousHourmeterAudit,
  pdePartiallyCoveredAudit,
  pdeUsingWorkedHoursFallbackAudit,
  pdeWithoutHourmeterAudit,
  unallocatedHoursAudit,
} from "./fuelAllocationAudit";
import type { FuelAllocationCalculation, FuelAllocationResult, FuelEntry, PDEEntry } from "./types";

const HOURS_EPSILON = 0.000001;

type OpenSlice = { start: number; end: number };
type FuelAllocationState = {
  fallbackHoursUsed?: Map<string, number>;
  usedPdeHourmeterSlices?: Map<string, OpenSlice[]>;
};

function validHourmeter(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function result(
  allocations: FuelAllocationResult[],
  audits: FuelAllocationCalculation["audits"],
  coveredHours: number,
): FuelAllocationCalculation {
  return {
    allocations,
    audits,
    coveredHours,
    allocatedHours: allocations.reduce((sum, allocation) => sum + allocation.allocatedHours, 0),
  };
}

function allocateResult(
  fuel: FuelEntry,
  pde: PDEEntry,
  start: number,
  end: number,
  litersPerHour: number,
  costPerHour: number,
): FuelAllocationResult {
  const allocatedHours = end - start;
  return {
    sourceFuelingId: fuel.id,
    pdeId: pde.id,
    equipmentId: fuel.equipmentId,
    fleet: fuel.fleet || fuel.equipmentId,
    pdeDate: pde.date,
    obra: pde.obra ?? "",
    hourmeterStart: start,
    hourmeterEnd: end,
    allocatedHours,
    litersAllocated: allocatedHours * litersPerHour,
    costAllocated: allocatedHours * costPerHour,
  };
}

function removeSlice(
  slices: OpenSlice[],
  allocatedStart: number,
  allocatedEnd: number,
): OpenSlice[] {
  const next: OpenSlice[] = [];
  for (const slice of slices) {
    if (allocatedEnd <= slice.start || allocatedStart >= slice.end) {
      next.push(slice);
      continue;
    }
    if (allocatedStart > slice.start + HOURS_EPSILON) {
      next.push({ start: slice.start, end: allocatedStart });
    }
    if (allocatedEnd < slice.end - HOURS_EPSILON) {
      next.push({ start: allocatedEnd, end: slice.end });
    }
  }
  return next.sort((a, b) => a.start - b.start);
}

function totalOpenHours(slices: OpenSlice[]) {
  return slices.reduce((sum, slice) => sum + slice.end - slice.start, 0);
}

function mergeSlices(slices: OpenSlice[]): OpenSlice[] {
  const sorted = [...slices]
    .filter((slice) => slice.end - slice.start > HOURS_EPSILON)
    .sort((a, b) => a.start - b.start);
  const merged: OpenSlice[] = [];
  for (const slice of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && slice.start <= previous.end + HOURS_EPSILON) {
      previous.end = Math.max(previous.end, slice.end);
    } else {
      merged.push({ ...slice });
    }
  }
  return merged;
}

function subtractSlices(start: number, end: number, used: OpenSlice[]): OpenSlice[] {
  let available: OpenSlice[] = [{ start, end }];
  for (const slice of used) {
    available = removeSlice(available, slice.start, slice.end);
    if (available.length === 0) break;
  }
  return available;
}

function markPdeSliceUsed(
  usedPdeHourmeterSlices: Map<string, OpenSlice[]>,
  pdeId: string,
  start: number,
  end: number,
) {
  const current = usedPdeHourmeterSlices.get(pdeId) ?? [];
  usedPdeHourmeterSlices.set(pdeId, mergeSlices([...current, { start, end }]));
}

export function resolvePreviousHourmeter(fuel: FuelEntry, previousFuel?: FuelEntry) {
  if (validHourmeter(fuel.previousHourmeter)) return fuel.previousHourmeter;
  if (previousFuel && validHourmeter(previousFuel.currentHourmeter)) {
    return previousFuel.currentHourmeter;
  }
  return undefined;
}

export function calculateFuelAllocation(
  fuel: FuelEntry,
  pdes: PDEEntry[],
  previousFuel?: FuelEntry,
  state: FuelAllocationState = {},
): FuelAllocationCalculation {
  const fallbackHoursUsed = state.fallbackHoursUsed ?? new Map<string, number>();
  const usedPdeHourmeterSlices = state.usedPdeHourmeterSlices ?? new Map<string, OpenSlice[]>();
  const previousHourmeter = resolvePreviousHourmeter(fuel, previousFuel);
  if (previousHourmeter === undefined) {
    return result([], [noPreviousHourmeterAudit(fuel)], 0);
  }

  const coveredHours = fuel.currentHourmeter - previousHourmeter;
  if (!Number.isFinite(coveredHours) || coveredHours <= 0) {
    return result([], [invalidIntervalAudit(fuel)], coveredHours);
  }

  const litersPerHour = fuel.liters / coveredHours;
  const costPerHour = (fuel.totalCost ?? 0) / coveredHours;
  const allocations: FuelAllocationResult[] = [];
  const audits = findPDEsWithoutAllocationData(fuel, pdes).map((pde) =>
    pdeWithoutHourmeterAudit(fuel, pde),
  );
  let openSlices: OpenSlice[] = [{ start: previousHourmeter, end: fuel.currentHourmeter }];
  const allocatedHoursByPde = new Map<string, { pde: PDEEntry; hours: number }>();

  const matchingPdes = findMatchingPDEs(fuel, previousHourmeter, pdes);
  if (matchingPdes.length > 1) {
    audits.push(multiplePdeMatchesAudit(fuel, matchingPdes));
  }

  for (const pde of matchingPdes) {
    const pdeStart = pde.startHourmeter as number;
    const pdeEnd = pde.endHourmeter as number;
    for (const slice of [...openSlices]) {
      const start = Math.max(slice.start, pdeStart);
      const end = Math.min(slice.end, pdeEnd);
      if (end - start <= HOURS_EPSILON) continue;
      const availableSegments = subtractSlices(
        start,
        end,
        usedPdeHourmeterSlices.get(pde.id) ?? [],
      );
      for (const segment of availableSegments) {
        if (segment.end - segment.start <= HOURS_EPSILON) continue;
        allocations.push(
          allocateResult(fuel, pde, segment.start, segment.end, litersPerHour, costPerHour),
        );
        openSlices = removeSlice(openSlices, segment.start, segment.end);
        markPdeSliceUsed(usedPdeHourmeterSlices, pde.id, segment.start, segment.end);
        const current = allocatedHoursByPde.get(pde.id) ?? { pde, hours: 0 };
        current.hours += segment.end - segment.start;
        allocatedHoursByPde.set(pde.id, current);
      }
    }
  }

  for (const { pde, hours } of allocatedHoursByPde.values()) {
    const intervalHours = (pde.endHourmeter ?? 0) - (pde.startHourmeter ?? 0);
    if (intervalHours > HOURS_EPSILON && hours < intervalHours - HOURS_EPSILON) {
      audits.push(pdePartiallyCoveredAudit(fuel, pde, hours, intervalHours));
    }
  }

  const hasHourmeterAllocations = allocations.length > 0;
  if (!hasHourmeterAllocations) {
    for (const pde of findFallbackPDEs(fuel, pdes)) {
      let availableHours = Math.max(
        0,
        (pde.workedHours ?? 0) - (fallbackHoursUsed.get(pde.id) ?? 0),
      );
      let allocatedFallbackHours = 0;
      while (availableHours > HOURS_EPSILON && openSlices.length > 0) {
        const slice = openSlices[0];
        const allocatedHours = Math.min(availableHours, slice.end - slice.start);
        if (allocatedHours <= HOURS_EPSILON) break;
        const start = slice.start;
        const end = start + allocatedHours;
        allocations.push(allocateResult(fuel, pde, start, end, litersPerHour, costPerHour));
        openSlices = removeSlice(openSlices, start, end);
        fallbackHoursUsed.set(pde.id, (fallbackHoursUsed.get(pde.id) ?? 0) + allocatedHours);
        allocatedFallbackHours += allocatedHours;
        availableHours -= allocatedHours;
      }
      if (allocatedFallbackHours > HOURS_EPSILON) {
        audits.push(pdeUsingWorkedHoursFallbackAudit(fuel, pde, allocatedFallbackHours));
      }
    }
  }

  const remainingHours = totalOpenHours(openSlices);
  if (remainingHours > HOURS_EPSILON) {
    if (allocations.length === 0) {
      audits.push(noMatchingPdeAudit(fuel, remainingHours, remainingHours * litersPerHour));
    }
    audits.push(
      unallocatedHoursAudit(fuel, remainingHours, openSlices, litersPerHour, costPerHour),
    );
  }

  return result(allocations, audits, coveredHours);
}

export function calculateFuelAllocations(fuels: FuelEntry[], pdes: PDEEntry[]) {
  const previousByEquipment = new Map<string, FuelEntry>();
  const state: FuelAllocationState = {
    fallbackHoursUsed: new Map<string, number>(),
    usedPdeHourmeterSlices: new Map<string, OpenSlice[]>(),
  };
  const allocations: FuelAllocationResult[] = [];
  const audits: FuelAllocationCalculation["audits"] = [];

  const sortedFuel = [...fuels].sort(
    (a, b) =>
      a.equipmentId.localeCompare(b.equipmentId) ||
      a.date.localeCompare(b.date) ||
      a.currentHourmeter - b.currentHourmeter,
  );
  for (const fuel of sortedFuel) {
    const calculation = calculateFuelAllocation(
      fuel,
      pdes,
      previousByEquipment.get(fuel.equipmentId),
      state,
    );
    allocations.push(...calculation.allocations);
    audits.push(...calculation.audits);
    previousByEquipment.set(fuel.equipmentId, fuel);
  }
  return { allocations, audits };
}
