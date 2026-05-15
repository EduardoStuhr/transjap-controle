import { useSyncExternalStore } from "react";
import { getCurrentUser } from "@/lib/auth-store";
import type { AttachedFile } from "@/components/AttachmentUpload";

export type MaintenanceStatus = "Aberta" | "Em andamento" | "Concluída" | "Atrasada";
export type MaintenanceStepStatus = "pendente" | "em_andamento" | "concluida";

export type MaintenanceStepTemplate = {
  id: string;
  label: string;
  defaultSlaHours: number;
};

export const MAINTENANCE_STEPS: MaintenanceStepTemplate[] = [
  { id: "solicitacao_aberta", label: "Solicitação aberta", defaultSlaHours: 4 },
  { id: "enviado_manutencao", label: "Enviado para manutenção", defaultSlaHours: 8 },
  { id: "diagnostico", label: "Em diagnóstico", defaultSlaHours: 24 },
  { id: "aguardando_orcamento", label: "Aguardando orçamento", defaultSlaHours: 24 },
  { id: "orcamento_recebido", label: "Orçamento recebido", defaultSlaHours: 8 },
  { id: "aguardando_aprovacao", label: "Aguardando aprovação", defaultSlaHours: 24 },
  { id: "aguardando_peca", label: "Aguardando peça", defaultSlaHours: 72 },
  { id: "execucao", label: "Em execução", defaultSlaHours: 24 },
  { id: "teste", label: "Em teste", defaultSlaHours: 8 },
  { id: "concluido", label: "Concluído", defaultSlaHours: 1 },
];

export type MaintenanceStep = MaintenanceStepTemplate & {
  status: MaintenanceStepStatus;
  slaHours: number;
  startedAt: string;
  completedAt: string;
  startedBy: string;
  completedBy: string;
  startNote: string;
  completionComment: string;
  durationMinutes: number;
  attachments: AttachedFile[];
};

export type MaintenanceTimelineEvent = {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  stepId?: string;
  note: string;
};

export type MaintenanceRecord = {
  id: string;
  equipment: string;
  type: string;
  technician: string;
  responsible: string;
  status: MaintenanceStatus;
  currentStepId: string;
  deadline: string;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  description: string;
  notes: string;
  serviceSummary: string;
  totalCost: number;
  steps: MaintenanceStep[];
  timeline: MaintenanceTimelineEvent[];
  waitingParts: string[];
};

export type MaintenanceDraft = Pick<
  MaintenanceRecord,
  | "equipment"
  | "type"
  | "technician"
  | "responsible"
  | "status"
  | "deadline"
  | "description"
  | "notes"
>;

type MaintenanceState = {
  records: MaintenanceRecord[];
};

const STORAGE_KEY = "transjap:fleet-command:maintenance:v2";
const LEGACY_STORAGE_KEY = "transjap:fleet-command:maintenance:v1";
const EMPTY_STATE: MaintenanceState = { records: [] };

let state: MaintenanceState = EMPTY_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function currentUserName() {
  return getCurrentUser()?.name || "Sistema";
}

function newId(prefix = "MT") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function initialSteps(): MaintenanceStep[] {
  return MAINTENANCE_STEPS.map((step) => ({
    ...step,
    status: "pendente",
    slaHours: step.defaultSlaHours,
    startedAt: "",
    completedAt: "",
    startedBy: "",
    completedBy: "",
    startNote: "",
    completionComment: "",
    durationMinutes: 0,
    attachments: [],
  }));
}

function timeline(action: string, note = "", stepId?: string): MaintenanceTimelineEvent {
  return {
    id: newId("EV"),
    timestamp: nowIso(),
    user: currentUserName(),
    action,
    stepId,
    note,
  };
}

