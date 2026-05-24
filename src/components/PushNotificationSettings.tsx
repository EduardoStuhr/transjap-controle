import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/AppLayout";
import {
  getPushConfiguration,
  subscribePushNotifications,
  unsubscribePushNotifications,
  type PushSubscriptionInput,
} from "@/lib/api/push";

type PushState = "checking" | "unsupported" | "unconfigured" | "blocked" | "inactive" | "active";
type StoredPushState = Exclude<PushState, "checking">;

const PUSH_STATUS_STORAGE_PREFIX = "transjap:push-notifications:status:v1:";

function statusStorageKey(userId: string) {
  return `${PUSH_STATUS_STORAGE_PREFIX}${userId}`;
}

function readStoredState(userId: string): StoredPushState | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(statusStorageKey(userId));
    if (
      value === "unsupported" ||
      value === "unconfigured" ||
      value === "blocked" ||
      value === "inactive" ||
      value === "active"
    ) {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}

function writeStoredState(userId: string, nextState: StoredPushState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(statusStorageKey(userId), nextState);
  } catch {
    // Storage local é apenas feedback visual; não deve impedir a inscrição push.
  }
}

function supportsPush() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function fromBase64Url(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = window.atob(`${value.replace(/-/g, "+").replace(/_/g, "/")}${padding}`);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function sameKey(left: ArrayBuffer | null, right: Uint8Array) {
  if (!left) return false;
  const leftBytes = new Uint8Array(left);
  return (
    leftBytes.length === right.length && leftBytes.every((byte, index) => byte === right[index])
  );
}

function serializeSubscription(subscription: PushSubscription): PushSubscriptionInput {
  const serialized = subscription.toJSON();
  const p256dh = serialized.keys?.p256dh;
  const auth = serialized.keys?.auth;
  if (!serialized.endpoint || !p256dh || !auth) {
    throw new Error("O navegador não retornou as chaves da assinatura.");
  }

  return {
    endpoint: serialized.endpoint,
    expirationTime: serialized.expirationTime ?? null,
    keys: { p256dh, auth },
  };
}

function errorDescription(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Tente novamente.";
}

async function waitForReadyServiceWorker() {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

export function PushNotificationSettings({ userId }: { userId: string }) {
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState("");

  const setPersistedState = useCallback(
    (nextState: StoredPushState) => {
      setState(nextState);
      writeStoredState(userId, nextState);
    },
    [userId],
  );

  useEffect(() => {
    let cancelled = false;
    const storedState = readStoredState(userId);
    setState(storedState ?? "checking");

    async function loadStatus() {
      if (!supportsPush()) {
        if (!cancelled) setPersistedState("unsupported");
        return;
      }

      try {
        const config = await getPushConfiguration();
        if (cancelled) return;
        setPublicKey(config.publicKey);
        if (!config.available) {
          setPersistedState(
            storedState === "active" && Notification.permission === "granted"
              ? "active"
              : "unconfigured",
          );
          return;
        }
        if (Notification.permission === "denied") {
          setPersistedState("blocked");
          return;
        }

        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        if (!subscription || Notification.permission !== "granted") {
          setPersistedState("inactive");
          return;
        }
        if (!sameKey(subscription.options.applicationServerKey, fromBase64Url(config.publicKey))) {
          setPersistedState("inactive");
          return;
        }

        await subscribePushNotifications({ data: serializeSubscription(subscription) });
        if (!cancelled) setPersistedState("active");
      } catch {
        if (!cancelled) setState(readStoredState(userId) ?? "inactive");
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [setPersistedState, userId]);

  const enable = async () => {
    setBusy(true);
    try {
      if (!supportsPush()) {
        setPersistedState("unsupported");
        toast.error("Navegador não suporta notificações");
        return;
      }

      const config = publicKey ? { available: true, publicKey } : await getPushConfiguration();
      if (!config.available || !config.publicKey) {
        setPersistedState("unconfigured");
        toast.error("Erro ao ativar notificações", {
          description: "Notificações ainda não configuradas no servidor.",
        });
        return;
      }

      const permission =
        Notification.permission === "granted"
          ? Notification.permission
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setPersistedState(permission === "denied" ? "blocked" : "inactive");
        toast.error("Permissão negada");
        return;
      }

      const registration = await waitForReadyServiceWorker();
      const applicationServerKey = fromBase64Url(config.publicKey);
      let subscription = await registration.pushManager.getSubscription();
      if (
        subscription &&
        !sameKey(subscription.options.applicationServerKey, applicationServerKey)
      ) {
        await unsubscribePushNotifications({ data: { endpoint: subscription.endpoint } }).catch(
          () => undefined,
        );
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      await subscribePushNotifications({ data: serializeSubscription(subscription) });
      setPublicKey(config.publicKey);
      setPersistedState("active");
      toast.success("Notificações ativadas");
    } catch (error) {
      toast.error("Erro ao ativar notificações", {
        description: errorDescription(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) {
        await unsubscribePushNotifications({ data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setPersistedState("inactive");
      toast.success("Notificações desativadas neste navegador.");
    } catch (error) {
      toast.error("Não foi possível desativar notificações.", {
        description: errorDescription(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const stateLabel: Record<PushState, string> = {
    checking: "Verificando",
    unsupported: "Indisponível neste navegador",
    unconfigured: "Configuração pendente",
    blocked: "Bloqueadas no navegador",
    inactive: "Desativadas",
    active: "Ativadas",
  };

  return (
    <section className="mt-8 border-t border-border-low pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Icon name="notifications_active" className="text-primary text-2xl" />
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-on-surface">
              Notificações do Windows
            </h3>
            <p className="mt-1 text-xs font-medium text-on-surface-variant">{stateLabel[state]}</p>
          </div>
        </div>
        {state === "active" ? (
          <Button type="button" variant="outline" onClick={disable} isLoading={busy}>
            Desativar
          </Button>
        ) : (
          <Button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              void enable();
            }}
            isLoading={busy}
            disabled={busy}
          >
            <Icon name="notifications_active" />
            Ativar
          </Button>
        )}
      </div>
    </section>
  );
}
