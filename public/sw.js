const CACHE_NAME = "transjap-sistema-v3";
const APP_ORIGIN = "https://sistema-transjap.com.br";
const APP_SHELL = [
  "/",
  "/login",
  "/agenda",
  "/estoque",
  "/manutencao",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const { request } = event;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/") || Response.error()));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || Response.error());

      return cached || network;
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Nova tarefa recebida",
    body: "Uma nova tarefa foi enviada para você.",
    url: `${APP_ORIGIN}/agenda`,
    tag: "transjap-task",
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/pwa-icon-192.png",
      badge: "/pwa-icon-192.png",
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url || `${APP_ORIGIN}/agenda` },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || `${APP_ORIGIN}/agenda`;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const current = windows.find((client) => client.url.startsWith(APP_ORIGIN));
      if (current) {
        return current.navigate(targetUrl).then(() => current.focus());
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
