import type { TaskRecord, TimelineEvent } from "@/lib/task-types";

export type UnreadKind = "response" | "comment" | "status";

export type UnreadActivity = {
  kinds: UnreadKind[];
  lastResponseAt?: string;
  lastCommentAt?: string;
  count: number;
};

function timestampValue(value: string | undefined): number {
  if (!value) return 0;

  const parsed = new Date(value).getTime();
  if (!Number.isNaN(parsed)) return parsed;

  const brDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[^\d]+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!brDate) return 0;

  const [, day, month, year, hours = "00", minutes = "00", seconds = "00"] = brDate;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  ).getTime();
}

function newestTimestamp<T extends { timestamp: string }>(entries: T[]): string | undefined {
  return entries.reduce<string | undefined>((newest, entry) => {
    if (!newest || timestampValue(entry.timestamp) > timestampValue(newest)) {
      return entry.timestamp;
    }
    return newest;
  }, undefined);
}

function isStatusChangeEvent(event: TimelineEvent): boolean {
  const action = event.action
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  return (
    action.includes("status") ||
    action.includes("tarefa concluida") ||
    action.includes("tarefa reaberta")
  );
}

/**
 * Returns the activity recorded after this user's most recent task view.
 * Activity authored by the same user is not considered unread for them.
 */
export function getUnreadActivity(
  task: TaskRecord,
  userName: string | null | undefined,
): UnreadActivity {
  const empty: UnreadActivity = { kinds: [], count: 0 };
  if (!userName) return empty;

  const isInvolved =
    task.createdBy === userName ||
    task.assignedTo.includes(userName) ||
    task.assignedTo.includes("Todos");
  if (!isInvolved) return empty;

  const lastSeenMs = timestampValue(task.viewedBy?.[userName]);
  const happenedAfterLastView = (timestamp: string) => timestampValue(timestamp) > lastSeenMs;

  const newResponses = (task.responses ?? []).filter(
    (response) =>
      (response.createdBy || response.author) !== userName &&
      happenedAfterLastView(response.timestamp),
  );
  const newComments = (task.comments ?? []).filter(
    (comment) =>
      (comment.createdBy || comment.author) !== userName &&
      happenedAfterLastView(comment.timestamp),
  );
  const statusChanged = (task.timeline ?? []).some(
    (event) =>
      event.actor !== userName &&
      isStatusChangeEvent(event) &&
      happenedAfterLastView(event.timestamp),
  );

  const kinds: UnreadKind[] = [];
  if (newResponses.length > 0) kinds.push("response");
  if (newComments.length > 0) kinds.push("comment");
  if (statusChanged) kinds.push("status");

  return {
    kinds,
    lastResponseAt: newestTimestamp(newResponses),
    lastCommentAt: newestTimestamp(newComments),
    count: newResponses.length + newComments.length + (statusChanged ? 1 : 0),
  };
}

export function hasUnread(task: TaskRecord, userName: string | null | undefined): boolean {
  return getUnreadActivity(task, userName).count > 0;
}
