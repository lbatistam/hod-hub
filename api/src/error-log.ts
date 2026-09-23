import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

export function requestId(): string {
  return crypto.randomBytes(4).toString('hex');
}

export async function recordServerError(error: unknown, req: { method: string; originalUrl: string }, id: string): Promise<void> {
  try {
    const line =
      JSON.stringify({
        id,
        at: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined,
      }) + '\n';
    const file = path.join(path.dirname(config.databasePath), 'hod-platform-error.log');
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.appendFile(file, line, { mode: 0o600 });
  } catch {
    // log nunca pode derrubar a API
  }
}
