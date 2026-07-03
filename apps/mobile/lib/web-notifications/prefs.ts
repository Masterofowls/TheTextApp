const PREFS_KEY = "thetextapp_web_notification_prefs";

export type WebNotificationPrefs = {
  messages: boolean;
  calls: boolean;
  sound: boolean;
};

const DEFAULT_PREFS: WebNotificationPrefs = {
  messages: true,
  calls: true,
  sound: true,
};

export function getWebNotificationPrefs(): WebNotificationPrefs {
  if (typeof localStorage === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setWebNotificationPrefs(partial: Partial<WebNotificationPrefs>) {
  if (typeof localStorage === "undefined") return;
  const next = { ...getWebNotificationPrefs(), ...partial };
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
}
