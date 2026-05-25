import { createServerFn } from "@tanstack/react-start";
import { getOptionalD1 } from "@/lib/cf-env";
import { requireServerAuthUser } from "@/lib/api/auth";
import {
  findUserById,
  findUserByName,
  isAdminUser,
  resolveResponsibleIds,
  resolveResponsibleNames,
  resolveResponsibleUsers,
  type AuthUser,
} from "@/lib/auth-users";
import {
  deleteStoreDocument,
  deleteStoreModuleDocuments,
  listStoreDocuments,
  upsertStoreDocument,
} from "@/lib/api/store-documents";
import {
  isTaskCompletedStatus,
  normalizeTaskPriority,
  normalizeTaskStatus,
  type TaskComment,
  type TaskRecord,
  type TaskResponse,
  type TaskStatus,
  type TimelineEvent,
} from "@/lib/task-types";

const TASKS_MODULE = "tasks";

export type StoredTaskKind = "task" | "request";

export type StoredTaskDocument = {
  kind: StoredTaskKind;
  task: TaskRecord;
};

export type TaskListResult = {
  tasks: TaskRecord[];
  pendingRequests: TaskRecord[];
};

export type TaskStatusChangeInput = {
  id: string;
  status: string;
};

export type TaskResponseInput = {
  taskId: string;
  text: string;
  attachments: TaskResponse["attachments"];
  nextStatus?: string | null;
};

export type TaskCommentInput = {
  taskId: string;
  text: string;
};

type TaskRow = {
  id: string;
  kind?: string;
  title: string;
  description: string;
  equipment: string;
  assigned_to: string;
  responsible_ids?: string;
  sector: string;
  priority: string;
  deadline: string | null;
  status: string;
  created_by: string;
  created_by_user_id?: string;
  attachments: string;
  viewed_by: string;
  viewed: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  completed_by?: string | null;
};

type TaskResponseRow = {
  id: string;
  task_id: string;
  author: string;
  text: string;
  attachments: string;
  timestamp: string;
};

type TaskCommentRow = {
  id: string;
  task_id: string;
  author: string;
  text: string;
  timestamp: string;
};

type TaskTimelineRow = {
  id: string;
  task_id: string;
  timestamp: string;
  action: string;
  actor: string;
  status: string | null;
};

type TaskRecipientRow = {
  task_id: string;
  user_id: string;
  user_name: string;
  created_at: string;
};

type TaskViewRow = {
  task_id: string;
  user_id: string;
  user_name: string;
  viewed_at: string;
};

let taskMigrationStarted = false;
let taskMigrationPromise: Promise<void> | null = null;

function nowIso() {
  return new Date().toISOString();
}

function splitTaskDocuments(documents: StoredTaskDocument[]): TaskListResult {
  return documents.reduce<TaskListResult>(
    (state, document) => {
      if (document.kind === "request") {
        state.pendingRequests.push(document.task);
      } else {
        state.tasks.push(document.task);
      }
      return state;
    },
    { tasks: [], pendingRequests: [] },
  );
}

