export interface FuelEntry {
  id: string;
  equipmentId: string;
  fleet?: string;
  liters: number;
  totalCost?: number;
  previousHourmeter?: number;
  currentHourmeter: number;
  date: string;
}

export interface PDEEntry {
  id: string;
  equipmentId: string;
  fleet?: string;
  date: string;
  obra?: string;
  startHourmeter?: number;
  endHourmeter?: number;
  workedHours?: number;
}

export interface FuelAllocationResult {
  sourceFuelingId: string;
  pdeId: string;
  equipmentId: string;
  fleet: string;
  pdeDate: string;
  obra: string;
  hourmeterStart: number;
  hourmeterEnd: number;
  allocatedHours: number;
  litersAllocated: number;
  costAllocated: number;
}

export type FuelAllocationAuditType =
  | "UNALLOCATED_HOURS"
  | "NO_PREVIOUS_HOURMETER"
  | "PDE_WITHOUT_HOURMETER"
  | "INVALID_HOURMETER_INTERVAL";

export interface FuelAllocationAuditResult {
  sourceFuelingId?: string;
  equipmentId?: string;
  fleet?: string;
  type: FuelAllocationAuditType;
  message: string;
  unresolvedHours: number;
  metadata?: Record<string, unknown>;
}

export interface FuelAllocationCalculation {
  allocations: FuelAllocationResult[];
  audits: FuelAllocationAuditResult[];
  coveredHours: number;
  allocatedHours: number;
}
