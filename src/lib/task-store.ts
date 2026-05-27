import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addTaskCommentDocument,
  addTaskResponseDocument,
  changeTaskStatusDocument,
  createTaskDocument,
  deleteTaskDocument,
  listTasks,
  markTaskViewedDocument,
  updateTaskDocument,
  type StoredTaskDocument,
  type StoredTaskKind,
  type TaskStatusChangeInput,
} from "@/lib/api/tasks";
import {
  isTaskCompletedStatus,
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
import { isAdminUser } from "@/lib/auth-users";
import {
  resolveRecipients,
  resolveResponsibleIds,
  resolveResponsibleUsers,
} from "@/lib/operational-options";
import type { AttachedFile } from "@/components/AttachmentUpload";

type TaskState = {
  tasks: TaskRecord[];
  pendingRequests: TaskRecord[];
};

type TaskSelector<T> = (state: TaskState) => T;

const QK = ["tasks"] as const;
const RELATED_TASK_QUERY_KEYS = [
  ["tasks"],
  ["task-details"],
  ["task-stats"],
  ["dashboard-counters"],
  ["notifications"],
  ["critical-tasks"],
] as const;
const STORAGE_KEY = "transjap:fleet-command:tasks:v1";
const DELETED_IDS_STORAGE_KEY = "transjap:fleet-command:tasks:deleted-ids:v1";
const REMOTE_SYNCED_STORAGE_KEY = "transjap:fleet-command:tasks:remote-synced:v1";

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

function stringField(source: Record<string, unknown>, fields: readonly string[]): string {
  for (const field of fields) {
    const value = source[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeViewedBy(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, timestamp]) => typeof timestamp === "string",
  ) as Array<[string, string]>;
  return Object.fromEntries(entries);
}

/**
 * A tarefa e considerada vista quando ao menos um destinatario registrou visualizacao.
 * Visualizacoes do criador ou de usuarios sem atribuicao nao participam do agregado.
 */
function computeViewedByRecipients(task: {
  assignedTo?: string[];
  responsibleIds?: string[];
  createdBy?: string;
  createdById?: string;
  viewedBy?: Record<string, string>;
}): boolean {
  const viewedBy = task.viewedBy ?? {};
  const recipientNames = (task.assignedTo ?? []).filter((name) => name !== task.createdBy);
  if (recipientNames.some((name) => Boolean(viewedBy[name]))) return true;

  return resolveResponsibleUsers([
    ...recipientNames,
    ...(task.responsibleIds ?? []),
  ]).some(
    (recipient) =>
      recipient.id !== task.createdById &&
      recipient.name !== task.createdBy &&
      Boolean(viewedBy[recipient.id] || viewedBy[recipient.name]),
  );
}

function normalizeResponses(value: unknown): TaskResponse[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const response = (entry || {}) as Partial<TaskResponse>;
    return {
      id: response.id || newId("RS"),
      author: response.author || "",
      createdBy: response.createdBy || response.author || "",
      authorId: response.authorId || "",
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
  const source = task as Record<string, unknown>;
  const createdAt = task.createdAt || displayDate();
  const updatedAt = task.updatedAt || nowIso();
  const assignedTo = normalizeAssignedTo(
    task.assignedTo ??
      source.assigned_to ??
      source.recipients ??
      source.responsaveis ??
      source["responsáveis"] ??
      task.resp,
  );
  const createdBy = stringField(source, [
    "createdBy",
    "createdByName",
    "created_by",
    "created_by_name",
    "sender",
    "author",
    "requestedBy",
    "requested_by",
  ]);
  const createdById = stringField(source, [
    "createdById",
    "createdByUserId",
    "created_by_user_id",
    "userId",
    "user_id",
  ]);
  const responsibleIds = Array.isArray(task.responsibleIds)
    ? task.responsibleIds.filter((id): id is string => typeof id === "string")
    : Array.isArray(source.responsible_ids)
      ? source.responsible_ids.filter((id): id is string => typeof id === "string")
      : resolveResponsibleIds(assignedTo);
  const viewedBy = normalizeViewedBy(task.viewedBy);
  const notificationReadBy = normalizeViewedBy(task.notificationReadBy);
  const status = normalizeTaskStatus(task.status);
  const completedAt =
    typeof task.completedAt === "string" && task.completedAt
      ? task.completedAt
      : isTaskCompletedStatus(status) && typeof task.updatedAt === "string"
        ? task.updatedAt
        : "";

  return {
    id: task.id || newId("TK"),
    createdBy,
    createdById,
    title: task.title || "",
    description: task.description || "",
    equipment: task.equipment || task.equip || "",
    assignedTo,
    responsibleIds,
    sector: task.sector || "",
    priority: normalizeTaskPriority(task.priority),
    deadline: task.deadline || "",
    status,
    attachments: sanitizeAttachments(task.attachments || []),
    comments: (task.comments || []).map((comment) => ({
      id: comment.id || newId("CM"),
      author: comment.author || "",
      createdBy: comment.createdBy || comment.author || "",
      authorId: comment.authorId || "",
      text: comment.text || "",
      timestamp: comment.timestamp || createdAt,
    })),
    responses: normalizeResponses(task.responses),
    viewedBy,
    notificationReadBy,
    timeline: (task.timeline || []).map((event) => ({
      id: event.id || newId("EV"),
      timestamp: event.timestamp || createdAt,
      action: event.action || "",
      actor: event.actor || "Sistema",
      status: event.status ? normalizeTaskStatus(event.status) : undefined,
    })),
    createdAt,
    updatedAt,
    completedAt,
    completedBy: typeof task.completedBy === "string" ? task.completedBy : "",
    viewed: computeViewedByRecipients({
      assignedTo,
      responsibleIds,
      createdBy,
      createdById,
      viewedBy,
    }),
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

function readDeletedTaskIds(): Set<string> {
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

function writeDeletedTaskIds(ids: Set<string>) {
  if (!isBrowser()) return;
  window.localStorage.setItem(DELETED_IDS_STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-500)));
}

function markDeletedTaskId(id: string) {
  const ids = readDeletedTaskIds();
  ids.add(id);
  writeDeletedTaskIds(ids);
}

function unmarkDeletedTaskId(id: string) {
  const ids = readDeletedTaskIds();
  ids.delete(id);
  writeDeletedTaskIds(ids);
}

function hasSyncedRemoteTasks() {
  return isBrowser() && window.localStorage.getItem(REMOTE_SYNCED_STORAGE_KEY) === "1";
}

function markRemoteTasksSynced() {
  if (!isBrowser()) return;
  window.localStorage.setItem(REMOTE_SYNCED_STORAGE_KEY, "1");
}

function filterDeletedTasks(state: TaskState): TaskState {
  const deletedIds = readDeletedTaskIds();
  if (deletedIds.size === 0) return state;

  return {
    tasks: state.tasks.filter((task) => !deletedIds.has(task.id)),
    pendingRequests: state.pendingRequests.filter((request) => !deletedIds.has(request.id)),
  };
}

function readStorage(): TaskState {
  if (!isBrowser()) return EMPTY_STATE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? filterDeletedTasks(normalizeState(JSON.parse(raw))) : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

function writeStorage(nextState: TaskState) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  markRemoteTasksSynced();
}

function sanitizeAssignedTo(value: string[]): string[] {
  const cleaned = value.map((name) => name.trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

function userHasViewed(task: TaskRecord, user: NonNullable<ReturnType<typeof getCurrentUser>>) {
  return Boolean(task.viewedBy[user.id] || task.viewedBy[user.name]);
}

function userIsRecipient(task: TaskRecord, user: NonNullable<ReturnType<typeof getCurrentUser>>) {
  const isCreator =
    Boolean(task.createdById && task.createdById === user.id) ||
    Boolean(task.createdBy && task.createdBy === user.name);
  if (isCreator) return false;

  if (task.assignedTo.includes(user.name) || task.responsibleIds.includes(user.id)) return true;

  const recipients = resolveResponsibleUsers([...task.assignedTo, ...task.responsibleIds]);
  return recipients.some(
    (recipient) => recipient.id === user.id || recipient.name === user.name,
  );
}

function withViewedByUser(task: TaskRecord, user: NonNullable<ReturnType<typeof getCurrentUser>>) {
  const viewedAt = nowIso();
  const notificationReadBy = {
    ...task.notificationReadBy,
    [user.id]: viewedAt,
    [user.name]: viewedAt,
  };
  if (!userIsRecipient(task, user)) {
    return { changed: true, task: { ...task, notificationReadBy } };
  }

  const alreadyViewed = userHasViewed(task, user);
  const viewedBy = { ...task.viewedBy, [user.id]: viewedAt, [user.name]: viewedAt };
  const viewed = computeViewedByRecipients({ ...task, viewedBy });
  const shouldFlipStatus = task.status === "Não visualizado" && !alreadyViewed;

  return {
    changed: true,
    task: {
      ...task,
      status: shouldFlipStatus ? "Visualizado" : task.status,
      viewedBy,
      notificationReadBy,
      viewed,
      timeline: alreadyViewed
        ? task.timeline
        : [
            {
              id: newId("EV"),
              timestamp: viewedAt,
              action: `Visualizado por ${user.name}`,
              actor: user.name,
              status: shouldFlipStatus ? "Visualizado" : task.status,
            },
            ...task.timeline,
          ],
      updatedAt: viewedAt,
    },
  };
}

function taskFromInput(input: TaskInput): TaskRecord {
  const now = nowIso();
  const user = getCurrentUser();
  const createdBy = user?.name || "";
  const responsibleIds = resolveResponsibleIds(input.assignedTo);
  const completedAt = isTaskCompletedStatus(input.status) ? now : "";

  return {
    id: newId("TK"),
    createdBy,
    createdById: user?.id || "",
    title: input.title.trim(),
    description: input.description.trim(),
    equipment: input.equipment.trim(),
    assignedTo: sanitizeAssignedTo(input.assignedTo),
    responsibleIds,
    sector: input.sector.trim(),
    priority: input.priority,
    deadline: input.deadline,
    status: input.status,
    attachments: sanitizeAttachments(input.attachments),
    comments: [],
    responses: [],
    viewedBy: {},
    notificationReadBy: {},
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
    completedAt,
    completedBy: isTaskCompletedStatus(input.status) ? createdBy : "",
    viewed: false,
  };
}

function completionTimestampForStatus(
  previousCompletedAt: string,
  previousStatus: TaskStatus,
  nextStatus: TaskStatus,
): string {
  if (isTaskCompletedStatus(nextStatus)) {
    return previousCompletedAt || (isTaskCompletedStatus(previousStatus) ? "" : nowIso());
  }

  return "";
}

function completedByForStatus(
  previousCompletedBy: string,
  previousStatus: TaskStatus,
  nextStatus: TaskStatus,
  actor: string,
): string {
  if (!isTaskCompletedStatus(nextStatus)) return "";
  return previousCompletedBy || (isTaskCompletedStatus(previousStatus) ? "" : actor);
}

function statusEvent(previous: TaskStatus, next: TaskStatus, actor = "Sistema"): TimelineEvent {
  const action = isTaskCompletedStatus(next)
    ? `Tarefa concluída por ${actor}`
    : isTaskCompletedStatus(previous)
      ? `Tarefa reaberta por ${actor}`
      : `Status alterado de ${previous} para ${next}`;

  return {
    id: newId("EV"),
    timestamp: nowIso(),
    action,
    actor,
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

function shouldPushLocalTask(
  remoteTask: TaskRecord | undefined,
  localTask: TaskRecord,
  deletedIds: Set<string>,
  allowBootstrap: boolean,
) {
  if (deletedIds.has(localTask.id)) return false;
  if (!remoteTask) return allowBootstrap;
  return newerThanLocal(remoteTask, localTask);
}

function useLocalTaskMigration(remoteState: TaskState | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const user = getCurrentUser();
    if (!enabled || !remoteState || localMigrationStarted || !isAdminUser(user)) return;

    const localState = readStorage();
    const remoteTasks = new Map<string, TaskRecord>();
    remoteState.tasks.forEach((task) => remoteTasks.set(task.id, task));
    remoteState.pendingRequests.forEach((task) => remoteTasks.set(task.id, task));
    const deletedIds = readDeletedTaskIds();
    const allowBootstrap = !hasSyncedRemoteTasks() && remoteTasks.size === 0;

    const documents = [
      ...localState.tasks
        .filter((task) =>
          shouldPushLocalTask(remoteTasks.get(task.id), task, deletedIds, allowBootstrap),
        )
        .map((task) => asDocument("task", task)),
      ...localState.pendingRequests
        .filter((task) =>
          shouldPushLocalTask(remoteTasks.get(task.id), task, deletedIds, allowBootstrap),
        )
        .map((task) => asDocument("request", task)),
    ];

    if (documents.length === 0) {
      writeStorage(remoteState);
      return;
    }

    localMigrationStarted = true;
    Promise.all(documents.map((document) => createTaskDocument({ data: document })))
      .then(() => {
        writeStorage(remoteState);
        localMigrationStarted = false;
        return queryClient.refetchQueries({ queryKey: QK, type: "active" });
      })
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
    refetchInterval: isBrowser() ? 2000 : false,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev ?? readStorage(),
  });

  useLocalTaskMigration(query.data, query.isSuccess && !query.isPlaceholderData);

  return selector(query.data ?? readStorage());
}

export function useTaskActions() {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all(
      RELATED_TASK_QUERY_KEYS.map((queryKey) =>
        queryClient.refetchQueries({ queryKey, type: "active" }),
      ),
    );
  };
  const updateCachedState = (updater: (state: TaskState) => TaskState) => {
    const next = updater(getCachedState(queryClient));
    queryClient.setQueryData(QK, next);
    writeStorage(next);
    return next;
  };
  const sortByUpdated = (items: TaskRecord[]) =>
    [...items].sort((a, b) =>
      (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
    );
  const upsertCachedTask = (kind: StoredTaskKind, task: TaskRecord) => {
    updateCachedState((state) => {
      const key = kind === "request" ? "pendingRequests" : "tasks";
      return {
        ...state,
        [key]: sortByUpdated([task, ...state[key].filter((item) => item.id !== task.id)]),
      };
    });
  };
  const removeCachedTask = (id: string) => {
    updateCachedState((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
      pendingRequests: state.pendingRequests.filter((request) => request.id !== id),
    }));
  };

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

  const viewedMutation = useMutation({
    mutationFn: (id: string) => markTaskViewedDocument({ data: id }),
    onSuccess: invalidate,
  });

  const statusMutation = useMutation({
    mutationFn: (input: TaskStatusChangeInput) => changeTaskStatusDocument({ data: input }),
    onSuccess: invalidate,
  });

  const responseMutation = useMutation({
    mutationFn: (input: Parameters<typeof addTaskResponseDocument>[0]["data"]) =>
      addTaskResponseDocument({ data: input }),
    onSuccess: invalidate,
  });

  const commentMutation = useMutation({
    mutationFn: (input: Parameters<typeof addTaskCommentDocument>[0]["data"]) =>
      addTaskCommentDocument({ data: input }),
    onSuccess: invalidate,
  });

  const saveTask = async (kind: StoredTaskKind, task: TaskRecord) => {
    upsertCachedTask(kind, task);
    try {
      await updateMutation.mutateAsync(asDocument(kind, task));
    } catch (error) {
      invalidate();
      throw error;
    }
    return task;
  };

  return {
    async createTask(input: TaskInput) {
      const task = taskFromInput(input);
      upsertCachedTask("task", task);
      try {
        await createMutation.mutateAsync(asDocument("task", task));
      } catch (error) {
        removeCachedTask(task.id);
        invalidate();
        throw error;
      }
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
        assignedTo: existing.assignedTo,
        responsibleIds: existing.responsibleIds,
        sector: existing.sector,
        priority: input.priority,
        deadline: input.deadline,
        status: nextStatus,
        attachments: sanitizeAttachments(input.attachments),
        timeline: statusChanged
          ? [
              statusEvent(existing.status, nextStatus, getCurrentUser()?.name || "Sistema"),
              ...existing.timeline,
            ]
          : existing.timeline,
        updatedAt: nowIso(),
        completedAt: completionTimestampForStatus(
          existing.completedAt,
          existing.status,
          nextStatus,
        ),
        completedBy: completedByForStatus(
          existing.completedBy,
          existing.status,
          nextStatus,
          getCurrentUser()?.name || "Sistema",
        ),
        viewed: computeViewedByRecipients(existing),
      };

      return saveTask("task", task);
    },

    async markTaskViewed(id: string) {
      const user = getCurrentUser();
      const current = getCachedState(queryClient);
      const existing = current.tasks.find((task) => task.id === id);
      if (!existing || !user) return existing ?? null;

      const { task, changed } = withViewedByUser(existing, user);
      if (!changed) return existing;
      upsertCachedTask("task", task);
      try {
        const result = await viewedMutation.mutateAsync(id);
        upsertCachedTask(result.kind, normalizeTask(result.task));
      } catch (error) {
        invalidate();
        throw error;
      }
      return task;
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
        createdBy: user.name,
        authorId: user.id,
        text,
        attachments: sanitizeAttachments(response.attachments),
        timestamp: nowIso(),
      };

      const task: TaskRecord = {
        ...existing,
        responses: [created, ...existing.responses],
        timeline: [
          {
            id: newId("EV"),
            timestamp: nowIso(),
            action: `${user.name} respondeu`,
            actor: user.name,
          },
          ...existing.timeline,
        ],
        updatedAt: nowIso(),
      };

      upsertCachedTask("task", task);
      try {
        const result = await responseMutation.mutateAsync({
          taskId,
          text,
          attachments: sanitizeAttachments(response.attachments),
        });
        const synced = normalizeTask(result.task);
        upsertCachedTask(result.kind, synced);
        return synced.responses[0] ?? created;
      } catch (error) {
        upsertCachedTask("task", existing);
        invalidate();
        throw error;
      }
    },

    async addResponseWithStatus(
      taskId: string,
      response: { text: string; attachments: AttachedFile[] },
      nextStatus: TaskStatus | null,
    ) {
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
        createdBy: user.name,
        authorId: user.id,
        text,
        attachments: sanitizeAttachments(response.attachments),
        timestamp: nowIso(),
      };

      const statusChanged = Boolean(nextStatus) && nextStatus !== existing.status;
      const finalStatus: TaskStatus = statusChanged ? (nextStatus as TaskStatus) : existing.status;
      const responseEvent = {
        id: newId("EV"),
        timestamp: nowIso(),
        action: `${user.name} respondeu`,
        actor: user.name,
      };

      const task: TaskRecord = {
        ...existing,
        status: finalStatus,
        responses: [created, ...existing.responses],
        timeline: [
          responseEvent,
          ...(statusChanged ? [statusEvent(existing.status, finalStatus, user.name)] : []),
          ...existing.timeline,
        ],
        viewed: computeViewedByRecipients(existing),
        completedAt: completionTimestampForStatus(
          existing.completedAt,
          existing.status,
          finalStatus,
        ),
        completedBy: completedByForStatus(
          existing.completedBy,
          existing.status,
          finalStatus,
          user.name,
        ),
        updatedAt: nowIso(),
      };

      upsertCachedTask("task", task);
      try {
        const result = await responseMutation.mutateAsync({
          taskId,
          text,
          attachments: sanitizeAttachments(response.attachments),
          nextStatus: statusChanged ? finalStatus : null,
        });
        const synced = normalizeTask(result.task);
        upsertCachedTask(result.kind, synced);
        return { response: synced.responses[0] ?? created, statusChanged, status: finalStatus };
      } catch (error) {
        upsertCachedTask("task", existing);
        invalidate();
        throw error;
      }
    },

    async addComment(taskId: string, comment: Pick<TaskComment, "author" | "text">) {
      const user = getCurrentUser();
      const text = comment.text.trim();
      const current = getCachedState(queryClient);
      const existing = current.tasks.find((task) => task.id === taskId);
      if (!text || !user || !existing) return null;

      const task: TaskRecord = {
        ...existing,
        comments: [
          {
            id: newId("CM"),
            author: user.name,
            createdBy: user.name,
            authorId: user.id,
            text,
            timestamp: nowIso(),
          },
          ...existing.comments,
        ],
        timeline: [
          {
            id: newId("EV"),
            timestamp: nowIso(),
            action: `${user.name} comentou`,
            actor: user.name,
          },
          ...existing.timeline,
        ],
        updatedAt: nowIso(),
      };

      upsertCachedTask("task", task);
      try {
        const result = await commentMutation.mutateAsync({ taskId, text });
        const synced = normalizeTask(result.task);
        upsertCachedTask(result.kind, synced);
        return synced.comments[0] ?? task.comments[0];
      } catch (error) {
        upsertCachedTask("task", existing);
        invalidate();
        throw error;
      }
    },

    async changeTaskStatus(taskId: string, nextStatus: TaskStatus) {
      const user = getCurrentUser();
      const current = getCachedState(queryClient);
      const existing = current.tasks.find((task) => task.id === taskId);
      if (!existing || existing.status === nextStatus) return existing ?? null;

      const actor = user?.name || "Sistema";
      const task: TaskRecord = {
        ...existing,
        status: nextStatus,
        viewed: computeViewedByRecipients(existing),
        completedAt: completionTimestampForStatus(
          existing.completedAt,
          existing.status,
          nextStatus,
        ),
        completedBy: completedByForStatus(existing.completedBy, existing.status, nextStatus, actor),
        timeline: [statusEvent(existing.status, nextStatus, actor), ...existing.timeline],
        updatedAt: nowIso(),
      };

      upsertCachedTask("task", task);
      try {
        const result = await statusMutation.mutateAsync({ id: taskId, status: nextStatus });
        const synced = normalizeTask(result.task);
        upsertCachedTask(result.kind, synced);
        return synced;
      } catch (error) {
        upsertCachedTask("task", existing);
        invalidate();
        throw error;
      }
    },

    async approveRequest(id: string) {
      const user = getCurrentUser();
      const createdBy = user?.name || "";
      const current = getCachedState(queryClient);
      const approved = current.pendingRequests.find((request) => request.id === id);
      if (!approved) return null;

      const task: TaskRecord = {
        ...approved,
        id: newId("TK"),
        createdBy: approved.createdBy || createdBy,
        createdById: approved.createdById || user?.id || "",
        responsibleIds: approved.responsibleIds.length
          ? approved.responsibleIds
          : resolveResponsibleIds(approved.assignedTo),
        status: "Não visualizado",
        viewed: false,
        completedAt: "",
        completedBy: "",
        updatedAt: nowIso(),
      };

      upsertCachedTask("task", task);
      markDeletedTaskId(id);
      removeCachedTask(id);
      try {
        await createMutation.mutateAsync(asDocument("task", task));
        await deleteMutation.mutateAsync(id);
      } catch (error) {
        unmarkDeletedTaskId(id);
        invalidate();
        throw error;
      }
      return approved;
    },

    async rejectRequest(id: string) {
      await queryClient.cancelQueries({ queryKey: QK });
      const current = getCachedState(queryClient);
      const rejected = current.pendingRequests.find((request) => request.id === id) ?? null;
      markDeletedTaskId(id);
      removeCachedTask(id);
      try {
        await deleteMutation.mutateAsync(id);
        removeCachedTask(id);
      } catch (error) {
        unmarkDeletedTaskId(id);
        queryClient.setQueryData(QK, current);
        writeStorage(current);
        invalidate();
        throw error;
      }
      return rejected;
    },

    async removeTask(id: string) {
      await queryClient.cancelQueries({ queryKey: QK });
      const previous = getCachedState(queryClient);
      markDeletedTaskId(id);
      removeCachedTask(id);
      try {
        await deleteMutation.mutateAsync(id);
        removeCachedTask(id);
      } catch (error) {
        unmarkDeletedTaskId(id);
        queryClient.setQueryData(QK, previous);
        writeStorage(previous);
        invalidate();
        throw error;
      }
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
  changeTaskStatus: (): never => {
    throw new Error(
      "taskActions.changeTaskStatus() foi removido. Use useTaskActions().changeTaskStatus().",
    );
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
