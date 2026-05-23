import type { AuthUser } from "@/lib/auth-store";
import type { TaskRecord } from "@/lib/task-types";

/**
 * Todos os usuários autenticados têm acesso total — qualquer tarefa é visível.
 */
export function canUserSeeTask(_task: TaskRecord, user: AuthUser | null): boolean {
  return Boolean(user);
}

export function filterVisibleTasks(tasks: TaskRecord[], user: AuthUser | null): TaskRecord[] {
  return user ? tasks : [];
}