function minutesBetween(start: string, end: string) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function normalizeRecord(record: Partial<MaintenanceRecord>): MaintenanceRecord {
  const steps =
    Array.isArray(record.steps) && record.steps.length > 0 ? record.steps : initialSteps();
  const currentStepId =
    record.currentStepId || steps.find((step) => step.status !== "concluida")?.id || steps[0].id;

  return {
    id: record.id || newId(),
    equipment: record.equipment || "",
    type: record.type || "Preventiva",
    technician: record.technician || "",
    responsible: record.responsible || record.technician || "",
    status: record.status || "Aberta",
    currentStepId,
    deadline: record.deadline || "",
    createdAt: record.createdAt || new Date().toLocaleDateString("pt-BR"),
    startedAt: record.startedAt || "",
    finishedAt: record.finishedAt || "",
    description: record.description || "",
    notes: record.notes || "",
    serviceSummary: record.serviceSummary || "",
    totalCost: record.totalCost || 0,
    steps,
    timeline: Array.isArray(record.timeline) ? record.timeline : [],
    waitingParts: Array.isArray(record.waitingParts) ? record.waitingParts : [],
  };
}

function readStorage(): MaintenanceState {
  if (!isBrowser()) return EMPTY_STATE;

  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<MaintenanceState>;
    return { records: Array.isArray(parsed.records) ? parsed.records.map(normalizeRecord) : [] };
  } catch {
    return EMPTY_STATE;
  }
}

function writeStorage(nextState: MaintenanceState) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function ensureHydrated() {
  if (hydrated || !isBrowser()) return;
  hydrated = true;
  state = readStorage();
}

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(updater: (current: MaintenanceState) => MaintenanceState) {
  ensureHydrated();
  state = updater(state);
  writeStorage(state);
  emit();
}

function nextOpenStep(steps: MaintenanceStep[]) {
  return steps.find((step) => step.status !== "concluida")?.id || steps[steps.length - 1]?.id || "";
}

export function getStepDelay(step: MaintenanceStep) {
  if (step.status !== "em_andamento" || !step.startedAt) return 0;
  const elapsedHours = (Date.now() - new Date(step.startedAt).getTime()) / 3_600_000;
  return Math.max(0, elapsedHours - step.slaHours);
}

export function getMaintenanceAlerts(records: MaintenanceRecord[]) {
  return records.flatMap((record) =>
    record.steps
      .filter((step) => step.status === "em_andamento" && getStepDelay(step) > 0)
      .map((step) => ({
        id: `${record.id}-${step.id}`,
        recordId: record.id,
        title: "Etapa atrasada",
        description: `${record.equipment} está parado em ${step.label}.`,
      })),
  );
}

