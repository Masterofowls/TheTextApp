/* TheTextApp — PWA shell cache + notification service worker */

const CACHE = "thetextapp-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/") ?? caches.match("/index.html"))
    );
    return;
  }

  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((res) => {
        const copy = res.clone();
        void caches.open(CACHE).then((cache) => cache.put(request, copy));
        return res;
      }))
    );
  }
});

function focusOrOpen(path, payload) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    if (clients.length > 0) {
      for (const client of clients) {
        client.postMessage(payload);
      }
      return clients[0].focus();
    }
    const url = new URL(path, self.location.origin).href;
    return self.clients.openWindow(url);
  });
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data ?? {};
  const action = event.action || "default";
  const replyText = event.reply ?? null;
  event.notification.close();

  const payload = { type: "NOTIFICATION_ACTION", action, data, replyText };

  if (data.kind === "message") {
    if (action === "reply" && replyText) {
      event.waitUntil(focusOrOpen(`/chat/${data.conversationId}`, payload));
      return;
    }
    if (action === "open" || action === "default") {
      event.waitUntil(focusOrOpen(`/chat/${data.conversationId}`, payload));
    }
    return;
  }

  if (data.kind === "incoming_call") {
    event.waitUntil(focusOrOpen(`/call/${data.callId}`, payload));
  }
});

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg?.type) return;

  if (msg.type === "SHOW_NOTIFICATION") {
    const { title, options } = msg.payload;
    event.waitUntil(self.registration.showNotification(title, options));
    return;
  }

  if (msg.type === "CLOSE_NOTIFICATION" && msg.tag) {
    event.waitUntil(
      self.registration.getNotifications({ tag: msg.tag }).then((list) => {
        for (const n of list) n.close();
      })
    );
  }
});
