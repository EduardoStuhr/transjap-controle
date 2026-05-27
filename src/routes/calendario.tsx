import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DbReminder } from "@/db/schema";
import { AppLayout, Icon } from "@/components/AppLayout";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { DayDetailsPanel } from "@/components/calendar/DayDetailsPanel";
import { ReminderDialog } from "@/components/calendar/ReminderDialog";
import {
  CALENDAR_TYPE_META,
  type CalendarFilter,
  type CalendarItem,
  type CalendarViewMode,
} from "@/components/calendar/calendar-types";
import { Button } from "@/components/ui/button";
import { listReminders } from "@/lib/api/reminders";
import { useAuthStore } from "@/lib/auth-store";
import { useTaskActions, useTaskStore } from "@/lib/task-store";
import { filterVisibleTasks } from "@/lib/task-visibility";
import {
  formatTaskCompletionLabel,
  isTaskCompletedStatus,
  type TaskRecord,
  type TaskStatus,
} from "@/lib/task-types";

export const Route = createFileRoute("/calendario")({
  component: CalendarPage,
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Tente novamente.";
}

const FILTERS: Array<{ id: CalendarFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "received", label: "Recebidas" },
  { id: "created", label: "Criadas por mim" },
  { id: "reminders", label: "Lembretes" },
  { id: "events", label: "Eventos" },
  { id: "overdue", label: "Atrasadas" },
];

const VIEW_MODES: Array<{ id: CalendarViewMode; label: string }> = [
  { id: "month", label: "Mês" },
  { id: "week", label: "Semana" },
  { id: "day", label: "Dia" },
];

function toUtcNoon(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date: Date) {
  const value = toUtcNoon(date);
  value.setUTCDate(value.getUTCDate() - value.getUTCDay());
  return value;
}

function rangeFor(date: Date, viewMode: CalendarViewMode) {
  if (viewMode === "day") {
    const day = isoDate(toUtcNoon(date));
    return { from: day, to: day };
  }

  if (viewMode === "week") {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { from: isoDate(start), to: isoDate(end) };
  }

  const start = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1, 12));
  const end = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0, 12));
  return { from: isoDate(start), to: isoDate(end) };
}

