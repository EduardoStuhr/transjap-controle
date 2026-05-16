import { useSyncExternalStore } from "react";
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

const STORAGE_KEY = "transjap:fleet-command:tasks:v1";

const EMPTY_STATE: TaskState = {
  tasks: [],
  pendingRequests: [],
};

let state: TaskState = EMPTY_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

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
  return attachments.map(({ file: _file, ...attachment }) => attachment);
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
    const r = (entry || {}) as Partial<TaskResponse>;
    return {
      id: r.id || newId("RS"),
      author: r.author || "",
      text: r.text || "",
      attachments: sanitizeAttachments(Array.isArray(r.attachments) ? r.attachments : []),
      timestamp: r.timestamp || displayDate(),
    };
  });
}

function normalizeTask(
  task: Partial<TaskRecord> & { equip?: string; resp?: string; assignedTo?: unknown },
): TaskRecord {
  const createdAt = task.createdAt || displayDate();
  const assignedTo = normalizeAssignedTo(task.assignedTo ?? task.resp);

  return {
    id: task.id || newId("TK"),
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

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(updater: (current: TaskState) => TaskState) {
  ensureHydrated();
  state = updater(state);
  writeStorage(state);
  emit();
}

function ensureHydrated() {
  if (hydrated || !isBrowser()) return;
  hydrated = true;
  state = readStorage();
}

function sanitizeAssignedTo(value: string[]): string[] {
  const cleaned = value.map((name) => name.trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

function taskFromInput(input: TaskInput): TaskRecord {
  const now = nowIso();

  return {
    id: newId("TK"),
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
    timeline: [],
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

export const taskActions = {
  createTask(input: TaskInput) {
    const task = taskFromInput(input);
    setState((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    return task;
  },

  updateTask(id: string, input: TaskInput) {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== id) return task;

        const nextStatus = input.status;
        const statusChanged = task.status !== nextStatus;

        return {
          ...task,
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
            ? [statusEvent(task.status, nextStatus), ...task.timeline]
            : task.timeline,
          updatedAt: nowIso(),
          viewed: nextStatus !== "Não visualizado" || task.viewed,
        };
      }),
    }));
  },

  markTaskViewed(id: string) {
    const user = getCurrentUser();
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== id) return task;

        const recipients = resolveRecipients(task.assignedTo);
        const isRecipient = user ? recipients.includes(user.name) : false;
        if (!isRecipient) return task;

        if (task.viewedBy[user!.name]) {
          return { ...task, viewed: true };
        }

        const nextViewedBy = { ...task.viewedBy, [user!.name]: nowIso() };
        const shouldFlipStatus = task.status === "Não visualizado";
        const nextStatus: TaskStatus = shouldFlipStatus ? "Visualizado" : task.status;

        return {
          ...task,
          status: nextStatus,
          viewedBy: nextViewedBy,
          viewed: true,
          timeline: shouldFlipStatus
            ? [
                {
                  id: newId("EV"),
                  timestamp: displayDate(),
                  action: `Visualizado por ${user!.name}`,
                  actor: user!.name,
                  status: nextStatus,
                },
                ...task.timeline,
              ]
            : task.timeline,
          updatedAt: nowIso(),
        };
      }),
    }));
  },

  addResponse(
    taskId: string,
    response: { text: string; attachments: AttachedFile[] },
  ): TaskResponse | null {
    const user = getCurrentUser();
    const text = response.text.trim();
    if (!user || !text) return null;

    const created: TaskResponse = {
      id: newId("RS"),
      author: user.name,
      text,
      attachments: sanitizeAttachments(response.attachments),
      timestamp: displayDate(),
    };

    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) return task;

        const recipients = resolveRecipients(task.assignedTo);
        if (!recipients.includes(user.name)) return task;

        return {
          ...task,
          responses: [created, ...task.responses],
          timeline: [
            {
              id: newId("EV"),
              timestamp: displayDate(),
              action: `Resposta enviada por ${user.name}`,
              actor: user.name,
            },
            ...task.timeline,
          ],
          updatedAt: nowIso(),
        };
      }),
    }));

    return created;
  },

  addComment(taskId: string, comment: Pick<TaskComment, "author" | "text">) {
    const text = comment.text.trim();
    const author = comment.author.trim();
    if (!text || !author) return;

    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              comments: [
                {
                  id: newId("CM"),
                  author,
                  text,
                  timestamp: displayDate(),
                },
                ...task.comments,
              ],
              updatedAt: nowIso(),
            }
          : task,
      ),
    }));
  },

  approveRequest(id: string) {
    let approved: TaskRecord | undefined;

    setState((current) => {
      approved = current.pendingRequests.find((request) => request.id === id);
      if (!approved) return current;

      return {
        tasks: [
          {
            ...approved,
            id: newId("TK"),
            status: "Não visualizado",
            viewed: false,
            updatedAt: nowIso(),
          },
          ...current.tasks,
        ],
        pendingRequests: current.pendingRequests.filter((request) => request.id !== id),
      };
    });

    return approved;
  },

  rejectRequest(id: string) {
    let rejected: TaskRecord | undefined;

    setState((current) => {
      rejected = current.pendingRequests.find((request) => request.id === id);
      return {
        ...current,
        pendingRequests: current.pendingRequests.filter((request) => request.id !== id),
      };
    });

    return rejected;
  },
};

export function useTaskStore<T>(selector: (state: TaskState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);

      if (!hydrated && isBrowser()) {
        queueMicrotask(() => {
          ensureHydrated();
          emit();
        });
      }

      if (isBrowser()) {
        window.addEventListener("storage", handleStorageEvent);
      }

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
  if (event.key !== STORAGE_KEY) return;
  state = readStorage();
  emit();
}
