import type { RealtimeEvent } from "@thetextapp/api/realtime-types";
import {
  closeWebNotificationByTag,
  registerNotificationServiceWorker,
  setWebNotificationRouter,
  showWebIncomingCallNotification,
  showWebMessageNotification,
} from "./web-notifications";

export type NotificationActionRouter = {
  openChat: (conversationId: string) => void;
  openCall: (callId: string, answer?: boolean) => void;
};

let declineHandler: ((callId: string) => void) | null = null;

export async function setupNotificationCategories() {
  await registerNotificationServiceWorker();
}

export async function registerForPushNotifications(): Promise<string | null> {
  await registerNotificationServiceWorker();
  return null;
}

export async function showMessageNotification(
  event: Extract<RealtimeEvent, { type: "message" }>
) {
  await showWebMessageNotification(event);
}

export async function showIncomingCallNotification(
  event: Extract<RealtimeEvent, { type: "incoming_call" }>
) {
  await showWebIncomingCallNotification(event);
}

export async function dismissCallNotification(callId: string) {
  await closeWebNotificationByTag(`call-${callId}`);
}

export function attachNotificationResponseHandlers(router: NotificationActionRouter) {
  setWebNotificationRouter({
    openChat: router.openChat,
    openCall: router.openCall,
    declineCall: (callId) => declineHandler?.(callId),
  });

  return () => {
    setWebNotificationRouter(null);
    declineHandler = null;
  };
}

export function setWebDeclineCallHandler(handler: (callId: string) => void) {
  declineHandler = handler;
}
