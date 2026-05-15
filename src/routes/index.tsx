import { toast } from "sonner";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { getUrgencyLevel } from "@/lib/urgency";
import heroImg from "@/assets/industrial-hero.jpg";

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
      {/* Hero metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {STATS.map((s) => (
          <div key={s.title} className="bg-surface-container border border-border-low p-6 shadow-industrial group relative overflow-hidden transition-industrial hover:border-primary/40">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-surface-highest rounded border border-border-low group-hover:border-primary/50 transition-colors">
                <Icon name={s.icon} className="text-primary text-3xl" />
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded ${s.tone === 'success' ? 'bg-status-success/10 text-status-success' : s.tone === 'warning' ? 'bg-status-warning/10 text-status-warning' : 'bg-status-error/10 text-status-error'}`}>
                {s.status}
              </span>
            </div>
            <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-widest">{s.title}</h3>
            <div className="text-5xl font-black text-on-surface mt-1 tracking-tighter">{s.value}</div>
            <div className="absolute bottom-0 left-0 h-1 w-0 bg-primary group-hover:w-full transition-all duration-700" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
        {/* Main Chart Section */}
        <div className="lg:col-span-2 bg-surface-container border border-border-low p-8 shadow-industrial-lg rounded-lg">
          <div className="flex justify-between items-start mb-10 border-b border-border-low pb-6 gap-4 flex-wrap">
            <div>
              <h3 className="text-3xl font-black tracking-tight text-on-surface uppercase">Desempenho Operacional</h3>
              <p className="text-sm text-on-surface-variant mt-2 font-medium">Monitoramento em tempo real de disponibilidade e produtividade da frota.</p>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-primary shadow-[0_0_8px_#ffd700]" />
                <span className="text-[10px] font-black uppercase tracking-widest">Em Operação</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-surface-highest" />
                <span className="text-[10px] font-black uppercase tracking-widest">Manutenção</span>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-3 h-64 w-full">
            {[
              { d: "SEG", up: 90, down: 10 },
              { d: "TER", up: 84, down: 16 },
              { d: "QUA", up: 96, down: 4 },
              { d: "QUI", up: 78, down: 22 },
              { d: "SEX", up: 88, down: 12 },
              { d: "SÁB", up: 95, down: 5, dim: true },
              { d: "DOM", up: 98, down: 2, dim: true },
            ].map((b) => (
              <div key={b.d} className={`flex-1 flex flex-col gap-1.5 items-center group ${b.dim ? "opacity-40" : ""}`}>
                <div className="w-full bg-surface-highest group-hover:bg-status-error/40 transition-colors" style={{ height: `${b.down * 2}px` }} />
                <div className="w-full bg-primary group-hover:shadow-[0_0_15px_#ffd700] transition-all" style={{ height: `${b.up * 2}px` }} />
                <span className="text-[10px] font-black text-on-surface-variant mt-3 tracking-widest">{b.d}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sticky Urgent Section */}
        <div className="bg-surface-container border border-status-error/20 p-8 shadow-industrial-lg rounded-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
             <Icon name="priority_high" className="text-status-error text-6xl opacity-5 animate-pulse-urgent" />
          </div>
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-status-error/10 rounded">
              <Icon name="emergency" className="text-status-error text-2xl" />
            </div>
            <h3 className="text-2xl font-black tracking-tight uppercase">Críticos & Prazos</h3>
          </div>
          <div className="space-y-4">
            {URGENT_TASKS.map((t) => {
              const urgency = getUrgencyLevel(t.deadline);
              return (
                <div key={t.id} className="p-5 bg-surface-highest border-l-4 border-status-error shadow-industrial transition-industrial hover:translate-x-1">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black text-status-error uppercase tracking-[0.2em]">{urgency.timeRemaining}</span>
                    <span className="text-[9px] font-mono text-on-surface-variant font-bold">#{t.id}</span>
                  </div>
                  <h4 className="text-sm font-bold text-on-surface leading-tight mb-3">{t.title}</h4>
                  <div className="flex items-center gap-2">
                    <Icon name="person" className="text-xs text-primary" />
                    <span className="text-[10px] font-black text-on-surface-variant uppercase">{t.resp}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <Button
            variant="outline"
            className="w-full mt-8 border-status-error/30 text-status-error hover:bg-status-error hover:text-white font-black uppercase tracking-widest py-6"
            onClick={() => toast("Alertas", { description: "Carregando central de emergências..." })}
          >
            Ver Todos Alertas
          </Button>
        </div>
      </div>

      {/* Industrial Brand Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center bg-surface-lowest p-12 border border-border-low shadow-industrial rounded-lg mb-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-32 h-32 bg-primary/5 rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl" />
        <div className="relative z-10">
          <span className="text-xs font-black tracking-[0.4em] uppercase text-primary mb-4 block">TRANSJAP MANAGER · V1.0</span>
          <h2 className="text-4xl md:text-5xl font-black text-on-surface mb-6 tracking-tighter uppercase leading-none">
            Inteligência Operacional de Pesados
          </h2>
          <p className="text-lg text-on-surface-variant mb-10 leading-relaxed font-medium">
            Sistema centralizado para controle de frota, logística de manutenção e fluxo operacional.
            Desenvolvido para máxima disponibilidade técnica e performance em campo.
          </p>
          <div className="flex gap-12">
            <div>
              <span className="text-4xl font-black text-primary tracking-tighter block">48</span>
              <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mt-1 block">Equipamentos</span>
            </div>
            <div className="w-px h-12 bg-border-low" />
            <div>
              <span className="text-4xl font-black text-primary tracking-tighter block">99.2%</span>
              <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mt-1 block">Uptime Técnico</span>
            </div>
          </div>
        </div>
        <div className="relative h-96 overflow-hidden rounded shadow-industrial-lg group">
          <img
            src={heroImg}
            alt="TransJap Heavy Machinery"
            className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-1000 scale-110 group-hover:scale-100"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
          <div className="absolute bottom-6 left-6 flex items-center gap-3">
             <div className="w-10 h-10 bg-primary flex items-center justify-center rounded shadow-industrial">
                <Icon name="construction" className="text-on-primary font-bold" />
             </div>
             <span className="text-xs font-black uppercase tracking-widest text-white drop-shadow-md">Padronização TransJap</span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
