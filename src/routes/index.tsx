import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import heroImg from "@/assets/industrial-hero.jpg";

export const Route = createFileRoute("/")({ component: Dashboard });

const STATS: { icon: string; title: string; value: string; status: string; statusTone: string; iconFilled?: boolean }[] = [
  { icon: "precision_manufacturing", title: "Equipamentos Ativos", value: "48", status: "+3 este mês", statusTone: "success" },
  { icon: "assignment", title: "Solicitações em Aberto", value: "12", status: "4 urgentes", statusTone: "muted" },
  { icon: "report", iconFilled: true, title: "Manutenções Pendentes", value: "05", status: "Atenção necessária", statusTone: "error" },
  { icon: "health_and_safety", title: "Operacional da Frota", value: "92%", status: "Funcionamento estável", statusTone: "success" },
];

const ALERTS = [
  { type: "CRÍTICO", tone: "error", text: "Escavadeira EX-320 necessita troca imediata do sistema hidráulico.", time: "Há 1 hora" },
  { type: "PRÓXIMO DO PRAZO", tone: "warning", text: "Caminhão Volvo FH-540 programado para revisão preventiva.", time: "Hoje às 18:00" },
  { type: "INSPEÇÃO", tone: "muted", text: "Pá carregadeira CAT 950 precisa de inspeção semanal.", time: "Amanhã" },
];

const TASKS = [
  { id: "#TK-0512", equipment: "Escavadeira CAT 320", icon: "snowmobile", responsible: "Davi", deadline: "15/05/2026", status: "Não Visualizada", tone: "error" },
  { id: "#TK-0511", equipment: "Trator Komatsu D61", icon: "agriculture", responsible: "Eduardo", deadline: "16/05/2026", status: "Em Andamento", tone: "primary" },
  { id: "#TK-0510", equipment: "Caminhão Volvo", icon: "local_shipping", responsible: "Equipe Mecânica", deadline: "17/05/2026", status: "Aguardando Peças", tone: "warning" },
];

const toneText: Record<string, string> = {
  success: "text-status-success",
  warning: "text-status-warning",
  error: "text-status-error",
  primary: "text-primary-container",
  muted: "text-on-surface-variant",
};
const toneBorder: Record<string, string> = {
  error: "border-status-error",
  warning: "border-status-warning",
  muted: "border-outline",
  primary: "border-primary-container",
  success: "border-status-success",
};
const toneBg: Record<string, string> = {
  error: "bg-status-error/10 text-status-error border-status-error/30",
  warning: "bg-status-warning/10 text-status-warning border-status-warning/30",
  primary: "bg-primary-container/10 text-primary-container border-primary-container/30",
  success: "bg-status-success/10 text-status-success border-status-success/30",
  muted: "bg-surface-high text-on-surface-variant border-border-low",
};

