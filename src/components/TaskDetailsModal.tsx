import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttachmentUpload, type AttachedFile } from "@/components/AttachmentUpload";
import { TaskStatusControls } from "@/components/TaskStatusControls";
import { ResponseWithStatusDialog } from "@/components/ResponseWithStatusDialog";
import {
  formatTaskCompletionLabel,
  isTaskCompletedStatus,
  TASK_STATUS_CONFIG,
  type TaskRecord,
} from "@/lib/task-types";
import type { TaskStatus } from "@/lib/task-types";
import { useAuthStore } from "@/lib/auth-store";
import { formatEquipmentReference, resolveRecipients } from "@/lib/operational-options";
import {
  canAdminViewAllTasks,
  getTaskStatusForUser,
  getTaskViewedAtForRecipient,
  getTaskVisibilityLabel,
  isUserTaskRecipient,
} from "@/lib/task-visibility";
import { useEquipmentStore } from "@/lib/equipment-store";
import { downloadAttachment, exportTaskAsCsv, exportTaskAsPdf } from "@/lib/task-export";
import { formatBrDate, formatBrDateTime } from "@/lib/utils";

interface TaskDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskRecord | null;
  onAddComment: (
    taskId: string,
    comment: { author: string; text: string },
  ) => void | Promise<unknown>;
  onAddResponse: (
    taskId: string,
    response: { text: string; attachments: AttachedFile[] },
  ) => void | Promise<unknown>;
  onEdit: (task: TaskRecord) => void;
  onDelete?: (task: TaskRecord) => void | Promise<unknown>;
  onChangeStatus?: (taskId: string, status: TaskStatus) => void | Promise<unknown>;
  onSendResponseWithStatus?: (
    taskId: string,
    response: { text: string; attachments: AttachedFile[] },
    nextStatus: TaskStatus | null,
  ) => void | Promise<unknown>;
}

