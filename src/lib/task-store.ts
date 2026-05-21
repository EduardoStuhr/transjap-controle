import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTaskDocument,
  deleteTaskDocument,
  listTasks,
  updateTaskDocument,
  type StoredTaskDocument,
  type StoredTaskKind,
} from "@/lib/api/tasks";
import {
  normalizeTaskPriority,
  normalizeTaskStatus,
  type TaskComment,
  type TaskInput,
  type TaskRecord,
  type TaskResponse,
  type TaskStatus,
  type TimelineEvent,
} from "@/lib/task-types";
import { getCurrentUser } from "@/lib/auth-store";
import { resolveRecipients } from "@/lib/operational-options";
import type { AttachedFile } from "@/components/AttachmentUpload";

type TaskState = {
  tasks: TaskRecord[];
  pendingRequests: TaskRecord[];
};

type TaskSelector<T> = (state: TaskState) => T;

const QK = ["tasks"] as const;
const STORAGE_KEY = "transjap:fleet-command:tasks:v1";

const EMPTY_STATE: TaskState = {
  tasks: [],
  pendingRequests: [],
};

let localMigrationStarted = false;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function displayDate(value = new Date()) {
  return value.toLocaleDateString("pt-BR");
}

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function sanitizeAttachments(attachments: AttachedFile[]) {
  return attachments.map((attachment) => ({ ...attachment }));
}

function normalizeAssignedTo(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((name): name is string => typeof name === "string");
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function normalizeViewedBy(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, timestamp]) => typeof timestamp === "string",
  ) as Array<[string, string]>;
  return Object.fromEntries(entries);
}

function normalizeResponses(value: unknown): TaskResponse[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const response = (entry || {}) as Partial<TaskResponse>;
    return {
      id: response.id || newId("RS"),
      author: response.author || "",
      text: response.text || "",
      attachments: sanitizeAttachments(
        Array.isArray(response.attachments) ? response.attachments : [],
      ),
      timestamp: response.timestamp || displayDate(),
    };
  });
}

function normalizeTask(
  task: Partial<TaskRecord> & { equip?: string; resp?: string; assignedTo?: unknown },
): TaskRecord {
  const createdAt = task.createdAt || displayDate();
  const assignedTo = normalizeAssignedTo(task.assignedTo ?? task.resp);
  const createdBy = typeof task.createdBy === "string" ? task.createdBy : "";

  return {
    id: task.id || newId("TK"),
    createdBy,
    title: task.title || "",
    description: task.description || "",
    equipment: task.equipment || task.equip || "",
    assignedTo,
    sector: task.sector || "",
    priority: normalizeTaskPriority(task.priority),
    deadline: task.deadline || "",
    status: normalizeTaskStatus(task.status),
    attachments: sanitizeAttachments(task.attachments || []),
    comments: (task.comments || []).map((comment) => ({
      id: comment.id || newId("CM"),
      author: comment.author || "",
      text: comment.text || "",
      timestamp: comment.timestamp || createdAt,
    })),
    responses: normalizeResponses(task.responses),
    viewedBy: normalizeViewedBy(task.viewedBy),
    timeline: (task.timeline || []).map((event) => ({
      id: event.id || newId("EV"),
      timestamp: event.timestamp || createdAt,
      action: event.action || "",
      actor: event.actor || "Sistema",
      status: event.status ? normalizeTaskStatus(event.status) : undefined,
    })),
    createdAt,
    updatedAt: task.updatedAt || nowIso(),
    viewed: Boolean(task.viewed),
  };
}

function normalizeState(value: unknown): TaskState {
  if (!value || typeof value !== "object") return EMPTY_STATE;
  const stored = value as Partial<TaskState>;

  return {
    tasks: Array.isArray(stored.tasks) ? stored.tasks.map(normalizeTask) : [],
    pendingRequests: Array.isArray(stored.pendingRequests)
      ? stored.pendingRequests.map(normalizeTask)
      : [],
  };
}

