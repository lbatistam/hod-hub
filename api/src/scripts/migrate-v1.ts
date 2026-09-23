// Migração SEGURA da V1: copia o SQLite da V1 para a Platform sem apagar/sobrescrever nada.
// - origem: V1_DATABASE_PATH (somente leitura, usa .backup() consistente mesmo com WAL);
// - destino: DATABASE_PATH da Platform (falha se já existir e --force não for passado);
// - segredos: lê V1 .env (GOOGLE_*, APP_ENCRYPTION_KEY, INITIAL_ADMIN_EMAIL) apenas para orientar o .env da Platform;
// - nunca escreve na V1, nunca apaga bancos atuais.
// Uso: npm run migrate:v1 [-- --force] [--from <v1.sqlite>] [--to <platform.sqlite>]
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] || null : null;
}

const force = process.argv.includes('--force');
const from = arg('--from') || config.v1DatabasePath;
const to = arg('--to') || config.databasePath;

if (!fs.existsSync(from)) {
  console.error(`Banco V1 não encontrado em: ${from}`);
  process.exit(1);
}
if (fs.existsSync(to) && !force) {
  console.error(`Destino já existe (proteção contra sobrescrita): ${to}\nUse --force para recriar a partir da V1.`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(to), { recursive: true });
if (fs.existsSync(to) && force) {
  const backup = `${to}.pre-migrate-${new Date().toISOString().slice(0, 10)}.bak`;
  fs.copyFileSync(to, backup);
  console.log(`Backup do destino anterior: ${backup}`);
  fs.rmSync(to, { force: true });
  for (const suffix of ['-wal', '-shm', '-journal']) fs.rmSync(`${to}${suffix}`, { force: true });
}

const src = new Database(from, { readonly: true });
try {
  await src.backup(to);
  console.log(`Cópia consistente da V1 concluída:\n  de: ${from}\n  para: ${to}`);
} finally {
  src.close();
}

// Validação pós-cópia: conta tabelas/linhas principais
const dst = new Database(to, { readonly: true });
try {
  const tables = (dst.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]).map((t) => t.name);
  console.log(`Tabelas: ${tables.join(', ')}`);
  for (const t of ['users', 'calendars', 'events', 'event_states', 'event_state_history', 'lead_creation_history', 'daily_summaries']) {
    if (tables.includes(t)) {
      const c = (dst.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
      console.log(`  ${t}: ${c}`);
    }
  }
  console.log('OK: a Platform aplicará ensureColumn/backfills do schema oficial ao iniciar (src/db.ts).');
  console.log('Próximo: configure o .env da Platform com os mesmos GOOGLE_* e APP_ENCRYPTION_KEY da V1 e rode npm run dev.');
} finally {
  dst.close();
}
