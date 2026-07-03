const SW_URL = "/sw.js";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function isServiceWorkerSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((reg) => reg)
      .catch((err) => {
        console.warn("[web-notifications] service worker registration failed", err);
        registrationPromise = null;
        return null;
      });
  }

  return registrationPromise;
}

export async function getNotificationRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return registerNotificationServiceWorker();
}

export async function postToServiceWorker(message: unknown) {
  const reg = await getNotificationRegistration();
  reg?.active?.postMessage(message);
}
