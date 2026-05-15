import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";

export const Route = createFileRoute("/perfil")({ component: Perfil });

function Perfil() {
  return (
    <AppLayout title="Perfil">
      <div className="bg-surface-container border border-border-low p-8 max-w-3xl">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-primary-container text-on-primary rounded-full flex items-center justify-center text-xl font-bold">
            U
          </div>
          <div>
            <h2 className="text-xl font-black text-on-surface">Sessão local</h2>
            <p className="text-sm text-on-surface-variant mt-2">
              Nenhum usuário cadastrado para esta sessão.
            </p>
          </div>
        </div>

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
