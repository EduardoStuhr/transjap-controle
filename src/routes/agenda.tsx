import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getUrgencyLevel } from "@/lib/urgency";
import { TaskModal, type TaskModalData } from "@/components/TaskModal";
import { TaskDetailsModal, type TaskDetail } from "@/components/TaskDetailsModal";

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
    description: "Necessário atualizar os dados de horímetros de todos os equipamentos",
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
    description: "Realizar contagem completa e verificação de peças em estoque",
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
    description: "Consolidar dados de consumo mensal e enviar para análise",
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

const INITIAL_PENDING: Task[] = [
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
];

function Agenda() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [pending, setPending] = useState<Task[]>(INITIAL_PENDING);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [filter, setFilter] = useState<Status | "All">("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  const filtered = tasks.filter((t) => {
    const statusMatch = filter === "All" || t.status === filter;
    return statusMatch;
  });

  const handleCreateTask = (data: TaskModalData) => {
    const newTask: Task = {
      id: `TK-${Math.floor(Math.random() * 9000) + 1000}`,
      title: data.title,
      description: data.description,
      equip: data.equipment,
      resp: data.assignedTo,
      assignedTo: data.assignedTo,
      sector: data.sector,
      priority: data.priority,
      deadline: data.deadline,
      status: "Not Viewed" as Status,
      attachments: [],
      createdAt: new Date().toLocaleDateString("pt-BR"),
      viewed: false,
    };
    setTasks([newTask, ...tasks]);
    setShowCreateModal(false);
  };

  const openTaskDetails = (task: Task) => {
    const taskDetail: TaskDetail = {
      ...task,
      timeline: [
        { timestamp: "Há 2 horas", action: "Tarefa criada", actor: "Davi", status: "Não Visualizado" },
        { timestamp: "Há 30 min", action: "Status alterado", actor: "Eduardo", status: "Em andamento" },
      ],
      comments: [
        {
          id: "1",
          author: "Eduardo",
          text: "Já iniciamos os trabalhos nesta tarefa. Atualizaremos em breve.",
          timestamp: "Há 15 min",
        },
      ],
    };
    setSelectedTask(taskDetail);
    setShowDetailsModal(true);
  };

  const approveRequest = (id: string) => {
    const item = pending.find((p) => p.id === id);
    if (!item) return;
    setPending((p) => p.filter((x) => x.id !== id));
    setTasks((t) => [{ ...item, id: `TK-${Math.floor(Math.random() * 9000) + 1000}`, status: "Not Viewed", viewed: false }, ...t]);
    toast.success("Solicitação aprovada", { description: `${item.title} foi convertida em tarefa.` });
  };

  const rejectRequest = (id: string) => {
    const item = pending.find((p) => p.id === id);
    setPending((p) => p.filter((x) => x.id !== id));
    toast.error("Solicitação recusada", { description: item?.title });
  };

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface uppercase">Agenda Operacional</h1>
          <p className="text-sm text-on-surface-variant mt-1 font-medium">Tarefas, solicitações e assignments</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="font-black gap-2 shadow-industrial">
          <Icon name="add" />
          Nova Tarefa
        </Button>
      </div>

      {/* Pending Requests Alert */}
      {pending.length > 0 && (
        <div className="bg-status-warning/10 border border-status-warning/30 rounded-lg p-4 mb-6 flex items-start gap-3">
          <Icon name="priority_high" className="text-status-warning text-xl flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-bold text-on-surface">Você tem {pending.length} solicitação(ões) aguardando aprovação</p>
            <p className="text-on-surface-variant text-xs mt-1">Revise e aprove solicitações urgentes</p>
          </div>
        </div>
      )}

      {/* Pending Requests */}
      {pending.length > 0 && (
        <div className="bg-surface-container border border-border-low rounded-lg p-6 mb-8 shadow-industrial">
          <h2 className="text-lg font-black text-on-surface uppercase mb-4 flex items-center gap-2">
            <Icon name="new_inbox" className="text-primary text-2xl" />
            Solicitações Pendentes
          </h2>
          <div className="space-y-3">
            {pending.map((req) => (
              <div key={req.id} className="border border-border-low rounded-lg p-4 bg-surface-highest/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-on-surface mb-1">{req.title}</p>
                  <p className="text-xs text-on-surface-variant">{req.description}</p>
                  <div className="flex gap-2 mt-2 text-xs">
                    <span className="text-on-surface-variant font-medium">Por: {req.resp}</span>
                    <span className="text-on-surface-variant font-medium">•</span>
                    <span className="text-on-surface-variant font-medium">{req.sector}</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rejectRequest(req.id)}
                    className="text-status-error border-status-error/30 hover:bg-status-error hover:text-white"
                  >
                    <Icon name="close" className="text-base" />
                  </Button>
                  <Button size="sm" onClick={() => approveRequest(req.id)} className="font-bold">
                    <Icon name="check" className="text-base" />
                    Aprovar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {(["All", "In Progress", "Not Viewed", "Waiting Approval", "Completed", "Overdue"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status as any)}
            className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider whitespace-nowrap transition-industrial ${
              filter === status
                ? "bg-primary text-on-primary shadow-industrial"
                : "bg-surface-container border border-border-low text-on-surface hover:border-primary/50"
            }`}
          >
            {status === "All" ? "Todas" : STATUS_CONFIG[status]?.label || status}
          </button>
        ))}
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setViewMode("list")}
          className={`p-2 rounded transition-colors ${viewMode === "list" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"}`}
        >
          <Icon name="view_list" />
        </button>
        <button
          onClick={() => setViewMode("grid")}
          className={`p-2 rounded transition-colors ${viewMode === "grid" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"}`}
        >
          <Icon name="view_agenda" />
        </button>
      </div>

      {/* Tasks */}
      {filtered.length > 0 ? (
        viewMode === "list" ? (
          // List View
          <div className="space-y-3">
            {filtered.map((task) => {
              const urgency = task.deadline ? getUrgencyLevel(task.deadline) : null;
              const config = STATUS_CONFIG[task.status];
              return (
                <button
                  key={task.id}
                  onClick={() => openTaskDetails(task)}
                  className="w-full bg-surface-container border border-border-low rounded-lg p-4 text-left hover:border-primary/50 hover:shadow-md transition-industrial group"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon name={config.icon} className={`text-lg ${config.color.split(" ")[1]}`} />
                        <span className="text-xs font-mono text-on-surface-variant font-bold">#{task.id}</span>
                        {!task.viewed && <span className="w-2 h-2 bg-status-warning rounded-full" />}
                      </div>
                      <h3 className="font-bold text-on-surface group-hover:text-primary transition-colors truncate">{task.title}</h3>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-on-surface-variant">
                        <span className="flex items-center gap-1">
                          <Icon name="person" className="text-base" />
                          {task.assignedTo}
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="domain" className="text-base" />
                          {task.sector}
                        </span>
                        {urgency && (
                          <span className={`${urgency.colorClass} font-bold`}>
                            {urgency.timeRemaining}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div
                        className={`px-3 py-1 rounded text-[10px] font-bold ${
                          task.priority === "Alta" || task.priority === "Urgente"
                            ? "bg-status-error/10 text-status-error"
                            : task.priority === "Média"
                              ? "bg-status-warning/10 text-status-warning"
                              : "bg-status-info/10 text-status-info"
                        }`}
                      >
                        {task.priority}
                      </div>
                      <div className={`px-3 py-1 rounded text-[10px] font-bold ${config.color}`}>
                        {config.label}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          // Grid View
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((task) => {
              const urgency = task.deadline ? getUrgencyLevel(task.deadline) : null;
              const config = STATUS_CONFIG[task.status];
              return (
                <button
                  key={task.id}
                  onClick={() => openTaskDetails(task)}
                  className="bg-surface-container border border-border-low rounded-lg p-5 text-left hover:border-primary/50 hover:shadow-md transition-industrial group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`px-2 py-1 rounded text-[10px] font-bold ${config.color}`}>
                      {config.label}
                    </div>
                    {!task.viewed && <span className="w-2 h-2 bg-status-warning rounded-full" />}
                  </div>
                  <h3 className="font-bold text-on-surface group-hover:text-primary transition-colors mb-3 line-clamp-2">
                    {task.title}
                  </h3>
                  <div className="space-y-2 text-xs text-on-surface-variant mb-4">
                    <p className="truncate">
                      <strong>Atribuído a:</strong> {task.assignedTo}
                    </p>
                    <p className="truncate">
                      <strong>Setor:</strong> {task.sector}
                    </p>
                    {urgency && (
                      <p>
                        <strong>Prazo:</strong>{" "}
                        <span className={urgency.colorClass}>{urgency.timeRemaining}</span>
                      </p>
                    )}
                  </div>
                  <div className="pt-3 border-t border-border-low flex items-center justify-between">
                    <span className="text-[10px] font-mono text-on-surface-variant">#{task.id}</span>
                    <div
                      className={`px-2 py-1 rounded text-[10px] font-bold ${
                        task.priority === "Alta" || task.priority === "Urgente"
                          ? "bg-status-error/10 text-status-error"
                          : task.priority === "Média"
                            ? "bg-status-warning/10 text-status-warning"
                            : "bg-status-info/10 text-status-info"
                      }`}
                    >
                      {task.priority}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div className="text-center py-12">
          <Icon name="task_alt" className="text-5xl text-on-surface-variant/30 mx-auto mb-3" />
          <p className="text-on-surface-variant">Nenhuma tarefa neste filtro</p>
        </div>
      )}

      {/* Modals */}
      <TaskModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSubmit={handleCreateTask}
        mode="create"
      />
      <TaskDetailsModal
        open={showDetailsModal}
        onOpenChange={setShowDetailsModal}
        task={selectedTask}
      />
    </AppLayout>
  );
}
