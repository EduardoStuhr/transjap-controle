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

  useEffect(() => {
    if (hydrated && session) {
      navigate({ to: search.redirect || "/" });
    }
  }, [hydrated, navigate, search.redirect, session]);

  return <LoginPanel onSuccess={() => navigate({ to: search.redirect || "/" })} />;
}
