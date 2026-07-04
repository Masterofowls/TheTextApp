import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { API_URL } from "./config";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_KEY ??
  "";

/** Supabase client for Realtime message subscriptions (optional — falls back to polling). */
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        realtime: { params: { eventsPerSecond: 10 } },
        auth: { persistSession: false },
      })
    : null;

export function subscribeToMessages(
  conversationId: string,
  onInsert: () => void
): RealtimeChannel | null {
  if (!supabase) return null;

  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => onInsert()
    )
    .subscribe();

  return channel;
}

/** Notify when the current user is added to a new conversation (first-message / new-chat fallback). */
export function subscribeToNewConversations(
  userId: string,
  onChange: () => void
): RealtimeChannel | null {
  if (!supabase) return null;

  const channel = supabase
    .channel(`conv-members:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "conversation_members",
        filter: `user_id=eq.${userId}`,
      },
      () => onChange()
    )
    .subscribe();

  return channel;
}

export function unsubscribeChannel(channel: RealtimeChannel | null) {
  if (channel && supabase) {
    supabase.removeChannel(channel);
  }
}

export function subscribeToCalls(
  userId: string,
  onChange: () => void
): RealtimeChannel | null {
  if (!supabase) return null;

  const channel = supabase
    .channel(`calls:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "calls" },
      () => onChange()
    )
    .subscribe();

  return channel;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export { API_URL };
