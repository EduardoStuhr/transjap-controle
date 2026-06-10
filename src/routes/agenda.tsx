import { createFileRoute } from "@tanstack/react-router";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useActiveTabScroll } from "@/hooks/useActiveTabScroll";
import { useAuthStore, type AuthUser } from "@/lib/auth-store";
import { getUrgencyLevel } from "@/lib/urgency";
import { useTaskActions, useTaskStore } from "@/lib/task-store";
import { sortTasksStable } from "@/lib/task-sort";
import { getUnreadActivity, type UnreadKind } from "@/lib/task-unread";
import {
  filterVisibleTasks,
  getTaskStatusForUser,
  getTaskVisibleReason,
  getTaskViewedAtForRecipient,
  getTaskVisibilityLabel,
  isTaskUnreadForUser,
} from "@/lib/task-visibility";
import {
  formatTaskCompletionLabel,
  isTaskCompletedStatus,
  TASK_STATUS_CONFIG,
  type TaskRecord,
  type TaskStatus,
} from "@/lib/task-types";
import type { TaskModalData } from "@/components/TaskModal";
import { useEquipmentStore } from "@/lib/equipment-store";
import { formatEquipmentReference, resolveRecipients } from "@/lib/operational-options";

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

const FILTERS: TaskFilter[] = [
  "Todas",
  "Em andamento",
  "Não visualizado",
  "Aguardando aprovação",
  "Aguardando peças",
  "Concluído",
  "Atrasado",
];

function getDebugStringList(task: TaskRecord, fields: readonly string[]): string[] {
  const source = task as unknown as Record<string, unknown>;
  return fields.flatMap((field) => {
    const value = source[field];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && Boolean(item));
    }
    return typeof value === "string" && value ? [value] : [];
  });
}

function describeDebugElement(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const name =
    element.dataset.debugName ||
    element.getAttribute("aria-label") ||
    element.tagName.toLowerCase();

  return {
    element: name,
    tag: element.tagName.toLowerCase(),
    className: element.className,
    display: styles.display,
    flexWrap: styles.flexWrap,
    overflowY: styles.overflowY,
    width: styles.width,
    maxWidth: styles.maxWidth,
    rectWidth: Math.round(rect.width),
    rectHeight: Math.round(rect.height),
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  };
}

function logAgendaTaskLayout() {
  if (typeof window === "undefined") return;

  window.requestAnimationFrame(() => {
    const overflowContainers = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const overflowY = window.getComputedStyle(element).overflowY;
        return overflowY === "auto" || overflowY === "scroll";
      })
      .map(describeDebugElement);

    const taskContainers = Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          ".app-layout-shell",
          ".app-content-shell",
          ".app-main",
          ".app-bottom-nav",
          "[data-agenda-route-header]",
          "[data-agenda-filters]",
          "[data-agenda-view-controls]",
          "[data-task-list-wrapper]",
          "[data-task-list-item]",
          "[data-task-header-line]",
          "[data-task-badges]",
          "[data-task-unread-badges]",
        ].join(", "),
      ),
    )
      .slice(0, 16)
      .map(describeDebugElement);

    console.groupCollapsed("[AgendaLayoutDebug] task screen");
    console.table(overflowContainers);
    console.table(taskContainers);
    console.info("[AgendaLayoutDebug] task labels", {
      commonContainer: "TaskListItem",
      commonSelector: "[data-task-list-item]",
      visibilityPriorityStatusContainer: "TaskBadges",
      visibilityPriorityStatusSelector: "[data-task-badges]",
      unreadContainer: "UnreadActivityBadges",
      unreadSelector: "[data-task-unread-badges]",
    });
    console.groupEnd();
  });
}