function readStorage(): TaskState {
  if (!isBrowser()) return EMPTY_STATE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

function writeStorage(nextState: TaskState) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function sanitizeAssignedTo(value: string[]): string[] {
  const cleaned = value.map((name) => name.trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

function taskFromInput(input: TaskInput): TaskRecord {
  const now = nowIso();
  const createdBy = getCurrentUser()?.name || "";

  return {
    id: newId("TK"),
    createdBy,
    title: input.title.trim(),
    description: input.description.trim(),
    equipment: input.equipment.trim(),
    assignedTo: sanitizeAssignedTo(input.assignedTo),
    sector: input.sector.trim(),
    priority: input.priority,
    deadline: input.deadline,
    status: input.status,
    attachments: sanitizeAttachments(input.attachments),
    comments: [],
    responses: [],
    viewedBy: {},
    timeline: [
      {
        id: newId("EV"),
        timestamp: displayDate(),
        action: `Tarefa enviada por ${createdBy || "Sistema"}`,
        actor: createdBy || "Sistema",
        status: input.status,
      },
    ],
    createdAt: displayDate(),
    updatedAt: now,
    viewed: input.status !== "Não visualizado",
  };
}

function statusEvent(previous: TaskStatus, next: TaskStatus): TimelineEvent {
  return {
    id: newId("EV"),
    timestamp: displayDate(),
    action: `Status alterado de ${previous} para ${next}`,
    actor: "Sistema",
    status: next,
  };
}

function asDocument(kind: StoredTaskKind, task: TaskRecord): StoredTaskDocument {
  return { kind, task };
}

function getCachedState(queryClient: ReturnType<typeof useQueryClient>): TaskState {
  return queryClient.getQueryData<TaskState>(QK) ?? readStorage();
}

function newerThanLocal(remoteTask: TaskRecord | undefined, localTask: TaskRecord) {
  if (!remoteTask) return true;
  return (
    (localTask.updatedAt || localTask.createdAt).localeCompare(
      remoteTask.updatedAt || remoteTask.createdAt,
    ) > 0
  );
}

function useLocalTaskMigration(remoteState: TaskState | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !remoteState || localMigrationStarted) return;

    const localState = readStorage();
    const remoteTasks = new Map<string, TaskRecord>();
    remoteState.tasks.forEach((task) => remoteTasks.set(task.id, task));
    remoteState.pendingRequests.forEach((task) => remoteTasks.set(task.id, task));

    const documents = [
      ...localState.tasks
        .filter((task) => newerThanLocal(remoteTasks.get(task.id), task))
        .map((task) => asDocument("task", task)),
      ...localState.pendingRequests
        .filter((task) => newerThanLocal(remoteTasks.get(task.id), task))
        .map((task) => asDocument("request", task)),
    ];

    if (documents.length === 0) {
      writeStorage(remoteState);
      return;
    }

    localMigrationStarted = true;
    Promise.all(documents.map((document) => createTaskDocument({ data: document })))
      .then(() => queryClient.invalidateQueries({ queryKey: QK }))
      .catch(() => {
        localMigrationStarted = false;
      });
  }, [enabled, queryClient, remoteState]);
}

export function useTaskStore<T>(selector: TaskSelector<T>): T {
  const query = useQuery({
    queryKey: QK,
    queryFn: async () => normalizeState(await listTasks()),
    staleTime: 0,
    retry: 1,
    placeholderData: () => readStorage(),
  });

  useLocalTaskMigration(query.data, query.isSuccess && !query.isPlaceholderData);

  return selector(query.data ?? readStorage());
}

