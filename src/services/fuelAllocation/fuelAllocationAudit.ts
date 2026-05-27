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

export function unallocatedHoursAudit(
  fuel: FuelEntry,
  hours: number,
  gaps: Array<{ start: number; end: number }>,
): FuelAllocationAuditResult {
  return {
    ...auditBase(fuel),
    type: "UNALLOCATED_HOURS",
    message: `${hours.toFixed(2)} h do abastecimento ${fuel.id} nao encontraram PDE correspondente.`,
    unresolvedHours: hours,
    metadata: { gaps },
  };
}
