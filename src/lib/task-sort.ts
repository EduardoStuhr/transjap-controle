import type { TaskRecord } from "@/lib/task-types";

/**
 * Ordenação estável das tarefas:
 * 1. Tarefas NÃO concluídas primeiro, ordenadas por createdAt desc (mais recentes no topo)
 * 2. Tarefas concluídas vão para o final, ordenadas por updatedAt desc
 *
 * Nada além de "Concluído" muda posição. Visualizar, comentar, mudar prioridade,
 * mudar para "Em andamento" — tudo mantém o card no lugar.
 */
export function sortTasksStable(tasks: TaskRecord[]): TaskRecord[] {
  const active: TaskRecord[] = [];
  const completed: TaskRecord[] = [];

  for (const task of tasks) {
    if (task.status === "Concluído") {
      completed.push(task);
    } else {
      active.push(task);
    }
  }

  active.sort((a, b) => parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt));
  completed.sort((a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt));

  return [...active, ...completed];
}

function parseTimestamp(value: string | undefined): number {
  if (!value) return 0;
  if (value.includes("/")) {
    const [d, m, y] = value.split("/").map(Number);
    if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(y)) {
      return new Date(y, m - 1, d).getTime();
    }
    return 0;
  }
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}
