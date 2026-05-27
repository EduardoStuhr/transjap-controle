import type { FuelEntry, PDEEntry } from "./types";

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function hasPdeHourmeterInterval(
  pde: PDEEntry,
): pde is PDEEntry & { startHourmeter: number; endHourmeter: number } {
  return (
    finite(pde.startHourmeter) &&
    finite(pde.endHourmeter) &&
    pde.endHourmeter > pde.startHourmeter
  );
}

export function allocatedIntersectionHours(
  previousHourmeter: number,
  currentHourmeter: number,
  pde: PDEEntry,
) {
  if (!hasPdeHourmeterInterval(pde)) return 0;
  const start = Math.max(pde.startHourmeter, previousHourmeter);
  const end = Math.min(pde.endHourmeter, currentHourmeter);
  return Math.max(0, end - start);
}

function scopedPdes(fuel: FuelEntry, pdes: PDEEntry[]) {
  return pdes.filter((pde) => pde.equipmentId === fuel.equipmentId);
}

export function findMatchingPDEs(
  fuel: FuelEntry,
  previousHourmeter: number,
  pdes: PDEEntry[],
) {
  return scopedPdes(fuel, pdes)
    .filter(
      (pde) =>
        allocatedIntersectionHours(previousHourmeter, fuel.currentHourmeter, pde) > 0,
    )
    .sort(
      (a, b) =>
        (a.startHourmeter ?? 0) - (b.startHourmeter ?? 0) ||
        a.date.localeCompare(b.date),
    );
}

export function findFallbackPDEs(fuel: FuelEntry, pdes: PDEEntry[]) {
  return scopedPdes(fuel, pdes)
    .filter(
      (pde) =>
        !hasPdeHourmeterInterval(pde) &&
        finite(pde.workedHours) &&
        pde.workedHours > 0 &&
        pde.date < fuel.date,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function findPDEsWithoutAllocationData(fuel: FuelEntry, pdes: PDEEntry[]) {
  return scopedPdes(fuel, pdes).filter(
    (pde) =>
      pde.date <= fuel.date &&
      !hasPdeHourmeterInterval(pde) &&
      (!finite(pde.workedHours) || pde.workedHours <= 0),
  );
}
