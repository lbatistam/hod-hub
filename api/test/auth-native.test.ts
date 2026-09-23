// Fluxo OAuth nativo (Electron): loopback-validado + ticket de uso único.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hod-platform-native-')), 'test.sqlite');
process.env.DATABASE_PATH = tmpDb;
process.env.APP_ENCRYPTION_KEY = 'c'.repeat(64);
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';

const auth = await import('../src/auth.js');
const { db } = await import('../src/db.js');
const { hashToken } = await import('../src/security.js');
const { createApp } = await import('../src/app.js');

describe('isLoopbackReturnTo (sem open redirect)', () => {
  it('aceita só loopback http com porta', () => {
    assert.equal(auth.isLoopbackReturnTo('http://127.0.0.1:8899/native-callback'), true);
    assert.equal(auth.isLoopbackReturnTo('http://localhost:3000/cb?x=1'), true);
    assert.equal(auth.isLoopbackReturnTo('/'), false);
    assert.equal(auth.isLoopbackReturnTo(''), false);
    assert.equal(auth.isLoopbackReturnTo('https://127.0.0.1:8899/cb'), false);
    assert.equal(auth.isLoopbackReturnTo('http://127.0.0.1/cb'), false); // sem porta
    assert.equal(auth.isLoopbackReturnTo('http://evil.com:8899/cb'), false);
    assert.equal(auth.isLoopbackReturnTo('http://127.0.0.1.evil.com:8899/cb'), false);
    assert.equal(auth.isLoopbackReturnTo('http://user:pass@127.0.0.1:8899/cb'), false);
    assert.equal(auth.isLoopbackReturnTo('file:///etc/passwd'), false);
    assert.equal(auth.isLoopbackReturnTo('javascript:alert(1)'), false);
  });
});

describe('login_tickets (uso único, expiração)', () => {
  it('roundtrip + segunda tentativa falha', () => {
    const t = auth.createLoginTicket('sessao-secreta-123');
    assert.equal(auth.consumeLoginTicket(t), 'sessao-secreta-123');
    assert.equal(auth.consumeLoginTicket(t), null);
  });
  it('ticket desconhecido/vazio/expirado falha', () => {
    assert.equal(auth.consumeLoginTicket('inexistente'), null);
    assert.equal(auth.consumeLoginTicket(''), null);
    assert.equal(auth.consumeLoginTicket(null), null);
    const t = auth.createLoginTicket('x');
    db.prepare(`UPDATE login_tickets SET expires_at = ? WHERE ticket_hash = ?`).run(Date.now() - 1000, hashToken(t));
    assert.equal(auth.consumeLoginTicket(t), null);
  });
});

describe('POST /api/v1/auth/native-exchange', () => {
  let server: import('node:http').Server;
  let base = '';

  before(async () => {
    db.prepare(`INSERT INTO users (google_sub, email, name, role, status) VALUES (?,?,?,?,?)`).run(
      'native-test-sub', 'native@teste.com', 'Nativo', 'admin', 'approved'
    );
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });
  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('400 para ticket inválido/ausente', async () => {
    for (const body of [{ ticket: 'nope' }, {}, { ticket: '' }]) {
      const r = await fetch(`${base}/api/v1/auth/native-exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, 400);
      assert.equal(((await r.json()) as { error: string }).error, 'invalid_ticket');
    }
  });

  it('200 troca ticket por {token, user}', async () => {
    const user = db.prepare(`SELECT id FROM users WHERE google_sub = ?`).get('native-test-sub') as { id: number };
    const raw = `sessao-${Date.now()}`;
    db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)`).run(
      hashToken(raw), user.id, Date.now() + 600_000
    );
    const ticket = auth.createLoginTicket(raw);
    const r = await fetch(`${base}/api/v1/auth/native-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    assert.equal(r.status, 200);
    const body = (await r.json()) as { token: string; user: { email: string } };
    assert.equal(body.token, raw);
    assert.equal(body.user.email, 'native@teste.com');
    // uso único também via endpoint
    const r2 = await fetch(`${base}/api/v1/auth/native-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    assert.equal(r2.status, 400);
  });

  it('modo web cria cookie HttpOnly e não entrega token ao navegador', async () => {
    const user = db.prepare(`SELECT id FROM users WHERE google_sub = ?`).get('native-test-sub') as { id: number };
    const raw = `web-session-${Date.now()}`;
    db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)`).run(
      hashToken(raw), user.id, Date.now() + 600_000
    );
    const r = await fetch(`${base}/api/v1/auth/native-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: auth.createLoginTicket(raw), mode: 'web' }),
    });
    assert.equal(r.status, 200);
    assert.match(String(r.headers.get('set-cookie')), /HttpOnly/);
    const body = (await r.json()) as { token?: string; user: { email: string } };
    assert.equal(body.token, undefined);
    assert.equal(body.user.email, 'native@teste.com');
  });

  it('GET /auth/google rejeita return_to externo e aceita loopback', async () => {
    const bad = await fetch(`${base}/api/v1/auth/google?return_to=${encodeURIComponent('https://evil.com/cb')}`, { redirect: 'manual' });
    assert.equal(bad.status, 400);
    // sem segredos Google neste teste → 501 (prova que a validação de return_to passa antes do OAuth real)
    const good = await fetch(
      `${base}/api/v1/auth/google?return_to=${encodeURIComponent('http://127.0.0.1:8899/native-callback')}`,
      { redirect: 'manual' }
    );
    assert.equal(good.status, 501);
  });
});
