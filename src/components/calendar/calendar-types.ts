export type CalendarItemType = "received_task" | "created_task" | "reminder" | "event" | "overdue";

export type CalendarViewMode = "month" | "week" | "day";

export type CalendarFilter = "all" | "received" | "created" | "reminders" | "events" | "overdue";

export type CalendarItemSource = "task" | "reminder";

export type CalendarItem = {
  id: string;
  sourceId: string;
  source: CalendarItemSource;
  title: string;
  type: CalendarItemType;
  date: string;
  time: string;
  endTime?: string;
  status: string;
  priority: string;
  createdBy: string;
  assignedTo: string[];
  description: string;
  location?: string;
  completed?: boolean;
  originalType?: Exclude<CalendarItemType, "overdue">;
};

export const CALENDAR_TYPE_META: Record<
  CalendarItemType,
  { label: string; color: string; bg: string; border: string; text: string; icon: string }
> = {
  received_task: {
    label: "Recebida",
    color: "#3b82f6",
    bg: "bg-blue-500/18",
    border: "border-blue-400/30",
    text: "text-blue-100",
    icon: "inbox",
  },
  created_task: {
    label: "Criada",
    color: "#fbbf24",
    bg: "bg-amber-400/18",
    border: "border-amber-300/35",
    text: "text-amber-100",
    icon: "edit_square",
  },
  reminder: {
    label: "Lembrete",
    color: "#10b981",
    bg: "bg-emerald-500/18",
    border: "border-emerald-400/30",
    text: "text-emerald-100",
    icon: "notifications",
  },
  event: {
    label: "Evento",
    color: "#a855f7",
    bg: "bg-purple-500/18",
    border: "border-purple-400/30",
    text: "text-purple-100",
    icon: "event",
  },
  overdue: {
    label: "Atrasada",
    color: "#ef4444",
    bg: "bg-red-500/18",
    border: "border-red-400/35",
    text: "text-red-100",
    icon: "warning",
  },
};

export const PRIORITY_META: Record<string, { label: string; className: string }> = {
  baixa: { label: "Baixa", className: "bg-surface-highest text-on-surface-variant" },
  média: { label: "Média", className: "bg-status-info/15 text-status-info" },
  media: { label: "Média", className: "bg-status-info/15 text-status-info" },
  alta: { label: "Alta", className: "bg-status-warning/15 text-status-warning" },
  urgente: { label: "Urgente", className: "bg-status-error/15 text-status-error" },
};

export function priorityMeta(priority: string | undefined) {
  return PRIORITY_META[(priority || "média").toLowerCase()] ?? PRIORITY_META["média"];
}
