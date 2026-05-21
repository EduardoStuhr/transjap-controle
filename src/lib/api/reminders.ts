import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { reminders, type DbReminder } from "@/db/schema";
import { getOptionalD1 } from "@/lib/cf-env";
import { getCurrentUser } from "@/lib/auth-store";

type ReminderDraft = {
  userId: string;
  kind?: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  endTime?: string;
  location?: string;
  color?: string;
  priority?: string;
  status?: string;
};

type ReminderFilters = {
  userId: string;
  dateFrom?: string;
  dateTo?: string;
};

type ReminderPatch = Partial<{
  kind: string;
  title: string;
  description: string;
  date: string;
  time: string | null;
  endTime: string | null;
  location: string;
  color: string;
  priority: string;
  status: string;
  completed: boolean;
}>;

const localReminders = new Map<string, DbReminder>();

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

export const listReminders = createServerFn({ method: "GET" })
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
    const row = {
      id: `RM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: user.id,
      kind: data.kind || "reminder",
      title,
      description: (data.description ?? "").trim(),
      date: data.date,
      time: data.time || null,
      endTime: data.endTime || null,
      location: (data.location ?? "").trim(),
      color: data.color || (data.kind === "event" ? "purple" : "green"),
      priority: data.priority || "média",
      status: data.status || "pendente",
      completed: false,
      createdAt: now,
      updatedAt: now,
    };

    if (!d1) {
      localReminders.set(row.id, row);
      return row;
    }

    const db = getDb(d1);
    await db.insert(reminders).values(row);
    return row;
  });

export const updateReminder = createServerFn({ method: "POST" })
  .inputValidator((args: { userId: string; id: string; patch: ReminderPatch }) => args)
  .handler(async ({ data }) => {
    const user = requireUser(data.userId);
    const patch = {
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

    const db = getDb(d1);
    await db.delete(reminders).where(and(eq(reminders.id, data.id), eq(reminders.userId, user.id)));
    return { ok: true };
  });
