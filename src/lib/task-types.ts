import type { AttachedFile } from "@/components/AttachmentUpload";

export const TASK_STATUSES = [
  "Não visualizado",
  "Visualizado",
  "Em andamento",
  "Aguardando peças",
  "Aguardando aprovação",
  "Concluído",
  "Atrasado",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["Baixa", "Média", "Alta", "Urgente"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type TaskComment = {
  id: string;
  author: string;
  text: string;
  timestamp: string;
};

export type TimelineEvent = {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  status?: TaskStatus;
};

export type TaskRecord = {
  id: string;
  title: string;
  description: string;
  equipment: string;
  assignedTo: string;
  sector: string;
  priority: TaskPriority;
  deadline: string;
  status: TaskStatus;
  attachments: AttachedFile[];
  comments: TaskComment[];
  timeline: TimelineEvent[];
  createdAt: string;
  updatedAt: string;
  viewed: boolean;
};

export type TaskInput = {
  title: string;
  description: string;
  sector: string;
  priority: TaskPriority;
  assignedTo: string;
  deadline: string;
  equipment: string;
  status: TaskStatus;
  attachments: AttachedFile[];
};

export const TASK_STATUS_CONFIG: Record<
  TaskStatus,
  { color: string; icon: string; label: TaskStatus }
> = {
  "Não visualizado": {
    color: "bg-surface-variant text-on-surface-variant",
    icon: "visibility_off",
    label: "Não visualizado",
  },
  Visualizado: {
    color: "bg-status-info/20 text-status-info",
    icon: "visibility",
    label: "Visualizado",
  },
  "Em andamento": {
    color: "bg-primary-container/20 text-primary-container",
    icon: "pending",
    label: "Em andamento",
  },
  "Aguardando peças": {
    color: "bg-status-warning/20 text-status-warning",
    icon: "settings_suggest",
    label: "Aguardando peças",
  },
  "Aguardando aprovação": {
    color: "bg-surface-high text-on-surface-variant",
    icon: "hourglass_empty",
    label: "Aguardando aprovação",
  },
  Concluído: {
    color: "bg-status-success/20 text-status-success",
    icon: "check_circle",
    label: "Concluído",
  },
  Atrasado: {
    color: "bg-status-error/20 text-status-error",
    icon: "warning",
    label: "Atrasado",
  },
};

export function normalizeTaskStatus(status: string | undefined): TaskStatus {
  switch (status) {
    case "Not Viewed":
    case "Não Visualizado":
    case "Não visualizado":
      return "Não visualizado";
    case "Viewed":
    case "Visualizado":
      return "Visualizado";
    case "In Progress":
    case "Em Andamento":
    case "Em andamento":
      return "Em andamento";
    case "Waiting for Parts":
    case "Aguardando Peças":
    case "Aguardando peças":
      return "Aguardando peças";
    case "Waiting Approval":
    case "Aguardando Aprovação":
    case "Aguardando aprovação":
      return "Aguardando aprovação";
    case "Completed":
    case "Concluído":
      return "Concluído";
    case "Overdue":
    case "Atrasado":
      return "Atrasado";
    default:
      return "Não visualizado";
  }
}

export function normalizeTaskPriority(priority: string | undefined): TaskPriority {
  return TASK_PRIORITIES.includes(priority as TaskPriority) ? (priority as TaskPriority) : "Média";
}
