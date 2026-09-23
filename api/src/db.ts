import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db: DatabaseType = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema oficial da HOD Platform = schema confiável da V1 (server/db.js)
// + extensões mínimas exigidas pelo objetivo (settings centrais, app_source no histórico,
//   controle de migrations). Nenhuma tabela da V1 foi removida ou renomeada.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'sdr' CHECK (role IN ('admin','sdr','closer')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS oauth_tokens (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER,
    scope TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash TEXT PRIMARY KEY,
    return_to TEXT NOT NULL DEFAULT '/',
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS calendars (
    id INTEGER PRIMARY KEY,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    google_calendar_id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    closer_name TEXT,
    color TEXT NOT NULL DEFAULT '#0000FF',
    closer_role TEXT NOT NULL DEFAULT 'fixed' CHECK (closer_role IN ('fixed','overbooking')),
    is_overbooking INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    google_event_id TEXT NOT NULL,
    calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    event_date TEXT NOT NULL,
    title TEXT NOT NULL,
    lead_name TEXT NOT NULL,
    phone TEXT,
    meeting_url TEXT,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    attendee_declined INTEGER NOT NULL DEFAULT 0,
    raw_json TEXT,
    synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (google_event_id, event_date)
  );

  CREATE TABLE IF NOT EXISTS event_states (
    event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    manual_status TEXT CHECK (manual_status IS NULL OR manual_status IN ('compareceu','no_show','cancelada','reagendar','reagendado','over_sem_atendimento')),
    confirmation TEXT NOT NULL DEFAULT 'neutro' CHECK (confirmation IN ('neutro','confirmado','nao_confirmado')),
    notes TEXT,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS event_state_history (
    id INTEGER PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    event_date TEXT NOT NULL,
    lead_name TEXT NOT NULL,
    closer_name TEXT,
    previous_status TEXT,
    new_status TEXT,
    previous_confirmation TEXT,
    new_confirmation TEXT,
    notes TEXT,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS lead_creation_history (
    id INTEGER PRIMARY KEY,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_google_event_id TEXT NOT NULL,
    lead_name TEXT NOT NULL,
    phone TEXT,
    event_date TEXT NOT NULL,
    created_at_google TEXT NOT NULL,
    original_closer_name TEXT,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (owner_user_id, source_google_event_id)
  );

  CREATE TABLE IF NOT EXISTS daily_summaries (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    summary_date TEXT NOT NULL,
    contacted_count INTEGER NOT NULL DEFAULT 0 CHECK (contacted_count >= 0),
    notes TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, summary_date)
  );

  -- NOVO (Platform): configurações compartilhadas de negócio (centrais).
  -- Preferências visuais locais (tema, zoom, densidade, posição da janela) NÃO entram aqui.
  CREATE TABLE IF NOT EXISTS shared_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by_app TEXT NOT NULL DEFAULT 'platform',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- NOVO (Platform 1.1.0): tickets de login nativo (uso único, curta expiração).
  -- Permite ao Electron concluir o OAuth do sistema sem guardar o segredo Google:
  -- o navegador entrega um ticket ao loopback local, trocado por sessão em /auth/native-exchange.
  CREATE TABLE IF NOT EXISTS login_tickets (
    ticket_hash TEXT PRIMARY KEY,
    session_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);
  CREATE INDEX IF NOT EXISTS idx_events_date_start ON events(event_date, starts_at);
  CREATE INDEX IF NOT EXISTS idx_events_calendar_date ON events(calendar_id, event_date);
  CREATE INDEX IF NOT EXISTS idx_event_states_status ON event_states(manual_status) WHERE manual_status IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_event_state_history_date ON event_state_history(event_date, changed_at);
  CREATE INDEX IF NOT EXISTS idx_lead_creation_history_owner_created
    ON lead_creation_history(owner_user_id, created_at_google);
`);

function ensureColumn(table: string, name: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

// Colunas evolutivas da V1 (port fiel de server/db.js ensureColumn)
ensureColumn('calendars', 'access_role', "TEXT NOT NULL DEFAULT 'reader'");
ensureColumn('calendars', 'overbooking_from', 'TEXT');
ensureColumn('calendars', 'team_status', "TEXT NOT NULL DEFAULT 'active'");
ensureColumn('events', 'source_google_event_id', 'TEXT');
ensureColumn('events', 'has_external_attendee', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('events', 'self_response_status', "TEXT NOT NULL DEFAULT 'needsAction'");
ensureColumn('events', 'organizer_email', 'TEXT');
ensureColumn('events', 'meeting_kind', "TEXT NOT NULL DEFAULT 'consultoria'");
ensureColumn('events', 'created_at_google', 'TEXT');
ensureColumn('daily_summaries', 'over_called_count', 'INTEGER');
ensureColumn('daily_summaries', 'attended_count', 'INTEGER');
ensureColumn('daily_summaries', 'no_show_ps_count', 'INTEGER');
ensureColumn('daily_summaries', 'over_unattended_count', 'INTEGER');

// NOVO (Platform): rastreabilidade de qual aplicativo fez cada alteração.
ensureColumn('event_state_history', 'app_source', "TEXT NOT NULL DEFAULT 'platform'");
ensureColumn('event_states', 'updated_by_app', "TEXT NOT NULL DEFAULT 'platform'");
ensureColumn('daily_summaries', 'updated_by_app', "TEXT NOT NULL DEFAULT 'platform'");

// Rebuild de event_states se CHECK legado (port fiel da V1)
const eventStatesSql =
  (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='event_states'").get() as { sql?: string } | undefined)?.sql || '';
if (
  !eventStatesSql.includes("'compareceu'") ||
  !eventStatesSql.includes("'over_sem_atendimento'") ||
  !eventStatesSql.includes("'reagendado'")
) {
  db.exec(`
    DROP INDEX IF EXISTS idx_event_states_status;
    ALTER TABLE event_states RENAME TO event_states_before_attendance;
    CREATE TABLE event_states (
      event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      manual_status TEXT CHECK (manual_status IS NULL OR manual_status IN ('compareceu','no_show','cancelada','reagendar','reagendado','over_sem_atendimento')),
      confirmation TEXT NOT NULL DEFAULT 'neutro' CHECK (confirmation IN ('neutro','confirmado','nao_confirmado')),
      notes TEXT,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by_app TEXT NOT NULL DEFAULT 'platform',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO event_states(event_id,manual_status,confirmation,notes,updated_by,updated_at)
      SELECT event_id,manual_status,confirmation,notes,updated_by,updated_at FROM event_states_before_attendance;
    DROP TABLE event_states_before_attendance;
    CREATE INDEX idx_event_states_status ON event_states(manual_status) WHERE manual_status IS NOT NULL;
  `);
}

// Backfills fiéis da V1 (chave multi-agenda + memória de criação p/ Over transferido)
db.prepare(
  `UPDATE events
   SET source_google_event_id=google_event_id,
       google_event_id=CAST(calendar_id AS TEXT) || ':' || google_event_id
   WHERE source_google_event_id IS NULL`
).run();

db.prepare(
  `INSERT OR IGNORE INTO lead_creation_history
   (owner_user_id,source_google_event_id,lead_name,phone,event_date,created_at_google,original_closer_name)
   SELECT calendars.owner_user_id,events.source_google_event_id,events.lead_name,events.phone,
     events.event_date,events.created_at_google,calendars.closer_name
   FROM events
   JOIN calendars ON calendars.id=events.calendar_id
   WHERE calendars.owner_user_id IS NOT NULL
     AND events.source_google_event_id IS NOT NULL
     AND events.created_at_google IS NOT NULL`
).run();

// Defaults centrais de negócio (compartilhados entre os 3 apps)
const seedSetting = db.prepare(
  `INSERT OR IGNORE INTO shared_settings (key, value) VALUES (?, ?)`
);
seedSetting.run('work_hours', JSON.stringify({ workStart: '08:00', workEnd: '23:00' }));
seedSetting.run('slot_config', JSON.stringify({ durationMinutes: 60, stepMinutes: 60 }));
seedSetting.run(
  'operation',
  JSON.stringify({ autoCloseMinutes: 50, overbookingFrom: '2026-07-15', timezone: 'America/Sao_Paulo' })
);
seedSetting.run(
  'business_rules',
  JSON.stringify({
    rescheduleCountsAsNoShow: true,
    overExcludedFromAttendance: true,
    declinedCountsAsNoShow: true,
    compareceuAbsolvesDeclined: true,
  })
);

db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`).run('1.0.0-platform');
db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`).run('1.1.0-native-tickets');
db.pragma('optimize');

export function getSharedSetting<T>(key: string, fallback: T): T {
  const row = db.prepare(`SELECT value FROM shared_settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}
