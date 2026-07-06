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
import {
  dismissIncomingCall,
  emitCallAnswered,
  emitCallEnded,
  setIncomingCall,
} from "@/lib/incoming-call-store";
import { emitConversationMessage } from "@/lib/message-events";
import {
  shouldShowIncomingCallNotification,
  shouldShowMessageNotification,
} from "@/lib/web-notifications";
import { realtimeSocket } from "@/lib/realtime-ws";
import { navigatePush } from "@/lib/navigation";
import {
  subscribeToNewConversations,
  unsubscribeChannel,
} from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { trpcVanilla } from "@/lib/trpc-vanilla";
import { useSession } from "@/lib/auth-client";

function refreshConversationList(
  utils: ReturnType<typeof trpc.useUtils>
) {
  void utils.conversation.list.refetch();
}

/** Connect WebSocket + notifications after the user is authenticated. */
export function useRealtime(enabled: boolean) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const userId = session?.user?.id;
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
    let memberChannel: ReturnType<typeof subscribeToNewConversations> = null;
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

        if (event.type === "conversation_created") {
          refreshConversationList(utils);
        }

        if (event.type === "message") {
          emitConversationMessage(event);
          refreshConversationList(utils);
          void utils.message.list.refetch({
            conversationId: event.conversationId,
            limit: 50,
          });
          const show =
            Platform.OS === "web"
              ? shouldShowMessageNotification(event.conversationId)
              : inBackground;
          if (show) {
            void showMessageNotification(event);
          }
        }

        if (event.type === "incoming_call") {
          setIncomingCall(event);
          void utils.calls.getActive.invalidate({ conversationId: event.conversationId });
          void utils.calls.listRinging.invalidate();
          const showNotify =
            Platform.OS === "web"
              ? shouldShowIncomingCallNotification()
              : inBackground;
          if (showNotify) {
            void showIncomingCallNotification(event);
          }
        }

        if (event.type === "call_answered") {
          emitCallAnswered(event);
          void utils.calls.getActive.invalidate({ conversationId: event.conversationId });
        }

        if (event.type === "call_ended") {
          emitCallEnded(event);
          void utils.calls.getActive.invalidate({ conversationId: event.conversationId });
          void utils.calls.listRinging.invalidate();
          if (Platform.OS === "web") {
            void dismissCallNotification(event.callId);
          }
        }
      };

      detachEvents = realtimeSocket.onEvent(handleEvent);
      await realtimeSocket.connect();

      const refreshList = () => refreshConversationList(utils);
      memberChannel =
        userId != null ? subscribeToNewConversations(userId, refreshList) : null;

      try {
        const ringing = await trpcVanilla.calls.listRinging.query();
        const first = ringing[0];
        if (first) setIncomingCall(first);
      } catch {
        /* offline or unauthenticated */
      }
    }

    boot().catch(console.error);

    return () => {
      cancelled = true;
      detachNotifications?.();
      detachEvents?.();
      unsubscribeChannel(memberChannel);
      memberChannel = null;
      realtimeSocket.disconnect();
    };
  }, [enabled, router, utils, userId]);
}
