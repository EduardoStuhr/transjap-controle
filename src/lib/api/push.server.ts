import { getOptionalD1, getOptionalEnvString } from "@/lib/cf-env";
import { findUserByName, resolveResponsibleIds } from "@/lib/auth-users";
import type { AuthUser } from "@/lib/auth-users";
import type { TaskRecord } from "@/lib/task-types";

export type BrowserPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type NativePushSubscription = {
  token: string;
  platform: "android" | "ios";
};

type StoredPushSubscription = BrowserPushSubscription & {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
  created_at: string;
  updated_at: string;
};

type PushConfiguration = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

type FcmConfiguration = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

const APP_ORIGIN = "https://sistema-transjap.com.br";
const FCM_ENDPOINT_PREFIX = "fcm:";
const FCM_CHANNEL_ID = "transjap_tasks";
const localSubscriptions = new Map<string, StoredPushSubscription>();
let subscriptionTablePromise: Promise<void> | null = null;
let fcmAccessTokenCache: { token: string; expiresAt: number } | null = null;

function nowIso() {
  return new Date().toISOString();
}

function pushConfiguration(): PushConfiguration | null {
  const publicKey = getOptionalEnvString("VAPID_PUBLIC_KEY");
  const privateKey = getOptionalEnvString("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return null;

  return {
    publicKey,
    privateKey,
    subject: getOptionalEnvString("VAPID_SUBJECT") || "mailto:suporte@sistema-transjap.com.br",
  };
}

function fcmConfiguration(): FcmConfiguration | null {
  const rawServiceAccount = getOptionalEnvString("FCM_SERVICE_ACCOUNT_JSON");
  if (rawServiceAccount) {
    try {
      const parsed = JSON.parse(rawServiceAccount) as Partial<{
        project_id: string;
        client_email: string;
        private_key: string;
      }>;
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        };
      }
    } catch {
      console.warn("[push] FCM_SERVICE_ACCOUNT_JSON invalido.");
    }
  }

  const projectId = getOptionalEnvString("FCM_PROJECT_ID");
  const clientEmail = getOptionalEnvString("FCM_CLIENT_EMAIL");
  const privateKey = getOptionalEnvString("FCM_PRIVATE_KEY");
  if (!projectId || !clientEmail || !privateKey) return null;

  return { projectId, clientEmail, privateKey };
}

export function getPushPublicConfiguration() {
  const config = pushConfiguration();
  return {
    available: Boolean(config),
    publicKey: config?.publicKey || "",
  };
}

