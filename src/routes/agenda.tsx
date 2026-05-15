import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getUrgencyLevel } from "@/lib/urgency";

export const Route = createFileRoute("/agenda")({ component: Agenda });

type Status =
  | "Not Viewed"
  | "Viewed"
  | "In Progress"
  | "Waiting for Parts"
  | "Waiting Approval"
  | "Completed"
  | "Overdue";

type Task = {
  id: string;
  title: string;
  description?: string;
  equip: string;
  resp: string;
  assignedTo: string;
  sector: string;
  priority: string;
  deadline: string;
  status: Status;
  attachments?: string[];
  createdAt: string;
  viewed: boolean;
};

const STATUS_CONFIG: Record<Status, { color: string; icon: string; label: string }> = {
  "Not Viewed": { color: "bg-surface-variant text-on-surface-variant", icon: "visibility_off", label: "Não Visualizado" },
  "Viewed": { color: "bg-status-info/20 text-status-info", icon: "visibility", label: "Visualizado" },
  "In Progress": { color: "bg-primary-container/20 text-primary-container", icon: "pending", label: "Em Andamento" },
  "Waiting for Parts": { color: "bg-status-warning/20 text-status-warning", icon: "settings_suggest", label: "Aguardando Peças" },
  "Waiting Approval": { color: "bg-surface-high text-on-surface-variant", icon: "hourglass_empty", label: "Aguardando Aprovação" },
  "Completed": { color: "bg-status-success/20 text-status-success", icon: "check_circle", label: "Concluído" },
  "Overdue": { color: "bg-status-error/20 text-status-error", icon: "warning", label: "Atrasado" },
};

const INITIAL_TASKS: Task[] = [
  {
    id: "TK-0512",
    title: "Atualizar planilha de horímetros",
    equip: "—",
    resp: "Davi",
    assignedTo: "Davi",
    sector: "Administrativo",
    priority: "Baixa",
    deadline: "17/05/2026",
    status: "In Progress",
    createdAt: "14/05/2026",
    viewed: true
  },
  {
    id: "TK-0511",
    title: "Conferência de estoque almoxarifado",
    equip: "—",
    resp: "Davi",
    assignedTo: "Almoxarifado",
    sector: "Almoxarifado",
    priority: "Baixa",
    deadline: "10/05/2026",
    status: "Completed",
    createdAt: "13/05/2026",
    viewed: true
  },
  {
    id: "TK-0509",
    title: "Relatório de consumo de diesel - Abril",
    equip: "—",
    resp: "Eduardo",
    assignedTo: "Fleet Team",
    sector: "Operacional",
    priority: "Alta",
    deadline: "20/05/2026",
    status: "Not Viewed",
    createdAt: "15/05/2026",
    viewed: false
  }
];

