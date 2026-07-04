import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import type { RealtimeEvent } from "@thetextapp/api/realtime-types";
import {
  attachNotificationResponseHandlers,
  dismissCallNotification,
  registerForPushNotifications,
  setupNotificationCategories,
  showIncomingCallNotification,
  showMessageNotification,
} from "@/lib/notifications";
import { shouldShowMessageNotification } from "@/lib/web-notifications";
import { realtimeSocket } from "@/lib/realtime-ws";
import { navigatePush } from "@/lib/navigation";
import { trpc } from "@/lib/trpc";
import { trpcVanilla } from "@/lib/trpc-vanilla";

/** Connect WebSocket + notifications after the user is authenticated. */
export function useRealtime(enabled: boolean) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!enabled) {
      realtimeSocket.disconnect();
      return;
    }

    let detachNotifications: (() => void) | undefined;
    let detachEvents: (() => void) | undefined;
    let cancelled = false;

    async function boot() {
      await setupNotificationCategories();
      if (cancelled) return;

      if (Platform.OS !== "web") {
        await registerForPushNotifications();
      }
      if (cancelled) return;

      detachNotifications = attachNotificationResponseHandlers({
        openChat: (conversationId) => navigatePush(router, `/chat/${conversationId}`),
        openCall: (callId, answer) => {
          if (answer) {
            void trpcVanilla.calls.answer.mutate({ callId }).catch(console.error);
          }
          navigatePush(router, `/call/${callId}`);
        },
      });

      const handleEvent = (event: RealtimeEvent) => {
        const inBackground =
          appState.current === "background" || appState.current === "inactive";

        if (event.type === "message") {
          void utils.conversation.list.invalidate();
          void utils.message.list.invalidate({ conversationId: event.conversationId });
          const show =
            Platform.OS === "web"
              ? shouldShowMessageNotification(event.conversationId)
              : inBackground;
          if (show) {
            void showMessageNotification(event);
          }
        }

        if (event.type === "incoming_call") {
          void utils.calls.getActive.invalidate({ conversationId: event.conversationId });
          void showIncomingCallNotification(event);
        }

        if (event.type === "call_ended") {
          void utils.calls.getActive.invalidate({ conversationId: event.conversationId });
          if (Platform.OS === "web") {
            void dismissCallNotification(event.callId);
          }
        }
      };

      detachEvents = realtimeSocket.onEvent(handleEvent);
      await realtimeSocket.connect();
    }

    boot().catch(console.error);

    return () => {
      cancelled = true;
      detachNotifications?.();
      detachEvents?.();
      realtimeSocket.disconnect();
    };
  }, [enabled, router, utils]);
}
