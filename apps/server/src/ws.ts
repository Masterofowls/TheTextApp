import type { ServerWebSocket } from "bun";
import { auth } from "./auth.js";
import { realtimeHub } from "./realtime-hub.js";

export type WsData = {
  userId: string;
};

export async function authenticateWsToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  const session = await auth.api.getSession({
    headers: new Headers({ Authorization: `Bearer ${token}` }),
  });
  return session?.user?.id ?? null;
}

export async function handleWsUpgrade(
  req: Request,
  server: { upgrade: (req: Request, options: { data: WsData }) => boolean }
): Promise<Response | undefined> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const userId = await authenticateWsToken(token);

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const upgraded = server.upgrade(req, { data: { userId } });
  if (!upgraded) {
    return new Response("WebSocket upgrade failed", { status: 400 });
  }

  return undefined;
}

export function onWsOpen(ws: ServerWebSocket<WsData>) {
  if (ws.data?.userId) {
    realtimeHub.addClient(ws.data.userId, ws);
    ws.send(JSON.stringify({ type: "connected", userId: ws.data.userId }));
  }
}

export function onWsClose(ws: ServerWebSocket<WsData>) {
  if (ws.data?.userId) {
    realtimeHub.removeClient(ws.data.userId, ws);
  }
}
