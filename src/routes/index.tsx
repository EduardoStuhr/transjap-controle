import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { getUrgencyLevel } from "@/lib/urgency";

export const Route = createFileRoute("/")({ component: Dashboard });

const STATS = [
  { icon: "precision_manufacturing", title: "Equipamentos Ativos", value: "48", status: "+3 este mês", tone: "success" },
  { icon: "assignment", title: "Solicitações em Aberto", value: "12", status: "4 urgentes", tone: "warning" },
  { icon: "report", title: "Manutenções Pendentes", value: "05", status: "Atenção técnica", tone: "error" },
  { icon: "health_and_safety", title: "Disponibilidade Frota", value: "92%", status: "Dentro da meta", tone: "success" },
];

const URGENT_TASKS = [
  { id: "TK-0512", title: "Escavadeira EX-320: Vazamento Hidráulico", deadline: "2026-05-16", resp: "Workshop Team" },
  { id: "TK-0515", title: "Caminhão Volvo: Revisão 50k", deadline: "2026-05-17", resp: "Davi" },
];

function Dashboard() {
  return (
    <AppLayout>
      {/* Key Metrics - Simplified */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STATS.map((s) => (
          <div key={s.title} className="bg-surface-container border border-border-low p-5 shadow-industrial group relative overflow-hidden transition-industrial hover:border-primary/40 hover:shadow-industrial-lg">
            <div className="flex justify-between items-start mb-3">
              <div className="p-2 bg-surface-highest rounded border border-border-low group-hover:border-primary/50 transition-colors">
                <Icon name={s.icon} className="text-primary text-2xl" />
              </div>
              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${s.tone === 'success' ? 'bg-status-success/10 text-status-success' : s.tone === 'warning' ? 'bg-status-warning/10 text-status-warning' : 'bg-status-error/10 text-status-error'}`}>
                {s.status}
              </span>
            </div>
            <h3 className="text-[11px] font-black text-on-surface-variant uppercase tracking-widest">{s.title}</h3>
            <div className="text-4xl font-black text-on-surface mt-2 tracking-tighter">{s.value}</div>
            <div className="absolute bottom-0 left-0 h-1 w-0 bg-primary group-hover:w-full transition-all duration-700" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Operational Chart */}
        <div className="lg:col-span-2 bg-surface-container border border-border-low p-6 shadow-industrial rounded-lg">
          <div className="mb-6 border-b border-border-low pb-4">
            <h3 className="text-lg font-black tracking-tight text-on-surface uppercase">Disponibilidade Frota</h3>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Últimos 7 dias</p>
          </div>
          <div className="flex items-end gap-2 h-48 w-full">
            {[
              { d: "SEG", up: 90, down: 10 },
              { d: "TER", up: 84, down: 16 },
              { d: "QUA", up: 96, down: 4 },
              { d: "QUI", up: 78, down: 22 },
              { d: "SEX", up: 88, down: 12 },
              { d: "SÁB", up: 95, down: 5 },
              { d: "DOM", up: 98, down: 2 },
            ].map((b) => (
              <div key={b.d} className="flex-1 flex flex-col gap-1 items-center group">
                <div className="w-full bg-surface-highest group-hover:bg-status-error/40 transition-colors" style={{ height: `${b.down * 1.5}px` }} />
                <div className="w-full bg-primary group-hover:shadow-[0_0_12px_#ffd700] transition-all" style={{ height: `${b.up * 1.5}px` }} />
                <span className="text-[10px] font-bold text-on-surface-variant mt-2">{b.d}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-6 mt-6 pt-4 border-t border-border-low">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-primary rounded" />
              <span className="text-[10px] font-bold text-on-surface-variant uppercase">Operacional</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-surface-highest rounded" />
              <span className="text-[10px] font-bold text-on-surface-variant uppercase">Manutenção</span>
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
            {URGENT_TASKS.map((t) => {
              const urgency = getUrgencyLevel(t.deadline);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toast(t.title, { description: `${t.resp} · ${urgency.timeRemaining}` })}
                  className="w-full p-3 bg-surface-highest border-l-4 border-status-error shadow-sm transition-industrial hover:shadow-md hover:translate-x-0.5 text-left group rounded"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[9px] font-black text-status-error uppercase">{urgency.timeRemaining}</span>
                    <span className="text-[9px] font-mono text-on-surface-variant">#{t.id}</span>
                  </div>
                  <p className="text-xs font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate">{t.title}</p>
                  <p className="text-[10px] text-on-surface-variant mt-1">{t.resp}</p>
                </button>
              );
            })}
          </div>
          <Button
            variant="outline"
            className="w-full mt-4 border-status-error/30 text-status-error hover:bg-status-error hover:text-white font-black text-xs py-2"
            onClick={() => toast("Alertas", { description: "Abrindo dashboard completo..." })}
          >
            Ver Todos
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
