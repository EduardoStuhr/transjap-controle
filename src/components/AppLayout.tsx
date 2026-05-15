import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

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
    <div className="min-h-screen bg-background text-on-surface">
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full border-r border-border-low bg-surface-low w-64 z-50">
        <SidebarInner pathname={pathname} />
      </aside>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative flex flex-col h-full border-r border-border-low bg-surface-low w-64">
            <SidebarInner pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <header className="flex justify-between items-center w-full h-16 px-6 fixed top-0 bg-surface-container border-b border-border-low shadow-sm z-40 md:pl-72">
        <div className="flex items-center gap-4 flex-1">
          <button
            type="button"
            className="md:hidden w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-bright rounded"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Icon name="menu" />
          </button>
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
              className="w-full bg-surface-highest border-none rounded text-base py-2 pl-10 pr-4 outline-none focus:ring-1 focus:ring-primary-container text-on-surface placeholder:text-on-surface-variant/50"
              placeholder="Buscar equipamentos, tarefas, séries..."
              type="text"
            />
          </form>
          <h2 className="md:hidden text-xl font-bold text-primary-container">TransJap</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-bright rounded relative"
            onClick={() => toast("3 novas notificações", { description: "Escavadeira EX-320, Volvo FH-540 e CAT 950." })}
          >
            <Icon name="notifications" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-status-error rounded-full" />
          </button>
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-bright rounded"
            onClick={() => toast("Configurações", { description: "Painel de configurações em breve." })}
          >
            <Icon name="settings" />
          </button>
          <button
            type="button"
            className="h-8 w-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold ml-2 hover:opacity-90"
            onClick={() => toast("Sessão", { description: "Logado como Davi (Administrador)" })}
            aria-label="Perfil"
          >
            D
          </button>
        </div>
      </header>

      <main className="md:ml-64 pt-24 pb-12 px-6 min-h-screen">
        {title && (
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-on-surface">{title}</h1>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

function SidebarInner({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-container flex items-center justify-center rounded">
            <Icon name="construction" className="text-on-primary" filled />
          </div>
          <div>
            <h1 className="text-lg font-bold text-primary-container tracking-tight leading-tight">TransJap Manager</h1>
            <p className="text-[11px] text-on-surface-variant opacity-70 leading-tight">
              Sistema Operacional e<br />Controle de Manutenção
            </p>
          </div>
        </div>
      </div>
      <nav className="mt-4 flex flex-col flex-1">
        {NAV.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={[
                "py-3 px-6 flex items-center gap-3 transition-all border-l-4",
                active
                  ? "text-primary-container border-primary-container bg-surface-high"
                  : "text-on-surface-variant border-transparent hover:bg-surface-high hover:text-on-surface",
              ].join(" ")}
            >
              <Icon name={item.icon} />
              <span className="text-sm font-semibold">{item.label}</span>
            </Link>
          );
        })}
        <div className="mt-auto p-4 text-[11px] text-on-surface-variant/60">v1.0 · TransJap © 2026</div>
      </nav>
    </>
  );
}
