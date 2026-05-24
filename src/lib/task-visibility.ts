import { findUserByName } from "@/lib/auth-users";
import type { AuthUser } from "@/lib/auth-store";
import { resolveRecipients, resolveResponsibleIds } from "@/lib/operational-options";
import type { TaskRecord, TaskStatus } from "@/lib/task-types";

const CREATOR_ID_FIELDS = [
  "createdById",
  "createdByUserId",
  "created_by_user_id",
  "userId",
  "user_id",
] as const;

const CREATOR_NAME_FIELDS = [
  "createdBy",
  "createdByName",
  "created_by",
  "created_by_name",
  "sender",
  "author",
  "requestedBy",
  "requested_by",
] as const;

const RECIPIENT_FIELDS = [
  "assignedTo",
  "assigned_to",
  "recipients",
  "responsaveis",
  "responsáveis",
] as const;

const RESPONSIBLE_ID_FIELDS = ["responsibleIds", "responsible_ids"] as const;

function asTaskRecord(task: TaskRecord): Record<string, unknown> {
  return task as unknown as Record<string, unknown>;
}

function getStringValues(task: TaskRecord, fields: readonly string[]): string[] {
  const source = asTaskRecord(task);
  return fields.flatMap((field) => {
    const value = source[field];
    if (typeof value === "string" && value.trim()) return [value.trim()];
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string => typeof item === "string" && Boolean(item.trim()),
      );
    }
    return [];
  });
}

export function getTaskResponsibleIds(task: TaskRecord): string[] {
  const explicitIds = getStringValues(task, RESPONSIBLE_ID_FIELDS);
  if (explicitIds.length > 0) return Array.from(new Set(explicitIds));
  return resolveResponsibleIds(getTaskRecipientNames(task));
}

export function getTaskCreatorIds(task: TaskRecord): string[] {
  return getStringValues(task, CREATOR_ID_FIELDS);
}

export function getTaskCreatorNames(task: TaskRecord): string[] {
  return getStringValues(task, CREATOR_NAME_FIELDS);
}

export function getTaskRecipientNames(task: TaskRecord): string[] {
  const aliases = getStringValues(task, RECIPIENT_FIELDS);
  return aliases.length > 0 ? Array.from(new Set(aliases)) : task.assignedTo;
}

export function getTaskViewedAt(task: TaskRecord, user: AuthUser | null): string {
  if (!user) return "";
  return task.viewedBy[user.id] || task.viewedBy[user.name] || "";
}

export function getTaskViewedAtForRecipient(task: TaskRecord, recipientName: string): string {
  const recipient = findUserByName(recipientName);
  return (recipient ? task.viewedBy[recipient.id] : "") || task.viewedBy[recipientName] || "";
}

export function hasUserViewedTask(task: TaskRecord, user: AuthUser | null): boolean {
  if (!user) return false;
  if (getTaskViewedAt(task, user)) return true;
  return Object.keys(task.viewedBy).length === 0 && task.viewed;
}

export function isTaskUnreadForUser(task: TaskRecord, user: AuthUser | null): boolean {
  if (!user) return false;
  return canUserSeeTask(task, user) && !hasUserViewedTask(task, user);
}

export function getTaskStatusForUser(task: TaskRecord, user: AuthUser | null): TaskStatus {
  if (task.status !== "Não visualizado" && task.status !== "Visualizado") return task.status;
  return hasUserViewedTask(task, user) ? "Visualizado" : "Não visualizado";
}

/**
 * Tarefas são privadas por envolvimento.
 * Um usuário vê uma tarefa se for o criador OU estiver nos destinatários.
 * Não há hierarquia de role — todos os usuários são tratados de forma igual.
 */
export function canUserSeeTask(task: TaskRecord, user: AuthUser | null): boolean {
  if (!user) return false;

  const creatorIds = getTaskCreatorIds(task);
  const creatorNames = getTaskCreatorNames(task);
  const recipientNames = getTaskRecipientNames(task);

  return (
    creatorIds.includes(user.id) ||
    creatorIds.includes(user.name) ||
    creatorNames.includes(user.name) ||
    creatorNames.includes(user.id) ||
    getTaskResponsibleIds(task).includes(user.id) ||
    resolveRecipients(recipientNames).includes(user.name)
  );
}

export function filterVisibleTasks(tasks: TaskRecord[], user: AuthUser | null): TaskRecord[] {
  return tasks.filter((task) => canUserSeeTask(task, user));
}

export function canUserReceiveTaskNotification(task: TaskRecord, user: AuthUser | null): boolean {
  if (!user) return false;
  return (
    getTaskResponsibleIds(task).includes(user.id) ||
    resolveRecipients(getTaskRecipientNames(task)).includes(user.name)
  );
}

export function filterNotifiableTasks(tasks: TaskRecord[], user: AuthUser | null): TaskRecord[] {
  return tasks.filter((task) => canUserReceiveTaskNotification(task, user));
}

export function getTaskVisibilityLabel(task: TaskRecord): "Privada" | "Compartilhada" {
  const participants = new Set<string>();
  getTaskCreatorIds(task).forEach((id) => participants.add(id));
  getTaskCreatorNames(task).forEach((name) => participants.add(`name:${name}`));
  getTaskResponsibleIds(task).forEach((id) => participants.add(id));
  resolveRecipients(getTaskRecipientNames(task)).forEach((name) =>
    participants.add(`name:${name}`),
  );
  return participants.size <= 1 ? "Privada" : "Compartilhada";
}