function Agenda() {
  const filterTabsRef = useActiveTabScroll<HTMLDivElement>();
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

  const visibleTasks = useMemo(
    () => sortTasksStable(filterVisibleTasks(tasks, user)),
    [tasks, user],
  );
  const visiblePending = useMemo(
    () => sortTasksStable(filterVisibleTasks(pending, user)),
    [pending, user],
  );
  const filteredTasks = useMemo(() => {
    return visibleTasks.filter((task) => {
      if (filter === "Todas") return true;
      if (filter === "Não visualizado") return isTaskUnreadForUser(task, user);
      if (filter === "Concluído") return isTaskCompletedStatus(task.status);
      if (filter === "Atrasado") {
        return (
          !isTaskCompletedStatus(task.status) &&
          (task.status === "Atrasado" ||
            Boolean(task.deadline && getUrgencyLevel(task.deadline).isOverdue))
        );
      }
      return task.status === filter;
    });
  }, [filter, user, visibleTasks]);

  const selectedTask = useMemo(
    () => visibleTasks.find((task) => task.id === selectedTaskId) || null,
    [selectedTaskId, visibleTasks],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem("debugTasksVisibility") !== "1") return;

    console.table(
      filteredTasks.map((task) => ({
        taskId: task.id,
        title: task.title,
        createdBy: task.createdBy,
        createdById: task.createdById,
        assignedTo: task.assignedTo.join(", "),
        recipientId: task.responsibleIds.join(", "),
        sharedWith: getDebugStringList(task, ["sharedWith", "shared_with", "viewers"]).join(", "),
        currentUserId: user?.id ?? "",
        currentUserRole: user?.role ?? "",
        visibleReason: getTaskVisibleReason(task, user) ?? "hidden",
      })),
    );
  }, [filteredTasks, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    logAgendaTaskLayout();
    window.addEventListener("resize", logAgendaTaskLayout);
    window.visualViewport?.addEventListener("resize", logAgendaTaskLayout);
    return () => {
      window.removeEventListener("resize", logAgendaTaskLayout);
      window.visualViewport?.removeEventListener("resize", logAgendaTaskLayout);
    };
  }, [filter, filteredTasks.length]);

  const editingTask = useMemo(
    () => visibleTasks.find((task) => task.id === editingTaskId) || null,
    [editingTaskId, visibleTasks],
  );

  const handleCreateTask = useCallback(
    async (data: TaskModalData) => {
      await taskActions.createTask(data);
      setFilter("Todas");
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
    const handleNotificationOpen = (event: Event) => {
      const taskId = (event as CustomEvent<string>).detail;
      if (!taskId || !visibleTasks.some((task) => task.id === taskId)) return;
      window.sessionStorage.removeItem("transjap:open-task-id");
      openTaskDetails(taskId);
    };
    window.addEventListener("transjap:open-task", handleNotificationOpen);
    return () => window.removeEventListener("transjap:open-task", handleNotificationOpen);
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

  const handleDeleteTask = useCallback(
    async (task: TaskRecord) => {
      await taskActions.removeTask(task.id);
      setSelectedTaskId(null);
      setShowDetailsModal(false);
    },
    [taskActions],
  );

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
      <div
        data-debug-name="Agenda route header"
        data-agenda-route-header
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8"
      >
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

      <div
        ref={filterTabsRef}
        data-debug-name="Agenda filters"
        data-agenda-filters
        className="flex gap-2 mb-6 overflow-x-auto pb-2 scroll-smooth overscroll-x-contain"
      >
        {FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            data-active={filter === status}
            className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider whitespace-nowrap transition-industrial ${
              filter === status
                ? "bg-primary text-on-primary shadow-industrial border-b-2 border-primary"
                : "bg-surface-container border border-border-low text-on-surface hover:border-primary/50"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div
        data-debug-name="Agenda view controls"
        data-agenda-view-controls
        className="flex gap-2 mb-6"
      >
        <button
          type="button"
          className="p-2 rounded bg-primary text-on-primary transition-colors"
          aria-label="Visualização em grade"
          aria-pressed="true"
        >
          <Icon name="view_agenda" />
        </button>
      </div>

      {filteredTasks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((task) => (
            <TaskGridCard
              key={task.id}
              task={task}
              onOpen={openTaskDetails}
              formatEquipment={formatEquipment}
              user={user}
            />
          ))}
        </div>
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
            onSubmit={async (data) => {
              await handleCreateTask(data);
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
            onDelete={handleDeleteTask}
            onChangeStatus={taskActions.changeTaskStatus}
            onSendResponseWithStatus={taskActions.addResponseWithStatus}
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

function formatRecipientViewedAt(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;

  return timestamp.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RecipientViewedDots({ task }: { task: TaskRecord }) {
  const recipients = Array.from(
    new Set(
      resolveRecipients(task.assignedTo)
        .map((name) => name.trim())
        .filter((name) => Boolean(name) && name !== task.createdBy),
    ),
  );
  if (recipients.length === 0) return null;

  const viewedEntries = recipients
    .map((name) => ({ name, seenAt: getTaskViewedAtForRecipient(task, name) }))
    .filter((entry) => Boolean(entry.seenAt));
  const pendingRecipients = recipients.filter(
    (name) => !viewedEntries.some((entry) => entry.name === name),
  );
  const viewedCount = viewedEntries.length;
  const complete = viewedCount === recipients.length;
  const label = [
    "Visualizado por:",
    ...(viewedEntries.length
      ? viewedEntries.map(
          (entry) => `- ${entry.name} (${formatRecipientViewedAt(entry.seenAt)})`,
        )
      : ["- Ninguém"]),
    "",
    "Não visualizaram:",
    ...(pendingRecipients.length ? pendingRecipients.map((name) => `- ${name}`) : ["- Ninguém"]),
  ].join("\n");

  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex h-5 items-center justify-center gap-1 rounded-full px-1.5 text-[10px] font-bold ${
        complete
          ? "bg-status-success/15 text-status-success"
          : viewedCount > 0
            ? "bg-status-warning/15 text-status-warning"
          : "bg-surface-bright/30 text-on-surface-variant"
      }`}
    >
      <Icon name={viewedCount > 0 ? "visibility" : "visibility_off"} className="text-xs" />
      {viewedCount}/{recipients.length}
    </span>
  );
}

function VirtualTaskList({
  tasks,
  onOpen,
  formatEquipment,
  user,
}: {
  tasks: TaskRecord[];
  onOpen: (id: string) => void;
  formatEquipment: (value: string | undefined) => string;
  user: AuthUser | null;
}) {
  return (
    <div
      data-debug-name="Agenda task list"
      data-task-list-wrapper
      className="task-list agenda-list task-list-wrapper space-y-3"
    >
      {tasks.map((task) => (
        <TaskListItem
          key={task.id}
          task={task}
          onOpen={onOpen}
          formatEquipment={formatEquipment}
          user={user}
        />
      ))}
    </div>
  );
}

const TaskListItem = memo(function TaskListItem({
  task,
  onOpen,
  formatEquipment,
  user,
}: {
  task: TaskRecord;
  onOpen: (id: string) => void;
  formatEquipment: (value: string | undefined) => string;
  user: AuthUser | null;
}) {
  const completionLabel = isTaskCompletedStatus(task.status)
    ? formatTaskCompletionLabel(task)
    : null;
  const urgency = !completionLabel && task.deadline ? getUrgencyLevel(task.deadline) : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      data-debug-name="TaskListItem"
      data-task-list-item
      className="w-full min-w-0 bg-surface-container border border-border-low rounded-lg p-3 sm:p-4 text-left hover:border-primary/50 hover:shadow-md transition-industrial group"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex-1 min-w-0">
          <div
            data-debug-name="TaskListItem header line"
            data-task-header-line
            className="mb-2 flex min-w-0 flex-col items-start gap-1.5"
          >
            <span className="text-xs font-mono text-on-surface-variant font-bold break-all">
              #{task.id}
            </span>
            <RecipientViewedDots task={task} />
            <UnreadActivityBadges task={task} user={user} />
          </div>
          <h3 className="font-bold text-on-surface group-hover:text-primary transition-colors line-clamp-2 break-words">
            {task.title}
          </h3>
          <div className="flex flex-wrap gap-x-3 gap-y-2 mt-2 text-xs text-on-surface-variant">
            <span className="flex min-w-0 items-center gap-1 break-words">
              <Icon name="outgoing_mail" className="text-base shrink-0" />
              Enviado por {task.createdBy || "Sistema"}
            </span>
            <span className="flex min-w-0 items-center gap-1 break-words">
              <Icon name="person" className="text-base shrink-0" />
              {task.assignedTo.length > 0 ? task.assignedTo.join(", ") : "Sem destinatário"}
            </span>
            <span className="flex min-w-0 items-center gap-1 break-words">
              <Icon name="domain" className="text-base shrink-0" />
              {task.sector || "Sem setor"}
            </span>
            {task.equipment && (
              <span className="flex min-w-0 items-center gap-1 break-words">
                <Icon name="precision_manufacturing" className="text-base shrink-0" />
                {formatEquipment(task.equipment)}
              </span>
            )}
            {urgency && (
              <span
                className={`${urgency.colorClass} font-bold break-words ${urgency.level === "RED" || urgency.level === "ORANGE" ? "animate-pulse" : ""}`}
              >
                {urgency.timeRemaining}
              </span>
            )}
            {completionLabel && (
              <span className="flex min-w-0 items-center gap-1 text-status-success font-bold break-words">
                <Icon name="check_circle" className="text-base shrink-0" />
                {completionLabel}
              </span>
            )}
          </div>
        </div>
        <TaskBadges task={task} user={user} />
      </div>
    </button>
  );
});

const TaskGridCard = memo(function TaskGridCard({
  task,
  onOpen,
  formatEquipment,
  user,
}: {
  task: TaskRecord;
  onOpen: (id: string) => void;
  formatEquipment: (value: string | undefined) => string;
  user: AuthUser | null;
}) {
  const completionLabel = isTaskCompletedStatus(task.status)
    ? formatTaskCompletionLabel(task)
    : null;
  const urgency = !completionLabel && task.deadline ? getUrgencyLevel(task.deadline) : null;
  const displayStatus = getTaskStatusForUser(task, user);
  const config = TASK_STATUS_CONFIG[displayStatus];
  const visibility = getTaskVisibilityLabel(task);

  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="overflow-hidden bg-surface-container border border-border-low rounded-lg p-4 sm:p-5 text-left hover:border-primary/50 hover:shadow-md transition-industrial group"
    >
      <div className="flex min-w-0 flex-wrap items-start gap-2 mb-3">
        <div className={`max-w-full px-2 py-1 rounded text-[10px] font-bold leading-tight break-words ${config.color}`}>
          {config.label}
        </div>
        <UnreadActivityBadges task={task} user={user} />
      </div>
      <h3 className="font-bold text-on-surface group-hover:text-primary transition-colors mb-3 line-clamp-2 break-words">
        {task.title}
      </h3>
      <div className="space-y-2 text-xs text-on-surface-variant mb-4">
        <p className="break-words">
          <strong>Enviado por:</strong> {task.createdBy || "Sistema"}
        </p>
        <p className="break-words">
          <strong>Destinatários:</strong>{" "}
          {task.assignedTo.length > 0 ? task.assignedTo.join(", ") : "Sem destinatário"}
        </p>
        <p className="break-words">
          <strong>Setor:</strong> {task.sector || "Sem setor"}
        </p>
        {task.equipment && (
          <p className="break-words">
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
        {completionLabel && (
          <p className="text-status-success font-bold flex items-center gap-1">
            <Icon name="check_circle" className="text-base" />
            {completionLabel}
          </p>
        )}
      </div>
      <div className="pt-3 border-t border-border-low flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[10px] font-mono text-on-surface-variant break-all">#{task.id}</span>
          <RecipientViewedDots task={task} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <div className="max-w-full px-2 py-1 rounded text-[10px] font-bold leading-tight bg-surface-high text-on-surface-variant inline-flex items-center gap-1 break-words">
            <Icon name={visibility === "Privada" ? "lock" : "group"} className="text-sm shrink-0" />
            {visibility}
          </div>
          <PriorityBadge priority={task.priority} />
        </div>
      </div>
    </button>
  );
});

function TaskBadges({ task, user }: { task: TaskRecord; user: AuthUser | null }) {
  const config = TASK_STATUS_CONFIG[getTaskStatusForUser(task, user)];
  const visibility = getTaskVisibilityLabel(task);

  return (
    <div
      data-debug-name="TaskBadges"
      data-task-badges
      className="flex w-full min-w-0 flex-wrap items-center justify-start gap-1.5 sm:w-auto sm:flex-shrink-0 sm:justify-end"
    >
      <div className="max-w-full shrink-0 px-2 sm:px-3 py-1 rounded text-[10px] font-bold leading-tight bg-surface-high text-on-surface-variant inline-flex items-center gap-1 whitespace-nowrap">
        <Icon name={visibility === "Privada" ? "lock" : "group"} className="text-sm shrink-0" />
        {visibility}
      </div>
      <PriorityBadge priority={task.priority} />
      <div className={`max-w-full shrink-0 px-2 sm:px-3 py-1 rounded text-[10px] font-bold leading-tight whitespace-nowrap ${config.color}`}>
        {config.label}
      </div>
    </div>
  );
}

const UNREAD_BADGES: Record<UnreadKind, { icon: string; label: string; className: string }> = {
  new: {
    icon: "fiber_new",
    label: "Nova tarefa",
    className: "bg-status-warning/15 text-status-warning border-status-warning/30",
  },
  response: {
    icon: "reply",
    label: "Nova resposta",
    className: "bg-status-info/15 text-status-info border-status-info/30",
  },
  comment: {
    icon: "chat",
    label: "Novo comentário",
    className: "bg-primary/15 text-primary border-primary/30",
  },
  status: {
    icon: "sync_alt",
    label: "Status alterado",
    className: "bg-status-warning/15 text-status-warning border-status-warning/30",
  },
  update: {
    icon: "edit_note",
    label: "Tarefa atualizada",
    className: "bg-status-info/15 text-status-info border-status-info/30",
  },
};

function UnreadActivityBadges({ task, user }: { task: TaskRecord; user: AuthUser | null }) {
  const unread = useMemo(() => getUnreadActivity(task, user?.name), [task, user?.name]);
  if (unread.kinds.length === 0) return null;

  return (
    <span
      data-debug-name="UnreadActivityBadges"
      data-task-unread-badges
      className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5"
    >
      {unread.kinds.map((kind) => {
        const badge = UNREAD_BADGES[kind];
        return (
          <span
            key={kind}
            className={`inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide leading-tight whitespace-nowrap ${badge.className}`}
          >
            <Icon name={badge.icon} className="text-xs shrink-0" />
            {badge.label}
          </span>
        );
      })}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TaskRecord["priority"] }) {
  return (
    <div
      className={`inline-flex max-w-full shrink-0 items-center justify-center rounded px-2 sm:px-3 py-1 text-center text-[10px] font-bold leading-tight whitespace-nowrap ${
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
