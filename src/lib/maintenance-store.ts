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

export const MAINTENANCE_OBRA_OPTIONS = ["Campo Log 05", "RDG - Viana", "Ulihorte"] as const;

export type MaintenanceStepTemplate = {
  id: string;
  label: string;
  defaultSlaHours: number;
};

export const MAINTENANCE_STEPS: MaintenanceStepTemplate[] = [
  { id: "enviado_manutencao", label: "Enviado para manutenção", defaultSlaHours: 8 },
  { id: "diagnostico", label: "Em diagnóstico", defaultSlaHours: 24 },
  { id: "aguardando_orcamento", label: "Aguardando orçamento", defaultSlaHours: 24 },
  { id: "orcamento_recebido", label: "Orçamento recebido", defaultSlaHours: 8 },
  { id: "aguardando_aprovacao", label: "Aguardando aprovação", defaultSlaHours: 24 },
  { id: "aguardando_peca", label: "Aguardando peça", defaultSlaHours: 72 },
  { id: "execucao", label: "Em execução", defaultSlaHours: 24 },
  { id: "concluido", label: "Concluído", defaultSlaHours: 1 },
];

const DEPRECATED_MAINTENANCE_STEP_IDS = new Set(["solicitacao_aberta", "teste"]);

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

export type MaintenanceCostEntry = {
  id: string;
  supplierName: string;
  partName: string;
  amount: number;
  createdAt: string;
  createdBy: string;
};

export type MaintenanceCostDraft = Pick<
  MaintenanceCostEntry,
  "supplierName" | "partName" | "amount"
>;

export type MaintenanceRecord = {
  id: string;
  equipment: string;
  obra: string;
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
  supplierName: string;
  materialDescription: string;
  cost: number;
  costEntries: MaintenanceCostEntry[];
  steps: MaintenanceStep[];
  timeline: MaintenanceTimelineEvent[];
  waitingParts: string[];
};

export type MaintenanceDraft = Pick<
  MaintenanceRecord,
  | "equipment"
  | "obra"
  | "type"
  | "status"
  | "item"
  | "serviceDescription"
  | "notes"
  | "supplierName"
  | "materialDescription"
  | "cost"
>;

type MaintenanceState = {
  records: MaintenanceRecord[];
};

type MaintenanceSelector<T> = (state: MaintenanceState) => T;

const QK = ["maintenance"] as const;
const STORAGE_KEY = "transjap:fleet-command:maintenance:v2";
const LEGACY_STORAGE_KEY = "transjap:fleet-command:maintenance:v1";
const DELETED_IDS_STORAGE_KEY = "transjap:fleet-command:maintenance:deleted-ids:v1";
const REMOTE_SYNCED_STORAGE_KEY = "transjap:fleet-command:maintenance:remote-synced:v1";
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

function makeCostEntry(
  draft: MaintenanceCostDraft,
  createdAt = nowIso(),
  createdBy = currentUserName(),
): MaintenanceCostEntry {
  return {
    id: newId("COST"),
    supplierName: draft.supplierName.trim(),
    partName: draft.partName.trim(),
    amount: Math.max(0, draft.amount),
    createdAt,
    createdBy,
  };
}

function normalizeCostEntries(record: Partial<MaintenanceRecord>): MaintenanceCostEntry[] {
  if (Array.isArray(record.costEntries) && record.costEntries.length > 0) {
    return record.costEntries.map((entry) => ({
      id: entry.id || newId("COST"),
      supplierName: entry.supplierName || "",
      partName: entry.partName || "",
      amount: typeof entry.amount === "number" ? Math.max(0, entry.amount) : 0,
      createdAt: entry.createdAt || record.createdAt || "",
      createdBy: entry.createdBy || record.submittedBy || "",
    }));
  }

  const amount = typeof record.cost === "number" ? Math.max(0, record.cost) : 0;
  if (!record.supplierName && !record.materialDescription && amount === 0) return [];

  return [
    {
      id: `COST-${record.id || "LEGACY"}-INITIAL`,
      supplierName: record.supplierName || "",
      partName: record.materialDescription || "",
      amount,
      createdAt: record.createdAt || "",
      createdBy: record.submittedBy || "",
    },
  ];
}