async function ensurePushSubscriptionsTable(d1: D1Database) {
  subscriptionTablePromise ??= (async () => {
    await d1
      .prepare(
        `CREATE TABLE IF NOT EXISTS push_subscriptions (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          expiration_time INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
      )
      .run();
    await d1
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)",
      )
      .run();
  })().catch((error) => {
    subscriptionTablePromise = null;
    throw error;
  });

  await subscriptionTablePromise;
}

function validateSubscription(subscription: BrowserPushSubscription) {
  if (!subscription.endpoint.startsWith("https://")) {
    throw new Error("Endpoint de notificação inválido.");
  }
  if (!subscription.keys.p256dh || !subscription.keys.auth) {
    throw new Error("Chaves da assinatura de notificação ausentes.");
  }
}

function validateNativeSubscription(subscription: NativePushSubscription) {
  if (subscription.platform !== "android" && subscription.platform !== "ios") {
    throw new Error("Plataforma de notificacao nativa invalida.");
  }
  if (!subscription.token || subscription.token.length < 16) {
    throw new Error("Token de notificacao nativa invalido.");
  }
}

function nativePushEndpoint(subscription: NativePushSubscription) {
  return `${FCM_ENDPOINT_PREFIX}${subscription.platform}:${encodeURIComponent(subscription.token)}`;
}

function parseNativePushEndpoint(endpoint: string): NativePushSubscription | null {
  if (!endpoint.startsWith(FCM_ENDPOINT_PREFIX)) return null;
  const withoutPrefix = endpoint.slice(FCM_ENDPOINT_PREFIX.length);
  const separator = withoutPrefix.indexOf(":");
  if (separator <= 0) return null;

  const platform = withoutPrefix.slice(0, separator);
  if (platform !== "android" && platform !== "ios") return null;

  return {
    platform,
    token: decodeURIComponent(withoutPrefix.slice(separator + 1)),
  };
}

export async function saveUserPushSubscription(
  user: AuthUser,
  subscription: BrowserPushSubscription,
) {
  validateSubscription(subscription);
  const timestamp = nowIso();
  const d1 = getOptionalD1();
  const stored: StoredPushSubscription = {
    ...subscription,
    id: crypto.randomUUID(),
    userId: user.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (!d1) {
    const existing = localSubscriptions.get(subscription.endpoint);
    localSubscriptions.set(subscription.endpoint, {
      ...stored,
      id: existing?.id || stored.id,
      createdAt: existing?.createdAt || stored.createdAt,
    });
    return { ok: true };
  }

  await ensurePushSubscriptionsTable(d1);
  await d1
    .prepare(
      `INSERT INTO push_subscriptions (
        id, user_id, endpoint, p256dh, auth, expiration_time, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        expiration_time = excluded.expiration_time,
        updated_at = excluded.updated_at`,
    )
    .bind(
      stored.id,
      stored.userId,
      stored.endpoint,
      stored.keys.p256dh,
      stored.keys.auth,
      stored.expirationTime,
      stored.createdAt,
      stored.updatedAt,
    )
    .run();
  return { ok: true };
}

export async function saveUserNativePushSubscription(
  user: AuthUser,
  subscription: NativePushSubscription,
) {
  validateNativeSubscription(subscription);
  const endpoint = nativePushEndpoint(subscription);
  const timestamp = nowIso();
  const d1 = getOptionalD1();
  const stored: StoredPushSubscription = {
    endpoint,
    expirationTime: null,
    keys: { p256dh: "native", auth: subscription.platform },
    id: crypto.randomUUID(),
    userId: user.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (!d1) {
    const existing = localSubscriptions.get(endpoint);
    localSubscriptions.set(endpoint, {
      ...stored,
      id: existing?.id || stored.id,
      createdAt: existing?.createdAt || stored.createdAt,
    });
    return { ok: true };
  }

  await ensurePushSubscriptionsTable(d1);
  await d1
    .prepare(
      `INSERT INTO push_subscriptions (
        id, user_id, endpoint, p256dh, auth, expiration_time, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        expiration_time = excluded.expiration_time,
        updated_at = excluded.updated_at`,
    )
    .bind(
      stored.id,
      stored.userId,
      stored.endpoint,
      stored.keys.p256dh,
      stored.keys.auth,
      stored.expirationTime,
      stored.createdAt,
      stored.updatedAt,
    )
    .run();
  return { ok: true };
}

export async function removeUserPushSubscription(user: AuthUser, endpoint: string) {
  const d1 = getOptionalD1();
  if (!d1) {
    const existing = localSubscriptions.get(endpoint);
    if (existing?.userId === user.id) localSubscriptions.delete(endpoint);
    return { ok: true };
  }

  await ensurePushSubscriptionsTable(d1);
  await d1
    .prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
    .bind(endpoint, user.id)
    .run();
  return { ok: true };
}

export async function removeUserNativePushSubscription(
  user: AuthUser,
  subscription: NativePushSubscription,
) {
  validateNativeSubscription(subscription);
  return removeUserPushSubscription(user, nativePushEndpoint(subscription));
}

function rowToSubscription(row: SubscriptionRow): StoredPushSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    expirationTime: row.expiration_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listSubscriptionsForUsers(userIds: string[]) {
  if (userIds.length === 0) return [];
  const d1 = getOptionalD1();
  if (!d1) {
    return Array.from(localSubscriptions.values()).filter((row) => userIds.includes(row.userId));
  }

  await ensurePushSubscriptionsTable(d1);
  const placeholders = userIds.map(() => "?").join(", ");
  const result = await d1
    .prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${placeholders})`)
    .bind(...userIds)
    .all<SubscriptionRow>();
  return (result.results ?? []).map(rowToSubscription);
}

async function removeExpiredSubscription(subscription: StoredPushSubscription) {
  const d1 = getOptionalD1();
  if (!d1) {
    localSubscriptions.delete(subscription.endpoint);
    return;
  }
  await d1
    .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .bind(subscription.endpoint)
    .run();
}

function decodeBase64Url(value: string) {
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat(
    (4 - (value.length % 4)) % 4,
  )}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array) {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function concatBytes(...chunks: Uint8Array[]) {
  const combined = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  chunks.forEach((chunk) => {
    combined.set(chunk, offset);
    offset += chunk.length;
  });
  return combined;
}

function ownedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length);
  bytes.set(value);
  return bytes;
}

async function hmacSha256(keyBytes: Uint8Array, value: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    ownedBytes(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, ownedBytes(value)));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number) {
  const output = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return output.slice(0, length);
}

async function encryptPayload(subscription: StoredPushSubscription, payload: string) {
  const textEncoder = new TextEncoder();
  const clientPublicKey = decodeBase64Url(subscription.keys.p256dh);
  const authSecret = decodeBase64Url(subscription.keys.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const localKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: receiverKey },
      localKeys.privateKey,
      256,
    ),
  );
  const serverPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", localKeys.publicKey));
  const authPrk = await hmacSha256(authSecret, sharedSecret);
  const keyInfo = concatBytes(
    textEncoder.encode("WebPush: info\0"),
    clientPublicKey,
    serverPublicKey,
  );
  const inputKeyMaterial = await hkdfExpand(authPrk, keyInfo, 32);
  const contentPrk = await hmacSha256(salt, inputKeyMaterial);
  const contentKey = await hkdfExpand(
    contentPrk,
    textEncoder.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdfExpand(contentPrk, textEncoder.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  const plainText = concatBytes(textEncoder.encode(payload), new Uint8Array([2]));
  const cipherText = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plainText),
  );
  const header = new Uint8Array(21 + serverPublicKey.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = serverPublicKey.length;
  header.set(serverPublicKey, 21);
  return concatBytes(header, cipherText);
}

