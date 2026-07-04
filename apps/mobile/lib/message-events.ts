import type { RealtimeMessageEvent } from "@thetextapp/api/realtime-types";

type ConversationListener = (event: RealtimeMessageEvent) => void;
type GlobalListener = (event: RealtimeMessageEvent) => void;

const byConversation = new Map<string, Set<ConversationListener>>();
const globalListeners = new Set<GlobalListener>();

export function emitConversationMessage(event: RealtimeMessageEvent) {
  for (const listener of globalListeners) listener(event);
  const set = byConversation.get(event.conversationId);
  if (!set) return;
  for (const listener of set) listener(event);
}

export function subscribeConversationMessages(
  conversationId: string,
  listener: ConversationListener
) {
  let set = byConversation.get(conversationId);
  if (!set) {
    set = new Set();
    byConversation.set(conversationId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) byConversation.delete(conversationId);
  };
}

export function subscribeAllMessages(listener: GlobalListener) {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}
