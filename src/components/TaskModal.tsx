import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/AppLayout";
import { AttachmentUpload, type AttachedFile } from "@/components/AttachmentUpload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface TaskModalData {
  title: string;
  description: string;
  sector: string;
  priority: string;
  assignedTo: string;
  deadline: string;
  equipment: string;
  status: string;
  comments: string;
  attachments: AttachedFile[];
}

interface TaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskModalData) => void;
  mode?: "create" | "edit";
  initialData?: Partial<TaskModalData>;
}

const SECTORS = [
  "Operacional",
  "Manutenção",
  "Almoxarifado",
  "Administrativo",
  "Fleet Management",
];

const PRIORITIES = ["Baixa", "Média", "Alta", "Urgente"];

const STATUSES = [
  "Não visualizado",
  "Visualizado",
  "Em andamento",
  "Aguardando peças",
  "Aguardando aprovação",
  "Concluído",
  "Atrasado",
];

const EQUIPMENT = [
  "—",
  "Escavadeira CAT 320",
  "Caminhão Volvo FH-540",
  "Trator Komatsu D61",
  "Pá Carregadeira CAT 950",
  "Empilhadeira Hyster H80",
];

const ASSIGNEES = [
  "Davi",
  "Eduardo",
  "Workshop Team",
  "Fleet Team",
  "Almoxarifado",
  "Operações",
];

export function TaskModal({
  open,
  onOpenChange,
  onSubmit,
  mode = "create",
  initialData,
}: TaskModalProps) {
  const [formData, setFormData] = useState<TaskModalData>({
    title: initialData?.title ?? "",
    description: initialData?.description ?? "",
    sector: initialData?.sector ?? "Operacional",
    priority: initialData?.priority ?? "Média",
    assignedTo: initialData?.assignedTo ?? "Davi",
    deadline: initialData?.deadline ?? "",
    equipment: initialData?.equipment ?? "—",
    status: initialData?.status ?? "Não visualizado",
    comments: initialData?.comments ?? "",
    attachments: initialData?.attachments ?? [],
  });

  const [activeTab, setActiveTab] = useState("details");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error("Erro", { description: "Título da tarefa é obrigatório." });
      return;
    }

    setIsSubmitting(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      onSubmit(formData);
      toast.success(
        mode === "create" ? "Tarefa criada" : "Tarefa atualizada",
        { description: formData.title }
      );
      onOpenChange(false);
      setFormData({
        title: "",
        description: "",
        sector: "Operacional",
        priority: "Média",
        assignedTo: "Davi",
        deadline: "",
        equipment: "—",
        status: "Não visualizado",
        comments: "",
        attachments: [],
      });
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
              <Icon name={mode === "create" ? "add_task" : "edit_task"} className="text-primary text-2xl" />
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
                    {EQUIPMENT.map((e) => (
                      <option key={e} value={e}>
                        {e}
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
                    {PRIORITIES.map((p) => (
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
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2 block">
                  <Icon name="comment" className="inline text-base mr-1" />
                  Comentários Adicionais
                </label>
                <textarea
                  name="comments"
                  value={formData.comments}
                  onChange={handleChange}
                  placeholder="Observações, restrições, ou notas importantes..."
                  rows={3}
                  className="w-full px-4 py-3 bg-surface-highest border border-border-low rounded-lg text-on-surface placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial font-medium resize-none"
                />
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
                  {ASSIGNEES.map((a) => (
                    <option key={a} value={a}>
                      {a}
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
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {s}
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
                onFilesChange={(attachments) =>
                  setFormData((prev) => ({ ...prev, attachments }))
                }
                maxFiles={10}
                maxSize={50}
              />
            </TabsContent>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-6 border-t border-border-low">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
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
