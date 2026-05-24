import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/AppLayout";
import { formatTaskCompletionLabel, type TaskRecord, type TaskStatus } from "@/lib/task-types";

const IN_PROGRESS: TaskStatus = "Em andamento";
const COMPLETED: TaskStatus = "Concluído";
const OTHER_STATUSES: TaskStatus[] = ["Aguardando peças", "Aguardando aprovação"];

type Props = {
  task: TaskRecord;
  canChange: boolean;
  onChangeStatus: (taskId: string, status: TaskStatus) => void | Promise<unknown>;
};

export function TaskStatusControls({ task, canChange, onChangeStatus }: Props) {
  const [savingStatus, setSavingStatus] = useState<TaskStatus | null>(null);
  const completed = task.status === COMPLETED;
  const completedLabel = completed ? formatTaskCompletionLabel(task) : null;
  const latestStatusEvent = task.timeline.find((event) => Boolean(event.status));
  const reopened =
    !completed &&
    latestStatusEvent?.status === IN_PROGRESS &&
    latestStatusEvent.action.toLowerCase().includes("reaberta");

  const changeStatus = async (status: TaskStatus) => {
    if (task.status === status) return;
    setSavingStatus(status);
    try {
      await onChangeStatus(task.id, status);
      toast.success("Status atualizado", {
        description:
          status === COMPLETED
            ? "Tarefa concluída com sucesso"
            : completed
              ? "Tarefa reaberta com sucesso"
              : `${task.title} agora está como ${status}.`,
      });
    } catch (error) {
      toast.error("Falha ao atualizar status", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSavingStatus(null);
    }
  };

  if (!canChange) return null;

  if (completed) {
    return (
      <div className="animate-fade-in flex flex-col gap-3 rounded-lg border border-status-success/30 bg-status-success/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon name="check_circle" className="text-status-success text-xl" />
          <div>
            <p className="text-sm font-black text-status-success">
              Tarefa concluída - Saiu da contagem de prazos críticos
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              {completedLabel}
              {task.completedBy ? ` por ${task.completedBy}` : ""}. A tarefa não aparece mais nos
              alertas críticos.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 border-status-success/40 text-status-success hover:bg-status-success/10"
          disabled={savingStatus === IN_PROGRESS}
          onClick={() => void changeStatus(IN_PROGRESS)}
        >
          <Icon
            name={savingStatus === IN_PROGRESS ? "progress_activity" : "replay"}
            className={`text-base ${savingStatus === IN_PROGRESS ? "animate-spin" : ""}`}
          />
          Reabrir
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reopened && (
        <div className="animate-fade-in rounded-lg border border-status-info/30 bg-status-info/10 p-4">
          <p className="flex items-center gap-2 text-sm font-black text-status-info">
            <Icon name="replay" className="text-xl" />
            Tarefa reaberta - Voltou para acompanhamento operacional
          </p>
          <p className="mt-1 pl-7 text-xs text-on-surface-variant">
            Atualizada por {latestStatusEvent?.actor || "Sistema"}.
          </p>
        </div>
      )}
      <div className="rounded-lg border border-border-low bg-surface-highest/40 p-4">
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
          Atualizar status
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {task.status !== IN_PROGRESS && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="justify-start border-status-info/30 text-status-info hover:bg-status-info/10"
              disabled={savingStatus === IN_PROGRESS}
              onClick={() => void changeStatus(IN_PROGRESS)}
            >
              <Icon
                name={savingStatus === IN_PROGRESS ? "progress_activity" : "radio_button_checked"}
                className={`text-base ${savingStatus === IN_PROGRESS ? "animate-spin" : ""}`}
              />
              Marcar como Em Andamento
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="justify-start border-status-success/30 text-status-success hover:bg-status-success/10"
            disabled={savingStatus === COMPLETED}
            onClick={() => void changeStatus(COMPLETED)}
          >
            <Icon
              name={savingStatus === COMPLETED ? "progress_activity" : "check_circle"}
              className={`text-base ${savingStatus === COMPLETED ? "animate-spin" : ""}`}
            />
            Marcar como Concluído
          </Button>

          <label className="relative min-w-52">
            <span className="sr-only">Outro status</span>
            <select
              value=""
              disabled={Boolean(savingStatus)}
              onChange={(event) => {
                const status = event.target.value as TaskStatus;
                if (status) void changeStatus(status);
              }}
              className="h-9 w-full rounded-md border border-border-low bg-surface-highest px-3 pr-9 text-sm font-bold text-on-surface outline-none transition-colors hover:border-primary/50 focus:border-primary"
            >
              <option value="" disabled>
                Outro status
              </option>
              {OTHER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <Icon
              name="expand_more"
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base text-on-surface-variant"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
