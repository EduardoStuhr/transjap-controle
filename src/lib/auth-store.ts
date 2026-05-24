import { useSyncExternalStore } from "react";
import { loginServer, logoutServer } from "@/lib/api/auth";
import { AUTH_USER_OPTIONS, LOCAL_USERS, normalizeRole, type AuthUser } from "@/lib/auth-users";

export type { AuthUser } from "@/lib/auth-users";

type AuthState = {
  user: AuthUser | null;
  hydrated: boolean;
};

const STORAGE_KEY = "transjap:fleet-command:auth:v1";

export { AUTH_USER_OPTIONS };

let state: AuthState = {
  user: null,
  hydrated: false,
};

const listeners = new Set<() => void>();

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emit() {
  listeners.forEach((listener) => listener());
}

function readSession(): AuthUser | null {
  if (!isBrowser()) return null;

  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) || window.sessionStorage.getItem(STORAGE_KEY);
    const user = raw ? (JSON.parse(raw) as AuthUser) : null;
    if (!user) return null;

    const registered =
      AUTH_USER_OPTIONS.find((option) => option.id === user.id) ??
      AUTH_USER_OPTIONS.find((option) => option.name === user.name);

    return registered ?? { ...user, role: normalizeRole(user.role) };
  } catch {
    return null;
  }
}

function writeSession(user: AuthUser, remember = true) {
  if (!isBrowser()) return;
  const serialized = JSON.stringify(user);
  const storage = remember ? window.localStorage : window.sessionStorage;
  storage.setItem(STORAGE_KEY, serialized);
}

function clearSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);
}

function ensureHydrated() {
  if (state.hydrated || !isBrowser()) return;
  state = { user: readSession(), hydrated: true };
}

export function getCurrentUser() {
  ensureHydrated();
  return state.user;
}

export const authActions = {
  async login(username: string, password: string, remember = true) {
    const normalized = username.trim().toLowerCase();
    const match = LOCAL_USERS.find(
      (user) => user.name.toLowerCase() === normalized && user.password === password,
    );

    if (!match) return null;

    const serverUser = await loginServer({ data: { username, password, remember } });
    if (!serverUser) return null;

    const { password: _password, ...user } = match;
    state = { user, hydrated: true };
    writeSession(user, remember);
    emit();
    return user;
  },

  logout() {
    state = { user: null, hydrated: true };
    clearSession();
    void logoutServer();
    emit();
  },
};

export function useAuthStore<T>(selector: (state: AuthState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);

      if (!state.hydrated && isBrowser()) {
        ensureHydrated();
      }

      if (isBrowser()) window.addEventListener("storage", handleStorageEvent);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && isBrowser()) {
          window.removeEventListener("storage", handleStorageEvent);
        }
      };
    },
    () => selector(state),
    () => selector({ user: null, hydrated: false }),
  );
}

function handleStorageEvent(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  state = { user: readSession(), hydrated: true };
  emit();
}
