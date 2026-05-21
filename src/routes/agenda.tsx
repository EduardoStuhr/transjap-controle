import { createFileRoute } from "@tanstack/react-router";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { getUrgencyLevel } from "@/lib/urgency";
import { useTaskActions, useTaskStore } from "@/lib/task-store";
import { filterVisibleTasks } from "@/lib/task-visibility";
import {
  TASK_STATUS_CONFIG,
  TASK_STATUSES,
  type TaskRecord,
  type TaskStatus,
} from "@/lib/task-types";
import type { TaskModalData } from "@/components/TaskModal";
import { useEquipmentStore } from "@/lib/equipment-store";
import { formatEquipmentReference } from "@/lib/operational-options";

const LazyTaskModal = lazy(() =>
  import("@/components/TaskModal").then((module) => ({ default: module.TaskModal })),
);

const LazyTaskDetailsModal = lazy(() =>
  import("@/components/TaskDetailsModal").then((module) => ({
    default: module.TaskDetailsModal,
  })),
);

export const Route = createFileRoute("/agenda")({ component: Agenda });

type TaskFilter = TaskStatus | "Todas";
type ViewMode = "grid" | "list";

const FILTERS: TaskFilter[] = [
  "Todas",
  "Em andamento",
  "Não visualizado",
  "Aguardando aprovação",
  "Aguardando peças",
  "Concluído",
  "Atrasado",
];