export const maintenanceActions = {
  createRecord(draft: MaintenanceDraft) {
    const createdAt = new Date().toLocaleDateString("pt-BR");
    const steps = initialSteps();
    const record: MaintenanceRecord = {
      id: newId(),
      equipment: draft.equipment.trim(),
      type: draft.type.trim() || "Preventiva",
      technician: draft.technician.trim(),
      responsible: draft.responsible.trim() || currentUserName(),
      status: "Aberta",
      currentStepId: steps[0].id,
      deadline: draft.deadline,
      createdAt,
      startedAt: "",
      finishedAt: "",
      description: draft.description.trim(),
      notes: draft.notes.trim(),
      serviceSummary: "",
      totalCost: 0,
      steps,
      timeline: [timeline("Manutenção criada", draft.notes)],
      waitingParts: [],
    };

    setState((current) => ({ records: [record, ...current.records] }));
    return record;
  },

  updateStepSla(recordId: string, stepId: string, slaHours: number) {
    setState((current) => ({
      records: current.records.map((record) =>
        record.id === recordId
          ? {
              ...record,
              steps: record.steps.map((step) =>
                step.id === stepId ? { ...step, slaHours: Math.max(1, slaHours) } : step,
              ),
            }
          : record,
      ),
    }));
  },

  startStep(recordId: string, stepId: string, note = "") {
    const timestamp = nowIso();
    const user = currentUserName();

    setState((current) => ({
      records: current.records.map((record) => {
        if (record.id !== recordId) return record;
        const nextSteps = record.steps.map((step) =>
          step.id === stepId
            ? {
                ...step,
                status: "em_andamento" as const,
                startedAt: step.startedAt || timestamp,
                startedBy: step.startedBy || user,
                startNote: note.trim() || step.startNote,
              }
            : step,
        );

        return {
          ...record,
          status: "Em andamento",
          currentStepId: stepId,
          startedAt: record.startedAt || timestamp,
          responsible: record.responsible || user,
          steps: nextSteps,
          timeline: [timeline("Etapa iniciada", note, stepId), ...record.timeline],
        };
      }),
    }));
  },

  completeStep(recordId: string, stepId: string, comment = "", attachments: AttachedFile[] = []) {
    const timestamp = nowIso();
    const user = currentUserName();

    setState((current) => ({
      records: current.records.map((record) => {
        if (record.id !== recordId) return record;
        const completedStep = record.steps.find((step) => step.id === stepId);
        const nextSteps = record.steps.map((step) =>
          step.id === stepId
            ? {
                ...step,
                status: "concluida" as const,
                startedAt: step.startedAt || timestamp,
                startedBy: step.startedBy || user,
                completedAt: timestamp,
                completedBy: user,
                completionComment: comment.trim(),
                durationMinutes: minutesBetween(step.startedAt || timestamp, timestamp),
                attachments: [
                  ...step.attachments,
                  ...attachments.map(({ file, ...attachment }) => attachment),
                ],
              }
            : step,
        );
        const currentStepId = nextOpenStep(nextSteps);
        const finished =
          currentStepId === nextSteps[nextSteps.length - 1]?.id && stepId === currentStepId;
        const status: MaintenanceStatus =
          stepId === "concluido" || nextSteps.every((step) => step.status === "concluida")
            ? "Concluída"
            : "Em andamento";

        return {
          ...record,
          status,
          currentStepId,
          finishedAt: status === "Concluída" ? timestamp : record.finishedAt,
          serviceSummary:
            status === "Concluída"
              ? comment.trim() || record.serviceSummary
              : record.serviceSummary,
          steps: nextSteps,
          timeline: [
            timeline(
              "Etapa concluída",
              comment ||
                `Duração: ${minutesBetween(completedStep?.startedAt || timestamp, timestamp)} min`,
              stepId,
            ),
            ...record.timeline,
          ],
        };
      }),
    }));
  },

  addWaitingPart(recordId: string, partName: string) {
    const name = partName.trim();
    if (!name) return;
    setState((current) => ({
      records: current.records.map((record) =>
        record.id === recordId
          ? {
              ...record,
              waitingParts: [...record.waitingParts, name],
              timeline: [timeline("Peça aguardada registrada", name), ...record.timeline],
            }
          : record,
      ),
    }));
  },

  addCost(recordId: string, cost: number, note: string) {
    setState((current) => ({
      records: current.records.map((record) =>
        record.id === recordId
          ? {
              ...record,
              totalCost: record.totalCost + Math.max(0, cost),
              timeline: [timeline("Custo registrado", note), ...record.timeline],
            }
          : record,
      ),
    }));
  },
};

export function useMaintenanceStore<T>(selector: (state: MaintenanceState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);

      if (!hydrated && isBrowser()) {
        queueMicrotask(() => {
          ensureHydrated();
          emit();
        });
      }

      if (isBrowser()) window.addEventListener("storage", handleStorageEvent);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && isBrowser()) {
          window.removeEventListener("storage", handleStorageEvent);
        }
      };
    },
    () => selector(state),
    () => selector(EMPTY_STATE),
  );
}

function handleStorageEvent(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== LEGACY_STORAGE_KEY) return;
  state = readStorage();
  emit();
}
