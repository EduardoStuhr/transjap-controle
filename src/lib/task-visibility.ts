import { findUserByName, isAdminUser } from "@/lib/auth-users";
import type { AuthUser } from "@/lib/auth-store";
import { resolveRecipients, resolveResponsibleIds } from "@/lib/operational-options";
import type { TaskRecord, TaskStatus } from "@/lib/task-types";

const ADMIN_CAN_VIEW_ALL_TASKS = false;

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
const SHARED_USER_FIELDS = ["sharedWith", "shared_with", "viewers"] as const;

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

export function getTaskSharedUsers(task: TaskRecord): string[] {
  return Array.from(new Set(getStringValues(task, SHARED_USER_FIELDS)));
}

export function canAdminViewAllTasks(user: AuthUser | null): boolean {
  return ADMIN_CAN_VIEW_ALL_TASKS && isAdminUser(user);
}

export function getTaskVisibleReason(task: TaskRecord, user: AuthUser | null): string | null {
  if (!user) return null;

  const creatorIds = getTaskCreatorIds(task);
  if (creatorIds.includes(user.id)) return "createdById";
  if (creatorIds.includes(user.name)) return "createdById:nameFallback";

  const creatorNames = getTaskCreatorNames(task);
  if (creatorNames.includes(user.name)) return "createdBy";
  if (creatorNames.includes(user.id)) return "createdBy:idFallback";

  const responsibleIds = getTaskResponsibleIds(task);
  if (responsibleIds.includes(user.id)) return "responsibleIds";

  const recipientNames = getTaskRecipientNames(task);
  if (recipientNames.includes(user.name)) return "assignedTo";
  if (recipientNames.includes(user.id)) return "assignedTo:idFallback";
  if (resolveRecipients(recipientNames).includes(user.name)) {
    return recipientNames.includes("Todos") ? "assignedTo:Todos" : "recipientResolved";
  }

  const sharedUsers = getTaskSharedUsers(task);
  if (sharedUsers.includes(user.id)) return "sharedWith";
  if (sharedUsers.includes(user.name)) return "sharedWith";

  if (canAdminViewAllTasks(user)) return "adminAuthorized";

  return null;
}

export function getTaskViewedAt(task: TaskRecord, user: AuthUser | null): string {
  if (!user) return "";
  return task.viewedBy[user.id] || task.viewedBy[user.name] || "";
}

export function getTaskViewedAtForRecipient(task: TaskRecord, recipientName: string): string {
  const recipient = findUserByName(recipientName);
  if (
    task.createdBy === recipientName ||
    Boolean(recipient && task.createdById === recipient.id)
  ) {
    return "";
  }
  return (recipient ? task.viewedBy[recipient.id] : "") || task.viewedBy[recipientName] || "";
}

export function hasUserViewedTask(task: TaskRecord, user: AuthUser | null): boolean {
  if (!user) return false;
  if (getTaskCreatorIds(task).includes(user.id) || getTaskCreatorNames(task).includes(user.name)) {
    return false;
  }
  return Boolean(getTaskViewedAt(task, user));
}

function hasRecipientViewedTask(task: TaskRecord): boolean {
  if (task.viewed) return true;

  return getTaskRecipientNames(task).some((recipientName) =>
    Boolean(getTaskViewedAtForRecipient(task, recipientName)),
  );
}

export function isUserTaskRecipient(task: TaskRecord, user: AuthUser | null): boolean {
  if (!user) return false;
  if (getTaskCreatorIds(task).includes(user.id) || getTaskCreatorNames(task).includes(user.name)) {
    return false;
  }

  const recipientNames = getTaskRecipientNames(task);
  return (
    getTaskResponsibleIds(task).includes(user.id) ||
    recipientNames.includes(user.name) ||
    recipientNames.includes(user.id) ||
    resolveRecipients(recipientNames).includes(user.name) ||
    getTaskSharedUsers(task).includes(user.id) ||
    getTaskSharedUsers(task).includes(user.name)
  );
}

export function isTaskUnreadForUser(task: TaskRecord, user: AuthUser | null): boolean {
  if (!user) return false;
  return canUserSeeTask(task, user) && !hasUserViewedTask(task, user);
}

export function getTaskStatusForUser(task: TaskRecord, user: AuthUser | null): TaskStatus {
  if (task.status !== "Não visualizado" && task.status !== "Visualizado") return task.status;
  return task.status === "Visualizado" ||
    hasRecipientViewedTask(task) ||
    hasUserViewedTask(task, user)
    ? "Visualizado"
    : "Não visualizado";
}

/**
 * Tarefas são privadas por envolvimento.
 * Um usuário vê uma tarefa se for o criador OU estiver nos destinatários.
 * Admin não tem acesso global neste módulo enquanto ADMIN_CAN_VIEW_ALL_TASKS estiver false.
 */
export function canUserSeeTask(task: TaskRecord, user: AuthUser | null): boolean {
  return Boolean(getTaskVisibleReason(task, user));
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
  getTaskSharedUsers(task).forEach((value) => participants.add(value));
  resolveRecipients(getTaskRecipientNames(task)).forEach((name) =>
    participants.add(`name:${name}`),
  );
  return participants.size <= 1 ? "Privada" : "Compartilhada";
}
