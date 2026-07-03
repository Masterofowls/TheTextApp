/* TheTextApp — system notification service worker (web / desktop) */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
  event.notification.close();

  const payload = { type: "NOTIFICATION_ACTION", action, data };

  if (data.kind === "message") {
    event.waitUntil(focusOrOpen(`/chat/${data.conversationId}`, payload));
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
