import { useEffect } from "react";
import { useRouter } from "expo-router";
import {
  handleWebNotificationAction,
  registerNotificationServiceWorker,
  setWebNotificationRouter,
} from "@/lib/web-notifications";
import { setWebDeclineCallHandler } from "@/lib/notifications";
import { trpcVanilla } from "@/lib/trpc-vanilla";

/** Listens for service-worker notification clicks/actions on web. */
export function useWebNotificationNavigation() {
  const router = useRouter();

  useEffect(() => {
    void registerNotificationServiceWorker();

    const handlers = {
      openChat: (conversationId: string) => router.push(`/chat/${conversationId}`),
      openCall: (callId: string, answer?: boolean) => {
        if (answer) {
          void trpcVanilla.calls.answer.mutate({ callId }).catch(console.error);
        }
        router.push(`/call/${callId}`);
      },
      declineCall: (callId: string) => {
        void trpcVanilla.calls.decline.mutate({ callId }).catch(console.error);
      },
    };

    setWebNotificationRouter(handlers);
    setWebDeclineCallHandler(handlers.declineCall);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        action?: string;
        data?: Record<string, string>;
      };
      if (data?.type !== "NOTIFICATION_ACTION" || !data.data) return;
      handleWebNotificationAction(data.action ?? "default", data.data, handlers);
    };

    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      setWebNotificationRouter(null);
      setWebDeclineCallHandler(() => {});
    };
  }, [router]);
}
