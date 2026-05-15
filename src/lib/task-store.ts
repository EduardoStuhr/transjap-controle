import { useSyncExternalStore } from "react";
import {
  normalizeTaskPriority,
  normalizeTaskStatus,
  type TaskComment,
  type TaskInput,
  type TaskRecord,
  type TaskStatus,
  type TimelineEvent,
} from "@/lib/task-types";

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

function sanitizeAttachments(attachments: TaskInput["attachments"]) {
  return attachments.map(({ file, ...attachment }) => attachment);
}

function normalizeTask(task: Partial<TaskRecord> & { equip?: string; resp?: string }): TaskRecord {
  const createdAt = task.createdAt || displayDate();

  return {
    id: task.id || newId("TK"),
    title: task.title || "",
    description: task.description || "",
    equipment: task.equipment || task.equip || "",
    assignedTo: task.assignedTo || task.resp || "",
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

function taskFromInput(input: TaskInput): TaskRecord {
  const now = nowIso();

  return {
    id: newId("TK"),
    title: input.title.trim(),
    description: input.description.trim(),
    equipment: input.equipment.trim(),
    assignedTo: input.assignedTo.trim(),
    sector: input.sector.trim(),
    priority: input.priority,
    deadline: input.deadline,
    status: input.status,
    attachments: sanitizeAttachments(input.attachments),
    comments: [],
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
          assignedTo: input.assignedTo.trim(),
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
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              status: task.status === "Não visualizado" ? "Visualizado" : task.status,
              viewed: true,
              updatedAt: nowIso(),
            }
          : task,
      ),
    }));
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
