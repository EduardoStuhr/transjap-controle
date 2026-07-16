import { toast } from "sonner";
import {
  subscribeNativePushNotifications,
  unsubscribeNativePushNotifications,
  type NativePushSubscriptionInput,
} from "@/lib/api/push";

const CHANNEL_ID = "transjap_tasks";
const TOKEN_STORAGE_KEY = "transjap:native-push-token:v1";

type NativePushStatus = "unsupported" | "blocked" | "inactive" | "active";
type NativePushPlatform = NativePushSubscriptionInput["platform"];
type NativePushModules = {
  PushNotifications: typeof import("@capacitor/push-notifications").PushNotifications;
  platform: NativePushPlatform;
};

function readStoredToken() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredToken(token: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // O token tambem fica salvo no servidor; localStorage e apenas para desativar com precisao.
  }
}

function clearStoredToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignorar falha de storage local.
  }
}

async function getNativePushModules(): Promise<NativePushModules | null> {
  if (typeof window === "undefined") return null;

  const [{ Capacitor }, { PushNotifications }] = await Promise.all([
    import("@capacitor/core"),
    import("@capacitor/push-notifications"),
  ]);

  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  if (platform !== "android" && platform !== "ios") return null;

  return { PushNotifications, platform: platform as NativePushPlatform };
}

function payloadUrl(data: unknown) {
  if (!data || typeof data !== "object") return "/agenda";
  const value = (data as Record<string, unknown>).url;
  return typeof value === "string" && value ? value : "/agenda";
}

function payloadTaskId(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const value = (data as Record<string, unknown>).taskId;
  return typeof value === "string" && value ? value : "";
}

async function createDefaultChannel(PushNotifications: NativePushModules["PushNotifications"]) {
  await PushNotifications.createChannel({
    id: CHANNEL_ID,
    name: "Tarefas Transjap",
    description: "Avisos de novas tarefas e respostas operacionais.",
    importance: 5,
    visibility: 1,
    lights: true,
    lightColor: "#FFD700",
    vibration: true,
  }).catch(() => undefined);
}

export async function getNativePushStatus(): Promise<NativePushStatus> {
  const modules = await getNativePushModules().catch(() => null);
  if (!modules) return "unsupported";

  const permissions = await modules.PushNotifications.checkPermissions().catch(() => null);
  if (permissions?.receive === "denied") return "blocked";
  return readStoredToken() ? "active" : "inactive";
}

export async function enableNativePushNotifications() {
  const modules = await getNativePushModules();
  if (!modules) {
    throw new Error("Notificacoes nativas estao disponiveis apenas no APK.");
  }

  const { PushNotifications, platform } = modules;
  await createDefaultChannel(PushNotifications);

  let permissions = await PushNotifications.checkPermissions();
  if (permissions.receive === "prompt") {
    permissions = await PushNotifications.requestPermissions();
  }
  if (permissions.receive !== "granted") {
    throw new Error("Permissao de notificacao negada no Android.");
  }

  await PushNotifications.removeAllListeners();

  const registration = new Promise<NativePushSubscriptionInput>((resolve, reject) => {
    void PushNotifications.addListener("registration", (token) => {
      resolve({ token: token.value, platform });
    });
    void PushNotifications.addListener("registrationError", (error) => {
      reject(new Error(error.error || "Falha ao registrar token FCM."));
    });
  });

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    toast.info(notification.title || "Notificacao Transjap", {
      description: notification.body,
    });
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
    const data = event.notification.data;
    const taskId = payloadTaskId(data);
    if (taskId) {
      window.sessionStorage.setItem("transjap:open-task-id", taskId);
      window.dispatchEvent(new CustomEvent("transjap:open-task", { detail: taskId }));
    }
    window.location.assign(payloadUrl(data));
  });

  await PushNotifications.register();
  const subscription = await registration;
  await subscribeNativePushNotifications({ data: subscription });
  writeStoredToken(subscription.token);
  return subscription;
}

export async function disableNativePushNotifications() {
  const modules = await getNativePushModules();
  const token = readStoredToken();
  const platform = modules?.platform ?? "android";

  if (token) {
    await unsubscribeNativePushNotifications({ data: { token, platform } }).catch(() => undefined);
  }

  if (modules) {
    await modules.PushNotifications.unregister().catch(() => undefined);
    await modules.PushNotifications.removeAllListeners().catch(() => undefined);
  }

  clearStoredToken();
}

export async function refreshNativePushRegistrationIfActive() {
  if (!readStoredToken()) return;
  await enableNativePushNotifications().catch((error) => {
    console.warn("[push] Nao foi possivel renovar token nativo.", error);
  });
}