function formatViewedAt(iso?: string) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function TaskDetailsModal({
  open,
  onOpenChange,
  task: incomingTask,
  onAddComment,
  onAddResponse,
  onEdit,
  onDelete,
  onChangeStatus,
  onSendResponseWithStatus,
}: TaskDetailsModalProps) {
  const user = useAuthStore((snapshot) => snapshot.user);
  const equipments = useEquipmentStore((snapshot) => snapshot.equipments);
  const commentAuthor = user?.name || "";
  const [newComment, setNewComment] = useState("");
  const [responseText, setResponseText] = useState("");
  const [responseAttachments, setResponseAttachments] = useState<AttachedFile[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [sendingResponse, setSendingResponse] = useState(false);
  const [liveTask, setLiveTask] = useState<TaskRecord | null>(incomingTask);
  const task = liveTask;

  useEffect(() => {
    setLiveTask(incomingTask);
  }, [incomingTask]);

  const recipients = useMemo(
    () =>
      task
        ? resolveRecipients(task.assignedTo).filter((recipient) => recipient !== task.createdBy)
        : [],
    [task],
  );
  const isRecipient = Boolean(task && isUserTaskRecipient(task, user));
  const isCreator = Boolean(
    user && task && (task.createdBy === user.name || task.createdById === user.id),
  );
  const canManageTask = Boolean(user && task && (canAdminViewAllTasks(user) || isCreator));

  if (!task) return null;

  const applyOptimisticStatus = (nextStatus: TaskStatus) => {
    const timestamp = new Date().toISOString();
    const actor = user?.name || "Sistema";
    setLiveTask((current) => {
      if (!current || current.status === nextStatus) return current;
      const completed = isTaskCompletedStatus(nextStatus);
      const reopened = isTaskCompletedStatus(current.status) && !completed;
      return {
        ...current,
        status: nextStatus,
        completedAt: completed ? current.completedAt || timestamp : "",
        completedBy: completed ? current.completedBy || actor : "",
        updatedAt: timestamp,
        timeline: [
          {
            id: `EV-OPT-${Date.now()}`,
            timestamp,
            action: completed
              ? `Tarefa concluída por ${actor}`
              : reopened
                ? `Tarefa reaberta por ${actor}`
                : `Status alterado de ${current.status} para ${nextStatus}`,
            actor,
            status: nextStatus,
          },
          ...current.timeline,
        ],
      };
    });
  };

  const handleStatusChange = async (taskId: string, nextStatus: TaskStatus) => {
    if (!onChangeStatus) return;
    applyOptimisticStatus(nextStatus);
    try {
      await onChangeStatus(taskId, nextStatus);
    } catch (error) {
      setLiveTask(incomingTask);
      throw error;
    }
  };

  const handleConfirmDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(task);
      toast.success("Tarefa excluída", { description: task.title });
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (err) {
      toast.error("Falha ao excluir", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDeleting(false);
    }
  };

  const statusConfig = TASK_STATUS_CONFIG[getTaskStatusForUser(task, user)];
  const completionLabel = isTaskCompletedStatus(task.status)
    ? formatTaskCompletionLabel(task)
    : null;
  const statusTextColor = statusConfig.color.split(" ")[1] || "text-on-surface-variant";
  const statusBgColor = statusConfig.color.split(" ")[0] || "bg-surface-variant";

  const handleAddComment = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newComment.trim() || !commentAuthor.trim()) return;

    await onAddComment(task.id, { author: commentAuthor, text: newComment });
    toast.success("Comentário adicionado", { description: "Sua mensagem foi registrada." });
    setNewComment("");
  };

  const handleOpenResponseDialog = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!responseText.trim()) return;
    setStatusDialogOpen(true);
  };

  const handleConfirmResponseWithStatus = async (chosen: TaskStatus | "manter") => {
    if (!responseText.trim()) return;
    setSendingResponse(true);
    try {
      const nextStatus: TaskStatus | null = chosen === "manter" ? null : chosen;
      const payload = { text: responseText, attachments: responseAttachments };
      if (nextStatus) applyOptimisticStatus(nextStatus);

      if (onSendResponseWithStatus) {
        await onSendResponseWithStatus(task.id, payload, nextStatus);
      } else {
        await onAddResponse(task.id, payload);
        if (nextStatus && onChangeStatus) {
          await onChangeStatus(task.id, nextStatus);
        }
      }

      toast.success(
        nextStatus === "Concluído"
          ? "Tarefa concluída com sucesso"
          : nextStatus === "Em andamento" && isTaskCompletedStatus(task.status)
            ? "Tarefa reaberta com sucesso"
            : nextStatus
              ? `Resposta enviada · status: ${nextStatus}`
              : "Resposta enviada",
      );
      setResponseText("");
      setResponseAttachments([]);
      setStatusDialogOpen(false);
    } catch (err) {
      setLiveTask(incomingTask);
      toast.error(`Falha ao enviar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSendingResponse(false);
    }
  };

  const handleDownload = (file: AttachedFile) => {
    const ok = downloadAttachment(file);
    if (!ok) toast.error("Arquivo indisponível", { description: file.name });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1 pb-4 border-b border-border-low">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  #{task.id}
                </span>
                <div
                  className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 ${statusBgColor} ${statusTextColor}`}
                >
                  <Icon name={statusConfig.icon} className="text-sm" />
                  {statusConfig.label}
                </div>
                <div className="px-2 py-1 rounded text-xs font-bold flex items-center gap-1 bg-surface-high text-on-surface-variant">
                  <Icon
                    name={getTaskVisibilityLabel(task) === "Privada" ? "lock" : "group"}
                    className="text-sm"
                  />
                  {getTaskVisibilityLabel(task)}
                </div>
              </div>
              <DialogTitle className="text-2xl font-black tracking-tight">{task.title}</DialogTitle>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {canManageTask && (
                <Button size="sm" variant="outline" onClick={() => onEdit(task)}>
                  <Icon name="edit" />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                title="Exportar PDF"
                onClick={() => exportTaskAsPdf(task)}
              >
                <Icon name="picture_as_pdf" />
              </Button>
              {canManageTask && onDelete && (
                <Button
                  size="sm"
                  variant="outline"
                  title="Excluir tarefa"
                  className="text-status-error border-status-error/40 hover:bg-status-error/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Icon name="delete" />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                title="Exportar planilha (.csv)"
                onClick={() => exportTaskAsCsv(task)}
              >
                <Icon name="table_view" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="details" className="flex items-center gap-1.5">
              <Icon name="info" className="text-base" />
              <span className="hidden sm:inline text-xs">Detalhes</span>
            </TabsTrigger>
            <TabsTrigger value="responses" className="flex items-center gap-1.5">
              <Icon name="reply" className="text-base" />
              <span className="hidden sm:inline text-xs">Respostas</span>
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-1.5">
              <Icon name="timeline" className="text-base" />
              <span className="hidden sm:inline text-xs">Timeline</span>
            </TabsTrigger>
            <TabsTrigger value="comments" className="flex items-center gap-1.5">
              <Icon name="chat" className="text-base" />
              <span className="hidden sm:inline text-xs">Comentários</span>
            </TabsTrigger>
            <TabsTrigger value="attachments" className="flex items-center gap-1.5">
              <Icon name="attach_file" className="text-base" />
              <span className="hidden sm:inline text-xs">Anexos</span>
            </TabsTrigger>
          </TabsList>

          {/* DETAILS TAB */}
          <TabsContent value="details" className="space-y-5 mt-5">
            <div>
              <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-3">
                Destinatários ({recipients.length})
              </p>
              {recipients.length === 0 ? (
                <p className="text-sm text-on-surface-variant">Sem destinatários.</p>
              ) : (
                <ul className="space-y-2">
                  {recipients.map((name) => {
                    const viewedAt = formatViewedAt(getTaskViewedAtForRecipient(task, name));
                    return (
                      <li
                        key={name}
                        className="flex items-center justify-between gap-3 bg-surface-highest/50 border border-border-low rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-black text-sm">
                            {name[0]?.toUpperCase() ?? "?"}
                          </div>
                          <span className="font-bold text-on-surface truncate">{name}</span>
                        </div>
                        {viewedAt ? (
                          <span className="flex items-center gap-1 text-xs font-bold text-status-info">
                            <Icon name="visibility" className="text-base" />
                            Visto em {viewedAt}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-bold text-on-surface-variant">
                            <Icon name="visibility_off" className="text-base" />
                            Não visualizado
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">
                  Prioridade
                </p>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded ${
                      task.priority === "Urgente"
                        ? "bg-status-error"
                        : task.priority === "Alta"
                          ? "bg-status-warning"
                          : task.priority === "Média"
                            ? "bg-primary"
                            : "bg-status-info"
                    }`}
                  />
                  <p className="font-bold text-on-surface">{task.priority}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">
                  Setor
                </p>
                <p className="font-bold text-on-surface">{task.sector || "Sem setor"}</p>
              </div>

              <div>
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">
                  Equipamento
                </p>
                <div className="flex items-center gap-2">
                  <Icon name="precision_manufacturing" className="text-primary text-lg" />
                  <p className="font-bold text-on-surface">
                    {formatEquipmentReference(task.equipment, equipments) || "Sem equipamento"}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">
                  Data Limite
                </p>
                <div className="flex items-center gap-2">
                  <Icon name="calendar_today" className="text-on-surface-variant text-lg" />
                  <p className="font-bold text-on-surface">
                    {task.deadline ? formatBrDate(task.deadline) : "Sem prazo"}
                  </p>
                </div>
              </div>

              {completionLabel && (
                <div>
                  <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">
                    Conclusão
                  </p>
                  <div className="flex items-center gap-2 text-status-success font-bold">
                    <Icon name="check_circle" className="text-lg" />
                    <p>
                      {completionLabel}
                      {task.completedBy ? ` por ${task.completedBy}` : ""}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">
                  Criado em
                </p>
                <p className="font-bold text-on-surface">{formatBrDate(task.createdAt)}</p>
              </div>

              <div>
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">
                  Enviado por
                </p>
                <div className="flex items-center gap-2">
                  <Icon name="outgoing_mail" className="text-on-surface-variant text-lg" />
                  <p className="font-bold text-on-surface">{task.createdBy || "Sistema"}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-3">
                Descrição
              </p>
              <div className="bg-surface-highest/50 border border-border-low rounded-lg p-4 text-on-surface leading-relaxed">
                {task.description || "Sem descrição"}
              </div>
            </div>
          </TabsContent>

          {/* RESPONSES TAB */}
          <TabsContent value="responses" className="space-y-5 mt-5">
            {onChangeStatus && (
              <TaskStatusControls
                task={task}
                canChange={canManageTask || isRecipient}
                onChangeStatus={handleStatusChange}
              />
            )}

            <div className="space-y-3">
              {task.responses.length === 0 ? (
                <div className="text-center py-6 text-on-surface-variant">
                  <Icon name="forum" className="text-4xl mx-auto mb-2 opacity-30" />
                  <p>Nenhuma resposta ainda</p>
                </div>
              ) : (
                task.responses.map((response) => (
                  <article
                    key={response.id}
                    className="border border-border-low rounded-lg p-4 bg-surface-highest/40"
                  >
                    <header className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black">
                          {response.author[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-on-surface">{response.author}</p>
                          <p className="text-[10px] text-on-surface-variant">
                            {formatBrDateTime(response.timestamp)}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-status-info bg-status-info/10 px-2 py-1 rounded">
                        Destinatário
                      </span>
                    </header>
                    <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                      {response.text}
                    </p>
                    {response.attachments.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {response.attachments.map((file) => (
                          <li key={file.id}>
                            <button
                              type="button"
                              onClick={() => handleDownload(file)}
                              className="w-full text-left flex items-center gap-2 px-2 py-1 rounded bg-surface-low hover:bg-surface-high transition-colors"
                            >
                              <Icon
                                name={
                                  file.type === "image"
                                    ? "image"
                                    : file.type === "pdf"
                                      ? "picture_as_pdf"
                                      : "description"
                                }
                                className="text-primary text-base"
                              />
                              <span className="text-xs text-on-surface truncate flex-1">
                                {file.name}
                              </span>
                              <span className="text-[10px] text-on-surface-variant">
                                {(file.size / 1024).toFixed(0)} KB
                              </span>
                              <Icon name="download" className="text-on-surface-variant text-base" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))
              )}
            </div>

            {isRecipient ? (
              <form
                onSubmit={handleOpenResponseDialog}
                className="border-t border-border-low pt-4 space-y-3"
              >
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest">
                  Responder como {user?.name}
                </p>
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Sua resposta para esta solicitação..."
                  rows={3}
                  className="w-full px-4 py-3 bg-surface-highest border border-border-low rounded-lg text-on-surface placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial font-medium resize-none"
                />
                <AttachmentUpload
                  files={responseAttachments}
                  onFilesChange={setResponseAttachments}
                  maxFiles={5}
                  maxSize={20}
                />
                <Button type="submit" disabled={!responseText.trim()} className="w-full font-black">
                  <Icon name="send" />
                  Enviar Resposta
                </Button>
              </form>
            ) : (
              <div className="border-t border-border-low pt-4 text-xs text-on-surface-variant">
                {user
                  ? "Apenas destinatários da tarefa podem responder."
                  : "Faça login como destinatário para responder."}
              </div>
            )}
          </TabsContent>

          {/* TIMELINE TAB */}
          <TabsContent value="timeline" className="space-y-4 mt-5">
            <div className="space-y-4">
              {task.timeline.length > 0 ? (
                task.timeline.map((event, index) => {
                  const eventCfg = event.status ? TASK_STATUS_CONFIG[event.status] : null;
                  const eventColor = eventCfg?.color.split(" ")[1] || "text-primary";
                  const eventBg = eventCfg?.color.split(" ")[0] || "bg-primary/20";
                  const eventIcon = eventCfg?.icon || "event";
                  return (
                    <div key={event.id} className="relative flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-10 h-10 rounded-full ${eventBg} flex items-center justify-center border-2 border-border-low`}
                        >
                          <Icon name={eventIcon} className={eventColor} />
                        </div>
                        {index !== task.timeline.length - 1 && (
                          <div className="w-0.5 h-12 bg-border-low mt-2" />
                        )}
                      </div>
                      <div className="flex-1 pt-2">
                        <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest">
                          {formatBrDateTime(event.timestamp)}
                        </p>
                        <p className="font-bold text-on-surface">{event.action}</p>
                        <p className="text-sm text-on-surface-variant">por {event.actor}</p>
                        {event.status && eventCfg && (
                          <div
                            className={`mt-2 inline-flex items-center gap-2 ${eventCfg.color} px-3 py-1 rounded text-xs font-bold`}
                          >
                            <Icon name={eventCfg.icon} className="text-sm" />
                            {event.status}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8">
                  <Icon
                    name="history"
                    className="text-on-surface-variant/30 text-5xl mx-auto mb-3"
                  />
                  <p className="text-on-surface-variant">Sem eventos no histórico ainda</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* COMMENTS TAB */}
          <TabsContent value="comments" className="space-y-5 mt-5">
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {task.comments.length > 0 ? (
                task.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="border border-border-low rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                          {comment.author[0]}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-on-surface">{comment.author}</p>
                          <p className="text-[10px] text-on-surface-variant">
                            {formatBrDateTime(comment.timestamp)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-on-surface leading-relaxed">{comment.text}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-on-surface-variant">
                  <Icon name="chat_bubble_outline" className="text-4xl mx-auto mb-2 opacity-30" />
                  <p>Nenhum comentário ainda</p>
                </div>
              )}
            </div>

            <form onSubmit={handleAddComment} className="border-t border-border-low pt-4 space-y-3">
              <p className="text-xs text-on-surface-variant">
                Comentários são públicos e podem ser feitos por qualquer pessoa. Para respostas
                oficiais, use a aba <strong>Respostas</strong>.
              </p>
              <div>
                <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2 block">
                  Autor
                </label>
                <input
                  value={commentAuthor}
                  readOnly
                  className="w-full px-4 py-2 bg-surface-highest border border-border-low rounded-lg text-on-surface placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial font-medium"
                />
              </div>
              <div>
                <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2 block">
                  Comentário
                </label>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Digite seu comentário..."
                  rows={3}
                  className="w-full px-4 py-3 bg-surface-highest border border-border-low rounded-lg text-on-surface placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial font-medium resize-none"
                />
              </div>
              <Button
                type="submit"
                disabled={!newComment.trim() || !commentAuthor.trim()}
                className="w-full font-black"
              >
                <Icon name="send" />
                Enviar Comentário
              </Button>
            </form>
          </TabsContent>

          {/* ATTACHMENTS TAB */}
          <TabsContent value="attachments" className="space-y-4 mt-5">
            {task.attachments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {task.attachments.map((file) => (
                  <div
                    key={file.id}
                    className="border border-border-low rounded-lg p-4 hover:bg-surface-high transition-colors group"
                  >
                    {file.type === "image" && file.preview && (
                      <div className="mb-3 h-24 w-full bg-surface-lowest rounded overflow-hidden">
                        <img
                          src={file.preview}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-surface-lowest rounded">
                        <Icon
                          name={
                            file.type === "image"
                              ? "image"
                              : file.type === "pdf"
                                ? "picture_as_pdf"
                                : "description"
                          }
                          className="text-primary text-lg"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-on-surface truncate">{file.name}</p>
                        <p className="text-[10px] text-on-surface-variant">
                          {(file.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownload(file)}
                        className="p-1 text-on-surface-variant hover:text-primary transition-colors"
                        title="Baixar"
                      >
                        <Icon name="download" className="text-lg" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-on-surface-variant">
                <Icon name="folder_open" className="text-5xl mx-auto mb-3 opacity-30" />
                <p>Nenhum anexo nesta tarefa</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa <strong>{task.title}</strong> será removida para você e para todos os
              destinatários. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              className="bg-status-error text-white hover:bg-status-error/90"
            >
              {deleting ? "Excluindo…" : "Excluir tarefa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ResponseWithStatusDialog
        open={statusDialogOpen}
        responseText={responseText}
        currentStatus={task.status}
        onConfirm={(chosen) => void handleConfirmResponseWithStatus(chosen)}
        onCancel={() => setStatusDialogOpen(false)}
        submitting={sendingResponse}
      />
    </Dialog>
  );
}
