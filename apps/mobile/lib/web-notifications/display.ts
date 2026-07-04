import type { RealtimeEvent } from "@thetextapp/api/realtime-types";
import { getWebNotificationPrefs } from "./prefs";
import { getNotificationRegistration, postToServiceWorker } from "./service-worker";
import { hasWebNotificationPermission } from "./permissions";

/** Absolute URL — service worker notifications require a fetchable icon on the app origin. */
function notificationIconUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URL("/favicon.png", window.location.origin).href;
}

type NotificationPayload = {
  kind: string;
  conversationId?: string;
  messageId?: string;
  callId?: string;
  callType?: string;
};

let clickRouter: {
  openChat: (conversationId: string) => void;
  openCall: (callId: string, answer?: boolean) => void;
  declineCall: (callId: string) => void;
} | null = null;

export function setWebNotificationRouter(router: typeof clickRouter) {
  clickRouter = router;
}

async function showSystemNotification(
  title: string,
  options: NotificationOptions & { data: NotificationPayload }
) {
  if (!hasWebNotificationPermission()) return;

  const icon = notificationIconUrl();
  const reg = await getNotificationRegistration();
  if (reg) {
    await reg.showNotification(title, {
      ...(icon ? { icon, badge: icon } : {}),
      ...options,
    });
    return;
  }

  if (typeof Notification === "undefined") return;

  const notification = new Notification(title, {
    ...(icon ? { icon } : {}),
    ...options,
  });

  notification.onclick = () => {
    window.focus();
    const data = options.data;
    if (data.kind === "message" && data.conversationId) {
      clickRouter?.openChat(data.conversationId);
    }
    if (data.kind === "incoming_call" && data.callId) {
      clickRouter?.openCall(data.callId, true);
    }
    notification.close();
  };
}

export async function showWebMessageNotification(
  event: Extract<RealtimeEvent, { type: "message" }>
) {
  const prefs = getWebNotificationPrefs();
  if (!prefs.messages) return;

  await showSystemNotification(event.senderName, {
    body: event.preview,
    tag: `msg-${event.conversationId}`,
    renotify: true,
    silent: !prefs.sound,
    data: {
      kind: "message",
      conversationId: event.conversationId,
      messageId: event.messageId,
    },
  });
}

export async function showWebIncomingCallNotification(
  event: Extract<RealtimeEvent, { type: "incoming_call" }>
) {
  const prefs = getWebNotificationPrefs();
  if (!prefs.calls) return;

  const actions = [
    { action: "answer", title: "Answer" },
    { action: "decline", title: "Decline" },
  ];

  await showSystemNotification(`Incoming ${event.callType} call`, {
    body: `${event.initiatorName} is calling`,
    tag: `call-${event.callId}`,
    requireInteraction: true,
    silent: false,
    actions,
    data: {
      kind: "incoming_call",
      callId: event.callId,
      conversationId: event.conversationId,
      callType: event.callType,
    },
  });
}

export async function closeWebNotificationByTag(tag: string) {
  await postToServiceWorker({ type: "CLOSE_NOTIFICATION", tag });
}

export async function showWebTestNotification() {
  await showSystemNotification("TheTextApp", {
    body: "Desktop notifications are working.",
    tag: "thetextapp-test",
    data: { kind: "test" },
  });
}

export function handleWebNotificationAction(
  action: string,
  data: NotificationPayload,
  handlers: {
    openChat: (id: string) => void;
    openCall: (id: string, answer?: boolean) => void;
    declineCall: (id: string) => void;
  }
) {
  if (data.kind === "message" && data.conversationId) {
    handlers.openChat(data.conversationId);
    return;
  }

  if (data.kind === "incoming_call" && data.callId) {
    if (action === "decline") {
      handlers.declineCall(data.callId);
      void closeWebNotificationByTag(`call-${data.callId}`);
      return;
    }
    handlers.openCall(data.callId, action === "answer" || action === "default");
    void closeWebNotificationByTag(`call-${data.callId}`);
  }
}