export function useTaskActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: (document: StoredTaskDocument) => createTaskDocument({ data: document }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: (document: StoredTaskDocument) => updateTaskDocument({ data: document }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTaskDocument({ data: id }),
    onSuccess: invalidate,
  });

  const saveTask = async (kind: StoredTaskKind, task: TaskRecord) => {
    await updateMutation.mutateAsync(asDocument(kind, task));
    return task;
  };

  return {
    async createTask(input: TaskInput) {
      const task = taskFromInput(input);
      await createMutation.mutateAsync(asDocument("task", task));
      return task;
    },

    async updateTask(id: string, input: TaskInput) {
      const current = getCachedState(queryClient);
      const existing = current.tasks.find((task) => task.id === id);
      if (!existing) return null;

      const nextStatus = input.status;
      const statusChanged = existing.status !== nextStatus;
      const task: TaskRecord = {
        ...existing,
        title: input.title.trim(),
        description: input.description.trim(),
        equipment: input.equipment.trim(),
        assignedTo: sanitizeAssignedTo(input.assignedTo),
        sector: input.sector.trim(),
        priority: input.priority,
        deadline: input.deadline,
        status: nextStatus,
        attachments: sanitizeAttachments(input.attachments),
        timeline: statusChanged
          ? [statusEvent(existing.status, nextStatus), ...existing.timeline]
          : existing.timeline,
        updatedAt: nowIso(),
        viewed: nextStatus !== "Não visualizado" || existing.viewed,
      };

      return saveTask("task", task);
    },

    async markTaskViewed(id: string) {
      const user = getCurrentUser();
      const current = getCachedState(queryClient);
      const existing = current.tasks.find((task) => task.id === id);
      if (!existing || !user) return existing ?? null;

      const recipients = resolveRecipients(existing.assignedTo);
      if (!recipients.includes(user.name)) return existing;
      if (existing.viewedBy[user.name]) {
        return saveTask("task", { ...existing, viewed: true });
      }

      const nextViewedBy = { ...existing.viewedBy, [user.name]: nowIso() };
      const shouldFlipStatus = existing.status === "Não visualizado";
      const nextStatus: TaskStatus = shouldFlipStatus ? "Visualizado" : existing.status;
      const task: TaskRecord = {
        ...existing,
        status: nextStatus,
        viewedBy: nextViewedBy,
        viewed: true,
        timeline: shouldFlipStatus
          ? [
              {
                id: newId("EV"),
                timestamp: displayDate(),
                action: `Visualizado por ${user.name}`,
                actor: user.name,
                status: nextStatus,
              },
              ...existing.timeline,
            ]
          : existing.timeline,
        updatedAt: nowIso(),
      };

      return saveTask("task", task);
    },

    async addResponse(taskId: string, response: { text: string; attachments: AttachedFile[] }) {
      const user = getCurrentUser();
      const text = response.text.trim();
      const current = getCachedState(queryClient);
      const existing = current.tasks.find((task) => task.id === taskId);
      if (!user || !text || !existing) return null;

      const recipients = resolveRecipients(existing.assignedTo);
      if (!recipients.includes(user.name)) return null;

      const created: TaskResponse = {
        id: newId("RS"),
        author: user.name,
        text,
        attachments: sanitizeAttachments(response.attachments),
        timestamp: displayDate(),
      };

      const task: TaskRecord = {
        ...existing,
        responses: [created, ...existing.responses],
        timeline: [
          {
            id: newId("EV"),
            timestamp: displayDate(),
            action: `Resposta enviada por ${user.name}`,
            actor: user.name,
          },
          ...existing.timeline,
        ],
        updatedAt: nowIso(),
      };

      await saveTask("task", task);
      return created;
    },

    async addComment(taskId: string, comment: Pick<TaskComment, "author" | "text">) {
      const text = comment.text.trim();
      const author = comment.author.trim();
      const current = getCachedState(queryClient);
      const existing = current.tasks.find((task) => task.id === taskId);
      if (!text || !author || !existing) return null;

      const task: TaskRecord = {
        ...existing,
        comments: [
          {
            id: newId("CM"),
            author,
            text,
            timestamp: displayDate(),
          },
          ...existing.comments,
        ],
        updatedAt: nowIso(),
      };

      await saveTask("task", task);
      return task.comments[0];
    },

    async approveRequest(id: string) {
      const createdBy = getCurrentUser()?.name || "";
      const current = getCachedState(queryClient);
      const approved = current.pendingRequests.find((request) => request.id === id);
      if (!approved) return null;

      const task: TaskRecord = {
        ...approved,
        id: newId("TK"),
        createdBy: approved.createdBy || createdBy,
        status: "Não visualizado",
        viewed: false,
        updatedAt: nowIso(),
      };

      await createMutation.mutateAsync(asDocument("task", task));
      await deleteMutation.mutateAsync(id);
      return approved;
    },

    async rejectRequest(id: string) {
      const current = getCachedState(queryClient);
      const rejected = current.pendingRequests.find((request) => request.id === id) ?? null;
      await deleteMutation.mutateAsync(id);
      return rejected;
    },

    async removeTask(id: string) {
      await deleteMutation.mutateAsync(id);
    },
  };
}

export const taskActions = {
  createTask: (): never => {
    throw new Error("taskActions.createTask() foi removido. Use useTaskActions().createTask().");
  },
  updateTask: (): never => {
    throw new Error("taskActions.updateTask() foi removido. Use useTaskActions().updateTask().");
  },
  markTaskViewed: (): never => {
    throw new Error(
      "taskActions.markTaskViewed() foi removido. Use useTaskActions().markTaskViewed().",
    );
  },
  addResponse: (): never => {
    throw new Error("taskActions.addResponse() foi removido. Use useTaskActions().addResponse().");
  },
  addComment: (): never => {
    throw new Error("taskActions.addComment() foi removido. Use useTaskActions().addComment().");
  },
  approveRequest: (): never => {
    throw new Error(
      "taskActions.approveRequest() foi removido. Use useTaskActions().approveRequest().",
    );
  },
  rejectRequest: (): never => {
    throw new Error(
      "taskActions.rejectRequest() foi removido. Use useTaskActions().rejectRequest().",
    );
  },
} as const;