function Agenda() {
  const user = useAuthStore((snapshot) => snapshot.user);
  const taskActions = useTaskActions();
  const tasks = useTaskStore((snapshot) => snapshot.tasks);
  const equipments = useEquipmentStore((snapshot) => snapshot.equipments);
  const pending = useTaskStore((snapshot) => snapshot.pendingRequests);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("Todas");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [prefillEquipment, setPrefillEquipment] = useState<string | null>(null);
  const formatEquipment = useCallback(
    (value: string | undefined) => formatEquipmentReference(value, equipments),
    [equipments],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const createFromCalendar = window.sessionStorage.getItem("transjap:create-task");
    if (createFromCalendar) {
      window.sessionStorage.removeItem("transjap:create-task");
      window.localStorage.removeItem("transjap:fleet-command:task-draft:create");
      setShowCreateModal(true);
    }
    const equipment = window.sessionStorage.getItem("transjap:prefill:task-equipment");
    if (!equipment) return;
    window.sessionStorage.removeItem("transjap:prefill:task-equipment");
    window.localStorage.removeItem("transjap:fleet-command:task-draft:create");
    setPrefillEquipment(equipment);
    setShowCreateModal(true);
  }, []);

  const visibleTasks = useMemo(() => filterVisibleTasks(tasks, user), [tasks, user]);
  const visiblePending = useMemo(() => filterVisibleTasks(pending, user), [pending, user]);
  const filteredTasks = useMemo(
    () => visibleTasks.filter((task) => filter === "Todas" || task.status === filter),
    [filter, visibleTasks],
  );

  const selectedTask = useMemo(
    () => visibleTasks.find((task) => task.id === selectedTaskId) || null,
    [selectedTaskId, visibleTasks],
  );

  const editingTask = useMemo(
    () => visibleTasks.find((task) => task.id === editingTaskId) || null,
    [editingTaskId, visibleTasks],
  );

  const handleCreateTask = useCallback(
    async (data: TaskModalData) => {
      await taskActions.createTask(data);
      setShowCreateModal(false);
    },
    [taskActions],
  );

  const handleUpdateTask = useCallback(
    async (data: TaskModalData) => {
      if (!editingTaskId) return;
      await taskActions.updateTask(editingTaskId, data);
      setEditingTaskId(null);
    },
    [editingTaskId, taskActions],
  );

  const openTaskDetails = useCallback(
    (taskId: string) => {
      void taskActions.markTaskViewed(taskId);
      setSelectedTaskId(taskId);
      setShowDetailsModal(true);
    },
    [taskActions],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const taskId = window.sessionStorage.getItem("transjap:open-task-id");
    if (!taskId || !visibleTasks.some((task) => task.id === taskId)) return;
    window.sessionStorage.removeItem("transjap:open-task-id");
    openTaskDetails(taskId);
  }, [openTaskDetails, visibleTasks]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const taskId = window.sessionStorage.getItem("transjap:edit-task-id");
    if (!taskId || !visibleTasks.some((task) => task.id === taskId)) return;
    window.sessionStorage.removeItem("transjap:edit-task-id");
    setEditingTaskId(taskId);
  }, [visibleTasks]);

  const handleEditFromDetails = useCallback((task: TaskRecord) => {
    setEditingTaskId(task.id);
    setShowDetailsModal(false);
  }, []);

  const approveRequest = useCallback(
    async (id: string) => {
      const item = await taskActions.approveRequest(id);
      if (!item) return;
      toast.success("Solicitação aprovada", {
        description: `${item.title} foi convertida em tarefa.`,
      });
    },
    [taskActions],
  );

  const rejectRequest = useCallback(
    async (id: string) => {
      const item = await taskActions.rejectRequest(id);
      toast.error("Solicitação recusada", { description: item?.title });
    },
    [taskActions],
  );

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface uppercase">
            Agenda Operacional
          </h1>
          <p className="text-sm text-on-surface-variant mt-1 font-medium">
            Tarefas, solicitações e atribuições
          </p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="font-black gap-2 shadow-industrial"
        >
          <Icon name="add" />
          Nova Tarefa
        </Button>
      </div>

      {visiblePending.length > 0 && (
        <section className="bg-surface-container border border-border-low rounded-lg p-6 mb-8 shadow-industrial">
          <h2 className="text-lg font-black text-on-surface uppercase mb-4 flex items-center gap-2">
            <Icon name="new_inbox" className="text-primary text-2xl" />
            Solicitações Pendentes
          </h2>
          <div className="space-y-3">
            {visiblePending.map((request) => (
              <PendingRequestCard
                key={request.id}
                request={request}
                onApprove={approveRequest}
                onReject={rejectRequest}
              />
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider whitespace-nowrap transition-industrial ${
              filter === status
                ? "bg-primary text-on-primary shadow-industrial"
                : "bg-surface-container border border-border-low text-on-surface hover:border-primary/50"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setViewMode("list")}
          className={`p-2 rounded transition-colors ${viewMode === "list" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"}`}
          aria-label="Visualizar como lista"
        >
          <Icon name="view_list" />
        </button>
        <button
          type="button"
          onClick={() => setViewMode("grid")}
          className={`p-2 rounded transition-colors ${viewMode === "grid" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"}`}
          aria-label="Visualizar como grade"
        >
          <Icon name="view_agenda" />
        </button>
      </div>

      {filteredTasks.length > 0 ? (
        viewMode === "list" ? (
          <VirtualTaskList
            tasks={filteredTasks}
            onOpen={openTaskDetails}
            formatEquipment={formatEquipment}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTasks.map((task) => (
              <TaskGridCard
                key={task.id}
                task={task}
                onOpen={openTaskDetails}
                formatEquipment={formatEquipment}
              />
            ))}
          </div>
        )
      ) : (
        <div className="text-center py-12">
          <Icon name="task_alt" className="text-5xl text-on-surface-variant/30 mx-auto mb-3" />
          <p className="text-on-surface-variant">
            {visibleTasks.length === 0
              ? "Nenhuma tarefa cadastrada"
              : "Nenhuma tarefa neste filtro"}
          </p>
        </div>
      )}

      <Suspense fallback={null}>
        {showCreateModal && (
          <LazyTaskModal
            open={showCreateModal}
            onOpenChange={(open) => {
              setShowCreateModal(open);
              if (!open) setPrefillEquipment(null);
            }}
            onSubmit={(data) => {
              handleCreateTask(data);
              setPrefillEquipment(null);
            }}
            mode="create"
            draftKey="transjap:fleet-command:task-draft:create"
            initialData={prefillEquipment ? { equipment: prefillEquipment } : undefined}
          />
        )}
        {editingTask && (
          <LazyTaskModal
            open={Boolean(editingTask)}
            onOpenChange={(open) => {
              if (!open) setEditingTaskId(null);
            }}
            onSubmit={handleUpdateTask}
            mode="edit"
            initialData={editingTask}
            draftKey={`transjap:fleet-command:task-draft:edit:${editingTask.id}`}
          />
        )}
        {showDetailsModal && (
          <LazyTaskDetailsModal
            open={showDetailsModal}
            onOpenChange={setShowDetailsModal}
            task={selectedTask}
            onAddComment={taskActions.addComment}
            onAddResponse={taskActions.addResponse}
            onEdit={handleEditFromDetails}
          />
        )}
      </Suspense>
    </AppLayout>
  );
}

const PendingRequestCard = memo(function PendingRequestCard({
  request,
  onApprove,
  onReject,
}: {
  request: TaskRecord;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div className="border border-border-low rounded-lg p-4 bg-surface-highest/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-on-surface mb-1">{request.title}</p>
        <p className="text-xs text-on-surface-variant">{request.description}</p>
        <div className="flex gap-2 mt-2 text-xs">
          <span className="text-on-surface-variant font-medium">
            {request.assignedTo.length > 0 ? request.assignedTo.join(", ") : "Sem destinatário"}
          </span>
          <span className="text-on-surface-variant font-medium">•</span>
          <span className="text-on-surface-variant font-medium">
            {request.sector || "Sem setor"}
          </span>
        </div>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onReject(request.id)}
          className="text-status-error border-status-error/30 hover:bg-status-error hover:text-white"
        >
          <Icon name="close" className="text-base" />
        </Button>
        <Button size="sm" onClick={() => onApprove(request.id)} className="font-bold">
          <Icon name="check" className="text-base" />
          Aprovar
        </Button>
      </div>
    </div>
  );
});

function VirtualTaskList({
  tasks,
  onOpen,
  formatEquipment,
}: {
  tasks: TaskRecord[];
  onOpen: (id: string) => void;
  formatEquipment: (value: string | undefined) => string;
}) {
  const rowHeight = 116;
  const viewportHeight = Math.min(680, tasks.length * rowHeight);
  const [scrollTop, setScrollTop] = useState(0);
  const visibleRange = useMemo(() => {
    const overscan = 5;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(
      tasks.length,
      Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
    );

    return { start, end };
  }, [scrollTop, tasks.length, viewportHeight]);

  const visibleTasks = useMemo(
    () => tasks.slice(visibleRange.start, visibleRange.end),
    [tasks, visibleRange],
  );

  return (
    <div
      className="relative overflow-y-auto pr-1"
      style={{ height: viewportHeight }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: tasks.length * rowHeight, position: "relative" }}>
        {visibleTasks.map((task, index) => (
          <div
            key={task.id}
            className="absolute left-0 right-0"
            style={{ top: (visibleRange.start + index) * rowHeight, height: rowHeight }}
          >
            <TaskListItem task={task} onOpen={onOpen} formatEquipment={formatEquipment} />
          </div>
        ))}
      </div>
    </div>
  );
}

