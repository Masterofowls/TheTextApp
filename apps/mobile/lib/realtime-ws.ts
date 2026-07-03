import type { RealtimeEvent } from "@thetextapp/api/realtime-types";
import { getAuthHeaders } from "./auth-client";
import { getWsUrl } from "./ws-url";

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

export class RealtimeSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<RealtimeEventHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  onEvent(handler: RealtimeEventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async connect() {
    this.closed = false;
    const headers = await getAuthHeaders();
    const token = headers.Authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return;

    const url = `${getWsUrl()}?token=${encodeURIComponent(token)}`;
    this.ws?.close();
    this.ws = new WebSocket(url);

    this.ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(String(evt.data)) as RealtimeEvent | { type: "connected" };
        if (data.type === "connected") return;
        for (const handler of this.handlers) handler(data as RealtimeEvent);
      } catch {
        /* ignore */
      }
    };

    this.ws.onclose = () => {
      if (!this.closed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const realtimeSocket = new RealtimeSocket();
