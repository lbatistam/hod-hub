import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function csv(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  rootDir,
  // Porta 8877 por padrão para rodar lado a lado com a V1 (8787) durante a migração.
  port: Number(process.env.PORT || 8877),
  origin: process.env.APP_ORIGIN || 'http://localhost:8877',
  corsOrigins: csv(
    process.env.CORS_ORIGINS ||
      'http://localhost:8787,http://127.0.0.1:8787'
  ),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8877/api/v1/auth/google/callback',
  encryptionKey: process.env.APP_ENCRYPTION_KEY || '',
  initialAdminEmail: (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase(),
  cookieSecure: process.env.COOKIE_SECURE === '1',
  databasePath: process.env.DATABASE_PATH || path.join(rootDir, 'data', 'hod-platform.sqlite'),
  v1DatabasePath:
    process.env.V1_DATABASE_PATH ||
    path.join(rootDir, '..', '..', 'apps', 'hod-hub', 'data', 'hod-hub.sqlite'),
  v1EnvPath:
    process.env.V1_ENV_PATH ||
    path.join(rootDir, '..', '..', 'apps', 'hod-hub', '.env'),
  archiveDir:
    process.env.ARCHIVE_DIR ||
    path.join(rootDir, '..', '..', 'data', 'hod-hub', 'history'),
};

export const APP_SOURCES = ['web-v1', 'heroui', 'shadcn', 'platform'] as const;
export type AppSource = (typeof APP_SOURCES)[number];

export function parseAppSource(value: unknown): AppSource {
  const v = String(value || 'platform').toLowerCase();
  return (APP_SOURCES as readonly string[]).includes(v) ? (v as AppSource) : 'platform';
}
