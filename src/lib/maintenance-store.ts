import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMaintenanceRecord,
  deleteMaintenanceRecord,
  listMaintenance,
  updateMaintenanceRecord,
} from "@/lib/api/maintenance";
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
  item: string;
  serviceDescription: string;
  submittedBy: string;
  steps: MaintenanceStep[];
  timeline: MaintenanceTimelineEvent[];
  waitingParts: string[];
};

export type MaintenanceDraft = Pick<
  MaintenanceRecord,
  "equipment" | "type" | "status" | "item" | "serviceDescription" | "notes"
>;

type MaintenanceState = {
  records: MaintenanceRecord[];
};

type MaintenanceSelector<T> = (state: MaintenanceState) => T;

const QK = ["maintenance"] as const;
const STORAGE_KEY = "transjap:fleet-command:maintenance:v2";
const LEGACY_STORAGE_KEY = "transjap:fleet-command:maintenance:v1";
const EMPTY_STATE: MaintenanceState = { records: [] };

let localMigrationStarted = false;

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

function sanitizeAttachments(attachments: AttachedFile[]) {
  return attachments.map((attachment) => ({ ...attachment }));
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

function normalizeStep(step: Partial<MaintenanceStep> & MaintenanceStepTemplate): MaintenanceStep {
  return {
    ...step,
    status: step.status || "pendente",
    slaHours: step.slaHours || step.defaultSlaHours,
    startedAt: step.startedAt || "",
    completedAt: step.completedAt || "",
    startedBy: step.startedBy || "",
    completedBy: step.completedBy || "",
    startNote: step.startNote || "",
    completionComment: step.completionComment || "",
    durationMinutes: step.durationMinutes || 0,
    attachments: sanitizeAttachments(step.attachments || []),
  };
}

function normalizeRecord(record: Partial<MaintenanceRecord>): MaintenanceRecord {
  const rawSteps =
    Array.isArray(record.steps) && record.steps.length > 0 ? record.steps : initialSteps();
  const steps = rawSteps.map((step, index) =>
    normalizeStep({
      ...MAINTENANCE_STEPS[index],
      ...step,
      id: step.id || MAINTENANCE_STEPS[index]?.id || newId("STEP"),
      label: step.label || MAINTENANCE_STEPS[index]?.label || "Etapa",
      defaultSlaHours: step.defaultSlaHours || MAINTENANCE_STEPS[index]?.defaultSlaHours || 24,
    }),
  );
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
    item: record.item || "",
    serviceDescription: record.serviceDescription || "",
    submittedBy: record.submittedBy || "",
    steps,
    timeline: Array.isArray(record.timeline) ? record.timeline : [],
    waitingParts: Array.isArray(record.waitingParts) ? record.waitingParts : [],
  };
}

function normalizeState(value: unknown): MaintenanceState {
  if (!value || typeof value !== "object") return EMPTY_STATE;
  const stored = value as Partial<MaintenanceState>;
  return { records: Array.isArray(stored.records) ? stored.records.map(normalizeRecord) : [] };
}

function readStorage(): MaintenanceState {
  if (!isBrowser()) return EMPTY_STATE;

  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    return normalizeState(JSON.parse(raw));
  } catch {
    return EMPTY_STATE;
  }
}

function writeStorage(nextState: MaintenanceState) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function nextOpenStep(steps: MaintenanceStep[]) {
  return steps.find((step) => step.status !== "concluida")?.id || steps[steps.length - 1]?.id || "";
}

function getCachedState(queryClient: ReturnType<typeof useQueryClient>): MaintenanceState {
  return queryClient.getQueryData<MaintenanceState>(QK) ?? readStorage();
}

function useLocalMaintenanceMigration(remoteState: MaintenanceState | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !remoteState || localMigrationStarted) return;

    const localState = readStorage();
    const remoteIds = new Set(remoteState.records.map((record) => record.id));
    const records = localState.records.filter((record) => !remoteIds.has(record.id));

    if (records.length === 0) {
      writeStorage(remoteState);
      return;
    }

    localMigrationStarted = true;
    Promise.all(records.map((record) => createMaintenanceRecord({ data: record })))
      .then(() => queryClient.invalidateQueries({ queryKey: QK }))
      .catch(() => {
        localMigrationStarted = false;
      });
  }, [enabled, queryClient, remoteState]);
}

export function getMaintenanceAlerts(_records: MaintenanceRecord[]) {
  return [] as Array<{
    id: string;
    recordId: string;
    title: string;
    description: string;
  }>;
}

export function useMaintenanceStore<T>(selector: MaintenanceSelector<T>): T {
  const query = useQuery({
    queryKey: QK,
    queryFn: async () => normalizeState(await listMaintenance()),
    staleTime: 0,
    retry: 1,
    placeholderData: () => readStorage(),
  });

  useLocalMaintenanceMigration(query.data, query.isSuccess && !query.isPlaceholderData);

  return selector(query.data ?? readStorage());
}

