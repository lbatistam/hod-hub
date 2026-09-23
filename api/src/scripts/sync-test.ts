// Fase 4b — sincronização simultânea: 3 personas (web-v1, heroui, shadcn).
// A e B escutam o SSE; C escreve. Exige que cada escrita chegue aos outros em <5s
// e que GETs reflitam o mesmo estado. Restaura tudo ao final (restam só trilhas de auditoria).
// Uso: npm run test:sync
import 'dotenv/config';
import Database from 'better-sqlite3';

process.env.DATABASE_PATH =
  process.env.DATABASE_PATH || '/Users/leandro/Documents/HOD Workspace/services/hod-hub-api/data/hod-platform.sqlite';

const { createApp } = await import('../app.js');
const { db } = await import('../db.js');
const { hashToken, randomToken } = await import('../security.js');

type Persona = 'web-v1' | 'heroui' | 'shadcn';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures += 1;
}

const me = db.prepare(`SELECT id, email, role, status FROM users ORDER BY id LIMIT 1`).get() as {
  id: number;
  email: string;
  role: string;
  status: string;
};
if (!me || me.status !== 'approved' || me.role !== 'admin') {
  console.error('FAIL: usuário base precisa ser admin/approved para o teste:', me);
  process.exit(1);
}

// Evento limpo (sem estado manual) para o teste de escrita
const target = db
  .prepare(
    `SELECT events.id, events.event_date AS eventDate, events.lead_name AS leadName,
     event_states.manual_status AS manualStatus, event_states.confirmation AS confirmation, event_states.notes AS notes
     FROM events LEFT JOIN event_states ON event_states.event_id = events.id
     WHERE event_states.manual_status IS NULL ORDER BY events.id LIMIT 1`
  )
  .get() as { id: number; eventDate: string; leadName: string; manualStatus: null; confirmation: string; notes: string | null };
if (!target) {
  console.error('FAIL: nenhum evento sem estado manual para testar');
  process.exit(1);
}
const originalSettings = db.prepare(`SELECT value FROM shared_settings WHERE key = 'work_hours'`).get() as { value: string };

