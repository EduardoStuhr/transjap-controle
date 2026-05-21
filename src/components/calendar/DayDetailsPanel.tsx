import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DbReminder } from "@/db/schema";
import { Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ReminderDialog } from "@/components/calendar/ReminderDialog";
import {
  CALENDAR_TYPE_META,
  priorityMeta,
  type CalendarItem,
} from "@/components/calendar/calendar-types";
import { deleteReminder, updateReminder } from "@/lib/api/reminders";

type Props = {
  date: string;
  items: CalendarItem[];
  reminders: DbReminder[];
  userId: string;
  focusedItemId?: string | null;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onEditTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
};

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function fullTime(item: CalendarItem) {
  if (!item.time) return "Sem horário";
  return `${item.time}${item.endTime ? ` - ${item.endTime}` : ""}`;
}

function ItemRow({
  item,
  active,
  onClick,
}: {
  item: CalendarItem;
  active: boolean;
  onClick: () => void;
}) {
  const meta = CALENDAR_TYPE_META[item.type];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-industrial ${meta.bg} ${meta.border} ${
        active ? "ring-1 ring-primary/70" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${meta.color}26`, color: meta.color }}
        >
          <Icon name={meta.icon} className="text-lg" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-black/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
              {meta.label}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold ${priorityMeta(item.priority).className}`}
            >
              {priorityMeta(item.priority).label}
            </span>
          </div>
          <p className="mt-1 truncate font-bold text-on-surface">{item.title}</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {fullTime(item)} · {item.status}
          </p>
        </div>
      </div>
    </button>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}

export function DayDetailsPanel({
  date,
  items,
  reminders,
  userId,
  focusedItemId,
  onClose,
  onOpenTask,
  onCompleteTask,
  onEditTask,
  onDeleteTask,
}: Props) {
  const queryClient = useQueryClient();
  const [activeItemId, setActiveItemId] = useState<string | null>(focusedItemId ?? null);
  const [editingReminder, setEditingReminder] = useState<DbReminder | null>(null);
  const activeItem = useMemo(
    () => items.find((item) => item.id === (activeItemId ?? focusedItemId)) ?? items[0] ?? null,
    [activeItemId, focusedItemId, items],
  );

  const completeMutation = useMutation({
    mutationFn: (item: CalendarItem) =>
      updateReminder({
        data: {
          userId,
          id: item.sourceId,
          patch: {
            completed: !item.completed,
            status: item.completed ? "pendente" : "concluído",
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (item: CalendarItem) =>
      deleteReminder({
        data: {
          userId,
          id: item.sourceId,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      toast.success("Item removido");
    },
  });

  const editPersonalItem = (item: CalendarItem) => {
    const reminder = reminders.find((row) => row.id === item.sourceId);
    if (reminder) setEditingReminder(reminder);
  };

  const deletePersonalItem = (item: CalendarItem) => {
    if (window.confirm("Deseja remover este item?")) deleteMutation.mutate(item);
  };

  const handleComplete = (item: CalendarItem) => {
    if (item.source === "task") {
      onCompleteTask(item.sourceId);
      return;
    }
    completeMutation.mutate(item);
  };

  const handleEdit = (item: CalendarItem) => {
    if (item.source === "task") {
      onEditTask(item.sourceId);
      return;
    }
    editPersonalItem(item);
  };

  const handleDelete = (item: CalendarItem) => {
    if (item.source === "task") {
      onDeleteTask(item.sourceId);
      return;
    }
    deletePersonalItem(item);
  };

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full overflow-y-auto border-border-low bg-surface-container p-0 sm:max-w-2xl">
          <div className="sticky top-0 z-10 border-b border-border-low bg-surface-container/95 p-6 backdrop-blur">
            <SheetHeader className="pr-8">
              <SheetTitle className="text-on-surface">Agenda de {formatDate(date)}</SheetTitle>
              <SheetDescription>
                {items.length} item(ns) entre tarefas, lembretes, eventos e pendências.
              </SheetDescription>
            </SheetHeader>
          </div>

          <div className="grid gap-4 p-6 lg:grid-cols-[260px_1fr]">
            <div className="max-h-[calc(100vh-180px)] space-y-2 overflow-y-auto pr-1">
              {items.length === 0 ? (
                <p className="rounded-xl border border-border-low bg-surface-highest p-4 text-sm text-on-surface-variant">
                  Nenhum item neste dia.
                </p>
              ) : (
                items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    active={item.id === activeItem?.id}
                    onClick={() => setActiveItemId(item.id)}
                  />
                ))
              )}
            </div>

            {activeItem ? (
              <div className="rounded-2xl border border-border-low bg-surface-highest p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-black uppercase tracking-widest ${CALENDAR_TYPE_META[activeItem.type].bg} ${CALENDAR_TYPE_META[activeItem.type].text}`}
                    >
                      <Icon name={CALENDAR_TYPE_META[activeItem.type].icon} className="text-sm" />
                      {CALENDAR_TYPE_META[activeItem.type].label}
                    </span>
                    <h3 className="mt-3 text-xl font-black text-on-surface">{activeItem.title}</h3>
                    {activeItem.description && (
                      <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                        {activeItem.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`rounded px-2 py-1 text-[10px] font-bold ${priorityMeta(activeItem.priority).className}`}
                  >
                    {priorityMeta(activeItem.priority).label}
                  </span>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <DetailBlock label="Horário" value={fullTime(activeItem)} />
                  <DetailBlock label="Status" value={activeItem.status} />
                  <DetailBlock label="Criado por" value={activeItem.createdBy || "Você"} />
                  <DetailBlock label="Responsável" value={activeItem.assignedTo.join(", ")} />
                  <DetailBlock label="Local" value={activeItem.location ?? ""} />
                  <DetailBlock label="Data" value={formatDate(activeItem.date)} />
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {activeItem.source === "task" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenTask(activeItem.sourceId)}
                    >
                      <Icon name="open_in_new" className="text-base" />
                      Abrir
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleComplete(activeItem)}
                    disabled={completeMutation.isPending}
                  >
                    <Icon
                      name={activeItem.completed ? "radio_button_unchecked" : "check_circle"}
                      className="text-base"
                    />
                    {activeItem.completed ? "Reabrir" : "Concluir"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(activeItem)}>
                    <Icon name="edit" className="text-base" />
                    Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(activeItem)}>
                    <Icon name="event_repeat" className="text-base" />
                    Reagendar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-status-error/30 text-status-error hover:bg-status-error/10"
                    onClick={() => handleDelete(activeItem)}
                    disabled={deleteMutation.isPending}
                  >
                    <Icon name="delete" className="text-base" />
                    Excluir
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {editingReminder && (
        <ReminderDialog
          open={Boolean(editingReminder)}
          onClose={() => setEditingReminder(null)}
          initialDate={date}
          userId={userId}
          reminder={editingReminder}
          kind={editingReminder.kind === "event" ? "event" : "reminder"}
        />
      )}
    </>
  );
}
