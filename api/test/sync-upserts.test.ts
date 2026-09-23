// Regressão do incidente QA 2026-09-14: placeholders × valores nos upserts do sync.
// Um mismatch derruba POST /sync com 500 APÓS o UPDATE active=0 (telas zeradas).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hod-platform-upsert-')), 'test.sqlite');
process.env.DATABASE_PATH = tmpDb;
process.env.APP_ENCRYPTION_KEY = 'e'.repeat(64);

const { db } = await import('../src/db.js');
const { UPSERT_CALENDAR_SQL, UPSERT_EVENT_SQL } = await import('../src/calendar.js');

// Os upserts referenciam owner_user_id. O banco temporário precisa conter o
// usuário proprietário para que o teste valide o SQL, e não falhe antes por FK.
db.prepare(
  `INSERT INTO users(id, google_sub, email, name, role, status)
   VALUES (1, 'sync-upsert-test', 'sync-upsert@test.local', 'Sync Upsert Test', 'admin', 'approved')`,
).run();

const placeholders = (sql: string) => sql.split('VALUES')[1].split('ON CONFLICT')[0].split(',').length;

describe('upserts do sync (placeholders × valores)', () => {
  it('calendars: 11 colunas, 11 valores, conflito atualiza', () => {
    assert.equal(placeholders(UPSERT_CALENDAR_SQL), 11);
    const stmt = db.prepare(UPSERT_CALENDAR_SQL);
    const vals: unknown[] = [1, 'edu@x.com', 'Edu', 'Eduardo', '#000', 'fixed', 0, null, 1, 'reader', 'active'];
    const first = stmt.get(...vals) as { id: number };
    assert.ok(first.id > 0);
    const second = stmt.get(...vals.slice(0, 8), 0, ...vals.slice(9)) as { id: number };
    assert.equal(second.id, first.id);
    const row = db.prepare(`SELECT active, team_status FROM calendars WHERE id = ?`).get(first.id) as { active: number; team_status: string };
    assert.equal(row.active, 0);
    assert.equal(row.team_status, 'active');
  });

  it('events: 17 colunas, 17 valores, conflito atualiza', () => {
    assert.equal(placeholders(UPSERT_EVENT_SQL), 17);
    const cal = db.prepare(UPSERT_CALENDAR_SQL).get(1, 'r@x.com', 'R', 'Rafael', '#000', 'overbooking', 1, '2026-07-15', 1, 'reader', 'active') as { id: number };
    const stmt = db.prepare(UPSERT_EVENT_SQL);
    const vals: unknown[] = ['1:abc', 'abc', cal.id, '2026-09-14', 'Consultoria X', 'X', null, null, '2026-09-14T10:00:00-03:00', '2026-09-14T11:00:00-03:00', 0, 1, 'needsAction', 'org@x.com', 'consultoria', '2026-09-01T00:00:00Z', '{}'];
    stmt.run(...vals);
    stmt.run(...vals.slice(0, 4), 'Consultoria Y', ...vals.slice(5));
    const row = db.prepare(`SELECT title, source_google_event_id FROM events WHERE google_event_id = ?`).get('1:abc') as { title: string; source_google_event_id: string };
    assert.equal(row.title, 'Consultoria Y');
    assert.equal(row.source_google_event_id, 'abc');
  });

  it('placeholder a menos falha alto (o modo do incidente)', () => {
    assert.throws(() => db.prepare(UPSERT_CALENDAR_SQL).get(1, 'a', 'b', 'c', 'd', 'e', 0, null, 1, 'reader'));
  });
});