const TaskListItem = memo(function TaskListItem({
  task,
  onOpen,
  formatEquipment,
}: {
  task: TaskRecord;
  onOpen: (id: string) => void;
  formatEquipment: (value: string | undefined) => string;
}) {
  const urgency = task.deadline ? getUrgencyLevel(task.deadline) : null;
  const config = TASK_STATUS_CONFIG[task.status];

  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="w-full bg-surface-container border border-border-low rounded-lg p-4 text-left hover:border-primary/50 hover:shadow-md transition-industrial group"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Icon name={config.icon} className={`text-lg ${config.color.split(" ")[1]}`} />
            <span className="text-xs font-mono text-on-surface-variant font-bold">#{task.id}</span>
            {!task.viewed && <span className="w-2 h-2 bg-status-warning rounded-full" />}
          </div>
          <h3 className="font-bold text-on-surface group-hover:text-primary transition-colors truncate">
            {task.title}
          </h3>
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Icon name="outgoing_mail" className="text-base" />
              Enviado por {task.createdBy || "Sistema"}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="person" className="text-base" />
              {task.assignedTo.length > 0 ? task.assignedTo.join(", ") : "Sem destinatário"}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="domain" className="text-base" />
              {task.sector || "Sem setor"}
            </span>
            {task.equipment && (
              <span className="flex items-center gap-1">
                <Icon name="precision_manufacturing" className="text-base" />
                {formatEquipment(task.equipment)}
              </span>
            )}
            {urgency && (
              <span
                className={`${urgency.colorClass} font-bold ${urgency.level === "RED" || urgency.level === "ORANGE" ? "animate-pulse" : ""}`}
              >
                {urgency.timeRemaining}
              </span>
            )}
          </div>
        </div>
        <TaskBadges task={task} />
      </div>
    </button>
  );
});

const TaskGridCard = memo(function TaskGridCard({
  task,
  onOpen,
  formatEquipment,
}: {
  task: TaskRecord;
  onOpen: (id: string) => void;
  formatEquipment: (value: string | undefined) => string;
}) {
  const urgency = task.deadline ? getUrgencyLevel(task.deadline) : null;
  const config = TASK_STATUS_CONFIG[task.status];

  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
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
          <strong>Enviado por:</strong> {task.createdBy || "Sistema"}
        </p>
        <p className="truncate">
          <strong>Destinatários:</strong>{" "}
          {task.assignedTo.length > 0 ? task.assignedTo.join(", ") : "Sem destinatário"}
        </p>
        <p className="truncate">
          <strong>Setor:</strong> {task.sector || "Sem setor"}
        </p>
        {task.equipment && (
          <p className="truncate">
            <strong>Equipamento:</strong> {formatEquipment(task.equipment)}
          </p>
        )}
        {urgency && (
          <p>
            <strong>Prazo:</strong>{" "}
            <span
              className={`${urgency.colorClass} ${urgency.level === "RED" || urgency.level === "ORANGE" ? "animate-pulse" : ""}`}
            >
              {urgency.timeRemaining}
            </span>
          </p>
        )}
      </div>
      <div className="pt-3 border-t border-border-low flex items-center justify-between">
        <span className="text-[10px] font-mono text-on-surface-variant">#{task.id}</span>
        <PriorityBadge priority={task.priority} />
      </div>
    </button>
  );
});

function TaskBadges({ task }: { task: TaskRecord }) {
  const config = TASK_STATUS_CONFIG[task.status];

  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      <PriorityBadge priority={task.priority} />
      <div className={`px-3 py-1 rounded text-[10px] font-bold ${config.color}`}>
        {config.label}
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: TaskRecord["priority"] }) {
  return (
    <div
      className={`px-3 py-1 rounded text-[10px] font-bold ${
        priority === "Alta" || priority === "Urgente"
          ? "bg-status-error/10 text-status-error"
          : priority === "Média"
            ? "bg-status-warning/10 text-status-warning"
            : "bg-status-info/10 text-status-info"
      }`}
    >
      {priority}
    </div>
  );
}
