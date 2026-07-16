import { Link, useRouterState } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authActions, useAuthStore } from "@/lib/auth-store";
import { isEduardoUser, type AuthUser } from "@/lib/auth-users";
import { getInventoryAlerts, useInventoryStore } from "@/lib/inventory-store";
import { getUrgencyLevel } from "@/lib/urgency";
import { useTaskStore } from "@/lib/task-store";
import { isTaskCompletedStatus } from "@/lib/task-types";
import { getUnreadActivity, hasUnread } from "@/lib/task-unread";
import { filterNotifiableTasks, filterVisibleTasks } from "@/lib/task-visibility";
import { sortTasksStable } from "@/lib/task-sort";
import { useMaintenanceStore } from "@/lib/maintenance-store";
import { useEquipmentStore } from "@/lib/equipment-store";
import { formatFleetCode } from "@/lib/operational-options";

const NAV = [
  { to: "/", label: "Painel", icon: "dashboard" },
  { to: "/agenda", label: "Tarefa Operacional", icon: "calendar_today" },
  { to: "/calendario", label: "Calendário", icon: "calendar_today" },
  { to: "/manutencao", label: "Manutenção", icon: "build" },
  { to: "/equipamentos", label: "Equipamentos", icon: "construction" },
  { to: "/localizacao-frotas", label: "Localização de Frotas", icon: "location_on" },
  { to: "/producao-consumo", label: "Produção × Consumo", icon: "query_stats" },
  {
    to: "/troca-filtros-diesel",
    label: "Troca de Filtros Diesel",
    icon: "oil_barrel",
    restrictedTo: "eduardo",
  },
  { to: "/estoque", label: "Estoque de Peças", icon: "inventory_2" },
  { to: "/relatorios", label: "Relatórios", icon: "insights" },
  { to: "/perfil", label: "Perfil", icon: "account_circle" },
] as const;

function canShowNavItem(
  item: (typeof NAV)[number],
  user: Pick<AuthUser, "id" | "name"> | null | undefined,
) {
  if (!("restrictedTo" in item)) return true;
  return item.restrictedTo === "eduardo" && isEduardoUser(user);
}

const READ_ALERTS_STORAGE_PREFIX = "transjap:alerts:read:v1:";

function alertStorageKey(userId: string | undefined) {
  return `${READ_ALERTS_STORAGE_PREFIX}${userId || "session"}`;
}

function readAlertKeys(userId: string | undefined) {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(alertStorageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [],
    );
  } catch {
    return new Set<string>();
  }
}

function writeAlertKeys(userId: string | undefined, keys: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    alertStorageKey(userId),
    JSON.stringify(Array.from(keys).slice(-200)),
  );
}

function taskAlertKey(task: { id: string; status: string; deadline: string }) {
  return `task:${task.id}:${task.status}:${task.deadline}`;
}

function stockAlertKey(alert: { id: string; description: string }) {
  return `stock:${alert.id}:${alert.description}`;
}

function readRootCssVar(styles: CSSStyleDeclaration, name: string) {
  return styles.getPropertyValue(name).trim() || "0px";
}

function logAgendaChromeMetrics() {
  if (typeof window === "undefined") return;

  window.requestAnimationFrame(() => {
    const rootStyles = window.getComputedStyle(document.documentElement);
    const header = document.querySelector<HTMLElement>(".app-header");
    const bottomNav = document.querySelector<HTMLElement>(".app-bottom-nav");
    const appMain = document.querySelector<HTMLElement>(".app-main");
    const headerRect = header?.getBoundingClientRect();
    const bottomNavRect = bottomNav?.getBoundingClientRect();

    console.info("[AgendaLayoutDebug] chrome", {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      visualViewportWidth: window.visualViewport?.width ?? null,
      visualViewportHeight: window.visualViewport?.height ?? null,
      headerRealHeight: headerRect ? Math.round(headerRect.height) : null,
      safeAreaTop: readRootCssVar(rootStyles, "--safe-area-inset-top"),
      safeAreaBottom: readRootCssVar(rootStyles, "--safe-area-inset-bottom"),
      androidSafeAreaTop: readRootCssVar(rootStyles, "--android-safe-area-top"),
      androidSafeAreaBottom: readRootCssVar(rootStyles, "--android-safe-area-bottom"),
      capacitorStatusBarHeight: readRootCssVar(rootStyles, "--capacitor-status-bar-height"),
      capacitorNavigationBarHeight: readRootCssVar(rootStyles, "--capacitor-navigation-bar-height"),
      bottomNavRealHeight: bottomNavRect ? Math.round(bottomNavRect.height) : null,
      bottomNavCssMinHeight: bottomNav ? window.getComputedStyle(bottomNav).minHeight : null,
      mainPaddingTop: appMain ? window.getComputedStyle(appMain).paddingTop : null,
      mainPaddingBottom: appMain ? window.getComputedStyle(appMain).paddingBottom : null,
    });
  });
}

