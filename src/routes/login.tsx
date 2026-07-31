import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { LoginPanel } from "@/components/LoginPanel";
import { useAuthStore } from "@/lib/auth-store";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const search = useRouterState({
    select: (state) => state.location.search as { redirect?: string },
  });
  const session = useAuthStore((state) => state.user);
  const hydrated = useAuthStore((state) => state.hydrated);
  const serverValidated = useAuthStore((state) => state.serverValidated);

  useEffect(() => {
    if (hydrated && serverValidated && session) {
      navigate({ to: search.redirect || "/" });
    }
  }, [hydrated, navigate, search.redirect, serverValidated, session]);

  return <LoginPanel onSuccess={() => navigate({ to: search.redirect || "/" })} />;
}
