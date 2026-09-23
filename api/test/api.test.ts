// Contrato /api/v1 + guards. Usa banco temporário (não toca na V1 nem no banco real).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hod-platform-test-')), 'test.sqlite');
process.env.DATABASE_PATH = tmpDb;
process.env.APP_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';

const { createApp } = (await import('../src/app.js')) as typeof import('../src/app.js');
const { openapiDocument } = (await import('../src/openapi.js')) as typeof import('../src/openapi.js');

let server: import('node:http').Server;
let base = '';

before(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('contrato /api/v1', () => {
  it('health + openapi', async () => {
    const h = (await (await fetch(`${base}/api/v1/health`)).json()) as { ok: boolean; app: string };
    assert.equal(h.ok, true);
    assert.equal(h.app, 'HOD Platform');
    const spec = (await (await fetch(`${base}/api/v1/openapi.json`)).json()) as { paths: Record<string, unknown> };
    for (const p of ['/api/v1/calendar/events', '/api/v1/calendar/events/{id}/state', '/api/v1/settings', '/api/v1/daily-summary', '/api/v1/analytics', '/api/v1/stream', '/api/v1/history']) {
      assert.ok(spec.paths[p], `faltando no OpenAPI: ${p}`);
    }
    assert.ok((openapiDocument.paths as Record<string, unknown>)['/api/v1/calendar/availability']);
  });

  it('rotas legadas /api/* retornam 410 com destino', async () => {
    const r = await fetch(`${base}/api/calendar/events?startDate=2026-09-14&endDate=2026-09-14`);
    assert.equal(r.status, 410);
    const b = (await r.json()) as { to: string };
    assert.match(b.to, /\/api\/v1\/calendar/);
  });

  it('rotas protegidas exigem sessão (401 sem cookie)', async () => {
    for (const p of ['/api/v1/calendar/events?startDate=2026-09-14&endDate=2026-09-14', '/api/v1/settings', '/api/v1/team', '/api/v1/history', '/api/v1/daily-summary?date=2026-09-14', '/api/v1/analytics?startDate=2026-09-14&endDate=2026-09-14']) {
      const r = await fetch(`${base}${p}`);
      assert.equal(r.status, 401, p);
    }
  });

  it('criação futura e excluída permanece no dia local, com validação de datas', async () => {
    const { db } = await import('../src/db.js');
    const { hashToken } = await import('../src/security.js');
    const userId = Number(db.prepare(`INSERT INTO users (google_sub,email,name,role,status) VALUES ('summary-test','summary@example.invalid','Teste','admin','approved')`).run().lastInsertRowid);
    const token = 'isolated-summary-test';
    db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(hashToken(token), userId, Date.now() + 60000);
    const headers = { Authorization: `Bearer ${token}` };
    db.prepare(`INSERT INTO lead_creation_history (owner_user_id,source_google_event_id,lead_name,event_date,created_at_google,original_closer_name) VALUES (?,?,?,?,?,?)`).run(userId,'deleted-event','Maria Silva','2026-10-20','2026-09-16T01:30:00Z','Rodrigo');
    const response = await fetch(`${base}/api/v1/daily-summary?date=2026-09-15`, { headers });
    assert.equal(response.status, 200);
    const summary = await response.json() as { created: { total:number; new:number; events: { archived:boolean; eventDate:string }[] }; qualified: { total:number; events: { archived:boolean; eventDate:string; createdAt:string }[] }; rescheduledEvents: unknown[]; happened:number };
    assert.equal(summary.created.total, 1);
    assert.equal(summary.created.new, 1);
    assert.equal(summary.created.events[0].archived, true);
    assert.equal(summary.created.events[0].eventDate, '2026-10-20');
    assert.equal(summary.qualified.total, summary.created.new);
    assert.equal(summary.qualified.events.length, 1);
    assert.equal(summary.qualified.events[0].archived, true);
    assert.equal(summary.qualified.events[0].eventDate, '2026-10-20');
    assert.equal(summary.qualified.events[0].createdAt, '2026-09-16T01:30:00Z');
    assert.deepEqual(summary.rescheduledEvents, []);
    assert.equal(summary.happened, 0);
    assert.equal((await fetch(`${base}/api/v1/daily-summary?date=2026-02-30`, { headers })).status, 400);
  });

  it('validação de estado rejeita manualStatus inválido (com sessão fake? espera 401 antes de 400)', async () => {
    // Sem sessão o guard responde 401 — prova que ninguém acessa o SQLite sem passar pela API auth.
    const r = await fetch(`${base}/api/v1/calendar/events/1/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-HOD-App': 'shadcn' },
      body: JSON.stringify({ manualStatus: 'invalido' }),
    });
    assert.equal(r.status, 401);
  });
});