function Agenda() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [pending, setPending] = useState<Task[]>([
    {
      id: "SL-0021",
      title: "Solicitação de novo uniforme",
      description: "Equipe de campo necessita de reposição de EPIs e uniformes.",
      equip: "—",
      resp: "Eduardo",
      assignedTo: "Warehouse",
      sector: "Almoxarifado",
      priority: "Média",
      deadline: "16/05/2026",
      status: "Waiting Approval",
      attachments: [],
      createdAt: "Hoje · 09:42",
      viewed: false
    },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<Status | "All">("All");
  const [userFilter, setUserFilter] = useState<string>("All");

  const filtered = tasks.filter((t) => {
    const statusMatch = filter === "All" || t.status === filter;
    const userMatch = userFilter === "All" || t.assignedTo === userFilter;
    return statusMatch && userMatch;
  });

  function toggleViewed(id: string) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, viewed: !t.viewed } : t));
  }

  function approveRequest(id: string) {
    const item = pending.find((p) => p.id === id);
    if (!item) return;
    setPending((p) => p.filter((x) => x.id !== id));
    setTasks((t) => [
      { ...item, id: `TK-${Math.floor(Math.random() * 9000) + 1000}`, status: "Not Viewed", viewed: false },
      ...t,
    ]);
    toast.success("Solicitação aprovada", { description: `${item.title} foi convertida em tarefa.` });
  }

  function rejectRequest(id: string) {
    const item = pending.find((p) => p.id === id);
    setPending((p) => p.filter((x) => x.id !== id));
    toast.error("Solicitação recusada", { description: item?.title });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const novo: Task = {
      id: `SL-${Math.floor(Math.random() * 9000) + 1000}`,
      title: (fd.get("title") || "Nova solicitação").toString(),
      description: (fd.get("description") || "").toString(),
      equip: (fd.get("equip") || "—").toString(),
      resp: (fd.get("resp") || "Davi").toString(),
      assignedTo: (fd.get("assignedTo") || "Operations Team").toString(),
      sector: (fd.get("sector") || "—").toString(),
      priority: (fd.get("priority") || "Média").toString(),
      deadline: (fd.get("deadline") || "—").toString(),
      status: "Waiting Approval",
      createdAt: "Agora",
      viewed: false
    };
    setPending((p) => [novo, ...p]);
    setShowForm(false);
    toast.success("Solicitação enviada", {
      description: `${novo.title} entrou na fila de pendências.`,
    });
    e.currentTarget.reset();
  }

  return (
    <AppLayout title="Agenda Operacional">
      <div className="bg-surface-low border-l-4 border-primary-container p-4 mb-8 shadow-industrial transition-industrial">
        <p className="text-on-surface-variant text-base">
          Gerenciamento de tarefas operacionais, comunicações e fluxo de trabalho.
          <span className="block mt-1 font-bold text-status-warning">
            <Icon name="info" className="text-sm align-middle mr-1" />
            Importante: Manutenções técnicas devem ser tratadas exclusivamente no módulo de Manutenção.
          </span>
        </p>
      </div>

      {/* Status legend - clickable filters */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Button
          variant={filter === "All" ? "default" : "outline"}
          onClick={() => setFilter("All")}
          className="rounded-full px-6 transition-industrial"
        >
          Todos
        </Button>
        {(Object.keys(STATUS_CONFIG) as Status[]).map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            onClick={() => setFilter(status)}
            className="rounded-full flex items-center gap-2 transition-industrial"
          >
            <Icon name={STATUS_CONFIG[status].icon} className="text-sm" />
            {STATUS_CONFIG[status].label}
          </Button>
        ))}
      </div>

      {/* Solicitações Pendentes */}
      <section className="mb-12 bg-surface-container border border-outline/20 shadow-industrial overflow-hidden rounded-lg transition-industrial">
        <div className="p-6 border-b border-border-low flex justify-between items-center bg-surface-low gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-status-warning animate-pulse-urgent shadow-[0_0_8px_rgba(242,153,74,0.5)]" />
            <h3 className="text-2xl font-bold tracking-tight">Solicitações Pendentes</h3>
            <span className="text-xs px-2.5 py-1 rounded-full bg-status-warning/20 text-status-warning font-black border border-status-warning/30">{pending.length}</span>
          </div>
          <Button
            onClick={() => setShowForm((v) => !v)}
            variant={showForm ? "destructive" : "default"}
            className="font-bold flex items-center gap-2 shadow-industrial transition-industrial"
          >
            <Icon name={showForm ? "close" : "add"} /> {showForm ? "Cancelar" : "Nova Solicitação"}
          </Button>
        </div>

        {pending.length === 0 ? (
          <div className="p-12 text-center">
            <Icon name="check_circle" className="text-5xl text-status-success/30 mb-2" />
            <p className="text-on-surface-variant font-medium">Nenhuma solicitação pendente no momento.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border-low">
            {pending.map((p) => {
              const urgency = getUrgencyLevel(p.deadline);
              return (
                <li key={p.id} className="p-6 border-l-4 border-status-warning bg-surface-low/50 hover:bg-surface-high transition-industrial group">
                  <div className="flex justify-between items-start gap-4 flex-wrap mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[11px] font-black font-mono px-2 py-0.5 bg-surface-highest text-on-surface rounded border border-outline/20">#{p.id}</span>
                        <span className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-status-warning">
                          <Icon name="history" className="text-sm" /> Aguardando Aprovação
                        </span>
                      </div>
                      <h4 className="font-bold text-on-surface text-xl group-hover:text-primary transition-colors">{p.title}</h4>
                      {p.description && <p className="text-sm text-on-surface-variant mt-2 max-w-2xl leading-relaxed">{p.description}</p>}
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-on-surface-variant block font-medium mb-1">{p.createdAt}</span>
                      <div className={`text-[10px] font-bold px-2 py-0.5 rounded border ${urgency.borderClass} ${urgency.colorClass} inline-block`}>
                        {urgency.timeRemaining}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                    <Field icon="person" label="Solicitante" value={p.resp} />
                    <Field icon="assignment_ind" label="Atribuído a" value={p.assignedTo} />
                    <Field icon="apartment" label="Setor" value={p.sector} />
                    <Field icon="priority_high" label="Prioridade" value={p.priority} />
                    <Field icon="event" label="Prazo" value={p.deadline} urgency={urgency} />
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={() => approveRequest(p.id)} className="bg-status-success hover:bg-status-success/90 text-white font-bold px-6 shadow-industrial">
                      <Icon name="check" /> Aprovar e Gerar Tarefa
                    </Button>
                    <Button variant="outline" onClick={() => rejectRequest(p.id)} className="border-status-error text-status-error hover:bg-status-error/10 font-bold">
                      <Icon name="close" /> Recusar
                    </Button>
                    <Button variant="ghost" className="font-bold" onClick={() => toast("Detalhes", { description: `Visualizando ${p.id}` })}>
                      Ver Detalhes
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Tasks list */}
        <div className="lg:col-span-2 bg-surface-container border border-border-low shadow-industrial-lg rounded-lg overflow-hidden transition-industrial">
          <div className="p-6 border-b border-border-low flex justify-between items-center bg-surface-low gap-4 flex-wrap">
            <h3 className="text-2xl font-bold tracking-tight">Fluxo de Trabalho Operacional</h3>
            <div className="flex gap-3">
              <select
                className="bg-surface-highest border border-border-low rounded text-[10px] font-black uppercase px-2 py-1 outline-none focus:border-primary"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              >
                <option value="All">Todos Responsáveis</option>
                <option value="Davi">Davi</option>
                <option value="Eduardo">Eduardo</option>
                <option value="Workshop Team">Workshop Team</option>
                <option value="Fleet Team">Fleet Team</option>
                <option value="Operations Team">Operations Team</option>
                <option value="Warehouse">Warehouse</option>
              </select>
              <Button variant="outline" size="sm" onClick={() => toast("Exportar", { description: "Gerando relatório CSV…" })}>
                <Icon name="download" /> Exportar
              </Button>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="p-20 text-center">
              <Icon name="inventory_2" className="text-5xl text-on-surface-variant/20 mb-4" />
              <p className="text-on-surface-variant font-medium">Nenhuma tarefa encontrada para este filtro.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border-low">
              {filtered.map((t) => {
                const urgency = getUrgencyLevel(t.deadline);
                const status = STATUS_CONFIG[t.status];
                return (
                  <li
                    key={t.id}
                    className={`p-6 border-l-4 ${urgency.level === "RED" ? "border-status-error" : urgency.level === "ORANGE" ? "border-status-warning" : "border-border-low"} hover:bg-surface-high transition-industrial group cursor-pointer`}
                    onClick={() => toggleViewed(t.id)}
                  >
                    <div className="flex justify-between items-start gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-[11px] font-black font-mono px-2 py-0.5 bg-surface-highest text-on-surface rounded border border-outline/20">#{t.id}</span>
                          {!t.viewed && <span className="w-2 h-2 rounded-full bg-primary-container shadow-[0_0_8px_#ffd700]" title="Não visualizado" />}
                          <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${status.color}`}>
                            <Icon name={status.icon} className="text-xs" /> {status.label}
                          </span>
                        </div>
                        <h4 className="font-bold text-on-surface text-lg group-hover:text-primary transition-colors">{t.title}</h4>
                        <div className="text-xs text-on-surface-variant mt-2 flex flex-wrap gap-x-6 gap-y-2 font-medium">
                          <span className="flex items-center gap-1.5"><Icon name="person" className="text-sm text-primary" /> {t.resp}</span>
                          <span className="flex items-center gap-1.5"><Icon name="assignment_ind" className="text-sm text-primary" /> {t.assignedTo}</span>
                          <span className="flex items-center gap-1.5"><Icon name="apartment" className="text-sm text-primary" /> {t.sector}</span>
                          <span className={`flex items-center gap-1.5 ${urgency.colorClass}`}><Icon name="event" className="text-sm" /> {t.deadline} {urgency.isOverdue && "⚠️"}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-on-surface-variant hover:text-primary transition-industrial"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast(t.title, { description: `Opções para a tarefa ${t.id}` });
                          }}
                        >
                          <Icon name="more_vert" />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* New request form */}
        <div className={`bg-surface-container border ${showForm ? "border-primary shadow-[0_0_20px_rgba(255,215,0,0.1)]" : "border-border-low"} p-8 shadow-industrial rounded-lg transition-industrial sticky top-24`}>
          <div className="mb-6">
            <h3 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <Icon name="add_task" className="text-primary text-3xl" /> Nova Solicitação
            </h3>
            <p className="text-sm text-on-surface-variant mt-2 font-medium">
              Envie uma nova pendência operacional. O gestor revisará para aprovação.
            </p>
          </div>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <FormGroup label="Título da Tarefa">
              <input name="title" required className="form-input" placeholder="Ex: Relatório Mensal de Frota" />
            </FormGroup>

            <FormGroup label="Descrição Detalhada">
              <textarea name="description" rows={3} className="form-input py-3" placeholder="Descreva os detalhes da solicitação..." />
            </FormGroup>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormGroup label="Atribuir a">
                <select name="assignedTo" className="form-input appearance-none">
                  <option value="Davi">Davi</option>
                  <option value="Eduardo">Eduardo</option>
                  <option value="Workshop Team">Workshop Team</option>
                  <option value="Fleet Team">Fleet Team</option>
                  <option value="Operations Team">Operations Team</option>
                  <option value="Warehouse">Warehouse</option>
                </select>
              </FormGroup>
              <FormGroup label="Setor">
                <select name="sector" className="form-input appearance-none">
                  <option value="Administrativo">Administrativo</option>
                  <option value="Operacional">Operacional</option>
                  <option value="Almoxarifado">Almoxarifado</option>
                  <option value="Frota">Frota</option>
                </select>
              </FormGroup>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormGroup label="Prioridade">
                <select name="priority" className="form-input appearance-none">
                  <option value="Baixa">Baixa</option>
                  <option value="Média">Média</option>
                  <option value="Alta">Alta</option>
                  <option value="Urgente">Urgente</option>
                </select>
              </FormGroup>
              <FormGroup label="Prazo">
                <input name="deadline" type="date" required className="form-input" />
              </FormGroup>
            </div>

            <div className="pt-2">
              <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mb-2 block">Anexos Operacionais</label>
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed border-2 py-8 flex flex-col gap-2 hover:border-primary hover:bg-primary/5 transition-industrial"
                onClick={() => toast("Anexar", { description: "Selecione arquivos operacionais." })}
              >
                <Icon name="cloud_upload" className="text-2xl" />
                <span className="text-xs font-bold">Clique ou arraste para anexar</span>
              </Button>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <Button type="submit" className="w-full font-black py-6 text-lg uppercase tracking-tighter shadow-industrial">
                <Icon name="send" /> Enviar Solicitação
              </Button>
              <Button type="reset" variant="ghost" className="w-full font-bold">
                Limpar Formulário
              </Button>
            </div>
          </form>
        </div>
      </div>

      <style>{`
        .form-input {
          width: 100%;
          background: var(--surface-highest);
          border: 1px solid var(--border-low);
          border-radius: 4px;
          padding: 10px 14px;
          font-size: 14px;
          font-weight: 500;
          color: var(--on-surface);
          outline: none;
          transition: all 0.2s;
        }
        .form-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 1px var(--primary);
        }
      `}</style>
    </AppLayout>
  );
}

function FormGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black">{label}</label>
      {children}
    </div>
  );
}

function Field({ icon, label, value, urgency }: { icon: string; label: string; value: string, urgency?: any }) {
  return (
    <div className={`bg-surface-low p-3 border rounded ${urgency?.level === "RED" ? "border-status-error/30" : "border-border-low/50"} transition-industrial`}>
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-on-surface-variant font-black">
        <Icon name={icon} className="text-xs text-primary" /> {label}
      </div>
      <div className={`text-sm font-bold mt-1 truncate ${urgency?.colorClass || "text-on-surface"}`}>{value}</div>
    </div>
  );
}