function Dashboard() {
  return (
    <AppLayout>
      {/* Hero metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {STATS.map((s) => (
          <div key={s.title} className="bg-surface-low border border-border-low p-6 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4">
              <Icon name={s.icon} className="text-primary-container text-3xl" filled={s.iconFilled} />
              <span className={`text-xs font-semibold uppercase tracking-wider ${toneText[s.statusTone]}`}>{s.status}</span>
            </div>
            <h3 className="text-sm font-semibold text-on-surface-variant">{s.title}</h3>
            <div className="text-5xl font-bold text-on-surface mt-1 tracking-tight">{s.value}</div>
            <div className="absolute bottom-0 left-0 h-1 w-0 bg-primary-container group-hover:w-full transition-all duration-500" />
          </div>
        ))}
      </div>

      {/* Operational summary + alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-2 bg-surface-container border border-border-low p-6">
          <div className="flex justify-between items-start mb-8 border-b border-border-low pb-4 gap-4 flex-wrap">
            <div>
              <h3 className="text-2xl font-semibold text-on-surface">Resumo Operacional</h3>
              <p className="text-sm text-on-surface-variant mt-1 max-w-xl">
                Acompanhe em tempo real o desempenho operacional dos equipamentos, manutenções programadas e solicitações internas da equipe TransJap.
              </p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-primary-container" />
                <span className="text-xs uppercase tracking-wider">Operação</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-surface-variant" />
                <span className="text-xs uppercase tracking-wider">Parado</span>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-2 h-64 w-full">
            {[
              { d: "Seg", up: 90, down: 10 },
              { d: "Ter", up: 84, down: 16 },
              { d: "Qua", up: 96, down: 4 },
              { d: "Qui", up: 78, down: 22 },
              { d: "Sex", up: 88, down: 12 },
              { d: "Sáb", up: 95, down: 5, dim: true },
              { d: "Dom", up: 98, down: 2, dim: true },
            ].map((b) => (
              <div key={b.d} className={`flex-1 flex flex-col gap-1 items-center ${b.dim ? "opacity-50" : ""}`}>
                <div className="w-full bg-surface-variant" style={{ height: `${b.down * 2}px` }} />
                <div className="w-full bg-primary-container" style={{ height: `${b.up * 2}px` }} />
                <span className="text-xs text-on-surface-variant mt-2">{b.d}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-container border border-border-low p-6">
          <div className="flex items-center gap-2 mb-6">
            <Icon name="warning" className="text-status-error" />
            <h3 className="text-2xl font-semibold text-on-surface">Alertas de Manutenção</h3>
          </div>
          <div className="space-y-4">
            {ALERTS.map((a, i) => (
              <div key={i} className={`p-4 bg-surface-highest border-l-4 ${toneBorder[a.tone]} flex flex-col gap-2`}>
                <div className="flex justify-between gap-2">
                  <span className={`text-xs font-bold tracking-wider ${toneText[a.tone]}`}>{a.type}</span>
                  <span className="text-xs text-on-surface-variant">{a.time}</span>
                </div>
                <h4 className="text-sm text-on-surface leading-snug">{a.text}</h4>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => toast("Alertas", { description: "Abrindo lista completa de alertas." })}
            className="block w-full text-center mt-6 text-sm font-semibold text-primary-container hover:underline"
          >
            Ver todos os alertas
          </button>
        </div>
      </div>

      {/* Recent tasks */}
      <div className="bg-surface-container border border-border-low overflow-hidden mb-12">
        <div className="p-6 border-b border-border-low flex justify-between items-center bg-surface-low gap-2 flex-wrap">
          <h3 className="text-2xl font-semibold text-on-surface">Tarefas Recentes</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => toast("Filtros", { description: "Painel de filtros em breve." })}
              className="flex items-center gap-2 border border-border-low px-4 py-2 text-sm font-semibold hover:bg-surface-light transition-all"
            >
              <Icon name="filter_list" className="text-base" /> Filtrar
            </button>
            <Link
              to="/agenda"
              className="bg-primary-container text-on-primary px-4 py-2 text-sm font-bold flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all"
            >
              <Icon name="add" className="text-base" /> Nova Tarefa
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-lowest border-b border-border-low">
              <tr>
                {["ID", "Equipamento", "Responsável", "Prazo", "Status", ""].map((h) => (
                  <th key={h} className="px-6 py-4 text-xs uppercase tracking-wider text-on-surface-variant font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-low">
              {TASKS.map((t, i) => (
                <tr key={t.id} className={`${i % 2 === 0 ? "bg-background/50" : "bg-surface-container"} hover:bg-surface-high transition-colors`}>
                  <td className="px-6 py-4 text-sm font-semibold">{t.id}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-surface-variant rounded flex items-center justify-center">
                        <Icon name={t.icon} className="text-on-surface-variant" />
                      </div>
                      <span className="text-sm">{t.equipment}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-on-surface-variant">{t.responsible}</td>
                  <td className="px-6 py-4 text-sm text-on-surface-variant">{t.deadline}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${toneBg[t.tone]}`}>{t.status}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => toast(t.equipment, { description: `${t.id} · Status: ${t.status}` })}
                      className="text-on-surface-variant hover:text-primary-container"
                    >
                      <Icon name="more_vert" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hero industrial */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-surface-lowest p-8 border border-border-low">
        <div>
          <span className="text-xs font-bold tracking-[0.2em] uppercase text-primary-container">Controle Total da Operação</span>
          <h2 className="text-3xl md:text-4xl font-bold text-on-surface mt-3 mb-4 tracking-tight">
            Toda a frota TransJap em um único sistema
          </h2>
          <p className="text-base text-on-surface-variant mb-6 leading-relaxed">
            A TransJap Manager centraliza toda a gestão operacional da empresa, permitindo controle de manutenção, tarefas, equipamentos e comunicação interna em um único sistema inteligente.
          </p>
          <div className="flex gap-8">
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-on-surface">48</span>
              <span className="text-xs text-on-surface-variant uppercase tracking-widest">Equipamentos</span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-on-surface">99,2%</span>
              <span className="text-xs text-on-surface-variant uppercase tracking-widest">Confiabilidade</span>
            </div>
          </div>
        </div>
        <div className="relative h-64 md:h-80 overflow-hidden group">
          <img
            src={heroImg}
            alt="Maquinário industrial pesado TransJap"
            className="w-full h-full object-cover grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700"
            width={1280}
            height={896}
          />
          <div className="absolute inset-0 border-[16px] border-background/20 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </div>
      </div>
    </AppLayout>
  );
}
