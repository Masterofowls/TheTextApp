import { useSession } from "@/lib/auth-client";
import { useRealtime } from "@/hooks/use-realtime";

/** Connects authenticated users to the API WebSocket + notifications. */
export function RealtimeBridge() {
  const { data: session, isPending } = useSession();
  const enabled = !isPending && Boolean(session?.user);
  useRealtime(enabled);
  return null;
}
