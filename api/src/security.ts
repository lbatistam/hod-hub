// Port fiel de server/security.js da V1 (AES-256-GCM + sha256 + token opaco).
import crypto from 'node:crypto';
import { config } from './config.js';

export function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function key(): Buffer {
  const raw = String(config.encryptionKey || '');
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('APP_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais.');
  }
  return Buffer.from(raw, 'hex');
}

export function encrypt(plain: string | null | undefined): string {
  if (plain === null || plain === undefined) return plain as unknown as string;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decrypt(payload: string | null | undefined): string | null {
  if (payload === null || payload === undefined) return null;
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key(),
      Buffer.from(ivB64, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}
