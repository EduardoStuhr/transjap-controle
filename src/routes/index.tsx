import { toast } from "sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { getUrgencyLevel } from "@/lib/urgency";
import { useTaskStore } from "@/lib/task-store";
import { filterVisibleTasks } from "@/lib/task-visibility";
import { sortTasksStable } from "@/lib/task-sort";
import { useMaintenanceStore } from "@/lib/maintenance-store";
import { useInventoryStore } from "@/lib/inventory-store";
import { useEquipmentStore } from "@/lib/equipment-store";
import { formatEquipmentReference } from "@/lib/operational-options";

export const Route = createFileRoute("/")({ component: Dashboard });

function parseBrDate(str: string): number {
  const [d, m, y] = str.split("/").map(Number);
  if (!d || !m || !y) return 0;
  return new Date(y, m - 1, d).getTime();
}

function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((snapshot) => snapshot.user);
  const tasks = useTaskStore((snapshot) => snapshot.tasks);
  const pendingRequests = useTaskStore((snapshot) => snapshot.pendingRequests);
  const maintenances = useMaintenanceStore((snapshot) => snapshot.records);
  const equipments = useEquipmentStore((snapshot) => snapshot.equipments);
  const stockMovements = useInventoryStore((snapshot) => snapshot.movements);
  const visibleTasks = useMemo(
    () => sortTasksStable(filterVisibleTasks(tasks, user)),
    [tasks, user],
  );
  const visiblePending = useMemo(
    () => filterVisibleTasks(pendingRequests, user),
    [pendingRequests, user],
  );
  const openTasks = visibleTasks.filter((task) => task.status !== "Concluído");
  const criticalTasks = openTasks
    .filter((task) => task.deadline && getUrgencyLevel(task.deadline).isOverdue)
    .slice(0, 5);
  const completedTasks = visibleTasks.length - openTasks.length;
  const openMaintenances = maintenances.filter((record) => record.status !== "Concluída");
  const formatEquipment = (value: string | undefined) =>
    formatEquipmentReference(value, equipments) || "Sem equipamento";
  const completedSteps = maintenances.flatMap((record) =>
    record.steps.filter((step) => step.durationMinutes > 0),
  );
  const stepsInProgress = maintenances.flatMap((record) =>
    record.steps
      .filter((step) => step.status === "em_andamento")
      .map((step) => ({
        id: `${record.id}-${step.id}`,
        equipment: record.equipment,
        label: step.label,
      })),
  );
  const averageStepTime = completedSteps.length
    ? Math.round(
        completedSteps.reduce((sum, step) => sum + step.durationMinutes, 0) / completedSteps.length,
      )
    : 0;
  const slowestSteps = [...completedSteps]
    .sort((a, b) => b.durationMinutes - a.durationMinutes)
    .slice(0, 3);
  const costByEquipment = stockMovements
    .filter((movement) => movement.equipment)
    .reduce<Record<string, number>>((acc, movement) => {
      acc[movement.equipment] = (acc[movement.equipment] || 0) + movement.costImpact;
      return acc;
    }, {});
  const weekDays = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  const today = new Date();
  const fleetData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - i));
    const dayLabel = weekDays[date.getDay()];
    const dayTime = date.getTime();

    const activeOnDay = maintenances.filter(
      (m) => m.status !== "Concluída" && parseBrDate(m.createdAt) <= dayTime,
    ).length;
    const total = Math.max(5, maintenances.length);
    const downPct = Math.min(100, Math.round((activeOnDay / total) * 100));
    const upPct = 100 - downPct;

    return { d: dayLabel, up: upPct, down: downPct };
  });

  const stats = [
    {
      icon: "assignment",
      title: "Tarefas Abertas",
      value: String(openTasks.length),
      status: "Sincronizado",
      tone: "success",
    },
    {
      icon: "inbox",
      title: "Solicitações",
      value: String(visiblePending.length),
      status: "Pendentes",
      tone: "warning",
    },
    {
      icon: "build",
      title: "Manutenções Abertas",
      value: String(openMaintenances.length),
      status: "Ativas",
      tone: "error",
    },
    {
      icon: "timer",
      title: "Tempo Médio Etapa",
      value: `${averageStepTime}m`,
      status: "Pipeline",
      tone: "success",
    },
  ];

  return (
    <AppLayout>
      {criticalTasks.length > 0 && (
        <div className="mb-6 p-4 rounded-lg border border-status-error/40 bg-status-error/10 flex items-center gap-3 animate-pulse">
          <Icon name="warning" className="text-status-error text-2xl" />
          <div className="flex-1">
            <p className="text-sm font-bold text-status-error uppercase tracking-wider">
              {criticalTasks.length} tarefa{criticalTasks.length > 1 ? "s" : ""} em prazo crítico
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Clique em "Prazos Críticos" no painel direito para revisar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/agenda" })}
            className="text-xs font-bold uppercase tracking-wider text-status-error hover:underline"
          >
            Ver agenda →
          </button>
        </div>
      )}

      {/* Key Metrics - Simplified */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div
            key={s.title}
            className="bg-surface-container border border-border-low p-5 shadow-industrial group relative overflow-hidden transition-industrial hover:border-primary/40 hover:shadow-industrial-lg"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="p-2 bg-surface-highest rounded border border-border-low group-hover:border-primary/50 transition-colors">
                <Icon name={s.icon} className="text-primary text-2xl" />
              </div>
              <span
                className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${s.tone === "success" ? "bg-status-success/10 text-status-success" : s.tone === "warning" ? "bg-status-warning/10 text-status-warning" : "bg-status-error/10 text-status-error"}`}
              >
                {s.status}
              </span>
            </div>
            <h3 className="text-[11px] font-black text-on-surface-variant uppercase tracking-widest">
              {s.title}
            </h3>
            <div className="text-4xl font-black text-on-surface mt-2 tracking-tighter">
              {s.value}
            </div>
            <div className="absolute bottom-0 left-0 h-1 w-0 bg-primary group-hover:w-full transition-all duration-700" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-surface-container border border-border-low p-5 rounded-lg">
          <h3 className="text-sm font-black uppercase tracking-widest mb-4">
            Etapas mais demoradas
          </h3>
          {slowestSteps.length > 0 ? (
            <div className="space-y-2">
              {slowestSteps.map((step) => (
                <p
                  key={`${step.id}-${step.completedAt}`}
                  className="text-sm flex justify-between gap-3"
                >
                  <span className="truncate">{step.label}</span>
                  <strong>{step.durationMinutes}m</strong>
                </p>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
              <Icon name="timer" className="text-3xl text-on-surface-variant/30" />
              <p className="text-xs text-on-surface-variant font-medium">
                Conclua etapas para ver tempos
              </p>
            </div>
          )}
        </div>
        <div className="bg-surface-container border border-border-low p-5 rounded-lg">
          <h3 className="text-sm font-black uppercase tracking-widest mb-4">Etapas em andamento</h3>
          {stepsInProgress.length > 0 ? (
            <div className="space-y-2">
              {stepsInProgress.slice(0, 3).map((step) => (
                <p key={step.id} className="text-sm flex justify-between gap-3">
                  <span className="truncate">{formatEquipment(step.equipment)}</span>
                  <strong className="text-on-surface-variant text-xs">{step.label}</strong>
                </p>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
              <Icon name="check_circle" className="text-3xl text-on-surface-variant/30" />
              <p className="text-xs text-on-surface-variant font-medium">
                Nenhuma etapa em execução
              </p>
            </div>
          )}
        </div>
        <div className="bg-surface-container border border-border-low p-5 rounded-lg">
          <h3 className="text-sm font-black uppercase tracking-widest mb-4">
            Custos por equipamento
          </h3>
          {Object.entries(costByEquipment).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(costByEquipment)
                .slice(0, 3)
                .map(([equipment, cost]) => (
                  <p key={equipment} className="text-sm flex justify-between gap-3">
                    <span className="truncate">{formatEquipment(equipment)}</span>
                    <strong>
                      {cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </strong>
                  </p>
                ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
              <Icon name="payments" className="text-3xl text-on-surface-variant/30" />
              <p className="text-xs text-on-surface-variant font-medium">
                Registre movimentações no estoque
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Operational Chart */}
        <div className="lg:col-span-2 bg-surface-container border border-border-low p-6 shadow-industrial rounded-lg">
          <div className="mb-6 border-b border-border-low pb-4">
            <h3 className="text-lg font-black tracking-tight text-on-surface uppercase">
              Disponibilidade Frota
            </h3>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Últimos 7 dias</p>
          </div>
          <div className="flex items-end gap-2 h-48 w-full">
            {fleetData.map((b) => (
              <div key={b.d} className="flex-1 flex flex-col gap-1 items-center group">
                <div
                  className="w-full bg-surface-highest group-hover:bg-status-error/40 transition-colors"
                  style={{ height: `${b.down * 1.5}px` }}
                />
                <div
                  className="w-full bg-primary group-hover:shadow-[0_0_12px_#ffd700] transition-all"
                  style={{ height: `${b.up * 1.5}px` }}
                />
                <span className="text-[10px] font-bold text-on-surface-variant mt-2">{b.d}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-6 mt-6 pt-4 border-t border-border-low">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-primary rounded" />
              <span className="text-[10px] font-bold text-on-surface-variant uppercase">
                Operacional
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-surface-highest rounded" />
              <span className="text-[10px] font-bold text-on-surface-variant uppercase">
                Manutenção
              </span>
            </div>
          </div>
        </div>

        {/* Urgent Tasks */}
        <div className="bg-surface-container border border-status-error/20 p-6 shadow-industrial rounded-lg relative overflow-hidden">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-1.5 bg-status-error/10 rounded">
              <Icon name="emergency" className="text-status-error text-xl" />
            </div>
            <h3 className="text-lg font-black tracking-tight uppercase">Prazos Críticos</h3>
          </div>
          <div className="space-y-3">
            {criticalTasks.length > 0 ? (
              criticalTasks.map((task) => {
                const urgency = getUrgencyLevel(task.deadline);
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() =>
                      toast(task.title, {
                        description: `${task.assignedTo.length > 0 ? task.assignedTo.join(", ") : "Sem destinatário"} · ${urgency.timeRemaining}`,
                      })
                    }
                    className="w-full p-3 bg-surface-highest border-l-4 border-status-error shadow-sm transition-industrial hover:shadow-md hover:translate-x-0.5 text-left group rounded"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[9px] font-black text-status-error uppercase">
                        {urgency.timeRemaining}
                      </span>
                      <span className="text-[9px] font-mono text-on-surface-variant">
                        #{task.id}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate">
                      {task.title}
                    </p>
                    <p className="text-[10px] text-on-surface-variant mt-1">
                      {task.assignedTo.length > 0 ? task.assignedTo.join(", ") : "Sem destinatário"}
                    </p>
                  </button>
                );
              })
            ) : (
              <div className="py-8 text-center text-on-surface-variant">
                <Icon name="check_circle" className="text-4xl opacity-30 mb-2" />
                <p className="text-xs font-bold">Nenhum prazo crítico</p>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            className="w-full mt-4 border-status-error/30 text-status-error hover:bg-status-error hover:text-white font-black text-xs py-2"
            onClick={() => navigate({ to: "/agenda" })}
          >
            Ver Todos
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
