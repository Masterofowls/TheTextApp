import * as SecureStore from "expo-secure-store";

export type AuthStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const authStorage: AuthStorage = {
  getItem(key: string): string | null {
    try {
      return SecureStore.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      SecureStore.setItem(key, value);
    } catch (error) {
      console.error(`[auth-storage] failed to persist "${key}"`, error);
    }
  },
};
