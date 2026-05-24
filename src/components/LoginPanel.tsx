import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { authActions, type AuthUser } from "@/lib/auth-store";

type LoginPanelProps = {
  onSuccess: (user: AuthUser) => void;
};

export function LoginPanel({ onSuccess }: LoginPanelProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    const user = await authActions.login(username, password, remember).finally(() => {
      setSubmitting(false);
    });

    if (!user) {
      toast.error("Login inválido", { description: "Confira usuário e senha." });
      return;
    }

    toast.success("Bem-vindo", { description: user.name });
    onSuccess(user);
  };

  return (
    <main className="min-h-screen bg-background text-on-surface grid place-items-center px-4">
      <section className="w-full max-w-md bg-surface-container border border-border-low rounded-lg p-6 shadow-industrial">
        <div className="flex flex-col items-center gap-4 mb-8">
          <img
            src="/logo.png"
            alt="TransJap — Terraplenagem e Construções"
            className="w-full max-w-[240px] h-auto object-contain"
          />
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest">
            Acesso operacional
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant">
            Usuário
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="mt-2 w-full px-4 py-3 bg-surface-highest border border-border-low rounded-lg text-on-surface outline-none focus:ring-2 focus:ring-primary"
              placeholder="Informe seu usuário"
              required
            />
          </label>
          <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant">
            Senha
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              className="mt-2 w-full px-4 py-3 bg-surface-highest border border-border-low rounded-lg text-on-surface outline-none focus:ring-2 focus:ring-primary"
              placeholder="Informe sua senha"
              required
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-on-surface-variant font-bold">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Manter sessão neste dispositivo
          </label>
          <Button type="submit" disabled={submitting} className="w-full font-black gap-2">
            <Icon name="login" />
            {submitting ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </section>
    </main>
  );
}