function completeAllSteps(steps: MaintenanceStep[], timestamp: string, user: string, note: string) {
  return steps.map((step) =>
    step.status === "concluida"
      ? step
      : {
          ...step,
          status: "concluida" as const,
          startedAt: step.startedAt || timestamp,
          completedAt: timestamp,
          startedBy: step.startedBy || user,
          completedBy: user,
          completionComment: step.completionComment || note,
          durationMinutes: step.startedAt ? minutesBetween(step.startedAt, timestamp) : 0,
        },
  );
}

function restoreCompletedSteps(record: MaintenanceRecord, timestamp: string, user: string) {
  const completedWithRecord = record.steps
    .map((step, index) => (step.completedAt === record.finishedAt ? index : -1))
    .filter((index) => index >= 0);
  const currentStepIndex = record.steps.findIndex((step) => step.id === record.currentStepId);
  const reopenIndex =
    completedWithRecord[0] ?? (currentStepIndex >= 0 ? currentStepIndex : record.steps.length - 1);

  return record.steps.map((step, index) => {
    if (index < reopenIndex) return step;

    if (index === reopenIndex) {
      return {
        ...step,
        status: "em_andamento" as const,
        startedAt: step.startedAt || record.startedAt || timestamp,
        startedBy: step.startedBy || user,
        completedAt: "",
        completedBy: "",
        completionComment: "",
        durationMinutes: 0,
      };
    }

    return {
      ...step,
      status: "pendente" as const,
      startedAt: "",
      startedBy: "",
      completedAt: "",
      completedBy: "",
      completionComment: "",
      durationMinutes: 0,
    };
  });
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
  const storedSteps =
    Array.isArray(record.steps) && record.steps.length > 0 ? record.steps : initialSteps();
  const rawSteps = storedSteps.filter((step) => !DEPRECATED_MAINTENANCE_STEP_IDS.has(step.id));
  const steps = rawSteps.map((step, index) =>
    normalizeStep({
      ...(MAINTENANCE_STEPS.find((template) => template.id === step.id) ||
        MAINTENANCE_STEPS[index]),
      ...step,
      id: step.id || MAINTENANCE_STEPS[index]?.id || newId("STEP"),
      label: step.label || MAINTENANCE_STEPS[index]?.label || "Etapa",
      defaultSlaHours: step.defaultSlaHours || MAINTENANCE_STEPS[index]?.defaultSlaHours || 24,
    }),
  );
  const fallbackStepId =
    steps.find((step) => step.status !== "concluida")?.id || steps[steps.length - 1]?.id || "";
  const currentStepId = steps.some((step) => step.id === record.currentStepId)
    ? record.currentStepId || fallbackStepId
    : fallbackStepId;

  return {
    id: record.id || newId(),
    equipment: record.equipment || "",
    obra: record.obra || "",
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
    supplierName: record.supplierName || "",
    materialDescription: record.materialDescription || "",
    cost: typeof record.cost === "number" ? record.cost : 0,
    costEntries: normalizeCostEntries(record),
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

function readDeletedRecordIds(): Set<string> {
  if (!isBrowser()) return new Set();

  try {
    const raw = window.localStorage.getItem(DELETED_IDS_STORAGE_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function writeDeletedRecordIds(ids: Set<string>) {
  if (!isBrowser()) return;
  window.localStorage.setItem(DELETED_IDS_STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-500)));
}

function markDeletedRecordId(id: string) {
  const ids = readDeletedRecordIds();
  ids.add(id);
  writeDeletedRecordIds(ids);
}

function unmarkDeletedRecordId(id: string) {
  const ids = readDeletedRecordIds();
  ids.delete(id);
  writeDeletedRecordIds(ids);
}

function hasSyncedRemoteMaintenance() {
  return isBrowser() && window.localStorage.getItem(REMOTE_SYNCED_STORAGE_KEY) === "1";
}

function markRemoteMaintenanceSynced() {
  if (!isBrowser()) return;
  window.localStorage.setItem(REMOTE_SYNCED_STORAGE_KEY, "1");
}

function filterDeletedRecords(state: MaintenanceState): MaintenanceState {
  const deletedIds = readDeletedRecordIds();
  if (deletedIds.size === 0) return state;

  return {
    records: state.records.filter((record) => !deletedIds.has(record.id)),
  };
}

function timestampMs(value: string | undefined) {
  if (!value) return 0;
  if (value.includes("/")) {
    const [d, m, y] = value.split("/").map(Number);
    if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(y)) {
      return new Date(y, m - 1, d).getTime();
    }
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordFreshness(record: MaintenanceRecord) {
  return Math.max(
    timestampMs(record.createdAt),
    timestampMs(record.startedAt),
    timestampMs(record.finishedAt),
    ...record.timeline.map((event) => timestampMs(event.timestamp)),
    ...record.costEntries.map((entry) => timestampMs(entry.createdAt)),
    ...record.steps.flatMap((step) => [timestampMs(step.startedAt), timestampMs(step.completedAt)]),
  );
}

function mergeMaintenanceStates(local: MaintenanceState, remote: MaintenanceState) {
  const deletedIds = readDeletedRecordIds();
  const byId = new Map<string, MaintenanceRecord>();

  remote.records.forEach((record) => {
    if (!deletedIds.has(record.id)) byId.set(record.id, record);
  });

  local.records.forEach((record) => {
    if (deletedIds.has(record.id)) return;
    const remoteRecord = byId.get(record.id);
    if (!remoteRecord || recordFreshness(record) > recordFreshness(remoteRecord)) {
      byId.set(record.id, record);
    }
  });

  return {
    records: Array.from(byId.values()).sort((a, b) => recordFreshness(b) - recordFreshness(a)),
  };
}

function readStorage(): MaintenanceState {
  if (!isBrowser()) return EMPTY_STATE;

  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    return filterDeletedRecords(normalizeState(JSON.parse(raw)));
  } catch {
    return EMPTY_STATE;
  }
}

function writeStorage(nextState: MaintenanceState) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  markRemoteMaintenanceSynced();
}

function nextOpenStep(steps: MaintenanceStep[]) {
  return steps.find((step) => step.status !== "concluida")?.id || steps[steps.length - 1]?.id || "";
}

function getCachedState(queryClient: ReturnType<typeof useQueryClient>): MaintenanceState {
  return queryClient.getQueryData<MaintenanceState>(QK) ?? readStorage();
}

function setCachedState(
  queryClient: ReturnType<typeof useQueryClient>,
  nextState: MaintenanceState,
) {
  queryClient.setQueryData<MaintenanceState>(QK, nextState);
  writeStorage(nextState);
}

function upsertRecord(records: MaintenanceRecord[], record: MaintenanceRecord) {
  return [record, ...records.filter((current) => current.id !== record.id)];
}

function useLocalMaintenanceMigration(remoteState: MaintenanceState | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !remoteState || localMigrationStarted) return;

    const localState = readStorage();
    const remoteIds = new Set(remoteState.records.map((record) => record.id));
    const deletedIds = readDeletedRecordIds();
    const allowBootstrap = !hasSyncedRemoteMaintenance() && remoteIds.size === 0;
    const records = localState.records.filter(
      (record) => !deletedIds.has(record.id) && !remoteIds.has(record.id) && allowBootstrap,
    );

    if (records.length === 0) {
      writeStorage(mergeMaintenanceStates(localState, remoteState));
      return;
    }

    localMigrationStarted = true;
    Promise.all(records.map((record) => createMaintenanceRecord({ data: record })))
      .then(() => {
        writeStorage(mergeMaintenanceStates(readStorage(), remoteState));
        localMigrationStarted = false;
        return queryClient.refetchQueries({ queryKey: QK, type: "active" });
      })
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

export function getMaintenanceExternalCost(record: Pick<MaintenanceRecord, "costEntries">) {
  return record.costEntries.reduce((sum, entry) => sum + entry.amount, 0);
}

export function getMaintenanceTotalCost(
  record: Pick<MaintenanceRecord, "totalCost" | "costEntries">,
) {
  return record.totalCost + getMaintenanceExternalCost(record);
}

export function useMaintenanceStore<T>(selector: MaintenanceSelector<T>): T {
  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const remote = normalizeState(await listMaintenance());
      const merged = mergeMaintenanceStates(readStorage(), remote);
      writeStorage(merged);
      return merged;
    },
    staleTime: 0,
    retry: 1,
    placeholderData: () => readStorage(),
  });

  useLocalMaintenanceMigration(query.data, query.isSuccess && !query.isPlaceholderData);

  return selector(query.data ?? readStorage());
}