function parseJson<T>(value: string | undefined | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeAssignedTo(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.filter((name): name is string => typeof name === "string")
    : typeof value === "string" && value
      ? [value]
      : [];

  return uniqueStrings(raw);
}

function stringField(source: Record<string, unknown>, fields: readonly string[]): string {
  for (const field of fields) {
    const value = source[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function arrayField(source: Record<string, unknown>, fields: readonly string[]): string[] {
  for (const field of fields) {
    const value = source[field];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
    if (typeof value === "string" && value.trim()) return [value.trim()];
  }
  return [];
}

function normalizeResponsibleIds(task: Partial<TaskRecord>): string[] {
  const source = task as Record<string, unknown>;
  const explicit = arrayField(source, ["responsibleIds", "responsible_ids"]);
  if (explicit.length > 0) return uniqueStrings(explicit);
  return resolveResponsibleIds(normalizeAssignedTo(task.assignedTo));
}

function resolveTaskRecipientUsers(task: Pick<TaskRecord, "assignedTo" | "responsibleIds">) {
  const byId = new Map<string, AuthUser>();
  resolveResponsibleUsers(task.assignedTo).forEach((user) => byId.set(user.id, user));
  task.responsibleIds
    .map((id) => findUserById(id))
    .filter((user): user is AuthUser => Boolean(user))
    .forEach((user) => byId.set(user.id, user));
  return Array.from(byId.values());
}

function mergeTaskViews(
  viewedBy: Record<string, string>,
  rows: readonly TaskViewRow[],
): Record<string, string> {
  const next = { ...viewedBy };
  rows.forEach((row) => {
    if (row.user_id) next[row.user_id] = row.viewed_at;
    if (row.user_name) next[row.user_name] = row.viewed_at;
  });
  return next;
}

function hasUserViewedTask(viewedBy: Record<string, string>, user: AuthUser): boolean {
  return Boolean(viewedBy[user.id] || viewedBy[user.name]);
}

function allRecipientsViewed(task: TaskRecord, viewedBy: Record<string, string>): boolean {
  const recipients = resolveTaskRecipientUsers(task);
  if (recipients.length === 0) return false;
  return recipients.every((recipient) =>
    Boolean(viewedBy[recipient.id] || viewedBy[recipient.name]),
  );
}

function withUserView(task: TaskRecord, user: AuthUser): { task: TaskRecord; changed: boolean } {
  const viewedAt = nowIso();
  const alreadyViewed = hasUserViewedTask(task.viewedBy, user);
  const viewedBy = { ...task.viewedBy, [user.id]: viewedAt, [user.name]: viewedAt };
  const fullyViewed = allRecipientsViewed(task, viewedBy);
  const shouldFlipStatus = task.status === "Não visualizado" && fullyViewed;

  return {
    changed: true,
    task: {
      ...task,
      status: shouldFlipStatus ? "Visualizado" : task.status,
      viewedBy,
      viewed: fullyViewed,
      timeline: alreadyViewed
        ? task.timeline
        : [
            {
              id: `EV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
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

function normalizeCreatedById(task: Partial<TaskRecord>): string {
  const source = task as Record<string, unknown>;
  const id = stringField(source, [
    "createdById",
    "createdByUserId",
    "created_by_user_id",
    "userId",
    "user_id",
  ]);
  if (id) return id;
  return findUserByName(normalizeCreatedBy(task))?.id ?? "";
}

function normalizeCreatedBy(task: Partial<TaskRecord>): string {
  return stringField(task as Record<string, unknown>, [
    "createdBy",
    "createdByName",
    "created_by",
    "created_by_name",
    "sender",
    "author",
    "requestedBy",
    "requested_by",
  ]);
}

function normalizeStoredTask(task: Partial<TaskRecord>): TaskRecord {
  const source = task as Record<string, unknown>;
  const assignedTo = normalizeAssignedTo(
    task.assignedTo ??
      source.assigned_to ??
      source.recipients ??
      source.responsaveis ??
      source["responsáveis"],
  );
  const responsibleIds = normalizeResponsibleIds({ ...task, assignedTo });
  const responsibleNames =
    assignedTo.length > 0 ? assignedTo : resolveResponsibleNames(responsibleIds);
  const createdAt = task.createdAt || nowIso();
  const updatedAt = task.updatedAt || nowIso();
  const status = normalizeTaskStatus(task.status);
  const completedAt =
    typeof task.completedAt === "string" && task.completedAt
      ? task.completedAt
      : isTaskCompletedStatus(status) && typeof task.updatedAt === "string"
        ? task.updatedAt
        : "";

  return {
    id: task.id || crypto.randomUUID(),
    createdBy: normalizeCreatedBy(task),
    createdById: normalizeCreatedById(task),
    title: task.title || "",
    description: task.description || "",
    equipment: task.equipment || "",
    assignedTo: responsibleNames,
    responsibleIds,
    sector: task.sector || "",
    priority: normalizeTaskPriority(task.priority),
    deadline: task.deadline || "",
    status,
    attachments: Array.isArray(task.attachments) ? task.attachments : [],
    comments: Array.isArray(task.comments)
      ? task.comments.map((comment) => ({
          ...comment,
          createdBy: comment.createdBy || comment.author,
          authorId: comment.authorId || findUserByName(comment.author)?.id || "",
        }))
      : [],
    responses: Array.isArray(task.responses)
      ? task.responses.map((response) => ({
          ...response,
          createdBy: response.createdBy || response.author,
          authorId: response.authorId || findUserByName(response.author)?.id || "",
        }))
      : [],
    viewedBy: task.viewedBy && typeof task.viewedBy === "object" ? task.viewedBy : {},
    timeline: Array.isArray(task.timeline) ? task.timeline : [],
    createdAt,
    updatedAt,
    completedAt,
    completedBy: typeof task.completedBy === "string" ? task.completedBy : "",
    viewed: Boolean(task.viewed),
  };
}

function withCompletionTimestamp(task: TaskRecord, previous?: TaskRecord, actor = ""): TaskRecord {
  if (isTaskCompletedStatus(task.status)) {
    return {
      ...task,
      completedAt:
        task.completedAt ||
        previous?.completedAt ||
        (!previous || !isTaskCompletedStatus(previous.status) ? nowIso() : ""),
      completedBy:
        task.completedBy ||
        previous?.completedBy ||
        (!previous || !isTaskCompletedStatus(previous.status) ? actor : ""),
    };
  }

  return { ...task, completedAt: "", completedBy: "" };
}

function applyStatusChange(task: TaskRecord, status: string, user: AuthUser): TaskRecord {
  const nextStatus = normalizeTaskStatus(status);
  if (task.status === nextStatus) return task;

  const timestamp = nowIso();
  const completed = isTaskCompletedStatus(nextStatus);
  const reopened = isTaskCompletedStatus(task.status) && !completed;
  const action = completed
    ? `Tarefa concluída por ${user.name}`
    : reopened
      ? `Tarefa reaberta por ${user.name}`
      : `Status alterado de ${task.status} para ${nextStatus}`;

  return {
    ...task,
    status: nextStatus,
    completedAt: completed ? task.completedAt || timestamp : "",
    completedBy: completed ? task.completedBy || user.name : "",
    updatedAt: timestamp,
    timeline: [
      {
        id: `EV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        timestamp,
        action,
        actor: user.name,
        status: nextStatus,
      },
      ...task.timeline,
    ],
  };
}

function canSeeTask(task: TaskRecord, user: AuthUser): boolean {
  if (isAdminUser(user)) return true;
  return (
    task.createdById === user.id ||
    task.createdById === user.name ||
    task.createdBy === user.name ||
    task.createdBy === user.id ||
    task.responsibleIds.includes(user.id) ||
    task.assignedTo.includes(user.name) ||
    task.assignedTo.includes(user.id) ||
    task.assignedTo.includes("Todos")
  );
}

function canMutateWholeTask(task: TaskRecord, user: AuthUser): boolean {
  return (
    isAdminUser(user) ||
    task.createdById === user.id ||
    task.createdBy === user.name ||
    task.createdBy === user.id
  );
}

function canDeleteTask(task: TaskRecord, user: AuthUser): boolean {
  return canMutateWholeTask(task, user);
}

function preserveProtectedFields(
  next: TaskRecord,
  existing: TaskRecord,
  user: AuthUser,
): TaskRecord {
  if (canMutateWholeTask(existing, user)) {
    return {
      ...next,
      createdBy: existing.createdBy,
      createdById: existing.createdById,
      assignedTo: existing.assignedTo,
      responsibleIds: existing.responsibleIds,
    };
  }

  return {
    ...existing,
    status: next.status,
    responses: next.responses,
    viewedBy: next.viewedBy,
    viewed: next.viewed,
    completedAt: next.completedAt,
    completedBy: next.completedBy,
    timeline: next.timeline,
    updatedAt: next.updatedAt || nowIso(),
  };
}

function originalCreatorFromTimeline(task: TaskRecord): AuthUser | null {
  for (const event of [...task.timeline].reverse()) {
    const match = event.action.match(/^Tarefa enviada por (.+)$/i);
    if (!match) continue;
    return findUserByName(match[1].trim()) ?? findUserByName(event.actor);
  }

  return null;
}

function repairTaskCreator(task: TaskRecord): TaskRecord {
  const originalCreator = originalCreatorFromTimeline(task);
  if (
    !originalCreator ||
    (task.createdBy === originalCreator.name && task.createdById === originalCreator.id)
  ) {
    return task;
  }

  return {
    ...task,
    createdBy: originalCreator.name,
    createdById: originalCreator.id,
  };
}

async function hasColumn(d1: D1Database, table: string, column: string): Promise<boolean> {
  const result = await d1.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return Boolean(result.results?.some((row) => row.name === column));
}

async function addColumnIfMissing(
  d1: D1Database,
  table: string,
  column: string,
  definition: string,
) {
  if (await hasColumn(d1, table, column)) return;
  await d1.prepare(`ALTER TABLE ${table} ADD ${definition}`).run();
}

async function ensureTaskTables(d1: D1Database) {
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '' NOT NULL,
        equipment TEXT DEFAULT '' NOT NULL,
        assigned_to TEXT NOT NULL,
        sector TEXT NOT NULL,
        priority TEXT NOT NULL,
        deadline TEXT,
        status TEXT NOT NULL,
        created_by TEXT DEFAULT '' NOT NULL,
        attachments TEXT DEFAULT '[]' NOT NULL,
        viewed_by TEXT DEFAULT '{}' NOT NULL,
        viewed INTEGER DEFAULT false NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT DEFAULT '' NOT NULL,
        completed_by TEXT DEFAULT '' NOT NULL
      )`,
    )
    .run();

  await addColumnIfMissing(d1, "tasks", "kind", "kind TEXT DEFAULT 'task' NOT NULL");
  await addColumnIfMissing(
    d1,
    "tasks",
    "created_by_user_id",
    "created_by_user_id TEXT DEFAULT '' NOT NULL",
  );
  await addColumnIfMissing(
    d1,
    "tasks",
    "responsible_ids",
    "responsible_ids TEXT DEFAULT '[]' NOT NULL",
  );
  await addColumnIfMissing(d1, "tasks", "completed_at", "completed_at TEXT DEFAULT '' NOT NULL");
  await addColumnIfMissing(d1, "tasks", "completed_by", "completed_by TEXT DEFAULT '' NOT NULL");

  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS task_responses (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL,
        author TEXT NOT NULL,
        text TEXT NOT NULL,
        attachments TEXT DEFAULT '[]' NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE cascade
      )`,
    )
    .run();
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS task_comments (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL,
        author TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE cascade
      )`,
    )
    .run();
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS task_timeline (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        status TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE cascade
      )`,
    )
    .run();
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS task_recipients (
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (task_id, user_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE cascade
      )`,
    )
    .run();
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS task_views (
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        viewed_at TEXT NOT NULL,
        PRIMARY KEY (task_id, user_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE cascade
      )`,
    )
    .run();

  await d1.prepare("CREATE INDEX IF NOT EXISTS idx_tasks_kind ON tasks(kind)").run();
  await d1
    .prepare("CREATE INDEX IF NOT EXISTS idx_tasks_created_by_user_id ON tasks(created_by_user_id)")
    .run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at)").run();
  await d1
    .prepare("CREATE INDEX IF NOT EXISTS idx_task_recipients_user_id ON task_recipients(user_id)")
    .run();
  await d1
    .prepare("CREATE INDEX IF NOT EXISTS idx_task_views_user_id ON task_views(user_id)")
    .run();
}

async function upsertTaskRows(d1: D1Database, document: StoredTaskDocument) {
  const task = normalizeStoredTask(document.task);
  const timestamp = task.updatedAt || nowIso();

  await d1
    .prepare(
      `INSERT INTO tasks (
        id, kind, title, description, equipment, assigned_to, responsible_ids, sector, priority,
        deadline, status, created_by, created_by_user_id, attachments, viewed_by, viewed,
        created_at, updated_at, completed_at, completed_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        title = excluded.title,
        description = excluded.description,
        equipment = excluded.equipment,
        assigned_to = excluded.assigned_to,
        responsible_ids = excluded.responsible_ids,
        sector = excluded.sector,
        priority = excluded.priority,
        deadline = excluded.deadline,
        status = excluded.status,
        created_by = excluded.created_by,
        created_by_user_id = excluded.created_by_user_id,
        attachments = excluded.attachments,
        viewed_by = excluded.viewed_by,
        viewed = excluded.viewed,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at,
        completed_by = excluded.completed_by`,
    )
    .bind(
      task.id,
      document.kind,
      task.title,
      task.description,
      task.equipment,
      JSON.stringify(task.assignedTo),
      JSON.stringify(task.responsibleIds),
      task.sector,
      task.priority,
      task.deadline || null,
      task.status,
      task.createdBy,
      task.createdById,
      JSON.stringify(task.attachments),
      JSON.stringify(task.viewedBy),
      task.viewed ? 1 : 0,
      task.createdAt,
      timestamp,
      task.completedAt,
      task.completedBy,
    )
    .run();

  await d1.prepare("DELETE FROM task_recipients WHERE task_id = ?").bind(task.id).run();
  for (const recipient of resolveTaskRecipientUsers(task)) {
    await d1
      .prepare(
        `INSERT INTO task_recipients (task_id, user_id, user_name, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(task_id, user_id) DO UPDATE SET
           user_name = excluded.user_name`,
      )
      .bind(task.id, recipient.id, recipient.name, task.createdAt)
      .run();
  }

  for (const viewer of resolveResponsibleUsers(["Todos"])) {
    const viewedAt = task.viewedBy[viewer.id] || task.viewedBy[viewer.name];
    if (!viewedAt) continue;
    await d1
      .prepare(
        `INSERT INTO task_views (task_id, user_id, user_name, viewed_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(task_id, user_id) DO UPDATE SET
           user_name = excluded.user_name,
           viewed_at = excluded.viewed_at`,
      )
      .bind(task.id, viewer.id, viewer.name, viewedAt)
      .run();
  }

  await d1.prepare("DELETE FROM task_responses WHERE task_id = ?").bind(task.id).run();
  await d1.prepare("DELETE FROM task_comments WHERE task_id = ?").bind(task.id).run();
  await d1.prepare("DELETE FROM task_timeline WHERE task_id = ?").bind(task.id).run();

  for (const response of task.responses) {
    await d1
      .prepare(
        `INSERT INTO task_responses (id, task_id, author, text, attachments, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        response.id,
        task.id,
        response.author,
        response.text,
        JSON.stringify(response.attachments),
        response.timestamp,
      )
      .run();
  }

  for (const comment of task.comments) {
    await d1
      .prepare(
        `INSERT INTO task_comments (id, task_id, author, text, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        comment.id,
        task.id,
        comment.author,
        comment.text,
        comment.timestamp,
      )
      .run();
  }

  for (const event of task.timeline) {
    await d1
      .prepare(
        `INSERT INTO task_timeline (id, task_id, timestamp, action, actor, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(event.id, task.id, event.timestamp, event.action, event.actor, event.status || null)
      .run();
  }

  return { kind: document.kind, task };
}

function taskFromRow(
  row: TaskRow,
  comments: TaskComment[],
  responses: TaskResponse[],
  timeline: TimelineEvent[],
): TaskRecord {
  return normalizeStoredTask({
    id: row.id,
    createdBy: row.created_by,
    createdById: row.created_by_user_id || findUserByName(row.created_by)?.id || "",
    title: row.title,
    description: row.description,
    equipment: row.equipment,
    assignedTo: parseJson<string[]>(row.assigned_to, []),
    responsibleIds: parseJson<string[]>(row.responsible_ids, []),
    sector: row.sector,
    priority: normalizeTaskPriority(row.priority),
    deadline: row.deadline || "",
    status: normalizeTaskStatus(row.status),
    attachments: parseJson(row.attachments, []),
    comments,
    responses,
    viewedBy: parseJson<Record<string, string>>(row.viewed_by, {}),
    timeline,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt:
      row.completed_at ||
      (isTaskCompletedStatus(row.status) && row.updated_at ? row.updated_at : ""),
    completedBy: row.completed_by || "",
    viewed: Boolean(row.viewed),
  });
}

async function documentFromRow(d1: D1Database, row: TaskRow): Promise<StoredTaskDocument> {
  const [commentsResult, responsesResult, timelineResult, viewsResult] = await Promise.all([
    d1
      .prepare("SELECT * FROM task_comments WHERE task_id = ? ORDER BY timestamp DESC")
      .bind(row.id)
      .all<TaskCommentRow>(),
    d1
      .prepare("SELECT * FROM task_responses WHERE task_id = ? ORDER BY timestamp DESC")
      .bind(row.id)
      .all<TaskResponseRow>(),
    d1
      .prepare("SELECT * FROM task_timeline WHERE task_id = ? ORDER BY timestamp DESC")
      .bind(row.id)
      .all<TaskTimelineRow>(),
    d1.prepare("SELECT * FROM task_views WHERE task_id = ?").bind(row.id).all<TaskViewRow>(),
  ]);
  const viewedBy = mergeTaskViews(
    parseJson<Record<string, string>>(row.viewed_by, {}),
    viewsResult.results ?? [],
  );

  return {
    kind: row.kind === "request" ? "request" : "task",
    task: taskFromRow(
      { ...row, viewed_by: JSON.stringify(viewedBy) },
      (commentsResult.results ?? []).map((comment) => ({
        id: comment.id,
        author: comment.author,
        createdBy: comment.author,
        authorId: findUserByName(comment.author)?.id || "",
        text: comment.text,
        timestamp: comment.timestamp,
      })),
      (responsesResult.results ?? []).map((response) => ({
        id: response.id,
        author: response.author,
        createdBy: response.author,
        authorId: findUserByName(response.author)?.id || "",
        text: response.text,
        attachments: parseJson(response.attachments, []),
        timestamp: response.timestamp,
      })),
      (timelineResult.results ?? []).map((event) => ({
        id: event.id,
        timestamp: event.timestamp,
        action: event.action,
        actor: event.actor,
        status: event.status ? normalizeTaskStatus(event.status) : undefined,
      })),
    ),
  };
}

async function getTaskDocument(d1: D1Database, id: string): Promise<StoredTaskDocument | null> {
  const row = await d1.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<TaskRow>();
  return row ? documentFromRow(d1, row) : null;
}

async function repairStoredTaskCreators(d1: D1Database) {
  const rows = await d1.prepare("SELECT * FROM tasks").all<TaskRow>();

  for (const row of rows.results ?? []) {
    const existing = await documentFromRow(d1, row);
    const repaired = repairTaskCreator(existing.task);
    if (repaired === existing.task) continue;

    await d1
      .prepare("UPDATE tasks SET created_by = ?, created_by_user_id = ? WHERE id = ?")
      .bind(repaired.createdBy, repaired.createdById, repaired.id)
      .run();
  }
}

async function backfillTaskAccessTables(d1: D1Database) {
  const rows = await d1
    .prepare(
      `SELECT * FROM tasks
       WHERE NOT EXISTS (SELECT 1 FROM task_recipients WHERE task_id = tasks.id)
          OR json_array_length(COALESCE(responsible_ids, '[]')) > (
            SELECT COUNT(*) FROM task_recipients WHERE task_id = tasks.id
          )`,
    )
    .all<TaskRow>();

  for (const row of rows.results ?? []) {
    await upsertTaskRows(d1, await documentFromRow(d1, row));
  }
}

async function migrateStoreDocumentsToTasks(d1: D1Database) {
  if (taskMigrationStarted) return taskMigrationPromise;
  taskMigrationStarted = true;
  taskMigrationPromise = (async () => {
    await ensureTaskTables(d1);
    await backfillTaskAccessTables(d1);
    const countRow = await d1
      .prepare("SELECT COUNT(*) AS total FROM tasks")
      .first<{ total: number }>();
    if ((countRow?.total ?? 0) > 0) {
      await deleteStoreModuleDocuments(TASKS_MODULE);
      return;
    }

    const documents = await listStoreDocuments<StoredTaskDocument>(TASKS_MODULE);
    for (const document of documents) {
      if (!document?.task?.id) continue;
      await upsertTaskRows(d1, document);
    }
    if (documents.length > 0) await deleteStoreModuleDocuments(TASKS_MODULE);
  })();
  return taskMigrationPromise;
}

async function listTaskDocumentsFromD1(
  d1: D1Database,
  user: AuthUser,
): Promise<StoredTaskDocument[]> {
  await migrateStoreDocumentsToTasks(d1);
  await repairStoredTaskCreators(d1);

  const query = isAdminUser(user)
    ? `SELECT * FROM tasks ORDER BY updated_at DESC`
    : `SELECT * FROM tasks
       WHERE created_by_user_id = ?
          OR created_by = ?
          OR created_by = ?
          OR EXISTS (SELECT 1 FROM task_recipients WHERE task_id = tasks.id AND user_id = ?)
          OR EXISTS (SELECT 1 FROM json_each(tasks.responsible_ids) WHERE value = ?)
          OR EXISTS (SELECT 1 FROM json_each(tasks.assigned_to) WHERE value = ? OR value = ? OR value = 'Todos')
       ORDER BY updated_at DESC`;
  const prepared = d1.prepare(query);
  const result = isAdminUser(user)
    ? await prepared.all<TaskRow>()
    : await prepared
        .bind(user.id, user.name, user.id, user.id, user.id, user.name, user.id)
        .all<TaskRow>();

  const documents: StoredTaskDocument[] = [];
  for (const row of result.results ?? []) {
    documents.push(await documentFromRow(d1, row));
  }
  return documents;
}

async function listTaskDocumentsLocal(user: AuthUser): Promise<StoredTaskDocument[]> {
  const documents = await listStoreDocuments<StoredTaskDocument>(TASKS_MODULE);
  const repaired: StoredTaskDocument[] = [];

  for (const document of documents) {
    const normalized = normalizeStoredTask(document.task);
    const task = repairTaskCreator(normalized);
    const next = { ...document, task };
    if (task !== normalized) {
      await upsertStoreDocument(TASKS_MODULE, task.id, next);
    }
    repaired.push(next);
  }

  return repaired.filter((document) => canSeeTask(document.task, user));
}

async function createDocument(document: StoredTaskDocument, user: AuthUser) {
  const d1 = getOptionalD1();
  const task = withCompletionTimestamp(
    normalizeStoredTask({
      ...document.task,
      createdBy: user.name,
      createdById: user.id,
      responsibleIds: resolveResponsibleIds(document.task.assignedTo),
    }),
    undefined,
    user.name,
  );
  const nextDocument: StoredTaskDocument = { kind: document.kind, task };
  let savedDocument: StoredTaskDocument;

  if (!d1) {
    savedDocument = await upsertStoreDocument(TASKS_MODULE, task.id, nextDocument);
  } else {
    await migrateStoreDocumentsToTasks(d1);
    savedDocument = await upsertTaskRows(d1, nextDocument);
  }

  if (document.kind === "task") {
    const { sendNewTaskPushNotifications } = await import("@/lib/api/push.server");
    await sendNewTaskPushNotifications(task).catch((error) => {
      console.warn("[push] A tarefa foi criada, mas o envio de notificação falhou.", error);
    });
  }

  return savedDocument;
}

async function updateDocument(document: StoredTaskDocument, user: AuthUser) {
  const d1 = getOptionalD1();

  if (!d1) {
    const documents = await listTaskDocumentsLocal(user);
    const existing = documents.find((entry) => entry.task.id === document.task.id);
    if (!existing) throw new Response("Tarefa nao encontrada ou sem permissao.", { status: 404 });
    const preserved = preserveProtectedFields(
      normalizeStoredTask(document.task),
      existing.task,
      user,
    );
    const task = withCompletionTimestamp(
      {
        ...preserved,
        viewedBy: { ...existing.task.viewedBy, ...preserved.viewedBy },
        viewed: existing.task.viewed || preserved.viewed,
      },
      existing.task,
      user.name,
    );
    const nextDocument: StoredTaskDocument = { kind: document.kind, task };
    return upsertStoreDocument(TASKS_MODULE, task.id, nextDocument);
  }

  await migrateStoreDocumentsToTasks(d1);
  const existing = await getTaskDocument(d1, document.task.id);
  if (!existing || !canSeeTask(existing.task, user)) {
    throw new Response("Tarefa nao encontrada ou sem permissao.", { status: 404 });
  }

  const preserved = preserveProtectedFields(
    normalizeStoredTask(document.task),
    existing.task,
    user,
  );
  const task = withCompletionTimestamp(
    {
      ...preserved,
      viewedBy: { ...existing.task.viewedBy, ...preserved.viewedBy },
      viewed: existing.task.viewed || preserved.viewed,
    },
    existing.task,
    user.name,
  );
  return upsertTaskRows(d1, { kind: document.kind, task });
}

function canRespondToTask(task: TaskRecord, user: AuthUser): boolean {
  return resolveTaskRecipientUsers(task).some((recipient) => recipient.id === user.id);
}

function responseActivity(
  input: TaskResponseInput,
  user: AuthUser,
  timestamp: string,
): TaskResponse {
  return {
    id: `RS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    author: user.name,
    createdBy: user.name,
    authorId: user.id,
    text: input.text.trim(),
    attachments: input.attachments,
    timestamp,
  };
}

function commentActivity(input: TaskCommentInput, user: AuthUser, timestamp: string): TaskComment {
  return {
    id: `CM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    author: user.name,
    createdBy: user.name,
    authorId: user.id,
    text: input.text.trim(),
    timestamp,
  };
}

function activityEvent(action: string, user: AuthUser, timestamp: string): TimelineEvent {
  return {
    id: `EV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    timestamp,
    action,
    actor: user.name,
  };
}

async function sendTaskActivityNotification(
  task: TaskRecord,
  user: AuthUser,
  action: "respondeu" | "comentou",
) {
  const { sendTaskActivityPushNotifications } = await import("@/lib/api/push.server");
  await sendTaskActivityPushNotifications(task, user, action).catch((error) => {
    console.warn("[push] A atividade foi registrada, mas a notificação falhou.", error);
  });
}

async function addResponseDocument(input: TaskResponseInput, user: AuthUser) {
  const text = input.text.trim();
  if (!text) throw new Response("Resposta vazia.", { status: 400 });

  const d1 = getOptionalD1();
  const timestamp = nowIso();

  if (!d1) {
    const documents = await listTaskDocumentsLocal(user);
    const existing = documents.find((document) => document.task.id === input.taskId);
    if (!existing || !canRespondToTask(existing.task, user)) {
      throw new Response("Tarefa nao encontrada ou sem permissao para responder.", {
        status: 404,
      });
    }

    const response = responseActivity(input, user, timestamp);
    const responseEvent = activityEvent(`${user.name} respondeu`, user, timestamp);
    const requestedStatus = input.nextStatus ? normalizeTaskStatus(input.nextStatus) : null;
    const statusChanged = Boolean(requestedStatus) && requestedStatus !== existing.task.status;
    const statusTask = statusChanged
      ? applyStatusChange(existing.task, requestedStatus as TaskStatus, user)
      : { ...existing.task, updatedAt: timestamp };
    const task: TaskRecord = {
      ...statusTask,
      responses: [response, ...existing.task.responses],
      timeline: [responseEvent, ...statusTask.timeline],
    };
    const saved = await upsertStoreDocument(TASKS_MODULE, task.id, {
      kind: existing.kind,
      task,
    });
    await sendTaskActivityNotification(task, user, "respondeu");
    return saved;
  }

  await migrateStoreDocumentsToTasks(d1);
  await repairStoredTaskCreators(d1);
  const existing = await getTaskDocument(d1, input.taskId);
  if (!existing || !canRespondToTask(existing.task, user)) {
    throw new Response("Tarefa nao encontrada ou sem permissao para responder.", { status: 404 });
  }

  const response = responseActivity(input, user, timestamp);
  const responseEvent = activityEvent(`${user.name} respondeu`, user, timestamp);
  const requestedStatus = input.nextStatus ? normalizeTaskStatus(input.nextStatus) : null;
  const statusChanged = Boolean(requestedStatus) && requestedStatus !== existing.task.status;
  const statusTask = statusChanged
    ? applyStatusChange(existing.task, requestedStatus as TaskStatus, user)
    : { ...existing.task, updatedAt: timestamp };
  const statements = [
    d1
      .prepare(
        `INSERT INTO task_responses (id, task_id, author, text, attachments, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        response.id,
        input.taskId,
        response.author,
        response.text,
        JSON.stringify(response.attachments),
        response.timestamp,
      ),
    d1
      .prepare(
        `INSERT INTO task_timeline (id, task_id, timestamp, action, actor, status)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        responseEvent.id,
        input.taskId,
        responseEvent.timestamp,
        responseEvent.action,
        responseEvent.actor,
      ),
    d1
      .prepare(
        `UPDATE tasks
         SET status = ?, completed_at = ?, completed_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        statusTask.status,
        statusTask.completedAt,
        statusTask.completedBy,
        statusTask.updatedAt,
        input.taskId,
      ),
  ];
  if (statusChanged) {
    const statusEvent = statusTask.timeline[0];
    statements.push(
      d1
        .prepare(
          `INSERT INTO task_timeline (id, task_id, timestamp, action, actor, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          statusEvent.id,
          input.taskId,
          statusEvent.timestamp,
          statusEvent.action,
          statusEvent.actor,
          statusEvent.status || null,
        ),
    );
  }
  await d1.batch(statements);

  const saved = (await getTaskDocument(d1, input.taskId)) ?? {
    kind: existing.kind,
    task: { ...statusTask, responses: [response, ...existing.task.responses] },
  };
  await sendTaskActivityNotification(saved.task, user, "respondeu");
  return saved;
}

async function addCommentDocument(input: TaskCommentInput, user: AuthUser) {
  const text = input.text.trim();
  if (!text) throw new Response("Comentario vazio.", { status: 400 });

  const d1 = getOptionalD1();
  const timestamp = nowIso();

  if (!d1) {
    const documents = await listTaskDocumentsLocal(user);
    const existing = documents.find((document) => document.task.id === input.taskId);
    if (!existing || !canSeeTask(existing.task, user)) {
      throw new Response("Tarefa nao encontrada ou sem permissao.", { status: 404 });
    }

    const comment = commentActivity(input, user, timestamp);
    const event = activityEvent(`${user.name} comentou`, user, timestamp);
    const task = {
      ...existing.task,
      comments: [comment, ...existing.task.comments],
      timeline: [event, ...existing.task.timeline],
      updatedAt: timestamp,
    };
    const saved = await upsertStoreDocument(TASKS_MODULE, task.id, {
      kind: existing.kind,
      task,
    });
    await sendTaskActivityNotification(task, user, "comentou");
    return saved;
  }

  await migrateStoreDocumentsToTasks(d1);
  await repairStoredTaskCreators(d1);
  const existing = await getTaskDocument(d1, input.taskId);
  if (!existing || !canSeeTask(existing.task, user)) {
    throw new Response("Tarefa nao encontrada ou sem permissao.", { status: 404 });
  }

  const comment = commentActivity(input, user, timestamp);
  const event = activityEvent(`${user.name} comentou`, user, timestamp);
  await d1.batch([
    d1
      .prepare(
        `INSERT INTO task_comments (id, task_id, author, text, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        comment.id,
        input.taskId,
        comment.author,
        comment.text,
        comment.timestamp,
      ),
    d1
      .prepare(
        `INSERT INTO task_timeline (id, task_id, timestamp, action, actor, status)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .bind(event.id, input.taskId, event.timestamp, event.action, event.actor),
    d1.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").bind(timestamp, input.taskId),
  ]);

  const saved = (await getTaskDocument(d1, input.taskId)) ?? {
    kind: existing.kind,
    task: {
      ...existing.task,
      comments: [comment, ...existing.task.comments],
      timeline: [event, ...existing.task.timeline],
      updatedAt: timestamp,
    },
  };
  await sendTaskActivityNotification(saved.task, user, "comentou");
  return saved;
}

async function deleteDocument(id: string, user: AuthUser) {
  const d1 = getOptionalD1();

  if (!d1) {
    const documents = await listTaskDocumentsLocal(user);
    const existing = documents.find((document) => document.task.id === id);
    if (!existing || !canDeleteTask(existing.task, user)) {
      throw new Response("Tarefa nao encontrada ou sem permissao.", { status: 404 });
    }
    await deleteStoreDocument(TASKS_MODULE, id);
    return { success: true, error: null };
  }

  await migrateStoreDocumentsToTasks(d1);
  const existing = await getTaskDocument(d1, id);
  if (!existing || !canDeleteTask(existing.task, user)) {
    throw new Response("Tarefa nao encontrada ou sem permissao.", { status: 404 });
  }

  const result = await d1.batch([
    d1.prepare("DELETE FROM task_views WHERE task_id = ?").bind(id),
    d1.prepare("DELETE FROM task_recipients WHERE task_id = ?").bind(id),
    d1.prepare("DELETE FROM task_responses WHERE task_id = ?").bind(id),
    d1.prepare("DELETE FROM task_comments WHERE task_id = ?").bind(id),
    d1.prepare("DELETE FROM task_timeline WHERE task_id = ?").bind(id),
    d1.prepare("DELETE FROM tasks WHERE id = ?").bind(id),
  ]);
  const deletedRows = result[result.length - 1]?.meta?.changes ?? 0;
  if (deletedRows === 0) {
    throw new Response("Tarefa nao encontrada ou ja excluida.", { status: 404 });
  }

  await deleteStoreDocument(TASKS_MODULE, id);
  return { success: true, error: null };
}

async function markDocumentViewed(id: string, user: AuthUser) {
  const d1 = getOptionalD1();

  if (!d1) {
    const documents = await listTaskDocumentsLocal(user);
    const existing = documents.find((document) => document.task.id === id);
    if (!existing) throw new Response("Tarefa nao encontrada ou sem permissao.", { status: 404 });

    const { task, changed } = withUserView(existing.task, user);
    if (!changed) return existing;
    const nextDocument: StoredTaskDocument = { kind: existing.kind, task };
    return upsertStoreDocument(TASKS_MODULE, task.id, nextDocument);
  }

  await migrateStoreDocumentsToTasks(d1);
  const existing = await getTaskDocument(d1, id);
  if (!existing || !canSeeTask(existing.task, user)) {
    throw new Response("Tarefa nao encontrada ou sem permissao.", { status: 404 });
  }

  const viewedAt = nowIso();
  const alreadyViewed = hasUserViewedTask(existing.task.viewedBy, user);
  const eventId = `EV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const writes = [
    d1
      .prepare(
        `INSERT INTO task_views (task_id, user_id, user_name, viewed_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(task_id, user_id) DO UPDATE SET
           user_name = excluded.user_name,
           viewed_at = excluded.viewed_at`,
      )
      .bind(id, user.id, user.name, viewedAt),
  ];
  if (!alreadyViewed) {
    writes.push(
      d1
        .prepare(
          `INSERT INTO task_timeline (id, task_id, timestamp, action, actor, status)
           VALUES (?, ?, ?, ?, ?, NULL)`,
        )
        .bind(eventId, id, viewedAt, `Visualizado por ${user.name}`, user.name),
    );
  }
  await d1.batch(writes);

  const recipients = resolveTaskRecipientUsers(existing.task);
  const row = await d1.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<TaskRow>();
  if (!row) throw new Response("Tarefa nao encontrada.", { status: 404 });
  const updated = await documentFromRow(d1, row);
  const fullyViewed =
    recipients.length > 0 &&
    recipients.every((recipient) => hasUserViewedTask(updated.task.viewedBy, recipient));
  await d1
    .prepare(
      `UPDATE tasks
       SET updated_at = ?,
           viewed = CASE WHEN ? = 1 THEN 1 ELSE viewed END,
           status = CASE
             WHEN ? = 1 AND status = 'Não visualizado' THEN 'Visualizado'
             ELSE status
           END
       WHERE id = ?`,
    )
    .bind(viewedAt, fullyViewed ? 1 : 0, fullyViewed ? 1 : 0, id)
    .run();

  return (await getTaskDocument(d1, id)) ?? updated;
}

async function changeDocumentStatus(input: TaskStatusChangeInput, user: AuthUser) {
  const d1 = getOptionalD1();
  const nextStatus = normalizeTaskStatus(input.status);

  if (!d1) {
    const documents = await listTaskDocumentsLocal(user);
    const existing = documents.find((document) => document.task.id === input.id);
    if (!existing) throw new Response("Tarefa nao encontrada ou sem permissao.", { status: 404 });
    const task = applyStatusChange(existing.task, nextStatus, user);
    if (task === existing.task) return existing;
    const nextDocument: StoredTaskDocument = { kind: existing.kind, task };
    return upsertStoreDocument(TASKS_MODULE, task.id, nextDocument);
  }

  await migrateStoreDocumentsToTasks(d1);
  const existing = await getTaskDocument(d1, input.id);
  if (!existing || !canSeeTask(existing.task, user)) {
    throw new Response("Tarefa nao encontrada ou sem permissao.", { status: 404 });
  }
  if (existing.task.status === nextStatus) return existing;

  const task = applyStatusChange(existing.task, nextStatus, user);
  const event = task.timeline[0];
  const result = await d1.batch([
    d1
      .prepare(
        `UPDATE tasks
         SET status = ?, completed_at = ?, completed_by = ?, updated_at = ?
         WHERE id = ? AND updated_at = ?`,
      )
      .bind(
        task.status,
        task.completedAt,
        task.completedBy,
        task.updatedAt,
        task.id,
        existing.task.updatedAt,
      ),
    d1
      .prepare(
        `INSERT INTO task_timeline (id, task_id, timestamp, action, actor, status)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM tasks WHERE id = ? AND updated_at = ?)`,
      )
      .bind(
        event.id,
        task.id,
        event.timestamp,
        event.action,
        event.actor,
        event.status || null,
        task.id,
        task.updatedAt,
      ),
  ]);

  if ((result[0].meta?.changes ?? 0) === 0) {
    throw new Response("A tarefa foi atualizada por outro usuário. Tente novamente.", {
      status: 409,
    });
  }

  return (await getTaskDocument(d1, input.id)) ?? { kind: existing.kind, task };
}

export const listTasks = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireServerAuthUser();
  const d1 = getOptionalD1();
  const documents = d1
    ? await listTaskDocumentsFromD1(d1, user)
    : await listTaskDocumentsLocal(user);
  return splitTaskDocuments(documents);
});

export const createTaskDocument = createServerFn({ method: "POST" })
  .inputValidator((document: StoredTaskDocument) => document)
  .handler(async ({ data }) => createDocument(data, await requireServerAuthUser()));

export const updateTaskDocument = createServerFn({ method: "POST" })
  .inputValidator((document: StoredTaskDocument) => document)
  .handler(async ({ data }) => updateDocument(data, await requireServerAuthUser()));

export const addTaskResponseDocument = createServerFn({ method: "POST" })
  .inputValidator((input: TaskResponseInput) => input)
  .handler(async ({ data }) => addResponseDocument(data, await requireServerAuthUser()));

export const addTaskCommentDocument = createServerFn({ method: "POST" })
  .inputValidator((input: TaskCommentInput) => input)
  .handler(async ({ data }) => addCommentDocument(data, await requireServerAuthUser()));

export const deleteTaskDocument = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => deleteDocument(data, await requireServerAuthUser()));

export const markTaskViewedDocument = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => markDocumentViewed(data, await requireServerAuthUser()));

export const changeTaskStatusDocument = createServerFn({ method: "POST" })
  .inputValidator((input: TaskStatusChangeInput) => input)
  .handler(async ({ data }) => changeDocumentStatus(data, await requireServerAuthUser()));
