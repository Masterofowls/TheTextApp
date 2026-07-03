import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { appRouter } from "@thetextapp/api";
import { getDb, pingDb } from "@thetextapp/db";
import { auth } from "./auth.js";
import { realtimeHub } from "./realtime-hub.js";

const app = new Hono();

const corsOrigins = [
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:19006",
  "http://localhost:9001",
  ...(process.env.CORS_ORIGINS?.split(",") ?? []),
];

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      if (corsOrigins.includes(origin)) return origin;
      if (origin.startsWith("exp://")) return origin;
      return corsOrigins[0];
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.all("/trpc/*", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

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
