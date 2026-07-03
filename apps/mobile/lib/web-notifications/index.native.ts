export type WebNotificationPrefs = {
  messages: boolean;
  calls: boolean;
  sound: boolean;
};

export function getWebNotificationPrefs(): WebNotificationPrefs {
  return { messages: true, calls: true, sound: true };
}

export function setWebNotificationPrefs() {}

export function setWebActiveConversation() {}

export function getWebActiveConversation(): string | null {
  return null;
}

export function isDocumentVisible(): boolean {
  return true;
}

export function shouldShowMessageNotification(): boolean {
  return true;
}

export function getWebNotificationPermission() {
  return "unsupported" as const;
}

export async function requestWebNotificationPermission() {
  return "unsupported" as const;
}

export function hasWebNotificationPermission() {
  return false;
}

export async function registerNotificationServiceWorker() {
  return null;
}

export function isServiceWorkerSupported() {
  return false;
}

export async function showWebMessageNotification() {}

export async function showWebIncomingCallNotification() {}

export async function closeWebNotificationByTag() {}

export async function showWebTestNotification() {}

export function setWebNotificationRouter() {}

export function handleWebNotificationAction() {}
