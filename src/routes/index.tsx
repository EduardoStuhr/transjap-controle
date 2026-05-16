import { toast } from "sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { getUrgencyLevel } from "@/lib/urgency";
import { useTaskStore } from "@/lib/task-store";
import { getMaintenanceAlerts, useMaintenanceStore } from "@/lib/maintenance-store";
import { useInventoryStore } from "@/lib/inventory-store";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const navigate = useNavigate();
  const tasks = useTaskStore((snapshot) => snapshot.tasks);
  const pendingRequests = useTaskStore((snapshot) => snapshot.pendingRequests);
  const maintenances = useMaintenanceStore((snapshot) => snapshot.records);
  const stockMovements = useInventoryStore((snapshot) => snapshot.movements);
  const openTasks = tasks.filter((task) => task.status !== "Concluído");
  const criticalTasks = openTasks
    .filter((task) => task.deadline && getUrgencyLevel(task.deadline).isOverdue)
    .slice(0, 5);
  const completedTasks = tasks.length - openTasks.length;
  const openMaintenances = maintenances.filter((record) => record.status !== "Concluída");
  const maintenanceAlerts = getMaintenanceAlerts(maintenances);
  const completedSteps = maintenances.flatMap((record) =>
    record.steps.filter((step) => step.durationMinutes > 0),
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
    const dateStr = date.toLocaleDateString("pt-BR");

    const activeOnDay = maintenances.filter(
      (m) => m.status !== "Concluída" && m.createdAt <= dateStr,
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
      icon: "new_inbox",
      title: "Solicitações",
      value: String(pendingRequests.length),
      status: "Pendentes",
      tone: "warning",
    },
    {
      icon: "build",
      title: "Manutenções Abertas",
      value: String(openMaintenances.length),
      status: `${maintenanceAlerts.length} gargalo(s)`,
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
            <p className="text-sm text-on-surface-variant">Sem etapas concluídas ainda</p>
          )}
        </div>
        <div className="bg-surface-container border border-border-low p-5 rounded-lg">
          <h3 className="text-sm font-black uppercase tracking-widest mb-4">
            Gargalos do processo
          </h3>
          {maintenanceAlerts.length > 0 ? (
            <div className="space-y-2">
              {maintenanceAlerts.slice(0, 3).map((alert) => (
                <p key={alert.id} className="text-sm text-status-error font-bold">
                  {alert.description}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">Nenhum gargalo ativo</p>
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
                    <span className="truncate">{equipment}</span>
                    <strong>
                      {cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </strong>
                  </p>
                ))}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">Sem custos registrados</p>
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
                      {task.assignedTo.length > 0
                        ? task.assignedTo.join(", ")
                        : "Sem destinatário"}
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