export function useMaintenanceActions() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (record: MaintenanceRecord) => createMaintenanceRecord({ data: record }),
  });

  const updateMutation = useMutation({
    mutationFn: (record: MaintenanceRecord) => updateMaintenanceRecord({ data: record }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMaintenanceRecord({ data: id }),
  });

  const updateRecord = async (record: MaintenanceRecord) => {
    await queryClient.cancelQueries({ queryKey: QK });
    const previous = getCachedState(queryClient);
    setCachedState(queryClient, { records: upsertRecord(previous.records, record) });

    try {
      const saved = normalizeRecord(await updateMutation.mutateAsync(record));
      setCachedState(queryClient, {
        records: upsertRecord(getCachedState(queryClient).records, saved),
      });
      return saved;
    } catch (error) {
      setCachedState(queryClient, previous);
      throw error;
    }
  };

  return {
    async createRecord(draft: MaintenanceDraft) {
      const createdAt = new Date().toLocaleDateString("pt-BR");
      const timestamp = nowIso();
      const submittedBy = currentUserName();
      const isAlreadyCompleted = draft.status === "Concluída";
      const completionNote = "Manutenção informada como já concluída no cadastro.";
      const steps = isAlreadyCompleted
        ? completeAllSteps(initialSteps(), timestamp, submittedBy, completionNote)
        : initialSteps();
      const initialCost =
        draft.supplierName.trim() || draft.materialDescription.trim() || draft.cost > 0
          ? [
              makeCostEntry(
                {
                  supplierName: draft.supplierName,
                  partName: draft.materialDescription,
                  amount: draft.cost,
                },
                timestamp,
                submittedBy,
              ),
            ]
          : [];
      const record: MaintenanceRecord = {
        id: newId(),
        equipment: draft.equipment.trim(),
        obra: draft.obra.trim(),
        type: draft.type.trim() || "Preventiva",
        technician: "",
        responsible: "",
        status: isAlreadyCompleted ? "Concluída" : "Aberta",
        currentStepId: isAlreadyCompleted ? steps[steps.length - 1].id : steps[0].id,
        deadline: "",
        createdAt,
        startedAt: isAlreadyCompleted ? timestamp : "",
        finishedAt: isAlreadyCompleted ? timestamp : "",
        description: "",
        notes: draft.notes.trim(),
        serviceSummary: "",
        totalCost: 0,
        item: draft.item.trim(),
        serviceDescription: draft.serviceDescription.trim(),
        submittedBy,
        supplierName: draft.supplierName.trim(),
        materialDescription: draft.materialDescription.trim(),
        cost: typeof draft.cost === "number" && draft.cost > 0 ? draft.cost : 0,
        costEntries: initialCost,
        steps,
        timeline: [
          ...(isAlreadyCompleted
            ? [timeline("Manutenção registrada como concluída", completionNote)]
            : []),
          ...(initialCost.length > 0
            ? [
                timeline(
                  "Custo de fornecedor registrado",
                  `${initialCost[0].partName || "Material"} - R$ ${initialCost[0].amount.toFixed(2)}`,
                ),
              ]
            : []),
          timeline("Manutenção criada", draft.serviceDescription),
        ],
        waitingParts: [],
      };

      await queryClient.cancelQueries({ queryKey: QK });
      const previous = getCachedState(queryClient);
      setCachedState(queryClient, { records: upsertRecord(previous.records, record) });

      try {
        const saved = normalizeRecord(await createMutation.mutateAsync(record));
        setCachedState(queryClient, {
          records: upsertRecord(getCachedState(queryClient).records, saved),
        });
        return saved;
      } catch (error) {
        setCachedState(queryClient, previous);
        throw error;
      }
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

    async updateObra(recordId: string, obra: string) {
      const current = getCachedState(queryClient);
      const record = current.records.find((candidate) => candidate.id === recordId);
      const nextObra = obra.trim();
      if (!record || record.obra === nextObra) return record ?? null;

      return updateRecord({
        ...record,
        obra: nextObra,
        timeline: [
          timeline("Obra atualizada", nextObra || "Obra não informada"),
          ...record.timeline,
        ],
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

    async addExternalCost(recordId: string, draft: MaintenanceCostDraft) {
      const current = getCachedState(queryClient);
      const record = current.records.find((candidate) => candidate.id === recordId);
      if (!record) return null;
      if (!draft.supplierName.trim() || !draft.partName.trim() || draft.amount <= 0) {
        throw new Error("Informe fornecedor, peça e valor válido.");
      }

      const entry = makeCostEntry(draft);
      return updateRecord({
        ...record,
        costEntries: [entry, ...record.costEntries],
        timeline: [
          timeline(
            "Custo de fornecedor registrado",
            `${entry.partName} - ${entry.supplierName} - R$ ${entry.amount.toFixed(2)}`,
          ),
          ...record.timeline,
        ],
      });
    },

    async removeExternalCost(recordId: string, costEntryId: string) {
      const current = getCachedState(queryClient);
      const record = current.records.find((candidate) => candidate.id === recordId);
      const entry = record?.costEntries.find((candidate) => candidate.id === costEntryId);
      if (!record || !entry) return null;

      const costEntries = record.costEntries.filter((candidate) => candidate.id !== costEntryId);
      return updateRecord({
        ...record,
        supplierName: costEntries.length === 0 ? "" : record.supplierName,
        materialDescription: costEntries.length === 0 ? "" : record.materialDescription,
        cost: costEntries.length === 0 ? 0 : record.cost,
        costEntries,
        timeline: [
          timeline(
            "Custo de fornecedor removido",
            `${entry.partName || "Material"} - ${entry.supplierName || "Fornecedor não informado"} - R$ ${entry.amount.toFixed(2)}`,
          ),
          ...record.timeline,
        ],
      });
    },

    async completeRecord(recordId: string, note = "") {
      const current = getCachedState(queryClient);
      const record = current.records.find((candidate) => candidate.id === recordId);
      if (!record || record.status === "Concluída") return record ?? null;

      const timestamp = nowIso();
      const user = currentUserName();
      const completionNote = note.trim() || "Manutenção registrada como já concluída.";
      const steps = completeAllSteps(record.steps, timestamp, user, completionNote);

      return updateRecord({
        ...record,
        status: "Concluída",
        currentStepId: steps[steps.length - 1]?.id || record.currentStepId,
        startedAt: record.startedAt || timestamp,
        finishedAt: timestamp,
        serviceSummary: record.serviceSummary || completionNote,
        steps,
        timeline: [
          timeline("Manutenção registrada como concluída", completionNote),
          ...record.timeline,
        ],
      });
    },

    async restoreRecord(recordId: string) {
      const current = getCachedState(queryClient);
      const record = current.records.find((candidate) => candidate.id === recordId);
      if (!record || record.status !== "Concluída") return record ?? null;

      const timestamp = nowIso();
      const user = currentUserName();
      const steps = restoreCompletedSteps(record, timestamp, user);
      const currentStepId = steps.find((step) => step.status === "em_andamento")?.id;

      return updateRecord({
        ...record,
        status: "Em andamento",
        currentStepId: currentStepId || nextOpenStep(steps),
        finishedAt: "",
        steps,
        timeline: [
          timeline(
            "Manutenção restaurada",
            `Registro reaberto; contagem de dias mantida desde ${record.createdAt}.`,
          ),
          ...record.timeline,
        ],
      });
    },

    async removeRecord(id: string) {
      await queryClient.cancelQueries({ queryKey: QK });
      const previous = getCachedState(queryClient);
      markDeletedRecordId(id);
      setCachedState(queryClient, {
        records: previous.records.filter((record) => record.id !== id),
      });

      try {
        await deleteMutation.mutateAsync(id);
        setCachedState(queryClient, {
          records: getCachedState(queryClient).records.filter((record) => record.id !== id),
        });
      } catch (error) {
        unmarkDeletedRecordId(id);
        setCachedState(queryClient, previous);
        throw error;
      }
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
  addExternalCost: (): never => {
    throw new Error(
      "maintenanceActions.addExternalCost() foi removido. Use useMaintenanceActions().addExternalCost().",
    );
  },
  removeExternalCost: (): never => {
    throw new Error(
      "maintenanceActions.removeExternalCost() foi removido. Use useMaintenanceActions().removeExternalCost().",
    );
  },
  completeRecord: (): never => {
    throw new Error(
      "maintenanceActions.completeRecord() foi removido. Use useMaintenanceActions().completeRecord().",
    );
  },
} as const;
