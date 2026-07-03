import type { AuthStorage } from "./auth-storage";

export const authStorage: AuthStorage = {
  getItem(key: string): string | null {
    if (typeof localStorage === "undefined") return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`[auth-storage] failed to persist "${key}"`, error);
    }
  },
};
