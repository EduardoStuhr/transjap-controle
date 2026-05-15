import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";

export const Route = createFileRoute("/perfil")({ component: Perfil });

const USERS = [
  { name: "Davi", role: "Administrador", login: "Davi", initials: "D" },
  { name: "Eduardo", role: "Supervisor", login: "Eduardo", initials: "E" },
];

function Perfil() {
  return (
    <AppLayout title="Perfil">
      <p className="text-on-surface-variant -mt-4 mb-8 text-base">
        Usuários cadastrados no sistema TransJap Manager.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
        {USERS.map((u) => (
          <div key={u.login} className="bg-surface-container border border-border-low p-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary-container text-on-primary rounded-full flex items-center justify-center text-2xl font-bold">
                {u.initials}
              </div>
              <div>
                <h3 className="text-xl font-bold">{u.name}</h3>
                <span className="text-xs uppercase tracking-wider text-primary-container font-semibold">{u.role}</span>
              </div>
            </div>
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between border-b border-border-low pb-2">
                <dt className="text-on-surface-variant">Login</dt>
                <dd className="font-mono">{u.login}</dd>
              </div>
              <div className="flex justify-between border-b border-border-low pb-2">
                <dt className="text-on-surface-variant">Senha</dt>
                <dd className="font-mono">•••</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Status</dt>
                <dd className="text-status-success font-semibold flex items-center gap-1">
                  <Icon name="check_circle" className="text-base" /> Ativo
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => toast("Editar usuário", { description: u.name })}
                className="flex-1 bg-primary-container text-on-primary px-3 py-2 text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90"
              >
                <Icon name="edit" className="text-base" /> Editar
              </button>
              <button
                type="button"
                onClick={() => toast("Senha", { description: "Link de redefinição enviado." })}
                className="border border-border-low px-3 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-surface-high"
              >
                <Icon name="lock_reset" className="text-base" /> Redefinir senha
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-surface-low border border-border-low p-6 max-w-3xl flex items-start gap-3">
        <Icon name="info" className="text-primary-container" />
        <p className="text-sm text-on-surface-variant">
          Os usuários iniciais utilizam senha padrão <span className="font-mono text-on-surface">123</span>. Recomenda-se alterar no primeiro acesso.
        </p>
      </div>
    </AppLayout>
  );
}
