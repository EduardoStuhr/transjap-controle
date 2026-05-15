import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";

export const Route = createFileRoute("/relatorios")({ component: Relatorios });

const REPORTS = [
  {
    title: "Desempenho Operacional",
    desc: "Horas de operação x parada por equipamento.",
    icon: "monitoring",
  },
  {
    title: "Manutenções por Tipo",
    desc: "Distribuição entre preventivas e corretivas.",
    icon: "donut_small",
  },
  { title: "Consumo de Peças", desc: "Peças mais utilizadas no almoxarifado.", icon: "inventory" },
  {
    title: "Tarefas por Responsável",
    desc: "Produtividade da equipe por período.",
    icon: "groups",
  },
];

function Relatorios() {
  return (
    <AppLayout title="Relatórios">
      <p className="text-on-surface-variant -mt-4 mb-8 text-base">
        Indicadores e relatórios consolidados da operação.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {REPORTS.map((r) => (
          <div
            key={r.title}
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
                onClick={() => toast("Relatório", { description: `Gerando: ${r.title}` })}
                className="mt-3 text-sm font-semibold text-primary-container hover:underline"
              >
                Gerar relatório →
              </button>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
