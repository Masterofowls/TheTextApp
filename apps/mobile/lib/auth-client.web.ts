import { createAuthClient } from "better-auth/react";
import {
  expoClient,
  getCookie,
  getSetCookie,
  hasBetterAuthCookies,
} from "@better-auth/expo/client";
import { expoPasskeyClient } from "expo-better-auth-passkey";
import { usernameClient } from "better-auth/client/plugins";
import { API_URL, APP_SCHEME } from "./config";
import { usernameToInternalEmail } from "./auth-username";
import { authStorage } from "./auth-storage";

const COOKIE_KEY = `${APP_SCHEME}_cookie`;
const SESSION_CACHE_KEY = `${APP_SCHEME}_session_data`;
const BEARER_TOKEN_KEY = `${APP_SCHEME}_bearer_token`;

function cookieHeaderFromStorage(): string {
  return getCookie(authStorage.getItem(COOKIE_KEY) || "{}");
}

function persistBearerToken(data: unknown) {
  const token = (data as { session?: { token?: string } } | null)?.session?.token;
  if (token) authStorage.setItem(BEARER_TOKEN_KEY, token);
}

function clearWebSessionStorage() {
  authStorage.setItem(COOKIE_KEY, "{}");
  authStorage.setItem(SESSION_CACHE_KEY, "{}");
  authStorage.setItem(BEARER_TOKEN_KEY, "");
}

function isAuthRoute(url: string) {
  return url.includes("/api/auth/");
}

function shouldClearSessionOnAuthError(url: string, status: number) {
  if (!isAuthRoute(url)) return false;
  return status === 500 || status === 401;
}

export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: {
    credentials: "include",
    onRequest: async (context) => {
      const headers = new Headers(context.headers);
      const bearer = authStorage.getItem(BEARER_TOKEN_KEY);
      if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
      const cookie = cookieHeaderFromStorage();
      if (cookie) headers.set("cookie", cookie);
      return { ...context, headers };
    },
    onSuccess: async (context) => {
      const url = context.request.url.toString();

      if (shouldClearSessionOnAuthError(url, context.response.status)) {
        clearWebSessionStorage();
        return;
      }

      const setCookie = context.response.headers.get("set-cookie");
      if (setCookie && hasBetterAuthCookies(setCookie, "better-auth")) {
        const prev = authStorage.getItem(COOKIE_KEY);
        authStorage.setItem(COOKIE_KEY, getSetCookie(setCookie, prev ?? undefined));
      }

      if (url.includes("/get-session") && context.data) {
        authStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(context.data));
      }
      if (url.includes("/sign-out")) {
        clearWebSessionStorage();
        return;
      }

      persistBearerToken(context.data);
    },
    onError: async (context) => {
      const url = context.request.url.toString();
      if (shouldClearSessionOnAuthError(url, context.response.status)) {
        clearWebSessionStorage();
      }
    },
    onResponse: async (context) => {
      const url = context.request.url.toString();
      if (shouldClearSessionOnAuthError(url, context.response.status)) {
        clearWebSessionStorage();
      }
      return context;
    },
  },
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
  const headers: Record<string, string> = {};
  const bearer = authStorage.getItem(BEARER_TOKEN_KEY);
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const cookie = cookieHeaderFromStorage();
  if (cookie) headers.cookie = cookie;

  if (!bearer) {
    try {
      const session = await getSession();
      const token = session?.data?.session?.token;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        authStorage.setItem(BEARER_TOKEN_KEY, token);
      }
    } catch {
      clearWebSessionStorage();
    }
  }

  return headers;
}

export async function signUpWithUsername(username: string, password: string) {
  const normalized = username.trim();
  return signUp.email({
    name: normalized,
    email: usernameToInternalEmail(normalized),
    username: normalized,
    password,
  });
}

export async function signInWithUsername(usernameOrEmail: string, password: string) {
  const value = usernameOrEmail.trim();
  if (value.includes("@")) {
    return signIn.email({ email: value, password });
  }
  return signIn.username({ username: value, password });
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const result = await authClient.isUsernameAvailable({ username: username.trim() });
  if (result.error) {
    throw new Error(result.error.message ?? "Could not check username");
  }
  return result.data?.available ?? false;
}
