// Backup quente do banco central (VACUUM INTO — consistente com WAL, sem derrubar a API).
// Uso: npm run backup [-- --out <arquivo>]
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

const i = process.argv.indexOf('--out');
const out =
  (i >= 0 && process.argv[i + 1]) ||
  path.join(config.rootDir, 'backups', `hod-platform-${new Date().toISOString().slice(0, 10)}.sqlite`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const db = new Database(config.databasePath, { readonly: true });
try {
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  console.log(`Backup concluído: ${out}`);
} finally {
  db.close();
}
