import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { Platform } from "react-native";
import superjson from "superjson";
import type { AppRouter } from "@thetextapp/api";
import { API_URL } from "./config";
import { clearWebSessionStorage, getAuthHeaders } from "./auth-client";

function isCrossOriginApi(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  try {
    return new URL(API_URL).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        transformer: superjson,
        headers: getAuthHeaders,
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: isCrossOriginApi() ? "omit" : "include",
          }).then((response) => {
            if (
              response.status === 401 &&
              isCrossOriginApi() &&
              options?.headers &&
              new Headers(options.headers as HeadersInit).has("Authorization")
            ) {
              clearWebSessionStorage();
            }
            return response;
          });
        },
      }),
    ],
  });
}
