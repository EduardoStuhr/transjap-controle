import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { authActions, useAuthStore } from "@/lib/auth-store";
import { PushNotificationSettings } from "@/components/PushNotificationSettings";

export const Route = createFileRoute("/perfil")({ component: Perfil });

function Perfil() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  return (
    <AppLayout title="Perfil">
      <div className="bg-surface-container border border-border-low p-8 max-w-3xl">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-primary-container text-on-primary rounded-full flex items-center justify-center text-xl font-bold">
            {user?.name?.[0] ?? "U"}
          </div>
          <div>
            {user ? (
              <>
                <h2 className="text-xl font-black text-on-surface">{user.name}</h2>
                <p className="text-sm text-on-surface-variant mt-2 capitalize">{user.role}</p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-black text-on-surface">Sessão local</h2>
                <p className="text-sm text-on-surface-variant mt-2">
                  Nenhum usuário cadastrado para esta sessão.
                </p>
              </>
            )}
          </div>
        </div>

        {user && (
          <>
            <PushNotificationSettings userId={user.id} />
            <div className="mt-6">
              <Button
                variant="ghost"
                className="gap-2 text-on-surface-variant hover:text-status-error"
                onClick={() => {
                  authActions.logout();
                  navigate({ to: "/login" });
                }}
              >
                <Icon name="logout" />
                <span className="text-xs font-black uppercase tracking-widest">Sair</span>
              </Button>
            </div>
          </>
        )}

        <div className="mt-8 bg-surface-low border border-border-low p-5 flex items-start gap-3">
          <Icon name="info" className="text-primary-container" />
          <p className="text-sm text-on-surface-variant">
            Contas e permissões serão exibidas aqui quando houver dados de autenticação.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
