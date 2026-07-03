import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import type { RealtimeEvent } from "@thetextapp/api/realtime-types";
import { trpcVanilla } from "./trpc-vanilla";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const MESSAGE_CATEGORY = "message";
const CALL_CATEGORY = "incoming_call";

export async function setupNotificationCategories() {
  await Notifications.setNotificationCategoryAsync(MESSAGE_CATEGORY, [
    {
      identifier: "reply",
      buttonTitle: "Reply",
      textInput: { submitButtonTitle: "Send", placeholder: "Message…" },
    },
    { identifier: "open", buttonTitle: "Open" },
  ]);

  await Notifications.setNotificationCategoryAsync(CALL_CATEGORY, [
    {
      identifier: "answer",
      buttonTitle: "Answer",
      options: { opensAppToForeground: true },
    },
    {
      identifier: "decline",
      buttonTitle: "Decline",
      options: { isDestructive: true },
    },
    { identifier: "open", buttonTitle: "Open" },
  ]);
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;
  const platform = Platform.OS === "ios" ? "ios" : "android";
  await trpcVanilla.user.registerPushToken.mutate({ token, platform });
  return token;
}

export async function showMessageNotification(
  event: Extract<RealtimeEvent, { type: "message" }>
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: event.senderName,
      body: event.preview,
      data: {
        kind: "message",
        conversationId: event.conversationId,
        messageId: event.messageId,
      },
      categoryIdentifier: MESSAGE_CATEGORY,
    },
    trigger: null,
  });
}

export async function showIncomingCallNotification(
  event: Extract<RealtimeEvent, { type: "incoming_call" }>
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Incoming ${event.callType} call`,
      body: `${event.initiatorName} is calling`,
      sound: "default",
      data: {
        kind: "incoming_call",
        callId: event.callId,
        conversationId: event.conversationId,
        callType: event.callType,
      },
      categoryIdentifier: CALL_CATEGORY,
    },
    trigger: null,
  });
}

export type NotificationActionRouter = {
  openChat: (conversationId: string) => void;
  openCall: (callId: string, answer?: boolean) => void;
};

export async function dismissCallNotification(_callId: string) {}

export function attachNotificationResponseHandlers(router: NotificationActionRouter) {
  const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
    const data = response.notification.request.content.data as Record<string, string>;
    const action = response.actionIdentifier;

    if (data.kind === "message") {
      if (action === Notifications.DEFAULT_ACTION_IDENTIFIER || action === "open") {
        router.openChat(data.conversationId);
        return;
      }
      if (action === "reply") {
        const text = response.userText?.trim();
        if (!text || !data.conversationId) return;
        try {
          await trpcVanilla.message.send.mutate({
            conversationId: data.conversationId,
            content: text,
            type: "text",
          });
        } catch (err) {
          console.error("[notifications] quick reply failed", err);
        }
        return;
      }
    }

    if (data.kind === "incoming_call" && data.callId) {
      if (action === "decline") {
        try {
          await trpcVanilla.calls.decline.mutate({ callId: data.callId });
        } catch (err) {
          console.error("[notifications] decline call failed", err);
        }
        return;
      }
      if (action === "answer" || action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        router.openCall(data.callId, true);
      }
    }
  });

  return () => sub.remove();
}
