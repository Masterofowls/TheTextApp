import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { expoPasskeyClient } from "expo-better-auth-passkey";
import { usernameClient } from "better-auth/client/plugins";
import { API_URL, APP_SCHEME } from "./config";
import { usernameToInternalEmail } from "./auth-username";
import { authStorage } from "./auth-storage";

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: APP_SCHEME,
      storage: authStorage,
    }),
    expoPasskeyClient(),
    usernameClient(),
  ],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await getSession();
  const headers: Record<string, string> = {};
  const token = session?.data?.session?.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Sign up with username + password only (no email collected from the user). */
export async function signUpWithUsername(username: string, password: string) {
  const normalized = username.trim();
  return signUp.email({
    name: normalized,
    email: usernameToInternalEmail(normalized),
    username: normalized,
    password,
  });
}

/** Sign in with username + password (or email for legacy accounts). */
export async function signInWithUsername(usernameOrEmail: string, password: string) {
  const value = usernameOrEmail.trim();
  if (value.includes("@")) {
    return signIn.email({ email: value, password });
  }
  return signIn.username({ username: value, password });
}

/** Real-time username availability (Better Auth `/is-username-available`). */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const result = await authClient.isUsernameAvailable({ username: username.trim() });
  if (result.error) {
    throw new Error(result.error.message ?? "Could not check username");
  }
  return result.data?.available ?? false;
}
