import { useWebNotificationNavigation } from "@/hooks/use-web-notifications";

/** Wire service-worker notification clicks globally (web). */
export function WebNotificationBridge() {
  useWebNotificationNavigation();
  return null;
}
