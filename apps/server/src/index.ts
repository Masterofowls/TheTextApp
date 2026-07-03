import "./env.js";
import type { Server } from "bun";
import { closeDb } from "@thetextapp/db";
import app from "./app.js";
import { handleWsUpgrade, onWsClose, onWsOpen, type WsData } from "./ws.js";

const port = Number(process.env.PORT ?? 9001);

console.log(`TheTextApp API (Bun + Hono) → http://0.0.0.0:${port}`);
console.log(`Realtime WebSocket → ws://0.0.0.0:${port}/ws`);

process.on("SIGINT", () => void closeDb());
process.on("SIGTERM", () => void closeDb());

export default {
  port,
  hostname: "0.0.0.0",
  fetch(req: Request, server: Server<WsData>) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      return handleWsUpgrade(req, server);
    }
    return app.fetch(req);
  },
  websocket: {
    open: onWsOpen,
    close: onWsClose,
    message() {},
  },
};
