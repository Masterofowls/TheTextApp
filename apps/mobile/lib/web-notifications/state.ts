let activeConversationId: string | null = null;

export function setWebActiveConversation(conversationId: string | null) {
  activeConversationId = conversationId;
}

export function getWebActiveConversation(): string | null {
  return activeConversationId;
}

export function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

export function shouldShowMessageNotification(conversationId: string): boolean {
  if (isDocumentVisible() && activeConversationId === conversationId) {
    return false;
  }
  return true;
}

/** Show incoming-call tray notifications when the tab is hidden or unfocused. */
export function shouldShowIncomingCallNotification(): boolean {
  return !isDocumentVisible();
}