async function createVapidAuthorization(endpoint: string, config: PushConfiguration) {
  const publicBytes = decodeBase64Url(config.publicKey);
  const privateBytes = decodeBase64Url(config.privateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("Chaves VAPID inválidas.");
  }

  const textEncoder = new TextEncoder();
  const header = encodeBase64Url(textEncoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const audience = new URL(endpoint).origin;
  const claims = encodeBase64Url(
    textEncoder.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: config.subject,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  const signingKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: encodeBase64Url(publicBytes.slice(1, 33)),
      y: encodeBase64Url(publicBytes.slice(33, 65)),
      d: encodeBase64Url(privateBytes),
      ext: false,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      textEncoder.encode(signingInput),
    ),
  );
  return `vapid t=${signingInput}.${encodeBase64Url(signature)}, k=${config.publicKey}`;
}

async function sendPushNotification(
  subscription: StoredPushSubscription,
  payload: Record<string, unknown>,
  config: PushConfiguration,
) {
  const body = await encryptPayload(subscription, JSON.stringify(payload));
  const authorization = await createVapidAuthorization(subscription.endpoint, config);
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body,
  });
}

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, "\n");
}

function pemToBytes(pem: string) {
  const base64 = normalizePrivateKey(pem)
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signJwtRs256(payload: Record<string, unknown>, config: FcmConfiguration) {
  const textEncoder = new TextEncoder();
  const header = encodeBase64Url(textEncoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = encodeBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    ownedBytes(pemToBytes(config.privateKey)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      textEncoder.encode(signingInput),
    ),
  );
  return `${signingInput}.${encodeBase64Url(signature)}`;
}

async function getFcmAccessToken(config: FcmConfiguration) {
  if (fcmAccessTokenCache && fcmAccessTokenCache.expiresAt > Date.now() + 60_000) {
    return fcmAccessTokenCache.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwtRs256(
    {
      iss: config.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    config,
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`FCM OAuth falhou: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("FCM OAuth nao retornou access_token.");

  fcmAccessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000,
  };
  return fcmAccessTokenCache.token;
}

function fcmData(payload: Record<string, unknown>) {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "title" || key === "body") continue;
    if (value === null || value === undefined) continue;
    data[key] = String(value);
  }
  return data;
}

async function sendFcmNotification(
  subscription: NativePushSubscription,
  payload: Record<string, unknown>,
  config: FcmConfiguration,
) {
  const accessToken = await getFcmAccessToken(config);
  return fetch(`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: subscription.token,
        notification: {
          title: String(payload.title || "Transjap Sistema"),
          body: String(payload.body || "Voce recebeu uma atualizacao."),
        },
        data: fcmData(payload),
        android: {
          priority: "HIGH",
          notification: {
            channel_id: FCM_CHANNEL_ID,
            tag: String(payload.tag || "transjap-task"),
            click_action: "OPEN_AGENDA",
          },
        },
      },
    }),
  });
}

