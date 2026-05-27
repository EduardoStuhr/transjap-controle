import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { reminders, type DbReminder, type DbReminderInsert } from "@/db/schema";
import { getOptionalD1 } from "@/lib/cf-env";
import { getCurrentUser } from "@/lib/auth-store";

type ReminderKind = DbReminder["kind"];
type ReminderColor = DbReminder["color"];
type ReminderPriority = DbReminder["priority"];
type ReminderStatus = DbReminder["status"];

type ReminderDraft = {
  userId: string;
  kind?: ReminderKind;
  title: string;
  description?: string;
  date: string;
  time?: string;
  endTime?: string;
  location?: string;
  color?: ReminderColor;
  priority?: ReminderPriority;
  status?: ReminderStatus;
};

type ReminderFilters = {
  userId: string;
  dateFrom?: string;
  dateTo?: string;
};

type ReminderPatch = Partial<{
  kind: ReminderKind;
  title: string;
  description: string;
  date: string;
  time: string | null;
  endTime: string | null;
  location: string;
  color: ReminderColor;
  priority: ReminderPriority;
  status: ReminderStatus;
  completed: boolean;
}>;

const localReminders = new Map<string, DbReminder>();
let remindersSchemaPromise: Promise<void> | null = null;

type TableInfoRow = {
  name: string;
};

function requireUser(userId?: string) {
  const user = getCurrentUser();
  const resolvedUserId = user?.id ?? userId;
  if (!resolvedUserId) throw new Error("Não autenticado");
  return { id: resolvedUserId };
}

function cleanPatch(patch: ReminderPatch): ReminderPatch {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() : value,
    ]),
  ) as ReminderPatch;
}

function sortReminderRows(rows: DbReminder[]) {
  return rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

async function migrateReminderTable(d1: D1Database) {
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'reminder',
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL,
        time TEXT,
        end_time TEXT,
        location TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT 'blue',
        priority TEXT NOT NULL DEFAULT 'média',
        status TEXT NOT NULL DEFAULT 'pendente',
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run();

  const tableInfo = await d1.prepare("PRAGMA table_info(reminders)").all<TableInfoRow>();
  const columns = new Set((tableInfo.results ?? []).map((row) => row.name));
  const additions: Array<[string, string]> = [
    ["kind", "ALTER TABLE reminders ADD COLUMN kind TEXT NOT NULL DEFAULT 'reminder'"],
    ["end_time", "ALTER TABLE reminders ADD COLUMN end_time TEXT"],
    ["location", "ALTER TABLE reminders ADD COLUMN location TEXT NOT NULL DEFAULT ''"],
    ["priority", "ALTER TABLE reminders ADD COLUMN priority TEXT NOT NULL DEFAULT 'média'"],
    ["status", "ALTER TABLE reminders ADD COLUMN status TEXT NOT NULL DEFAULT 'pendente'"],
  ];

  for (const [column, sql] of additions) {
    if (!columns.has(column)) {
      try {
        await d1.prepare(sql).run();
      } catch (error) {
        const updatedInfo = await d1.prepare("PRAGMA table_info(reminders)").all<TableInfoRow>();
        const wasAddedByAnotherRequest = (updatedInfo.results ?? []).some(
          (row) => row.name === column,
        );
        if (!wasAddedByAnotherRequest) throw error;
      }
    }
  }
}

async function ensureReminderTable(d1: D1Database) {
  remindersSchemaPromise ??= migrateReminderTable(d1).catch((error) => {
    remindersSchemaPromise = null;
    throw error;
  });
  await remindersSchemaPromise;
}

export const listReminders = createServerFn({ method: "POST" })
  .inputValidator((args: ReminderFilters) => args)
  .handler(async ({ data }) => {
    const user = requireUser(data.userId);
    const d1 = getOptionalD1();

    if (!d1) {
      return sortReminderRows(
        Array.from(localReminders.values()).filter((row) => {
          if (row.userId !== user.id) return false;
          if (data.dateFrom && row.date < data.dateFrom) return false;
          if (data.dateTo && row.date > data.dateTo) return false;
          return true;
        }),
      );
    }

    await ensureReminderTable(d1);
    const db = getDb(d1);
    const conditions = [eq(reminders.userId, user.id)];
    if (data.dateFrom) conditions.push(gte(reminders.date, data.dateFrom));
    if (data.dateTo) conditions.push(lte(reminders.date, data.dateTo));

    return db
      .select()
      .from(reminders)
      .where(and(...conditions))
      .all();
  });

export const createReminder = createServerFn({ method: "POST" })
  .inputValidator((draft: ReminderDraft) => draft)
  .handler(async ({ data }) => {
    const user = requireUser(data.userId);
    const title = data.title.trim();
    if (!title) throw new Error("Informe um título para o lembrete.");
    if (!data.date) throw new Error("Informe uma data para o lembrete.");

    const d1 = getOptionalD1();
    const now = new Date().toISOString();
    const kind: ReminderKind = data.kind ?? "reminder";
    const row: DbReminder = {
      id: `RM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: user.id,
      kind,
      title,
      description: (data.description ?? "").trim(),
      date: data.date,
      time: data.time || null,
      endTime: data.endTime || null,
      location: (data.location ?? "").trim(),
      color: data.color ?? (kind === "event" ? "purple" : "green"),
      priority: data.priority ?? "média",
      status: data.status ?? "pendente",
      completed: data.status === "concluído",
      createdAt: now,
      updatedAt: now,
    };

    if (!d1) {
      localReminders.set(row.id, row);
      return row;
    }

    await ensureReminderTable(d1);
    const db = getDb(d1);
    await db.insert(reminders).values(row);
    return row;
  });

export const updateReminder = createServerFn({ method: "POST" })
  .inputValidator((args: { userId: string; id: string; patch: ReminderPatch }) => args)
  .handler(async ({ data }) => {
    const user = requireUser(data.userId);
    const patch: Partial<DbReminderInsert> = {
      ...cleanPatch(data.patch),
      updatedAt: new Date().toISOString(),
    };
    const d1 = getOptionalD1();

    if (!d1) {
      const existing = localReminders.get(data.id);
      if (existing?.userId === user.id) {
        localReminders.set(data.id, { ...existing, ...patch });
      }
      return { ok: true };
    }

    await ensureReminderTable(d1);
    const db = getDb(d1);
    await db
      .update(reminders)
      .set(patch)
      .where(and(eq(reminders.id, data.id), eq(reminders.userId, user.id)));
    return { ok: true };
  });

export const deleteReminder = createServerFn({ method: "POST" })
  .inputValidator((args: { userId: string; id: string }) => args)
  .handler(async ({ data }) => {
    const user = requireUser(data.userId);
    const d1 = getOptionalD1();

    if (!d1) {
      const existing = localReminders.get(data.id);
      if (existing?.userId === user.id) localReminders.delete(data.id);
      return { ok: true };
    }

    await ensureReminderTable(d1);
    const db = getDb(d1);
    await db.delete(reminders).where(and(eq(reminders.id, data.id), eq(reminders.userId, user.id)));
    return { ok: true };
  });
