import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { DbReminder } from "@/db/schema";

const REMINDER_QUERY_PREFIX = ["reminders"] as const;

type ReminderRange = {
  from?: unknown;
  to?: unknown;
};

function reminderBelongsToQuery(reminder: DbReminder, queryKey: QueryKey) {
  const [, queryUserId, queryRange] = queryKey;

  if (typeof queryUserId === "string" && queryUserId !== reminder.userId) return false;
  if (!queryRange || typeof queryRange !== "object") return true;

  const range = queryRange as ReminderRange;
  const endDate = reminder.endDate || reminder.date;
  return (
    (typeof range.from !== "string" || endDate >= range.from) &&
    (typeof range.to !== "string" || reminder.date <= range.to)
  );
}

export function upsertCachedReminder(queryClient: QueryClient, nextReminder: DbReminder) {
  const matchingQueries = queryClient.getQueriesData<DbReminder[]>({
    queryKey: REMINDER_QUERY_PREFIX,
  });

  for (const [queryKey, current] of matchingQueries) {
    const withoutReminder = (current ?? []).filter((row) => row.id !== nextReminder.id);
    const nextRows = reminderBelongsToQuery(nextReminder, queryKey)
      ? [nextReminder, ...withoutReminder]
      : withoutReminder;

    if (current || nextRows.length > 0) {
      queryClient.setQueryData<DbReminder[]>(queryKey, nextRows);
    }
  }
}

export function updateCachedReminders(
  queryClient: QueryClient,
  update: (rows: DbReminder[]) => DbReminder[],
) {
  queryClient.setQueriesData<DbReminder[]>({ queryKey: REMINDER_QUERY_PREFIX }, (current) =>
    current ? update(current) : current,
  );
}