export function useMaintenanceActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: (record: MaintenanceRecord) => createMaintenanceRecord({ data: record }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: (record: MaintenanceRecord) => updateMaintenanceRecord({ data: record }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMaintenanceRecord({ data: id }),
    onSuccess: invalidate,
  });

  const updateRecord = async (record: MaintenanceRecord) => {
    await updateMutation.mutateAsync(record);
    return record;
  };

  return {
    async createRecord(draft: MaintenanceDraft) {
      const createdAt = new Date().toLocaleDateString("pt-BR");
      const steps = initialSteps();
      const submittedBy = getCurrentUser()?.name || "";
      const record: MaintenanceRecord = {
        id: newId(),
        equipment: draft.equipment.trim(),
        type: draft.type.trim() || "Preventiva",
        technician: "",
        responsible: "",
        status: "Aberta",
        currentStepId: steps[0].id,
        deadline: "",
        createdAt,
        startedAt: "",
        finishedAt: "",
        description: "",
        notes: draft.notes.trim(),
        serviceSummary: "",
        totalCost: 0,
        item: draft.item.trim(),
        serviceDescription: draft.serviceDescription.trim(),
        submittedBy,
        steps,
        timeline: [timeline("Manutenção criada", draft.serviceDescription)],
        waitingParts: [],
      };

      await createMutation.mutateAsync(record);
      return record;
    },

    async startStep(recordId: string, stepId: string, note = "") {
      const timestamp = nowIso();
      const user = currentUserName();
      const current = getCachedState(queryClient);
      const record = current.records.find((candidate) => candidate.id === recordId);
      if (!record) return null;

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

      return updateRecord({
        ...record,
        status: "Em andamento",
        currentStepId: stepId,
        startedAt: record.startedAt || timestamp,
        responsible: record.responsible || user,
        steps: nextSteps,
        timeline: [timeline("Etapa iniciada", note, stepId), ...record.timeline],
      });
    },

    async completeStep(
      recordId: string,
      stepId: string,
      comment = "",
      attachments: AttachedFile[] = [],
    ) {
      const timestamp = nowIso();
      const user = currentUserName();
      const current = getCachedState(queryClient);
      const record = current.records.find((candidate) => candidate.id === recordId);
      if (!record) return null;

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
              attachments: [...step.attachments, ...sanitizeAttachments(attachments)],
            }
          : step,
      );
      const currentStepId = nextOpenStep(nextSteps);
      const status: MaintenanceStatus =
        stepId === "concluido" || nextSteps.every((step) => step.status === "concluida")
          ? "Concluída"
          : "Em andamento";

      return updateRecord({
        ...record,
        status,
        currentStepId,
        finishedAt: status === "Concluída" ? timestamp : record.finishedAt,
        serviceSummary:
          status === "Concluída" ? comment.trim() || record.serviceSummary : record.serviceSummary,
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
      });
    },

    async addWaitingPart(recordId: string, partName: string) {
      const name = partName.trim();
      const current = getCachedState(queryClient);
      const record = current.records.find((candidate) => candidate.id === recordId);
      if (!name || !record) return null;

      return updateRecord({
        ...record,
        waitingParts: [...record.waitingParts, name],
        timeline: [timeline("Peça aguardada registrada", name), ...record.timeline],
      });
    },

    async addCost(recordId: string, cost: number, note: string) {
      const current = getCachedState(queryClient);
      const record = current.records.find((candidate) => candidate.id === recordId);
      if (!record) return null;

      return updateRecord({
        ...record,
        totalCost: record.totalCost + Math.max(0, cost),
        timeline: [timeline("Custo registrado", note), ...record.timeline],
      });
    },

    async removeRecord(id: string) {
      await deleteMutation.mutateAsync(id);
    },
  };
}

export const maintenanceActions = {
  createRecord: (): never => {
    throw new Error(
      "maintenanceActions.createRecord() foi removido. Use useMaintenanceActions().createRecord().",
    );
  },
  startStep: (): never => {
    throw new Error(
      "maintenanceActions.startStep() foi removido. Use useMaintenanceActions().startStep().",
    );
  },
  completeStep: (): never => {
    throw new Error(
      "maintenanceActions.completeStep() foi removido. Use useMaintenanceActions().completeStep().",
    );
  },
  addWaitingPart: (): never => {
    throw new Error(
      "maintenanceActions.addWaitingPart() foi removido. Use useMaintenanceActions().addWaitingPart().",
    );
  },
  addCost: (): never => {
    throw new Error(
      "maintenanceActions.addCost() foi removido. Use useMaintenanceActions().addCost().",
    );
  },
} as const;
