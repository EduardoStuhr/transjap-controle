import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DbReminder } from "@/db/schema";
import { Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { upsertCachedReminder } from "@/components/calendar/reminder-query-cache";
import { createReminder, updateReminder } from "@/lib/api/reminders";

type CalendarPersonalKind = "reminder" | "event";
type ReminderPriority = DbReminder["priority"];
type ReminderStatus = DbReminder["status"];

type Props = {
  open: boolean;
  onClose: () => void;
  initialDate: string;
  userId: string;
  kind?: CalendarPersonalKind;
  reminder?: DbReminder | null;
  onRemindersChanged: () => Promise<unknown>;
};

function inferKind(reminder: DbReminder | null | undefined, fallback: CalendarPersonalKind) {
  if (reminder?.kind === "event" || reminder?.color === "purple") return "event";
  return fallback;
}

function defaultStatus(kind: CalendarPersonalKind): ReminderStatus {
  return kind === "event" ? "agendado" : "pendente";
}

function defaultPriority(kind: CalendarPersonalKind): ReminderPriority {
  return kind === "event" ? "alta" : "média";
}

function emptyForm(initialDate: string, kind: CalendarPersonalKind) {
  return {
    title: "",
    description: "",
    date: initialDate,
    time: "",
    endTime: "",
    location: "",
    priority: defaultPriority(kind),
    status: defaultStatus(kind),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Tente novamente.";
}

export function ReminderDialog({
  open,
  onClose,
  initialDate,
  userId,
  kind = "reminder",
  reminder,
  onRemindersChanged,
}: Props) {
  const resolvedKind = useMemo(() => inferKind(reminder, kind), [kind, reminder]);
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm(initialDate, resolvedKind));
  const isEditing = Boolean(reminder);
  const isEvent = resolvedKind === "event";

  useEffect(() => {
    if (!open) return;
    const nextKind = inferKind(reminder, kind);
    setForm(
      reminder
        ? {
            title: reminder.title,
            description: reminder.description,
            date: reminder.date,
            time: reminder.time ?? "",
            endTime: reminder.endTime ?? "",
            location: reminder.location ?? "",
            priority: reminder.priority ?? defaultPriority(nextKind),
            status: reminder.status ?? (reminder.completed ? "concluído" : defaultStatus(nextKind)),
          }
        : emptyForm(initialDate, nextKind),
    );
  }, [initialDate, kind, open, reminder]);

  const createMutation = useMutation({
    mutationFn: () =>
      createReminder({
        data: {
          userId,
          kind: resolvedKind,
          title: form.title,
          description: form.description,
          date: form.date,
          time: form.time,
          endTime: form.endTime,
          location: form.location,
          color: isEvent ? "purple" : "green",
          priority: form.priority,
          status: form.status,
        },
      }),
    onSuccess: async (created) => {
      upsertCachedReminder(queryClient, created);
      toast.success(isEvent ? "Evento criado" : "Lembrete criado");
      onClose();
      await onRemindersChanged();
    },
    onError: (error) => {
      toast.error(
        isEvent ? "Não foi possível criar o evento" : "Não foi possível criar o lembrete",
        {
          description: errorMessage(error),
        },
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateReminder({
        data: {
          userId,
          id: reminder?.id ?? "",
          patch: {
            kind: resolvedKind,
            title: form.title,
            description: form.description,
            date: form.date,
            time: form.time || null,
            endTime: form.endTime || null,
            location: form.location,
            color: isEvent ? "purple" : "green",
            priority: form.priority,
            status: form.status,
            completed: form.status === "concluído",
          },
        },
      }),
    onSuccess: async () => {
      if (reminder) {
        upsertCachedReminder(queryClient, {
          ...reminder,
          kind: resolvedKind,
          title: form.title.trim(),
          description: form.description.trim(),
          date: form.date,
          time: form.time || null,
          endTime: form.endTime || null,
          location: form.location.trim(),
          color: isEvent ? "purple" : "green",
          priority: form.priority,
          status: form.status,
          completed: form.status === "concluído",
          updatedAt: new Date().toISOString(),
        });
      }
      toast.success(isEvent ? "Evento atualizado" : "Lembrete atualizado");
      onClose();
      await onRemindersChanged();
    },
    onError: (error) => {
      toast.error(
        isEvent ? "Não foi possível atualizar o evento" : "Não foi possível atualizar o lembrete",
        { description: errorMessage(error) },
      );
    },
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast.error("Informe um título");
      return;
    }
    if (!form.date) {
      toast.error("Informe uma data");
      return;
    }
    if (isEditing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl border-border-low bg-surface-container">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name={isEvent ? "event" : "notifications"} className="text-primary" />
            {isEditing
              ? isEvent
                ? "Editar evento"
                : "Editar lembrete"
              : isEvent
                ? "Novo evento"
                : "Novo lembrete"}
          </DialogTitle>
          <DialogDescription>
            {isEvent
              ? "Eventos importantes ficam destacados em roxo na agenda."
              : "Lembretes pessoais aparecem apenas no seu calendário."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Título
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              className="mt-2 w-full rounded-lg border border-border-low bg-surface-highest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
              placeholder={isEvent ? "Visita técnica" : "Enviar relatório"}
              autoFocus
            />
          </label>

          <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Descrição
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              className="mt-2 min-h-24 w-full resize-none rounded-lg border border-border-low bg-surface-highest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
              placeholder="Detalhes importantes"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Data
              <input
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm((current) => ({ ...current, date: event.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-border-low bg-surface-highest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
              />
            </label>

            <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Início
              <input
                type="time"
                value={form.time}
                onChange={(event) =>
                  setForm((current) => ({ ...current, time: event.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-border-low bg-surface-highest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
              />
            </label>

            <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Fim
              <input
                type="time"
                value={form.endTime}
                onChange={(event) =>
                  setForm((current) => ({ ...current, endTime: event.target.value }))
                }
                disabled={!isEvent}
                className="mt-2 w-full rounded-lg border border-border-low bg-surface-highest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary disabled:opacity-45"
              />
            </label>
          </div>

          {isEvent && (
            <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Local
              <input
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({ ...current, location: event.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-border-low bg-surface-highest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
                placeholder="Escritório, obra, cliente..."
              />
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Prioridade
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value as ReminderPriority,
                  }))
                }
                className="mt-2 w-full rounded-lg border border-border-low bg-surface-highest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
              >
                <option value="baixa">Baixa</option>
                <option value="média">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </label>

            <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as ReminderStatus,
                  }))
                }
                className="mt-2 w-full rounded-lg border border-border-low bg-surface-highest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
              >
                <option value={defaultStatus(resolvedKind)}>{defaultStatus(resolvedKind)}</option>
                <option value="em andamento">em andamento</option>
                <option value="concluído">concluído</option>
              </select>
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={saving}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
