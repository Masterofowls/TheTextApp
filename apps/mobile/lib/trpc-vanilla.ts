import { httpBatchLink } from "@trpc/client";
import { createTRPCProxyClient } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@thetextapp/api";
import { API_URL } from "./config";
import { getAuthHeaders } from "./auth-client";

/** Imperative tRPC client for notification action handlers (outside React). */
export const trpcVanilla = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      transformer: superjson,
      headers: getAuthHeaders,
      fetch(url, options) {
        return fetch(url, { ...options, credentials: "include" });
      },
    }),
  ],
});
