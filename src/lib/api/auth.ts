import { createServerFn } from "@tanstack/react-start";
import { LOCAL_USERS, type AuthUser } from "@/lib/auth-users";

type LoginInput = {
  username: string;
  password: string;
  remember?: boolean;
};

export async function getServerAuthUser(): Promise<AuthUser | null> {
  const { readServerAuthUser } = await import("@/lib/api/auth-session.server");
  return readServerAuthUser();
}

export async function requireServerAuthUser(): Promise<AuthUser> {
  const user = await getServerAuthUser();
  if (!user) {
    throw new Response("Sessao expirada ou invalida.", { status: 401 });
  }
  return user;
}

export const loginServer = createServerFn({ method: "POST" })
  .inputValidator((input: LoginInput) => input)
  .handler(async ({ data }) => {
    const normalized = data.username.trim().toLowerCase();
    const match = LOCAL_USERS.find(
      (user) => user.name.toLowerCase() === normalized && user.password === data.password,
    );

    if (!match) return null;

    const { password: _password, ...user } = match;
    const { writeServerAuthUser } = await import("@/lib/api/auth-session.server");
    await writeServerAuthUser(user, data.remember !== false);
    return user;
  });

export const logoutServer = createServerFn({ method: "POST" }).handler(async () => {
  const { clearServerAuthSession } = await import("@/lib/api/auth-session.server");
  await clearServerAuthSession();
  return { ok: true };
});

export const getSessionUserServer = createServerFn({ method: "GET" }).handler(async () =>
  getServerAuthUser(),
);
