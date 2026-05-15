import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/agenda", label: "Agenda Operacional", icon: "calendar_today" },
  { to: "/manutencao", label: "Manutenção", icon: "build" },
  { to: "/equipamentos", label: "Equipamentos", icon: "construction" },
  { to: "/estoque", label: "Estoque de Peças", icon: "inventory_2" },
  { to: "/relatorios", label: "Relatórios", icon: "insights" },
  { to: "/perfil", label: "Perfil", icon: "account_circle" },
] as const;

export function Icon({ name, className = "", filled = false }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span className={`material-symbols-outlined ${filled ? "filled" : ""} ${className}`}>{name}</span>
  );
}

export function AppLayout({ children, title }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col md:flex-row">
      {/* Side Alerts / Top Bar for important notices */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-primary z-[100]" />

      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full border-r border-border-low bg-surface-low w-64 z-50 shadow-industrial">
        <SidebarInner pathname={pathname} />
      </aside>

      {open && (
        <div className="md:hidden fixed inset-0 z-[60] flex">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="relative flex flex-col h-full border-r border-border-low bg-surface-low w-72 transition-industrial">
            <SidebarInner pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col md:pl-64">
        <header className="flex justify-between items-center w-full h-16 px-6 fixed top-0 bg-surface-container/80 backdrop-blur-md border-b border-border-low shadow-sm z-40 md:w-[calc(100%-16rem)]">
          <div className="flex items-center gap-6 flex-1">
            <button
              type="button"
              className="md:hidden w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-bright rounded transition-colors"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
            >
              <Icon name="menu" />
            </button>
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-status-error/10 border border-status-error/20 rounded-full animate-pulse-urgent">
               <Icon name="report" className="text-status-error text-sm" />
               <span className="text-[10px] font-black uppercase tracking-widest text-status-error">3 Prazos Críticos</span>
            </div>
            <form
              className="relative w-full max-w-md hidden md:block"
              onSubmit={(e) => {
                e.preventDefault();
                const v = (new FormData(e.currentTarget).get("q") || "").toString();
                toast.message("Busca", { description: v ? `Procurando por "${v}"…` : "Digite algo para buscar." });
              }}
            >
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                name="q"
                className="w-full bg-surface-highest/50 border border-border-low rounded text-sm py-2 pl-10 pr-4 outline-none focus:ring-1 focus:ring-primary focus:border-primary text-on-surface placeholder:text-on-surface-variant/40 transition-industrial"
                placeholder="Buscar equipamentos, tarefas, séries..."
                type="text"
              />
            </form>
            <h2 className="md:hidden text-xl font-black text-primary tracking-tighter uppercase">TransJap</h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-bright rounded-full relative transition-industrial"
              onClick={() => toast("Central de Alertas", { description: "3 alertas críticos na frota." })}
            >
              <Icon name="notifications" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-status-error rounded-full ring-2 ring-surface-container animate-pulse" />
            </button>
            <button
              type="button"
              className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-bright rounded-full transition-industrial"
              onClick={() => toast("Configurações", { description: "Preferências do sistema." })}
            >
              <Icon name="settings" />
            </button>
            <div className="w-px h-6 bg-border-low mx-2" />
            <div className="flex items-center gap-3 pl-2 group cursor-pointer" onClick={() => toast("Perfil", { description: "Davi (Administrador)" })}>
               <div className="text-right hidden sm:block">
                  <p className="text-xs font-black text-on-surface uppercase tracking-widest leading-none">Davi</p>
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Admin</p>
               </div>
               <div className="h-9 w-9 rounded bg-primary text-on-primary flex items-center justify-center font-black shadow-industrial group-hover:scale-105 transition-transform">
                D
               </div>
            </div>
          </div>
        </header>

        <main className="pt-24 pb-12 px-6 min-h-screen">
          {title && (
            <div className="mb-10">
              <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-2 block">Sistema Operacional</span>
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-on-surface uppercase leading-none">{title}</h1>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarInner({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <div className="p-8">
        <div className="flex flex-col gap-4">
          <div className="w-12 h-12 bg-primary flex items-center justify-center rounded shadow-industrial">
            <Icon name="construction" className="text-on-primary text-2xl" filled />
          </div>
          <div>
            <h1 className="text-xl font-black text-primary tracking-tighter leading-none uppercase">TransJap</h1>
            <p className="text-[10px] text-on-surface-variant font-black uppercase tracking-widest mt-2 opacity-60">
              Fleet & Ops Management
            </p>
          </div>
        </div>
      </div>
      <nav className="mt-6 flex flex-col flex-1 px-4 gap-1">
        {NAV.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={[
                "py-3 px-4 flex items-center gap-3 transition-industrial rounded group",
                active
                  ? "text-primary bg-primary/10 font-black shadow-[inset_4px_0_0_0_#ffd700]"
                  : "text-on-surface-variant hover:bg-surface-highest hover:text-on-surface font-bold",
              ].join(" ")}
            >
              <Icon name={item.icon} className={active ? "text-primary" : "group-hover:text-primary transition-colors"} />
              <span className="text-xs uppercase tracking-widest">{item.label}</span>
            </Link>
          );
        })}
        <div className="mt-auto p-4 border-t border-border-low">
           <Button variant="ghost" className="w-full justify-start gap-3 text-on-surface-variant hover:text-status-error py-6" onClick={() => toast("Sair", { description: "Encerrando sessão..." })}>
              <Icon name="logout" />
              <span className="text-xs font-black uppercase tracking-widest">Sair do Sistema</span>
           </Button>
           <p className="mt-6 text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] text-center">v1.0 · TransJap © 2026</p>
        </div>
      </nav>
    </>
  );
}
