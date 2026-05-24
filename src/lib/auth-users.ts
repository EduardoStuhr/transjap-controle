export const USER_ROLES = ["admin", "operacional", "manutencao", "estoque"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type AuthUser = {
  id: string;
  name: "Eduardo" | "Davi" | "Luiz" | "Jean" | "Reginaldo" | "Wando" | "Diego" | "Natalia";
  role: UserRole;
};

export type AuthUserWithPassword = AuthUser & { password: string };

export const LOCAL_USERS: AuthUserWithPassword[] = [
  { id: "usr-eduardo", name: "Eduardo", role: "admin", password: "Transjap2026*" },
  { id: "usr-davi", name: "Davi", role: "admin", password: "Transjap2026*" },
  { id: "usr-luiz", name: "Luiz", role: "admin", password: "Transjap2026*" },
  { id: "usr-jean", name: "Jean", role: "admin", password: "Transjap2026*" },
  { id: "usr-reginaldo", name: "Reginaldo", role: "admin", password: "Transjap2026*" },
  { id: "usr-wando", name: "Wando", role: "admin", password: "Transjap2026*" },
  { id: "usr-diego", name: "Diego", role: "admin", password: "Transjap2026*" },
  { id: "usr-natalia", name: "Natalia", role: "admin", password: "Transjap2026*" },
];

export const AUTH_USER_OPTIONS = LOCAL_USERS.map(({ password: _password, ...user }) => user);

const USERS_BY_ID = new Map(AUTH_USER_OPTIONS.map((user) => [user.id, user]));
const USERS_BY_NAME = new Map(AUTH_USER_OPTIONS.map((user) => [user.name.toLowerCase(), user]));

export function normalizeRole(role: string | undefined): UserRole {
  if (role === "administrador" || role === "gestor") return "admin";
  return USER_ROLES.includes(role as UserRole) ? (role as UserRole) : "operacional";
}

export function isAdminUser(user: Pick<AuthUser, "role"> | null | undefined): boolean {
  return normalizeRole(user?.role) === "admin";
}

export function findUserById(id: string | undefined): AuthUser | null {
  if (!id) return null;
  return USERS_BY_ID.get(id) ?? null;
}

export function findUserByName(name: string | undefined): AuthUser | null {
  if (!name) return null;
  return USERS_BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

export function findUserByNameOrId(value: string | undefined): AuthUser | null {
  if (!value) return null;
  return findUserById(value) ?? findUserByName(value);
}

export function resolveResponsibleUsers(assignedTo: readonly string[]): AuthUser[] {
  const includesAll = assignedTo.includes("Todos");
  const users = includesAll
    ? AUTH_USER_OPTIONS
    : assignedTo
        .map((value) => findUserByNameOrId(value))
        .filter((user): user is AuthUser => Boolean(user));

  return Array.from(new Map(users.map((user) => [user.id, user])).values());
}

export function resolveResponsibleIds(assignedTo: readonly string[]): string[] {
  return resolveResponsibleUsers(assignedTo).map((user) => user.id);
}

export function resolveResponsibleNames(assignedTo: readonly string[]): string[] {
  return resolveResponsibleUsers(assignedTo).map((user) => user.name);
}
