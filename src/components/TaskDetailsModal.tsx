import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TASK_STATUS_CONFIG, type TaskRecord } from "@/lib/task-types";

interface TaskDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskRecord | null;
  onAddComment: (taskId: string, comment: { author: string; text: string }) => void;
  onEdit: (task: TaskRecord) => void;
}

export function TaskDetailsModal({
  open,
  onOpenChange,
  task,
  onAddComment,
  onEdit,
}: TaskDetailsModalProps) {
  const [commentAuthor, setCommentAuthor] = useState("");
  const [newComment, setNewComment] = useState("");

  if (!task) return null;

  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const statusTextColor = statusConfig.color.split(" ")[1] || "text-on-surface-variant";
  const statusBgColor = statusConfig.color.split(" ")[0] || "bg-surface-variant";

  const handleAddComment = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newComment.trim() || !commentAuthor.trim()) return;

    onAddComment(task.id, { author: commentAuthor, text: newComment });
    toast.success("Comentário adicionado", { description: "Sua resposta foi registrada." });
    setNewComment("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1 pb-4 border-b border-border-low">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  #{task.id}
                </span>
                <div
                  className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 ${statusBgColor} ${statusTextColor}`}
                >
                  <Icon name={statusConfig.icon} className="text-sm" />
                  {statusConfig.label}
                </div>
              </div>
              <DialogTitle className="text-2xl font-black tracking-tight">{task.title}</DialogTitle>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(task)}>
                <Icon name="edit" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => toast("Compartilhando...")}>
                <Icon name="share" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details" className="flex items-center gap-1.5">
              <Icon name="info" className="text-base" />
              <span className="hidden sm:inline">Detalhes</span>
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-1.5">
              <Icon name="timeline" className="text-base" />
              <span className="hidden sm:inline">Timeline</span>
            </TabsTrigger>
            <TabsTrigger value="comments" className="flex items-center gap-1.5">
              <Icon name="chat" className="text-base" />
              <span className="hidden sm:inline text-xs">Comentários</span>
            </TabsTrigger>
            <TabsTrigger value="attachments" className="flex items-center gap-1.5">
              <Icon name="attach_file" className="text-base" />
              <span className="hidden sm:inline">Anexos</span>
            </TabsTrigger>
          </TabsList>

          {/* DETAILS TAB */}
          <TabsContent value="details" className="space-y-5 mt-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">
                  Responsável
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-black">
                    {(task.assignedTo || "S")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <p className="font-bold text-on-surface">
                      {task.assignedTo || "Sem responsável"}
                    </p>
                    <p className="text-xs text-on-surface-variant">{task.sector || "Sem setor"}</p>
                  </div>
                </div>
              </div>

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
                  Equipamento
                </p>
                <div className="flex items-center gap-2">
                  <Icon name="precision_manufacturing" className="text-primary text-lg" />
                  <p className="font-bold text-on-surface">{task.equipment || "Sem equipamento"}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">
                  Data Limite
                </p>
                <div className="flex items-center gap-2">
                  <Icon name="calendar_today" className="text-on-surface-variant text-lg" />
                  <p className="font-bold text-on-surface">{task.deadline || "Sem prazo"}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">
                  Criado em
                </p>
                <p className="font-bold text-on-surface">{task.createdAt}</p>
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

          {/* TIMELINE TAB */}
          <TabsContent value="timeline" className="space-y-4 mt-5">
            <div className="space-y-4">
              {task.timeline.length > 0 ? (
                task.timeline.map((event, index) => (
                  <div key={event.id} className="relative flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary">
                        <Icon name="event" className="text-primary" />
                      </div>
                      {index !== task.timeline.length - 1 && (
                        <div className="w-0.5 h-12 bg-border-low mt-2" />
                      )}
                    </div>
                    <div className="flex-1 pt-2">
                      <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest">
                        {event.timestamp}
                      </p>
                      <p className="font-bold text-on-surface">{event.action}</p>
                      <p className="text-sm text-on-surface-variant">por {event.actor}</p>
                      {event.status && (
                        <div className="mt-2 inline-flex items-center gap-2 bg-surface-high px-3 py-1 rounded text-xs font-bold">
                          <span className="w-2 h-2 rounded-full bg-primary" />
                          {event.status}
                        </div>
                      )}
                    </div>
                  </div>
                ))
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
            {/* Comments List */}
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
                          <p className="text-[10px] text-on-surface-variant">{comment.timestamp}</p>
                        </div>
                      </div>
                      <button className="text-on-surface-variant hover:text-primary transition-colors">
                        <Icon name="more_vert" />
                      </button>
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

            {/* Add Comment Form */}
            <form onSubmit={handleAddComment} className="border-t border-border-low pt-4 space-y-3">
              <div>
                <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2 block">
                  Autor
                </label>
                <input
                  value={commentAuthor}
                  onChange={(e) => setCommentAuthor(e.target.value)}
                  placeholder="Seu nome ou equipe"
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
                  placeholder="Digite sua resposta ou atualização..."
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
    </Dialog>
  );
}
