import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import { useTaskStore } from "@/lib/task-store";
import { useMaintenanceStore } from "@/lib/maintenance-store";
import { useInventoryStore } from "@/lib/inventory-store";
import { useAuthStore } from "@/lib/auth-store";
import { filterVisibleTasks } from "@/lib/task-visibility";

export const Route = createFileRoute("/relatorios")({ component: Relatorios });

type ReportKey = "desempenho" | "tipos" | "consumo" | "responsavel";

type ReportCard = {
  key: ReportKey;
  title: string;
  desc: string;
  icon: string;
};

const REPORTS: ReportCard[] = [
  {
    key: "desempenho",
    title: "Desempenho Operacional",
    desc: "Horas de operação x parada por equipamento.",
    icon: "monitoring",
  },
  {
    key: "tipos",
    title: "Manutenções por Tipo",
    desc: "Distribuição entre preventivas e corretivas.",
    icon: "donut_small",
  },
  {
    key: "consumo",
    title: "Consumo de Peças",
    desc: "Peças mais utilizadas no almoxarifado.",
    icon: "inventory",
  },
  {
    key: "responsavel",
    title: "Tarefas por Responsável",
    desc: "Produtividade da equipe por período.",
    icon: "groups",
  },
];

function Relatorios() {
  const [openReport, setOpenReport] = useState<ReportKey | null>(null);
  const user = useAuthStore((s) => s.user);
  const allTasks = useTaskStore((s) => s.tasks);
  const tasks = useMemo(() => filterVisibleTasks(allTasks, user), [allTasks, user]);
  const maintenances = useMaintenanceStore((s) => s.records);
  const movements = useInventoryStore((s) => s.movements);

  const byType = useMemo(() => {
    const grouped = maintenances.reduce<Record<string, number>>((acc, m) => {
      acc[m.type] = (acc[m.type] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  }, [maintenances]);

  const topConsumed = useMemo(() => {
    const grouped = movements
      .filter((mv) => mv.type === "uso em manutenção")
      .reduce<Record<string, number>>((acc, mv) => {
        acc[mv.itemName] = (acc[mv.itemName] || 0) + mv.quantity;
        return acc;
      }, {});
    return Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [movements]);

  const tasksByResponsible = useMemo(() => {
    const grouped = tasks.reduce<Record<string, number>>((acc, t) => {
      const recipients = t.assignedTo.length > 0 ? t.assignedTo : ["Sem destinatário"];
      recipients.forEach((name) => {
        acc[name] = (acc[name] || 0) + 1;
      });
      return acc;
    }, {});
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  }, [tasks]);

  const performance = useMemo(() => {
    const total = maintenances.length;
    const completed = maintenances.filter((m) => m.status === "Concluída").length;
    const completionPct = total === 0 ? 0 : Math.round((completed / total) * 100);

    const completedSteps = maintenances.flatMap((record) =>
      record.steps.filter((step) => step.durationMinutes > 0),
    );
    const avgStepTime = completedSteps.length
      ? Math.round(
          completedSteps.reduce((sum, step) => sum + step.durationMinutes, 0) /
            completedSteps.length,
        )
      : 0;

    const byEquipment = maintenances.reduce<Record<string, number>>((acc, m) => {
      acc[m.equipment] = (acc[m.equipment] || 0) + 1;
      return acc;
    }, {});
    const topEquipments = Object.entries(byEquipment)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return { total, completionPct, avgStepTime, topEquipments };
  }, [maintenances]);

  const toggle = (key: ReportKey) => setOpenReport((current) => (current === key ? null : key));

  return (
    <AppLayout title="Relatórios">
      <p className="text-on-surface-variant -mt-4 mb-8 text-base">
        Indicadores e relatórios consolidados da operação.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {REPORTS.map((r) => {
          const isOpen = openReport === r.key;
          return (
            <div
              key={r.key}
              className="bg-surface-container border border-border-low p-6 flex gap-4 items-start hover:border-primary-container/50 transition-colors"
            >
              <div className="w-12 h-12 bg-primary-container/10 flex items-center justify-center rounded">
                <Icon name={r.icon} className="text-primary-container text-2xl" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold">{r.title}</h3>
                <p className="text-sm text-on-surface-variant mt-1">{r.desc}</p>
                <button
                  type="button"
                  onClick={() => toggle(r.key)}
                  className="mt-3 text-sm font-semibold text-primary-container hover:underline"
                >
                  {isOpen ? "Fechar →" : "Gerar relatório →"}
                </button>

                {isOpen && (
                  <div className="border-t border-border-low pt-4 mt-4">
                    {r.key === "tipos" && (
                      <ReportList
                        rows={byType.map(([type, count]) => ({
                          label: type,
                          value: `${count}`,
                        }))}
                        emptyText="Nenhuma manutenção registrada."
                      />
                    )}

                    {r.key === "consumo" && (
                      <ReportList
                        rows={topConsumed.map(([item, qty]) => ({
                          label: item,
                          value: `${qty} un.`,
                        }))}
                        emptyText="Nenhum consumo de peças registrado."
                      />
                    )}

                    {r.key === "responsavel" && (
                      <ReportList
                        rows={tasksByResponsible.map(([name, total]) => ({
                          label: name,
                          value: `${total} tarefa(s)`,
                        }))}
                        emptyText="Nenhuma tarefa cadastrada."
                      />
                    )}

                    {r.key === "desempenho" && (
                      <div className="space-y-3">
                        <ReportList
                          rows={[
                            { label: "Total de manutenções", value: `${performance.total}` },
                            {
                              label: "% concluídas",
                              value: `${performance.completionPct}%`,
                            },
                            {
                              label: "Tempo médio por etapa",
                              value: `${performance.avgStepTime} min`,
                            },
                          ]}
                          emptyText=""
                        />
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">
                            Top 3 equipamentos com mais manutenções
                          </p>
                          <ReportList
                            rows={performance.topEquipments.map(([equipment, count]) => ({
                              label: equipment,
                              value: `${count}`,
                            }))}
                            emptyText="Sem dados de equipamentos."
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
}

function ReportList({
  rows,
  emptyText,
}: {
  rows: Array<{ label: string; value: string }>;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return emptyText ? <p className="text-sm text-on-surface-variant">{emptyText}</p> : null;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-on-surface truncate">{row.label}</span>
          <strong className="text-on-surface font-black">{row.value}</strong>
        </li>
      ))}
    </ul>
  );
}
