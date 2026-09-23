// SSE central: propaga atualizações para todos os apps abertos.
// Eventos: event.state_changed, daily_entry.updated, settings.updated,
// calendars.synced, users.updated, analytics.invalidated
import type { Response } from 'express';

export type StreamEventName =
  | 'event.state_changed'
  | 'daily_entry.updated'
  | 'settings.updated'
  | 'calendars.synced'
  | 'users.updated'
  | 'server.heartbeat';

export interface StreamPayload {
  type: StreamEventName;
  data: unknown;
  at: string;
}

const clients = new Set<Response>();

export function streamClientCount(): number {
  return clients.size;
}

export function addStreamClient(res: Response): () => void {
  clients.add(res);
  return () => {
    clients.delete(res);
  };
}

export function broadcast(type: StreamEventName, data: unknown): void {
  const payload: StreamPayload = { type, data, at: new Date().toISOString() };
  const line = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(line);
    } catch {
      // cliente morto será removido no close
    }
  }
}

// Heartbeat a cada 25s para manter proxies/NAT e detectar clientes mortos.
setInterval(() => {
  if (clients.size === 0) return;
  broadcast('server.heartbeat', { clients: clients.size });
}, 25_000).unref();
