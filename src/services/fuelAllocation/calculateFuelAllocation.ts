import {
  findFallbackPDEs,
  findMatchingPDEs,
  findPDEsWithoutAllocationData,
} from "./findMatchingPDEs";
import {
  invalidIntervalAudit,
  noPreviousHourmeterAudit,
  pdeWithoutHourmeterAudit,
  unallocatedHoursAudit,
} from "./fuelAllocationAudit";
import type {
  FuelAllocationCalculation,
  FuelAllocationResult,
  FuelEntry,
  PDEEntry,
} from "./types";

const HOURS_EPSILON = 0.000001;

type OpenSlice = { start: number; end: number };

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
  fallbackHoursUsed = new Map<string, number>(),
): FuelAllocationCalculation {
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

  for (const pde of findMatchingPDEs(fuel, previousHourmeter, pdes)) {
    const pdeStart = pde.startHourmeter as number;
    const pdeEnd = pde.endHourmeter as number;
    for (const slice of [...openSlices]) {
      const start = Math.max(slice.start, pdeStart);
      const end = Math.min(slice.end, pdeEnd);
      if (end - start <= HOURS_EPSILON) continue;
      allocations.push(allocateResult(fuel, pde, start, end, litersPerHour, costPerHour));
      openSlices = removeSlice(openSlices, start, end);
    }
  }

  for (const pde of findFallbackPDEs(fuel, pdes)) {
    let availableHours = Math.max(
      0,
      (pde.workedHours ?? 0) - (fallbackHoursUsed.get(pde.id) ?? 0),
    );
    while (availableHours > HOURS_EPSILON && openSlices.length > 0) {
      const slice = openSlices[openSlices.length - 1];
      const allocatedHours = Math.min(availableHours, slice.end - slice.start);
      if (allocatedHours <= HOURS_EPSILON) break;
      const end = slice.end;
      const start = end - allocatedHours;
      allocations.push(allocateResult(fuel, pde, start, end, litersPerHour, costPerHour));
      openSlices = removeSlice(openSlices, start, end);
      fallbackHoursUsed.set(pde.id, (fallbackHoursUsed.get(pde.id) ?? 0) + allocatedHours);
      availableHours -= allocatedHours;
    }
  }

  const remainingHours = totalOpenHours(openSlices);
  if (remainingHours > HOURS_EPSILON) {
    audits.push(unallocatedHoursAudit(fuel, remainingHours, openSlices));
  }

  return result(allocations, audits, coveredHours);
}

export function calculateFuelAllocations(fuels: FuelEntry[], pdes: PDEEntry[]) {
  const previousByEquipment = new Map<string, FuelEntry>();
  const fallbackHoursUsed = new Map<string, number>();
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
      fallbackHoursUsed,
    );
    allocations.push(...calculation.allocations);
    audits.push(...calculation.audits);
    previousByEquipment.set(fuel.equipmentId, fuel);
  }
  return { allocations, audits };
}
