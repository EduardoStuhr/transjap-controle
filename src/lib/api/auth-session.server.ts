import { clearSession, getSession, updateSession } from "@tanstack/react-start/server";
import { AUTH_USER_OPTIONS, normalizeRole, type AuthUser } from "@/lib/auth-users";

const SESSION_NAME = "transjap_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const FALLBACK_SESSION_SECRET =
  "transjap-manager-local-session-secret-change-in-cloudflare-env-2026";

type AuthSessionData = {
  user?: AuthUser;
};

function getSessionPassword() {
  const secret = typeof process !== "undefined" ? process.env.TRANSJAP_SESSION_SECRET : undefined;
  return secret && secret.length >= 32 ? secret : FALLBACK_SESSION_SECRET;
}

function sessionConfig(maxAge = SESSION_MAX_AGE) {
  return {
    name: SESSION_NAME,
    password: getSessionPassword(),
    maxAge,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: !import.meta.env.DEV,
      path: "/",
      maxAge,
    },
  };
}

export async function readServerAuthUser(): Promise<AuthUser | null> {
  const session = await getSession<AuthSessionData>(sessionConfig());
  const user = session.data.user;
  if (!user) return null;

  const registered = AUTH_USER_OPTIONS.find((option) => option.id === user.id);
  if (!registered) return null;

  return { ...registered, role: normalizeRole(user.role) };
}

export async function writeServerAuthUser(user: AuthUser, remember = true) {
  const maxAge = remember ? SESSION_MAX_AGE : 60 * 60 * 8;
  await updateSession<AuthSessionData>(sessionConfig(maxAge), { user });
}

export async function clearServerAuthSession() {
  await clearSession(sessionConfig());
}
