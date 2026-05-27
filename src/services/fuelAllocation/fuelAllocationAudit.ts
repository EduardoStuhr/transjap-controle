import type { FuelAllocationAuditResult, FuelEntry, PDEEntry } from "./types";

function auditBase(fuel: FuelEntry) {
  return {
    sourceFuelingId: fuel.id,
    equipmentId: fuel.equipmentId,
    fleet: fuel.fleet || fuel.equipmentId,
    unresolvedHours: 0,
  };
}

export function noPreviousHourmeterAudit(fuel: FuelEntry): FuelAllocationAuditResult {
  return {
    ...auditBase(fuel),
    type: "NO_PREVIOUS_HOURMETER",
    message: `Abastecimento ${fuel.id} sem horimetro anterior ou CMB anterior utilizavel.`,
  };
}

export function invalidIntervalAudit(fuel: FuelEntry): FuelAllocationAuditResult {
  return {
    ...auditBase(fuel),
    type: "INVALID_HOURMETER_INTERVAL",
    message: `Intervalo de horimetro invalido no abastecimento ${fuel.id}.`,
    metadata: {
      previousHourmeter: fuel.previousHourmeter,
      currentHourmeter: fuel.currentHourmeter,
    },
  };
}

export function pdeWithoutHourmeterAudit(
  fuel: FuelEntry,
  pde: PDEEntry,
): FuelAllocationAuditResult {
  return {
    ...auditBase(fuel),
    type: "PDE_WITHOUT_HOURMETER",
    message: `PDE ${pde.id} sem horimetro e sem horas trabalhadas para rateio.`,
    metadata: { pdeId: pde.id, pdeDate: pde.date },
  };
}

export function pdeUsingWorkedHoursFallbackAudit(
  fuel: FuelEntry,
  pde: PDEEntry,
  allocatedHours: number,
): FuelAllocationAuditResult {
  return {
    ...auditBase(fuel),
    type: "PDE_USING_WORKED_HOURS_FALLBACK",
    message: `PDE ${pde.id} sem intervalo de horimetro; rateio usou horas trabalhadas.`,
    unresolvedHours: 0,
    metadata: {
      pdeId: pde.id,
      pdeDate: pde.date,
      workedHours: pde.workedHours ?? 0,
      allocatedHours,
    },
  };
}

export function pdePartiallyCoveredAudit(
  fuel: FuelEntry,
  pde: PDEEntry,
  allocatedHours: number,
  intervalHours: number,
): FuelAllocationAuditResult {
  return {
    ...auditBase(fuel),
    type: "PDE_PARTIALLY_COVERED",
    message: `PDE ${pde.id} foi parcialmente coberta pelo abastecimento ${fuel.id}.`,
    unresolvedHours: Math.max(0, intervalHours - allocatedHours),
    metadata: {
      pdeId: pde.id,
      pdeDate: pde.date,
      allocatedHours,
      intervalHours,
      startHourmeter: pde.startHourmeter,
      endHourmeter: pde.endHourmeter,
    },
  };
}

export function multiplePdeMatchesAudit(
  fuel: FuelEntry,
  pdes: PDEEntry[],
): FuelAllocationAuditResult {
  return {
    ...auditBase(fuel),
    type: "MULTIPLE_PDE_MATCHES",
    message: `${pdes.length} PDEs cruzaram o intervalo do abastecimento ${fuel.id}.`,
    metadata: {
      pdeIds: pdes.map((pde) => pde.id),
      pdeDates: pdes.map((pde) => pde.date),
    },
  };
}

export function noMatchingPdeAudit(
  fuel: FuelEntry,
  hours: number,
  liters: number,
): FuelAllocationAuditResult {
  return {
    ...auditBase(fuel),
    type: "NO_MATCHING_PDE",
    message: `Abastecimento ${fuel.id} nao encontrou PDE para rateio por horimetro.`,
    unresolvedHours: hours,
    metadata: { unallocatedLiters: liters },
  };
}

export function unallocatedHoursAudit(
  fuel: FuelEntry,
  hours: number,
  gaps: Array<{ start: number; end: number }>,
  litersPerHour = 0,
  costPerHour = 0,
): FuelAllocationAuditResult {
  return {
    ...auditBase(fuel),
    type: "UNALLOCATED_HOURS",
    message: `${hours.toFixed(2)} h do abastecimento ${fuel.id} nao encontraram PDE correspondente.`,
    unresolvedHours: hours,
    metadata: {
      gaps,
      unallocatedLiters: hours * litersPerHour,
      unallocatedCost: hours * costPerHour,
    },
  };
}