async function sendStoredPushNotification(
  subscription: StoredPushSubscription,
  payload: Record<string, unknown>,
  webConfig: PushConfiguration | null,
  fcmConfig: FcmConfiguration | null,
) {
  const nativeSubscription = parseNativePushEndpoint(subscription.endpoint);
  if (nativeSubscription) {
    if (!fcmConfig) return null;
    return sendFcmNotification(nativeSubscription, payload, fcmConfig);
  }

  if (!webConfig) return null;
  return sendPushNotification(subscription, payload, webConfig);
}

async function removePushIfExpired(subscription: StoredPushSubscription, response: Response) {
  if (response.status === 404 || response.status === 410) {
    await removeExpiredSubscription(subscription);
    return;
  }

  if (parseNativePushEndpoint(subscription.endpoint) && response.status === 400) {
    const body = await response.clone().text().catch(() => "");
    if (/UNREGISTERED|INVALID_ARGUMENT/i.test(body)) {
      await removeExpiredSubscription(subscription);
    }
  }
}

export async function sendNewTaskPushNotifications(task: TaskRecord) {
  const webConfig = pushConfiguration();
  const fcmConfig = fcmConfiguration();
  if (!webConfig && !fcmConfig) return;

  const recipientIds = Array.from(
    new Set([...task.responsibleIds, ...resolveResponsibleIds(task.assignedTo)]),
  );
  const subscriptions = await listSubscriptionsForUsers(recipientIds);
  const payload = {
    title: "Nova tarefa recebida",
    body: task.title,
    url: `${APP_ORIGIN}/agenda`,
    taskId: task.id,
    tag: `task-${task.id}`,
  };

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const response = await sendStoredPushNotification(
          subscription,
          payload,
          webConfig,
          fcmConfig,
        );
        if (!response) return;
        await removePushIfExpired(subscription, response);
        if (!response.ok) {
          console.warn(`[push] Falha ao notificar subscription: HTTP ${response.status}`);
        }
      } catch (error) {
        console.warn("[push] Não foi possível enviar notificação.", error);
      }
    }),
  );
}

export async function sendTaskActivityPushNotifications(
  task: TaskRecord,
  actor: AuthUser,
  action: "respondeu" | "comentou",
) {
  const webConfig = pushConfiguration();
  const fcmConfig = fcmConfiguration();
  if (!webConfig && !fcmConfig) return;

  const creatorId = task.createdById || findUserByName(task.createdBy)?.id || "";
  const participantIds = new Set([
    creatorId,
    ...task.responsibleIds,
    ...resolveResponsibleIds(task.assignedTo),
  ]);
  participantIds.delete("");
  participantIds.delete(actor.id);

  const subscriptions = await listSubscriptionsForUsers(Array.from(participantIds));
  const payload = {
    title: `${actor.name} ${action}`,
    body: task.title,
    url: `${APP_ORIGIN}/agenda`,
    taskId: task.id,
    tag: `task-activity-${task.id}`,
  };

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const response = await sendStoredPushNotification(
          subscription,
          payload,
          webConfig,
          fcmConfig,
        );
        if (!response) return;
        await removePushIfExpired(subscription, response);
        if (!response.ok) {
          console.warn(`[push] Falha ao notificar subscription: HTTP ${response.status}`);
        }
      } catch (error) {
        console.warn("[push] Não foi possível enviar notificação.", error);
      }
    }),
  );
}