function periodLabel(date: Date, viewMode: CalendarViewMode) {
  if (viewMode === "month") {
    const value = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  if (viewMode === "day") {
    return date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }
  const range = rangeFor(date, "week");
  return `${range.from.split("-").reverse().join("/")} - ${range.to.split("-").reverse().join("/")}`;
}

function isReminderComplete(reminder: DbReminder) {
  return reminder.completed || reminder.status === "concluído";
}

function isOverdue(date: string, completed: boolean) {
  return !completed && date < todayIso();
}

function taskTime(deadline: string) {
  return deadline.includes("T") ? deadline.slice(11, 16) : "";
}

function reminderKind(reminder: DbReminder) {
  return reminder.kind === "event" || reminder.color === "purple" ? "event" : "reminder";
}

function taskToCalendarItem(task: TaskRecord, currentUserName: string): CalendarItem | null {
  const date = task.deadline?.slice(0, 10);
  if (!date) return null;
  const mine = task.createdBy === currentUserName;
  const completed = isTaskCompletedStatus(task.status);
  const baseType = mine ? "created_task" : "received_task";
  return {
    id: `task-${task.id}`,
    sourceId: task.id,
    source: "task",
    title: task.title,
    type: completed ? "completed_task" : isOverdue(date, completed) ? "overdue" : baseType,
    originalType: baseType,
    date,
    time: taskTime(task.deadline),
    status: completed ? "Concluído" : task.status,
    priority: task.priority.toLowerCase(),
    createdBy: task.createdBy || "Sistema",
    assignedTo: task.assignedTo,
    description: task.description,
    completed,
    completionLabel: completed ? formatTaskCompletionLabel(task) : undefined,
  };
}

function reminderToCalendarItem(reminder: DbReminder): CalendarItem {
  const completed = isReminderComplete(reminder);
  const kind = reminderKind(reminder);
  return {
    id: `reminder-${reminder.id}`,
    sourceId: reminder.id,
    source: "reminder",
    title: reminder.title,
    type: isOverdue(reminder.date, completed) ? "overdue" : kind,
    originalType: kind,
    date: reminder.date,
    time: reminder.time ?? "",
    endTime: reminder.endTime ?? "",
    status: completed ? "concluído" : reminder.status || "pendente",
    priority: reminder.priority || (kind === "event" ? "alta" : "média"),
    createdBy: "Você",
    assignedTo: [],
    description: reminder.description,
    location: reminder.location,
    completed,
  };
}

function matchesFilter(item: CalendarItem, filter: CalendarFilter) {
  if (filter === "all") return true;
  if (filter === "received")
    return item.originalType === "received_task" && item.type === "received_task";
  if (filter === "created")
    return item.originalType === "created_task" && item.type === "created_task";
  if (filter === "reminders") return item.originalType === "reminder" && item.type !== "overdue";
  if (filter === "events") return item.originalType === "event" && item.type !== "overdue";
  return item.type === "overdue";
}

function matchesSearch(item: CalendarItem, search: string) {
  if (!search.trim()) return true;
  const needle = search.trim().toLowerCase();
  return [
    item.title,
    item.description,
    item.createdBy,
    item.assignedTo.join(" "),
    item.location ?? "",
    item.status,
    item.priority,
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function itemSort(a: CalendarItem, b: CalendarItem) {
  return (
    a.date.localeCompare(b.date) ||
    (a.time || "99:99").localeCompare(b.time || "99:99") ||
    a.title.localeCompare(b.title)
  );
}

function CalendarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((snapshot) => snapshot.user);
  const taskActions = useTaskActions();
  const tasks = useTaskStore((snapshot) => snapshot.tasks);
  const [anchorDate, setAnchorDate] = useState(toUtcNoon(new Date()));
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [filter, setFilter] = useState<CalendarFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [personalDialogKind, setPersonalDialogKind] = useState<"reminder" | "event" | null>(null);

  const currentRange = useMemo(() => rangeFor(anchorDate, viewMode), [anchorDate, viewMode]);

  const { data: reminders = [], refetch: refetchReminders } = useQuery({
    queryKey: ["reminders", user?.id, currentRange],
    queryFn: () =>
      listReminders({
        data: {
          userId: user?.id ?? "",
          dateFrom: currentRange.from,
          dateTo: currentRange.to,
        },
      }),
    enabled: Boolean(user?.id),
  });

  const syncVisibleReminders = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["reminders"],
      refetchType: "none",
    });
    await refetchReminders();
  };

  const visibleTasks = useMemo(
    () => filterVisibleTasks(tasks, user).filter((task) => task.deadline),
    [tasks, user],
  );

  const allItems = useMemo(() => {
    const taskItems = visibleTasks
      .map((task) => taskToCalendarItem(task, user?.name ?? ""))
      .filter((item): item is CalendarItem => Boolean(item));
    const reminderItems = reminders.map(reminderToCalendarItem);
    return [...taskItems, ...reminderItems].sort(itemSort);
  }, [reminders, user?.name, visibleTasks]);

  const filteredItems = useMemo(
    () => allItems.filter((item) => matchesFilter(item, filter) && matchesSearch(item, search)),
    [allItems, filter, search],
  );

  const selectedItems = useMemo(
    () => filteredItems.filter((item) => item.date === selectedDay),
    [filteredItems, selectedDay],
  );

  const counts = useMemo(() => {
    return {
      received: allItems.filter(
        (item) => item.originalType === "received_task" && item.type === "received_task",
      ).length,
      created: allItems.filter(
        (item) => item.originalType === "created_task" && item.type === "created_task",
      ).length,
      reminders: allItems.filter(
        (item) => item.originalType === "reminder" && item.type !== "overdue",
      ).length,
      events: allItems.filter((item) => item.originalType === "event" && item.type !== "overdue")
        .length,
      overdue: allItems.filter((item) => item.type === "overdue").length,
    };
  }, [allItems]);

  const movePeriod = (direction: -1 | 1) => {
    setAnchorDate((current) => {
      const next = new Date(current);
      if (viewMode === "month") next.setUTCMonth(current.getUTCMonth() + direction);
      if (viewMode === "week") next.setUTCDate(current.getUTCDate() + direction * 7);
      if (viewMode === "day") next.setUTCDate(current.getUTCDate() + direction);
      return next;
    });
    setSelectedDay(null);
    setFocusedItemId(null);
  };

  const goToday = () => {
    const today = toUtcNoon(new Date());
    setAnchorDate(today);
    setSelectedDay(isoDate(today));
    setFocusedItemId(null);
  };

  const openTask = (taskId: string) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("transjap:open-task-id", taskId);
    }
    navigate({ to: "/agenda" });
  };

  const editTask = (taskId: string) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("transjap:edit-task-id", taskId);
    }
    navigate({ to: "/agenda" });
  };

  const createTask = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("transjap:create-task", "1");
    }
    navigate({ to: "/agenda" });
  };

  const completeTask = async (taskId: string) => {
    const task = visibleTasks.find((item) => item.id === taskId);
    if (!task) return;
    const nextStatus: TaskStatus = isTaskCompletedStatus(task.status)
      ? "Em andamento"
      : "Concluído";
    await taskActions.changeTaskStatus(taskId, nextStatus);
    toast.success(nextStatus === "Concluído" ? "Tarefa concluída" : "Tarefa reaberta");
  };

  const deleteTask = async (taskId: string) => {
    if (!window.confirm("Deseja excluir esta tarefa?")) return;
    try {
      await taskActions.removeTask(taskId);
      toast.success("Tarefa excluída");
    } catch (error) {
      toast.error("Falha ao excluir tarefa", { description: getErrorMessage(error) });
    }
  };

  const selectItem = (item: CalendarItem) => {
    setSelectedDay(item.date);
    setFocusedItemId(item.id);
  };

  return (
    <AppLayout>
      <div className="mb-5 overflow-hidden rounded-2xl border border-border-low bg-surface-container shadow-industrial">
        <div className="border-b border-border-low bg-gradient-to-r from-primary/12 via-surface-container to-surface-container p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                Agenda operacional
              </span>
              <h1 className="mt-1 text-3xl font-black uppercase tracking-tight">Calendário</h1>
              <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
                Tarefas recebidas, tarefas criadas por você, lembretes pessoais, eventos e
                pendências atrasadas em uma agenda única.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setPersonalDialogKind("reminder")}>
                <Icon name="notifications" />
                Novo lembrete
              </Button>
              <Button variant="outline" onClick={createTask}>
                <Icon name="add_task" />
                Nova tarefa
              </Button>
              <Button onClick={() => setPersonalDialogKind("event")}>
                <Icon name="event" />
                Novo evento
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => movePeriod(-1)}>
              <Icon name="chevron_left" className="text-base" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>
              Hoje
            </Button>
            <Button variant="outline" size="sm" onClick={() => movePeriod(1)}>
              <Icon name="chevron_right" className="text-base" />
            </Button>
            <h2 className="ml-1 text-lg font-black uppercase tracking-tight">
              {periodLabel(anchorDate, viewMode)}
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setViewMode(mode.id)}
                className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                  viewMode === mode.id
                    ? "bg-primary text-on-primary"
                    : "bg-surface-highest text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 border-t border-border-low p-4 xl:grid-cols-[1fr_320px]">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                  filter === item.id
                    ? "border-primary bg-primary text-on-primary"
                    : "border-border-low bg-surface-highest text-on-surface-variant hover:border-primary/50 hover:text-on-surface"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="relative block">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar título, descrição, responsável..."
              className="w-full rounded-lg border border-border-low bg-surface-highest py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
            />
          </label>
        </div>

        <div className="grid gap-3 border-t border-border-low p-4 sm:grid-cols-5">
          {[
            ["Recebidas", counts.received, "received_task"],
            ["Criadas", counts.created, "created_task"],
            ["Lembretes", counts.reminders, "reminder"],
            ["Eventos", counts.events, "event"],
            ["Atrasadas", counts.overdue, "overdue"],
          ].map(([label, count, type]) => {
            const meta = CALENDAR_TYPE_META[type as keyof typeof CALENDAR_TYPE_META];
            return (
              <div
                key={String(label)}
                className={`rounded-xl border p-3 ${meta.bg} ${meta.border}`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-black" style={{ color: meta.color }}>
                  {count}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {selectedDay && user && selectedItems.length > 0 ? (
        <div className="grid gap-4 items-start lg:grid-cols-[1fr_minmax(320px,460px)]">
          <div className="min-w-0">
            <CalendarGrid
              anchorDate={anchorDate}
              viewMode={viewMode}
              items={filteredItems}
              selectedDate={selectedDay}
              onSelectDay={(date) => {
                setSelectedDay(date);
                setFocusedItemId(null);
              }}
              onSelectItem={selectItem}
            />
          </div>
          <div className="min-w-0 lg:sticky lg:top-4">
            <DayDetailsPanel
              date={selectedDay}
              items={selectedItems}
              reminders={reminders}
              userId={user.id}
              focusedItemId={focusedItemId}
              onRemindersChanged={syncVisibleReminders}
              onClose={() => {
                setSelectedDay(null);
                setFocusedItemId(null);
              }}
              onOpenTask={openTask}
              onCompleteTask={completeTask}
              onEditTask={editTask}
              onDeleteTask={deleteTask}
            />
          </div>
        </div>
      ) : (
        <CalendarGrid
          anchorDate={anchorDate}
          viewMode={viewMode}
          items={filteredItems}
          selectedDate={selectedDay}
          onSelectDay={(date) => {
            setSelectedDay(date);
            setFocusedItemId(null);
          }}
          onSelectItem={selectItem}
        />
      )}

      {user && personalDialogKind && (
        <ReminderDialog
          open={Boolean(personalDialogKind)}
          onClose={() => setPersonalDialogKind(null)}
          initialDate={selectedDay ?? todayIso()}
          userId={user.id}
          kind={personalDialogKind}
          onRemindersChanged={syncVisibleReminders}
        />
      )}
    </AppLayout>
  );
}
