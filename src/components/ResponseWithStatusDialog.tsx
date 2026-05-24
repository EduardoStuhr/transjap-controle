import { useEffect, useState } from "react";
import { Icon } from "@/components/AppLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TaskStatus } from "@/lib/task-types";

type StatusChoice = TaskStatus | "manter";

type StatusOption = {
  value: StatusChoice;
  label: string;
  icon: string;
  color: string;
  description: string;
};

const STATUS_OPTIONS: StatusOption[] = [
  {
    value: "Em andamento",
    label: "Em andamento",
    icon: "play_circle",
    color: "text-status-info",
    description: "Comecei a trabalhar nessa tarefa",
  },
  {
    value: "Aguardando peças",
    label: "Aguardando peças",
    icon: "inventory_2",
    color: "text-status-warning",
    description: "Bloqueado esperando peça chegar",
  },
  {
    value: "Aguardando aprovação",
    label: "Aguardando aprovação",
    icon: "hourglass_top",
    color: "text-status-warning",
    description: "Preciso de uma decisão antes de continuar",
  },
  {
    value: "Concluído",
    label: "Concluído",
    icon: "check_circle",
    color: "text-status-success",
    description: "Tarefa finalizada · sai da contagem de prazos",
  },
  {
    value: "manter",
    label: "Manter status atual",
    icon: "edit_note",
    color: "text-on-surface-variant",
    description: "Só responder, sem mudar nada",
  },
];

type Props = {
  open: boolean;
  responseText: string;
  currentStatus: TaskStatus;
  onConfirm: (chosenStatus: StatusChoice) => void;
  onCancel: () => void;
  submitting: boolean;
};

export function ResponseWithStatusDialog({
  open,
  responseText,
  currentStatus,
  onConfirm,
  onCancel,
  submitting,
}: Props) {
  const available = STATUS_OPTIONS.filter((opt) => opt.value !== currentStatus);
  const defaultChoice: StatusChoice =
    available.find((opt) => opt.value === "Em andamento")?.value ??
    available[0]?.value ??
    "manter";
  const [selected, setSelected] = useState<StatusChoice>(defaultChoice);

  useEffect(() => {
    if (open) setSelected(defaultChoice);
  }, [open, defaultChoice]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-black uppercase tracking-wider">
            Como está a tarefa?
          </DialogTitle>
          <DialogDescription className="text-xs">
            Sua resposta + atualização de status em um só passo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="bg-surface-bright/30 rounded p-3 border border-border-low/40">
            <div className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">
              Sua resposta
            </div>
            <p className="text-sm whitespace-pre-wrap line-clamp-3">{responseText}</p>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              Status após enviar
            </div>
            {available.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected === opt.value
                    ? "border-primary bg-primary/10"
                    : "border-border-low hover:bg-surface-bright/30"
                }`}
              >
                <input
                  type="radio"
                  name="status-choice"
                  value={opt.value}
                  checked={selected === opt.value}
                  onChange={() => setSelected(opt.value)}
                  className="mt-1 accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className={`flex items-center gap-2 font-bold text-sm ${opt.color}`}>
                    <Icon name={opt.icon} className="text-base" />
                    {opt.label}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border-low">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => onConfirm(selected)}
            className="gap-2"
          >
            {submitting && <Icon name="progress_activity" className="animate-spin text-base" />}
            Enviar resposta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