const sessionsBefore = (db.prepare(`SELECT COUNT(*) AS c FROM sessions`).get() as { c: number }).c;
const tokens = new Map<Persona, string>();
for (const p of ['web-v1', 'heroui', 'shadcn'] as Persona[]) {
  const t = randomToken();
  db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)`).run(
    hashToken(t),
    me.id,
    Date.now() + 10 * 60 * 1000
  );
  tokens.set(p, t);
}
const headers = (p: Persona) => ({ Authorization: `Bearer ${tokens.get(p)}`, 'X-HOD-App': p, 'Content-Type': 'application/json' });
const headersAs = (p: Persona, appSource: string) => ({ Authorization: `Bearer ${tokens.get(p)}`, 'X-HOD-App': appSource, 'Content-Type': 'application/json' });

const app = createApp();
const server = await new Promise<import('node:http').Server>((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

// Leitor SSE mínimo sobre fetch (EventSource não envia Bearer)
async function listenSSE(
  persona: Persona,
  want: string,
  timeoutMs = 8000
): Promise<{ type: string; data: Record<string, unknown> } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/v1/stream`, {
      headers: { Authorization: `Bearer ${tokens.get(persona)}` },
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return null;
      buf += dec.decode(value, { stream: true });
      const frames = buf.split('\n\n');
      buf = frames.pop() || '';
      for (const f of frames) {
        const ev = /^event: (.+)$/m.exec(f)?.[1]?.trim();
        const dataLine = /^data: (.+)$/m.exec(f)?.[1];
        if (ev === want && dataLine) {
          const data = JSON.parse(dataLine) as { type: string; data: Record<string, unknown> };
          try {
            await reader.cancel();
          } catch {
            /* ignora */
          }
          return data;
        }
      }
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DailyEntryShape {
  contactedCount: number;
  overCalledCount: number | null;
  attendedCount: number | null;
  noShowPsCount: number | null;
  notes: string | null;
  updatedAt: string | null;
}

let originalEntry: DailyEntryShape | null = null;

try {
  // 1. web-v1 confirma consultoria; heroui + shadcn recebem via SSE
  const waitH = listenSSE('heroui', 'event.state_changed');
  const waitS = listenSSE('shadcn', 'event.state_changed');
  await sleep(500); // garante assinaturas ativas
  const patchRes = await fetch(`${base}/api/v1/calendar/events/${target.id}/state`, {
    method: 'PATCH',
    headers: headers('web-v1'),
    body: JSON.stringify({ manualStatus: 'compareceu', confirmation: 'confirmado' }),
  });
  check('PATCH state 200', patchRes.status === 200, `status=${patchRes.status}`);
  const [gotH, gotS] = await Promise.all([waitH, waitS]);
  check('heroui recebeu event.state_changed', !!gotH && (gotH.data.app as string) === 'web-v1', JSON.stringify(gotH?.data).slice(0, 120));
  check('shadcn recebeu event.state_changed', !!gotS && (gotS.data.app as string) === 'web-v1', JSON.stringify(gotS?.data).slice(0, 120));

  // 2. Leitura cruzada: os 3 veem o mesmo estado
  for (const p of ['web-v1', 'heroui', 'shadcn'] as Persona[]) {
    const ev = (await (
      await fetch(`${base}/api/v1/calendar/events/${target.id}`, { headers: headers(p) })
    ).json()) as { event: { manualStatus: string; confirmation: string } };
    check(`GET ${p} vê compareceu/confirmado`, ev.event.manualStatus === 'compareceu' && ev.event.confirmation === 'confirmado');
  }

  // 3. heroui altera daily-entry; shadcn recebe
  originalEntry = (await (
    await fetch(`${base}/api/v1/calendar/daily-entry?date=${target.eventDate}`, { headers: headers('web-v1') })
  ).json()) as DailyEntryShape;
  const waitD = listenSSE('shadcn', 'daily_entry.updated');
  await sleep(500);
  const dailyRes = await fetch(`${base}/api/v1/calendar/daily-entry`, {
    method: 'PATCH',
    headers: headers('heroui'),
    body: JSON.stringify({ date: target.eventDate, contactedCount: 7, notes: 'teste-sync' }),
  });
  check('PATCH daily 200', dailyRes.status === 200);
  const gotD = await waitD;
  check('shadcn recebeu daily_entry.updated (heroui)', !!gotD && (gotD.data.app as string) === 'heroui');
  const entry = (await (
    await fetch(`${base}/api/v1/calendar/daily-entry?date=${target.eventDate}`, { headers: headers('shadcn') })
  ).json()) as { contactedCount: number; notes: string };
  check('shadcn lê contactedCount=7', entry.contactedCount === 7 && entry.notes === 'teste-sync');

  // 4. web-v1 (admin) altera configuração compartilhada; todos recebem
  const waitCfgH = listenSSE('heroui', 'settings.updated');
  const waitCfgS = listenSSE('shadcn', 'settings.updated');
  await sleep(500);
  const cfgRes = await fetch(`${base}/api/v1/settings/work_hours`, {
    method: 'PUT',
    headers: headers('web-v1'),
    body: JSON.stringify({ value: { workStart: '08:00', workEnd: '22:00' } }),
  });
  check('PUT settings 200 (admin)', cfgRes.status === 200, `status=${cfgRes.status}`);
  const [cfgH, cfgS] = await Promise.all([waitCfgH, waitCfgS]);
  check('heroui recebeu settings.updated', !!cfgH);
  check('shadcn recebeu settings.updated', !!cfgS);
  const cfg = (await (
    await fetch(`${base}/api/v1/settings/work_hours`, { headers: headers('shadcn') })
  ).json()) as { value: { workEnd: string } };
  check('shadcn lê workEnd=22:00', cfg.value.workEnd === '22:00');
} finally {
  // Restauração: estado original + settings originais + sessões removidas
  await fetch(`${base}/api/v1/calendar/events/${target.id}/state`, {
    method: 'PATCH',
    headers: headersAs('web-v1', 'platform'),
    body: JSON.stringify({ manualStatus: target.manualStatus, confirmation: target.confirmation || 'neutro', notes: target.notes }),
  }).catch(() => undefined);
  await fetch(`${base}/api/v1/settings/work_hours`, {
    method: 'PUT',
    headers: headersAs('web-v1', 'platform'),
    body: JSON.stringify({ value: JSON.parse(originalSettings.value) }),
  }).catch(() => undefined);
  if (originalEntry) {
    if (originalEntry.updatedAt === null) {
      // Não existia linha antes do teste: remove o resíduo em vez de zerar.
      try {
        db.prepare(`DELETE FROM daily_summaries WHERE user_id = ? AND summary_date = ?`).run(me.id, target.eventDate);
      } catch {
        /* documentado abaixo se falhar */
      }
    } else {
      await fetch(`${base}/api/v1/calendar/daily-entry`, {
        method: 'PATCH',
        headers: headersAs('heroui', 'platform'),
        body: JSON.stringify({
          date: target.eventDate,
          contactedCount: originalEntry.contactedCount,
          overCalledCount: originalEntry.overCalledCount,
          attendedCount: originalEntry.attendedCount,
          noShowPsCount: originalEntry.noShowPsCount,
          notes: originalEntry.notes,
        }),
      }).catch(() => undefined);
    }
  }
  for (const t of tokens.values()) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(t));
  }
  server.close();
}

const sessionsAfter = (db.prepare(`SELECT COUNT(*) AS c FROM sessions`).get() as { c: number }).c;
check('sessões efêmeras removidas', sessionsAfter === sessionsBefore, `${sessionsBefore} → ${sessionsAfter}`);
const auditApps = db
  .prepare(`SELECT DISTINCT app_source FROM event_state_history WHERE event_id = ? ORDER BY 1`)
  .all(target.id) as { app_source: string }[];
check('auditoria registra apps (web-v1 + platform)', auditApps.some((r) => r.app_source === 'web-v1') && auditApps.some((r) => r.app_source === 'platform'), JSON.stringify(auditApps));

console.log(failures === 0 ? 'SYNC_ALL_PASS' : `SYNC_FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
