import type { RealtimeEvent, RealtimePublisher } from "@thetextapp/api/realtime-types";

type WsSocket = { send: (data: string) => void };

type Client = {
  userId: string;
  socket: WsSocket;
};

export class RealtimeHub implements RealtimePublisher {
  private clients = new Map<string, Set<Client>>();

  addClient(userId: string, socket: WsSocket) {
    const client: Client = { userId, socket };
    let set = this.clients.get(userId);
    if (!set) {
      set = new Set();
      this.clients.set(userId, set);
    }
    set.add(client);
  }

  removeClient(userId: string, socket: WsSocket) {
    const set = this.clients.get(userId);
    if (!set) return;
    for (const client of set) {
      if (client.socket === socket) set.delete(client);
    }
    if (set.size === 0) this.clients.delete(userId);
  }

  publishToUsers(userIds: string[], event: RealtimeEvent) {
    const payload = JSON.stringify(event);
    for (const userId of userIds) {
      const set = this.clients.get(userId);
      if (!set) continue;
      for (const { socket } of set) {
        try {
          socket.send(payload);
        } catch {
          /* disconnected */
        }
      }
    }
  }

  onlineCount(): number {
    let n = 0;
    for (const set of this.clients.values()) n += set.size;
    return n;
  }
}

export const realtimeHub = new RealtimeHub();
