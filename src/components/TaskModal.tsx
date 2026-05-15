import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/AppLayout";
import { AttachmentUpload, type AttachedFile } from "@/components/AttachmentUpload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskInput,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/task-types";
import {
  ASSIGNMENT_OPTIONS,
  EQUIPMENT_OPTIONS,
  SECTOR_OPTIONS,
  normalizeOption,
} from "@/lib/operational-options";

export interface TaskModalData extends TaskInput {
  title: string;
  description: string;
  sector: string;
  priority: TaskPriority;
  assignedTo: string;
  deadline: string;
  equipment: string;
  status: TaskStatus;
  attachments: AttachedFile[];
}

interface TaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskModalData) => void;
  mode?: "create" | "edit";
  initialData?: Partial<TaskModalData>;
  draftKey?: string;
}

const EMPTY_FORM: TaskModalData = {
  title: "",
  description: "",
  sector: "Operacional",
  priority: "Média",
  assignedTo: "Todos",
  deadline: "",
  equipment: "Escavadeira CAT 320",
  status: "Não visualizado",
  attachments: [],
};

function normalizeAssignmentData(data: TaskModalData): TaskModalData {
  return {
    ...data,
    assignedTo: normalizeOption(data.assignedTo, ASSIGNMENT_OPTIONS, "Todos"),
    sector: normalizeOption(data.sector, SECTOR_OPTIONS, "Operacional"),
    equipment: normalizeOption(data.equipment, EQUIPMENT_OPTIONS, "Escavadeira CAT 320"),
  };
}

function safeReadDraft(key: string | undefined): Partial<TaskModalData> | null {
  if (!key || typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeWriteDraft(key: string | undefined, data: TaskModalData) {
  if (!key || typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(data));
}

function safeClearDraft(key: string | undefined) {
  if (!key || typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

export function TaskModal({
  open,
  onOpenChange,
  onSubmit,
  mode = "create",
  initialData,
  draftKey,
}: TaskModalProps) {
  const initialFormData = useMemo<TaskModalData>(
    () => ({
      ...EMPTY_FORM,
      ...initialData,
      attachments: initialData?.attachments ?? [],
    }),
    [initialData],
  );

  const [formData, setFormData] = useState<TaskModalData>(initialFormData);

  const [activeTab, setActiveTab] = useState("details");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormData(normalizeAssignmentData({ ...initialFormData, ...safeReadDraft(draftKey) }));
    setActiveTab("details");
  }, [draftKey, initialFormData, open]);

  useEffect(() => {
    if (!open) return;
    safeWriteDraft(draftKey, formData);
  }, [draftKey, formData, open]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCancel = () => {
    safeClearDraft(draftKey);
    onOpenChange(false);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error("Erro", { description: "Título da tarefa é obrigatório." });
      return;
    }

    setIsSubmitting(true);
    try {
      onSubmit(formData);
      safeClearDraft(draftKey);
      toast.success(mode === "create" ? "Tarefa criada" : "Tarefa atualizada", {
        description: formData.title,
      });
      onOpenChange(false);
      setFormData(EMPTY_FORM);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon
                name={mode === "create" ? "add_task" : "edit_task"}
                className="text-primary text-2xl"
              />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black tracking-tight uppercase">
                {mode === "create" ? "Nova Tarefa" : "Editar Tarefa"}
              </DialogTitle>
              <DialogDescription className="text-sm text-on-surface-variant">
                {mode === "create"
                  ? "Crie uma nova tarefa com detalhes, prazos e anexos"
                  : "Atualize os detalhes da tarefa"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details" className="flex items-center gap-2">
              <Icon name="info" className="text-base" />
              <span className="hidden sm:inline">Detalhes</span>
            </TabsTrigger>
            <TabsTrigger value="assignment" className="flex items-center gap-2">
              <Icon name="assignment" className="text-base" />
              <span className="hidden sm:inline">Atribuição</span>
            </TabsTrigger>
            <TabsTrigger value="attachments" className="flex items-center gap-2">
              <Icon name="attach_file" className="text-base" />
              <span className="hidden sm:inline">Anexos</span>
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            {/* DETAILS TAB */}
            <TabsContent value="details" className="space-y-5">
              <div>
                <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2 block">
                  <Icon name="title" className="inline text-base mr-1" />
                  Título da Tarefa *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Ex: Revisar sistema hidráulico da escavadeira"
                  className="w-full px-4 py-3 bg-surface-highest border border-border-low rounded-lg text-on-surface placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial text-base font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2 block">
                  <Icon name="description" className="inline text-base mr-1" />
                  Descrição Detalhada
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Explique os detalhes, contexto, e qualquer informação importante para execução da tarefa..."
                  rows={6}
                  className="w-full px-4 py-3 bg-surface-highest border border-border-low rounded-lg text-on-surface placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial font-medium resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2 block">
                    <Icon name="precision_manufacturing" className="inline text-base mr-1" />
                    Equipamento
                  </label>
                  <select
                    name="equipment"
                    value={formData.equipment}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-surface-highest border border-border-low rounded-lg text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial"
                  >
                    {EQUIPMENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2 block">
                    <Icon name="calendar_today" className="inline text-base mr-1" />
                    Data Limite
                  </label>
                  <input
                    type="date"
                    name="deadline"
                    value={formData.deadline}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-surface-highest border border-border-low rounded-lg text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2 block">
                    <Icon name="priority_high" className="inline text-base mr-1" />
                    Prioridade
                  </label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-surface-highest border border-border-low rounded-lg text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial"
                  >
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2 block">
                    <Icon name="task_alt" className="inline text-base mr-1" />
                    Status
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-surface-highest border border-border-low rounded-lg text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </TabsContent>

            {/* ASSIGNMENT TAB */}
            <TabsContent value="assignment" className="space-y-5">
              <div>
                <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2 block">
                  <Icon name="group" className="inline text-base mr-1" />
                  Atribuir a
                </label>
                <select
                  name="assignedTo"
                  value={formData.assignedTo}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-surface-highest border border-border-low rounded-lg text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial"
                >
                  {ASSIGNMENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2 block">
                  <Icon name="domain" className="inline text-base mr-1" />
                  Setor/Departamento
                </label>
                <select
                  name="sector"
                  value={formData.sector}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-surface-highest border border-border-low rounded-lg text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial"
                >
                  {SECTOR_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-surface-highest/50 border border-border-low rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Icon name="info" className="text-primary text-lg" />
                  <p className="text-sm font-bold text-on-surface">Resumo da Atribuição</p>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-on-surface-variant font-semibold">Responsável:</dt>
                    <dd className="text-on-surface font-bold">{formData.assignedTo}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-on-surface-variant font-semibold">Setor:</dt>
                    <dd className="text-on-surface font-bold">{formData.sector}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-on-surface-variant font-semibold">Prazo:</dt>
                    <dd className="text-on-surface font-bold">
                      {formData.deadline || "Sem prazo"}
                    </dd>
                  </div>
                </dl>
              </div>
            </TabsContent>

            {/* ATTACHMENTS TAB */}
            <TabsContent value="attachments" className="space-y-5">
              <AttachmentUpload
                files={formData.attachments}
                onFilesChange={(attachments) => setFormData((prev) => ({ ...prev, attachments }))}
                maxFiles={10}
                maxSize={50}
              />
            </TabsContent>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-6 border-t border-border-low">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="flex-1"
              >
                <Icon name="close" />
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 font-black shadow-industrial"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/20 border-t-primary-foreground animate-spin mr-2" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Icon name={mode === "create" ? "add" : "save"} />
                    {mode === "create" ? "Criar Tarefa" : "Atualizar"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