// Todas as rotas são acessíveis a qualquer usuário autenticado.

export function Icon({
  name,
  className = "",
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span className={`material-symbols-outlined ${filled ? "filled" : ""} ${className}`}>
      {name}
    </span>
  );
}

export function AppLayout({ children, title }: { children: ReactNode; title?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const user = useAuthStore((snapshot) => snapshot.user);
  const visibleNav = useMemo(() => NAV.filter((item) => canShowNavItem(item, user)), [user]);
  const [viewedAlertKeys, setViewedAlertKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setViewedAlertKeys(readAlertKeys(user?.id));
  }, [user?.id]);

  const tasks = useTaskStore((s) => s.tasks);
  const maintenances = useMaintenanceStore((s) => s.records);
  const equipments = useEquipmentStore((s) => s.equipments);
  const inventoryItems = useInventoryStore((s) => s.items);
  const inventoryOfflineQueue = useInventoryStore((s) => s.offlineQueue);
  const stockAlerts = useMemo(
    () =>
      getInventoryAlerts({
        items: inventoryItems,
        offlineQueue: inventoryOfflineQueue,
      } as Parameters<typeof getInventoryAlerts>[0]),
    [inventoryItems, inventoryOfflineQueue],
  );
  const criticalTasks = useMemo(
    () =>
      sortTasksStable(
        filterNotifiableTasks(tasks, user).filter(
          (task) =>
            !isTaskCompletedStatus(task.status) &&
            task.deadline &&
            getUrgencyLevel(task.deadline).isOverdue,
        ),
      ),
    [tasks, user],
  );
  const unreadTasks = useMemo(
    () =>
      sortTasksStable(
        filterVisibleTasks(tasks, user).filter((task) => hasUnread(task, user?.name)),
      ),
    [tasks, user],
  );
  const unreadTaskCount = unreadTasks.length;
  const activeAlertKeys = useMemo(
    () => [
      ...criticalTasks.map((task) => taskAlertKey(task)),
      ...stockAlerts.map((alert) => stockAlertKey(alert)),
    ],
    [criticalTasks, stockAlerts],
  );
  const unreadAlertCount = activeAlertKeys.filter((key) => !viewedAlertKeys.has(key)).length;
  const totalNotifCount = unreadTaskCount + unreadAlertCount;

  const markAlertsViewed = (keys: readonly string[]) => {
    if (keys.length === 0) return;
    setViewedAlertKeys((current) => {
      const next = new Set(current);
      keys.forEach((key) => next.add(key));
      writeAlertKeys(user?.id, next);
      return next;
    });
  };

  const results = useMemo(() => {
    if (query.length < 2) return [];
    const needle = query.toLowerCase();
    const visibleTasks = sortTasksStable(filterVisibleTasks(tasks, user));
    return [
      ...visibleTasks
        .filter((t) => t.title.toLowerCase().includes(needle))
        .slice(0, 4)
        .map((t) => ({
          key: `task-${t.id}`,
          type: "Tarefa",
          label: t.title,
          to: "/agenda" as const,
        })),
      ...maintenances
        .filter((m) => m.equipment.toLowerCase().includes(needle))
        .slice(0, 3)
        .map((m) => ({
          key: `maint-${m.id}`,
          type: "Manutenção",
          label: m.equipment,
          to: "/manutencao" as const,
        })),
      ...equipments
        .filter(
          (equipment) =>
            equipment.location.toLowerCase().includes(needle) ||
            equipment.id.toLowerCase().includes(needle) ||
            formatFleetCode(equipment.id).toLowerCase().includes(needle),
        )
        .slice(0, 3)
        .map((equipment) => ({
          key: `fleet-location-${equipment.id}`,
          type: "Localização",
          label: `${formatFleetCode(equipment.id)} - ${equipment.location || "Sem localização"}`,
          to: "/localizacao-frotas" as const,
        })),
    ];
  }, [equipments, maintenances, query, tasks, user]);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (pathname !== "/agenda") return;
    logAgendaChromeMetrics();
    window.addEventListener("resize", logAgendaChromeMetrics);
    window.visualViewport?.addEventListener("resize", logAgendaChromeMetrics);
    return () => {
      window.removeEventListener("resize", logAgendaChromeMetrics);
      window.visualViewport?.removeEventListener("resize", logAgendaChromeMetrics);
    };
  }, [pathname]);

  const openTaskFromNotification = (taskId: string) => {
    setNotifOpen(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("transjap:open-task-id", taskId);
      if (pathname === "/agenda") {
        window.dispatchEvent(new CustomEvent("transjap:open-task", { detail: taskId }));
        return;
      }
    }
    void navigate({ to: "/agenda" });
  };
  const criticalCount = useTaskStore(
    (snapshot) =>
      filterNotifiableTasks(snapshot.tasks, user).filter(
        (task) =>
          !isTaskCompletedStatus(task.status) &&
          task.deadline &&
          getUrgencyLevel(task.deadline).isOverdue,
      ).length,
  );
  const stockAlertCount = stockAlerts.length;
  const totalAlertCount = criticalCount + stockAlertCount;

  return (
    <div className="app-layout-shell bg-background text-on-surface flex flex-col md:flex-row">
      {/* Side Alerts / Top Bar for important notices */}
      <div className="app-status-strip fixed h-1 bg-primary z-[100]" />

      <aside className="app-desktop-sidebar hidden md:flex flex-col fixed left-0 border-r border-border-low bg-surface-low w-64 z-50 shadow-industrial">
        <SidebarInner pathname={pathname} unreadTaskCount={unreadTaskCount} />
      </aside>

      {open && (
        <div className="app-mobile-drawer md:hidden fixed inset-0 z-[60] flex">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="app-mobile-drawer-panel relative flex flex-col h-full border-r border-border-low bg-surface-low transition-industrial">
            <SidebarInner
              pathname={pathname}
              unreadTaskCount={unreadTaskCount}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="app-content-shell flex-1 flex flex-col md:pl-64">
        <header className="app-header flex justify-between items-center fixed bg-surface-container/80 backdrop-blur-md border-b border-border-low shadow-sm z-40 gap-2 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-6">
            <button
              type="button"
              className="md:hidden w-9 h-9 shrink-0 flex items-center justify-center text-on-surface-variant hover:bg-surface-bright rounded transition-colors"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
            >
              <Icon name="menu" />
            </button>
            {criticalCount > 0 && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-status-error/10 border border-status-error/20 rounded-full animate-pulse-urgent animate-pulse">
                <Icon name="report" className="text-status-error text-sm" />
                <span className="text-[10px] font-black uppercase tracking-widest text-status-error">
                  {criticalCount} {criticalCount === 1 ? "Prazo Crítico" : "Prazos Críticos"}
                </span>
              </div>
            )}
            <div className="relative w-full max-w-md hidden md:block">
              <Icon
                name="search"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
              />
              <input
                name="q"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                className="w-full bg-surface-highest/50 border border-border-low rounded text-sm py-2 pl-10 pr-4 outline-none focus:ring-1 focus:ring-primary focus:border-primary text-on-surface placeholder:text-on-surface-variant/40 transition-industrial"
                placeholder="Buscar equipamentos, tarefas, séries..."
                type="text"
              />
              {searchOpen && query.length >= 2 && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-surface-container border border-border-low rounded shadow-industrial-lg z-50 overflow-hidden">
                  {results.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-on-surface-variant font-medium">
                      Nenhum resultado encontrado
                    </p>
                  ) : (
                    <ul>
                      {results.map((r) => (
                        <li key={r.key}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              navigate({ to: r.to });
                              setSearchOpen(false);
                              setQuery("");
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-surface-highest flex items-center justify-between gap-3 transition-colors"
                          >
                            <span className="text-sm font-medium text-on-surface truncate">
                              {r.label}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant flex-shrink-0">
                              {r.type}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <img
              src="/logo.png"
              alt="Transjap"
              className="md:hidden h-7 w-auto max-w-[118px] shrink object-contain"
            />
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <div
              className="relative"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setTimeout(() => setNotifOpen(false), 200);
                }
              }}
            >
              <button
                type="button"
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-bright rounded-full relative transition-industrial"
                onClick={() => {
                  const opening = !notifOpen;
                  setNotifOpen(opening);
                  if (opening) markAlertsViewed(activeAlertKeys);
                }}
                aria-label="Central de alertas"
              >
                <Icon name="notifications" />
                {totalNotifCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-status-error text-white rounded-full text-[10px] font-black flex items-center justify-center ring-2 ring-surface-container">
                    {totalNotifCount > 99 ? "99+" : totalNotifCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-12 w-[calc(100vw-2rem)] max-w-80 max-h-[min(24rem,calc(100dvh-var(--safe-area-inset-top)-var(--safe-area-inset-bottom)-6rem))] overflow-y-auto bg-surface-container border border-border-low rounded-lg shadow-industrial-lg z-50 animate-fade-in">
                  <div className="p-3 border-b border-border-low flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-widest">
                      Notificações
                      {totalNotifCount > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-status-error/15 text-status-error text-[10px] font-black">
                          {totalNotifCount}
                        </span>
                      )}
                    </span>
                    <button type="button" onClick={() => setNotifOpen(false)} aria-label="Fechar">
                      <Icon name="close" className="text-on-surface-variant text-base" />
                    </button>
                  </div>
                  {unreadTaskCount === 0 && totalAlertCount === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Icon name="check_circle" className="text-3xl text-on-surface-variant/30" />
                      <p className="text-xs text-on-surface-variant font-medium mt-2">
                        Nenhuma notificação no momento
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border-low">
                      {unreadTasks.slice(0, 5).map((task) => {
                        const kinds = getUnreadActivity(task, user?.name).kinds;
                        const kindLabel = kinds
                          .map((k) =>
                            k === "new"
                              ? "Nova tarefa"
                              : k === "response"
                                ? "Nova resposta"
                                : k === "comment"
                                  ? "Novo comentário"
                                  : k === "update"
                                    ? "Tarefa atualizada"
                                    : "Status alterado",
                          )
                          .join(" · ");
                        return (
                          <li key={`unread-${task.id}`}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => openTaskFromNotification(task.id)}
                              className="w-full text-left px-4 py-3 hover:bg-surface-highest transition-colors flex items-start gap-3"
                            >
                              <Icon
                                name="notifications_active"
                                className="text-status-info text-base mt-0.5 flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-on-surface truncate">
                                  {task.title}
                                </p>
                                <p className="text-[10px] text-status-info font-bold uppercase tracking-widest mt-0.5">
                                  {kindLabel}
                                </p>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                      {unreadTaskCount > 5 && (
                        <li>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setNotifOpen(false);
                              navigate({ to: "/agenda" });
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-surface-highest transition-colors text-[10px] font-bold text-on-surface-variant uppercase tracking-widest"
                          >
                            + {unreadTaskCount - 5} novidade{unreadTaskCount - 5 !== 1 ? "s" : ""}{" "}
                            em tarefas
                          </button>
                        </li>
                      )}
                      {criticalTasks.map((task) => {
                        const urgency = getUrgencyLevel(task.deadline);
                        return (
                          <li key={`task-${task.id}`}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                markAlertsViewed([taskAlertKey(task)]);
                                setNotifOpen(false);
                                navigate({ to: "/agenda" });
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-surface-highest transition-colors flex items-start gap-3"
                            >
                              <Icon
                                name="report"
                                className="text-status-error text-base mt-0.5 flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-on-surface truncate">
                                  {task.title}
                                </p>
                                <p className="text-[10px] text-status-error font-bold uppercase tracking-widest mt-0.5">
                                  {urgency.timeRemaining}
                                </p>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                      {stockAlerts.map((alert) => (
                        <li key={`stock-${alert.id}`}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              markAlertsViewed([stockAlertKey(alert)]);
                              setNotifOpen(false);
                              navigate({ to: "/estoque" });
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-surface-highest transition-colors flex items-start gap-3"
                          >
                            <Icon
                              name="inventory_2"
                              className={`text-base mt-0.5 flex-shrink-0 ${alert.tone === "error" ? "text-status-error" : "text-status-warning"}`}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-on-surface truncate">
                                {alert.title}
                              </p>
                              <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">
                                {alert.description}
                              </p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-bright rounded-full transition-industrial"
              onClick={() => setShowConfig(true)}
            >
              <Icon name="settings" />
            </button>
            <div className="hidden sm:block w-px h-6 bg-border-low mx-2" />
            <div
              className="relative"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setTimeout(() => setAvatarOpen(false), 200);
                }
              }}
            >
              <button
                type="button"
                onClick={() => setAvatarOpen((v) => !v)}
                className="flex items-center gap-2 sm:gap-3 sm:pl-2 hover:bg-surface-bright/40 rounded transition-colors py-1 group"
                aria-label="Menu do usuário"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-black text-on-surface uppercase tracking-widest leading-none">
                    {user?.name || "Usuário"}
                  </p>
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">
                    {user?.role || "Sessão local"}
                  </p>
                </div>
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded bg-primary text-on-primary flex items-center justify-center font-black shadow-industrial group-hover:scale-105 transition-transform">
                  {user?.name?.[0] || "U"}
                </div>
              </button>
              {avatarOpen && (
                <div className="absolute right-0 top-12 w-48 bg-surface-container border border-border-low rounded-lg shadow-industrial-lg z-50 animate-fade-in py-1">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      navigate({ to: "/perfil" });
                      setAvatarOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-surface-highest flex items-center gap-2"
                  >
                    <Icon name="account_circle" className="text-base" /> Meu perfil
                  </button>
                  <div className="border-t border-border-low my-1" />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      authActions.logout();
                      setAvatarOpen(false);
                      navigate({ to: "/login" });
                    }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-status-error/10 text-status-error flex items-center gap-2"
                  >
                    <Icon name="logout" className="text-base" /> Sair do sistema
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="app-main px-4 sm:px-6">
          {title && (
            <div className="mb-10">
              <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-2 block">
                Sistema Operacional
              </span>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-on-surface uppercase leading-none break-words">
                {title}
              </h1>
            </div>
          )}
          {children}
        </main>
      </div>
      <nav className="app-bottom-nav md:hidden fixed z-50 flex items-start overflow-x-auto scrollbar-hide border-t border-border-low bg-surface-low/95 backdrop-blur pt-2 gap-1">
        {visibleNav.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              className={`app-bottom-nav-item flex flex-col items-center gap-1 rounded px-1 py-1 text-[9px] font-black uppercase leading-tight ${
                active ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              <Icon name={item.icon} className="text-xl" />
              <span className="app-bottom-nav-label">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>

      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurações do Sistema</DialogTitle>
            <DialogDescription>Configurações avançadas em breve.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Tema
              <select
                defaultValue="system"
                className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-md text-on-surface text-sm font-medium outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="system">Sistema</option>
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
              </select>
            </label>
            <p className="text-[11px] text-on-surface-variant">
              Seleção visual — a troca de tema entrará no ar em uma próxima atualização.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfig(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SidebarInner({
  pathname,
  unreadTaskCount,
  onNavigate,
}: {
  pathname: string;
  unreadTaskCount: number;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const visibleNav = useMemo(() => NAV.filter((item) => canShowNavItem(item, user)), [user]);
  return (
    <>
      <div className="p-6 flex items-center justify-center">
        <img
          src="/logo.png"
          alt="Transjap — Terraplenagem e Construções"
          className="w-full max-w-[180px] h-auto object-contain"
        />
      </div>
      <nav className="mt-6 flex flex-col flex-1 px-4 gap-1">
        {visibleNav.map((item) => {
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
              <Icon
                name={item.icon}
                className={active ? "text-primary" : "group-hover:text-primary transition-colors"}
              />
              <span className="flex-1 text-xs uppercase tracking-widest">{item.label}</span>
              {item.to === "/agenda" && unreadTaskCount > 0 && (
                <span
                  aria-label={`${unreadTaskCount} ${unreadTaskCount === 1 ? "novidade não lida" : "novidades não lidas"}`}
                  className="min-w-[20px] h-5 px-1.5 rounded-full bg-status-error text-white text-[10px] font-black flex items-center justify-center"
                >
                  {unreadTaskCount > 99 ? "99+" : unreadTaskCount}
                </span>
              )}
            </Link>
          );
        })}
        <div className="mt-auto p-4 border-t border-border-low">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-on-surface-variant hover:text-status-error py-6"
            onClick={() => {
              if (!window.confirm("Deseja realmente sair do sistema?")) return;
              authActions.logout();
              toast("Sair", { description: "Sessão encerrada." });
              navigate({ to: "/login" });
            }}
          >
            <Icon name="logout" />
            <span className="text-xs font-black uppercase tracking-widest">Sair do Sistema</span>
          </Button>
          <p className="mt-6 text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] text-center">
            v1.0 · Transjap © 2026
          </p>
        </div>
      </nav>
    </>
  );
}
