export type UrgencyLevel = "GREEN" | "BLUE" | "YELLOW" | "ORANGE" | "RED";

export interface UrgencyInfo {
  level: UrgencyLevel;
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  timeRemaining: string;
  isOverdue: boolean;
}

export function getUrgencyLevel(deadlineStr: string): UrgencyInfo {
  if (!deadlineStr || deadlineStr === "—") {
    return {
      level: "GREEN",
      label: "No Deadline",
      colorClass: "text-on-surface-variant",
      bgClass: "bg-surface-high",
      borderClass: "border-outline",
      timeRemaining: "Sem prazo",
      isOverdue: false,
    };
  }

  // Handle formats like "16/05/2026" or "2026-05-16"
  let deadline: Date;
  if (deadlineStr.includes("/")) {
    const [day, month, year] = deadlineStr.split("/").map(Number);
    deadline = new Date(year, month - 1, day);
  } else {
    deadline = new Date(deadlineStr);
  }

  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.ceil(diffHours / 24);

  if (diffMs < 0) {
    const overdueDays = Math.abs(Math.floor(diffHours / 24));
    return {
      level: "RED",
      label: "Atrasado",
      colorClass: "text-status-error",
      bgClass: "bg-status-error/10",
      borderClass: "border-status-error",
      timeRemaining: overdueDays === 0 ? "Atrasado hoje" : `Atrasado por ${overdueDays}d`,
      isOverdue: true,
    };
  }

  if (diffHours < 24) {
    return {
      level: "ORANGE",
      label: "Urgente",
      colorClass: "text-status-warning",
      bgClass: "bg-status-warning/10",
      borderClass: "border-status-warning",
      timeRemaining: `Expira em ${Math.round(diffHours)}h`,
      isOverdue: false,
    };
  }

  if (diffHours < 48) {
    return {
      level: "YELLOW",
      label: "Atenção",
      colorClass: "text-status-warning",
      bgClass: "bg-status-warning/10",
      borderClass: "border-status-warning",
      timeRemaining: "Expira em 2 dias",
      isOverdue: false,
    };
  }

  if (diffHours < 72) {
    return {
      level: "BLUE",
      label: "Aproximando",
      colorClass: "text-status-info",
      bgClass: "bg-status-info/10",
      borderClass: "border-status-info",
      timeRemaining: "Expira em 3 dias",
      isOverdue: false,
    };
  }

  return {
    level: "GREEN",
    label: "Normal",
    colorClass: "text-status-success",
    bgClass: "bg-status-success/10",
    borderClass: "border-status-success",
    timeRemaining: `Faltam ${diffDays} dias`,
    isOverdue: false,
  };
}

export function daysSinceBrDate(brDate: string): number {
  if (!brDate) return 0;
  const [d, m, y] = brDate.split("/").map(Number);
  if (!d || !m || !y) return 0;
  const diff = Date.now() - new Date(y, m - 1, d).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}
