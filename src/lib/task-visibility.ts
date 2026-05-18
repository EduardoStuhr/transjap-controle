import type { AuthUser } from "@/lib/auth-store";
import type { TaskRecord } from "@/lib/task-types";

/**
 * Define se o usuário logado pode ver uma tarefa específica.
 * Administradores veem tudo. Demais veem se forem criadores ou destinatários.
 * Tarefas legadas sem `createdBy` só ficam visíveis para administradores.
 */
export function canUserSeeTask(task: TaskRecord, user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.role === "administrador") return true;
  if (!task.createdBy) return false;
  if (task.createdBy === user.name) return true;
  if (task.assignedTo.includes("Todos")) return true;
  return task.assignedTo.includes(user.name);
}

export function filterVisibleTasks(tasks: TaskRecord[], user: AuthUser | null): TaskRecord[] {
  return tasks.filter((task) => canUserSeeTask(task, user));
}
