import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { resolveMoqRelayUrl, moqCertProbeUrl } from "@thetextapp/moq/relay-url";
import { appRouter } from "@thetextapp/api";
import { getDb, pingDb } from "@thetextapp/db";
import { auth } from "./auth.js";
import { getSessionFromRequest } from "./session-from-request.js";
import { realtimeHub } from "./realtime-hub.js";

const app = new Hono();

const corsOrigins = [
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:19006",
  "http://localhost:9001",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:8082",
  "http://127.0.0.1:19006",
  ...(process.env.CORS_ORIGINS?.split(",").filter(Boolean) ?? []),
];

function isAllowedOrigin(origin: string): boolean {
  if (corsOrigins.includes(origin)) return true;
  if (origin.startsWith("exp://")) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
  return false;
}

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      if (isAllowedOrigin(origin)) return origin;
      return corsOrigins[0];
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["set-auth-token"],
  })
);

app.get("/health", async (c) => {
  const dbOk = await pingDb();
  return c.json(
    {
      status: dbOk ? "ok" : "degraded",
      service: "thetextapp-api",
      database: dbOk ? "connected" : "unavailable",
      timestamp: new Date().toISOString(),
    },
    dbOk ? 200 : 503
  );
});

/** Proxy MoQ cert fingerprint — browsers cannot fetch plain HTTP on Fly port 443. */
app.get("/moq/certificate.sha256", async (c) => {
  const relayUrl = resolveMoqRelayUrl();
  const probeUrl = moqCertProbeUrl(relayUrl);
  try {
    const response = await fetch(probeUrl, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return c.text("relay unavailable", 502);
    }
    const hash = (await response.text()).trim();
    return c.text(hash, 200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
  } catch {
    return c.text("relay unreachable", 502);
  }
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.all("/trpc/*", async (c) => {
  const session = await getSessionFromRequest(c.req.raw);

  return fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => ({
      db: getDb(),
      session: session
        ? {
            user: session.user,
            session: session.session,
          }
        : null,
      req: c.req.raw,
      realtime: realtimeHub,
    }),
  });
});

export default app;
