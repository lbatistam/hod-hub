// Fase 2 — comparativo Web App V1 × HOD Platform (somente leitura).
// - Esperado: lido do banco da V1 em modo SOMENTE-LEITURA (backend V1 segue intacto, sem precisar estar no ar).
// - Obtido: via HTTP autenticado na Platform (sessão Bearer efêmera, criada e APAGADA neste script).
// - Regras: as mesmas ports fiéis já cobertas por test/rules.test.ts.
// Uso: npm run compare:v1 [-- --date YYYY-MM-DD]
import 'dotenv/config';
import Database from 'better-sqlite3';

const V1_PATH =
  process.env.V1_DATABASE_PATH || '/Users/leandro/Documents/HOD Workspace/apps/hod-hub/data/hod-hub.sqlite';
process.env.DATABASE_PATH =
  process.env.DATABASE_PATH || '/Users/leandro/Documents/HOD Workspace/services/hod-hub-api/data/hod-platform.sqlite';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] || null : null;
}
const DATE = arg('--date') || '2026-09-13';
const RANGE = { startDate: '2026-08-01', endDate: '2026-09-13' };

const v1 = new Database(V1_PATH, { readonly: true });

const { createApp } = await import('../app.js');
const { db } = await import('../db.js');
const { hashToken, randomToken } = await import('../security.js');
const {
  attendanceStatus,
  classifyCreatedLeads,
  effectiveConfirmation,
  eventFlow,
  isNoShow,
} = await import('../rules/consultation-rules.js');

const EVENTS_SELECT = `SELECT events.id,
  COALESCE(events.source_google_event_id,events.google_event_id) AS googleEventId,
  events.event_date AS eventDate, events.title, events.lead_name AS leadName, events.phone,
  events.meeting_url AS meetingUrl, events.starts_at AS startsAt, events.ends_at AS endsAt,
  events.attendee_declined AS attendeeDeclined, events.has_external_attendee AS hasExternalAttendee,
  events.self_response_status AS selfResponseStatus, events.meeting_kind AS meetingKind,
  events.created_at_google AS createdAt, calendars.closer_name AS closer,
  calendars.display_name AS calendarName, calendars.color, calendars.team_status AS teamStatus,
  CASE WHEN calendars.is_overbooking=1 AND (calendars.overbooking_from IS NULL OR events.event_date >= calendars.overbooking_from)
  THEN 1 ELSE 0 END AS isOverbooking,
  calendars.access_role AS calendarAccessRole,
  event_states.manual_status AS manualStatus, COALESCE(event_states.confirmation,'neutro') AS confirmation,
  event_states.notes
  FROM events JOIN calendars ON calendars.id=events.calendar_id
  LEFT JOIN event_states ON event_states.event_id=events.id`;

function v1Events(startDate: string, endDate: string, includeFormer: boolean): Record<string, unknown>[] {
  return v1
    .prepare(
      `${EVENTS_SELECT}
       WHERE events.event_date BETWEEN ? AND ? AND calendars.active=1
       AND (?=1 OR calendars.team_status IN ('active','support'))
       ORDER BY datetime(events.starts_at),calendars.closer_name,events.lead_name`
    )
    .all(startDate, endDate, includeFormer ? 1 : 0) as Record<string, unknown>[];
}

const like = (r: Record<string, unknown>) => ({
  isOverbooking: r.isOverbooking === 1,
  manualStatus: r.manualStatus as string | null,
  attendeeDeclined: r.attendeeDeclined === 1,
  hasExternalAttendee: r.hasExternalAttendee === 1,
  confirmation: r.confirmation as string,
  startsAt: r.startsAt as string,
  endsAt: r.endsAt as string,
});

function expectedDailySummary(date: string) {
  const rows = v1Events(date, date, false);
  const normal = rows.filter((r) => r.isOverbooking !== 1);
  const past = normal.filter((r) => new Date(r.endsAt as string).getTime() <= Date.now() || r.manualStatus);
  const concluded = normal.filter(
    (r) => eventFlow(like(r)) === 'concluidas' || r.manualStatus === 'compareceu'
  );
  const manual = normal.filter((r) =>
    ['no_show', 'cancelada', 'reagendar', 'reagendado'].includes(String(r.manualStatus))
  ).length;
  const suggested = normal.filter((r) => isNoShow(like(r))).length;
  const overs = rows.filter((r) => r.isOverbooking === 1);
  const createdToday = rows.filter((r) => String(r.createdAt || '').slice(0, 10) === date);
  const historical = v1
    .prepare(
      `SELECT lead_name AS leadName, phone, created_at_google AS createdAt FROM lead_creation_history
       ORDER BY datetime(created_at_google) LIMIT 10000`
    )
    .all() as { leadName: string; phone: string | null; createdAt: string }[];
  const { newLeads, repeated } = classifyCreatedLeads(
    createdToday.map((r) => ({
      leadName: String(r.leadName),
      phone: (r.phone as string | null) || null,
      createdAt: String(r.createdAt || `${date}T12:00:00-03:00`),
    })),
    historical
  );
  return {
    date,
    scheduled: normal.length,
    pastMeetings: past.length,
    pendingOvers: overs.length,
    happened: concluded.length,
    noShows: Math.max(manual, suggested),
    createdTotal: createdToday.length,
    createdNew: newLeads.length,
    createdRepeated: repeated.length,
  };
}

function expectedAnalytics(startDate: string, endDate: string) {
  const rows = v1Events(startDate, endDate, false).filter((r) => r.isOverbooking !== 1);
  return {
    scheduled: rows.length,
    confirmed: rows.filter((r) => effectiveConfirmation(like(r)) === 'confirmado').length,
    attended: rows.filter((r) => r.manualStatus === 'compareceu').length,
    noShows: rows.filter((r) => isNoShow(like(r))).length,
  };
}

// --- sessão Bearer efêmera (apagada ao final) ---
const me = db.prepare(`SELECT id, email, role, status FROM users ORDER BY id LIMIT 1`).get() as {
  id: number;
  email: string;
  role: string;
  status: string;
};
if (!me || me.status !== 'approved') {
  console.error('FAIL: usuário base da cópia não está approved:', me);
  process.exit(1);
}
const sessionsBefore = (db.prepare(`SELECT COUNT(*) AS c FROM sessions`).get() as { c: number }).c;
const bearer = randomToken();
db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)`).run(
  hashToken(bearer),
  me.id,
  Date.now() + 10 * 60 * 1000
);

const app = createApp();
const server = await new Promise<import('node:http').Server>((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const addr = server.address();
const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
const auth = { Authorization: `Bearer ${bearer}`, 'X-HOD-App': 'platform' };

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures += 1;
}

try {
  // 1. events (3 janelas, via HTTP autenticado)
  for (const [label, sd, ed, inc] of [
    ['semana', '2026-09-07', '2026-09-13', false],
    ['mes', RANGE.startDate, RANGE.endDate, false],
    ['historico', '2024-01-01', '2026-12-31', true],
  ] as const) {
    const got = (await (
      await fetch(`${base}/api/v1/calendar/events?startDate=${sd}&endDate=${ed}${inc ? '&includeFormer=1' : ''}`, { headers: auth })
    ).json()) as { events: unknown[] };
    const exp = v1Events(sd, ed, inc);
    check(
      `events ${label}`,
      got.events.length === exp.length &&
        JSON.stringify(got.events) === JSON.stringify(exp.map((r) => ({ ...r }))),
      `api=${got.events.length} v1=${exp.length}`
    );
  }

  // 2. daily-entry (linha manual do dia)
  const entryGot = (await (
    await fetch(`${base}/api/v1/calendar/daily-entry?date=${DATE}`, { headers: auth })
  ).json()) as Record<string, unknown>;
  const entryExp = v1
    .prepare(
      `SELECT summary_date AS date, contacted_count AS contactedCount, over_called_count AS overCalledCount,
       attended_count AS attendedCount, no_show_ps_count AS noShowPsCount, notes, updated_at AS updatedAt
       FROM daily_summaries WHERE user_id = ? AND summary_date = ?`
    )
    .get(me.id, DATE) as Record<string, unknown> | undefined;
  check(
    `daily-entry ${DATE}`,
    JSON.stringify(entryGot) ===
      JSON.stringify(
        entryExp || { date: DATE, contactedCount: 0, overCalledCount: null, attendedCount: null, noShowPsCount: null, notes: null, updatedAt: null }
      ),
    JSON.stringify(entryGot)
  );

  // 3. daily-summary (5 números + criados)
  const sumGot = (await (
    await fetch(`${base}/api/v1/daily-summary?date=${DATE}`, { headers: auth })
  ).json()) as Record<string, number>;
  const sumExp = expectedDailySummary(DATE);
  const sumFields = ['scheduled', 'pastMeetings', 'pendingOvers', 'happened', 'noShows'] as const;
  const sumOk = sumFields.every((f) => sumGot[f] === sumExp[f]);
  const createdOk =
    (sumGot.created as unknown as { total: number; new: number; repeated: number }).total === sumExp.createdTotal &&
    (sumGot.created as unknown as { total: number; new: number; repeated: number }).new === sumExp.createdNew &&
    (sumGot.created as unknown as { total: number; new: number; repeated: number }).repeated === sumExp.createdRepeated;
  check(`daily-summary ${DATE}`, sumOk && createdOk, `api=${JSON.stringify({ s: sumGot.scheduled, p: sumGot.pastMeetings, o: sumGot.pendingOvers, h: sumGot.happened, n: sumGot.noShows, c: sumGot.created })}`);

  // 4. analytics (totais do período)
  const anaGot = (await (
    await fetch(`${base}/api/v1/analytics?startDate=${RANGE.startDate}&endDate=${RANGE.endDate}`, { headers: auth })
  ).json()) as { total: Record<string, number> };
  const anaExp = expectedAnalytics(RANGE.startDate, RANGE.endDate);
  check(
    `analytics ${RANGE.startDate}..${RANGE.endDate}`,
    anaGot.total.scheduled === anaExp.scheduled &&
      anaGot.total.confirmed === anaExp.confirmed &&
      anaGot.total.attended === anaExp.attended &&
      anaGot.total.noShows === anaExp.noShows,
    `api=${JSON.stringify(anaGot.total)} v1=${JSON.stringify(anaExp)}`
  );

  // 5. history (auditoria do dia) — conta linhas + mesmos eventos
  const hisGot = (await (
    await fetch(`${base}/api/v1/history?date=${DATE}&limit=500`, { headers: auth })
  ).json()) as { records: { eventId: number | null; appSource: string }[] };
  const hisExp = v1
    .prepare(`SELECT event_id AS eventId FROM event_state_history WHERE event_date = ? ORDER BY datetime(changed_at) DESC LIMIT 500`)
    .all(DATE) as { eventId: number | null }[];
  // eventId pode ser null: semântica V1 (ON DELETE SET NULL — evento espelhado para fora pelo sync,
  // histórico preservado). appSource 'platform' = default de backfill das linhas pré-Platform.
  check(
    `history ${DATE}`,
    hisGot.records.length === hisExp.length &&
      hisGot.records.every((r, i) => r && (r.eventId === hisExp[i].eventId) && typeof r.appSource === 'string'),
    `api=${hisGot.records.length} v1=${hisExp.length}`
  );

  // 6. team + calendars (contagens)
  const teamGot = (await (await fetch(`${base}/api/v1/team`, { headers: auth })).json()) as {
    configured: unknown[];
    calendars: unknown[];
    users: unknown[];
  };
  const calExp = (v1.prepare(`SELECT COUNT(*) AS c FROM calendars`).get() as { c: number }).c;
  const usersExp = (v1.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number }).c;
  check('team', teamGot.configured.length === 14 && teamGot.calendars.length === calExp && teamGot.users.length === usersExp,
    `closers=${teamGot.configured.length} calendars=${teamGot.calendars.length}/${calExp} users=${teamGot.users.length}/${usersExp}`);

  // 7. eventos com regras de presença (amostra: isNoShow via API == V1 em 200 linhas)
  const sample = v1Events('2026-08-01', '2026-08-31', false).slice(0, 200);
  void attendanceStatus;
  void eventFlow;
  const flagsV1 = sample.map((r) => (isNoShow(like(r)) ? 1 : 0).toString()).join('');
  const apiRows = (await (
    await fetch(`${base}/api/v1/calendar/events?startDate=2026-08-01&endDate=2026-08-31`, { headers: auth })
  ).json()) as { events: Record<string, unknown>[] };
  const flagsApi = apiRows.events.slice(0, 200).map((r) => (isNoShow(like(r)) ? 1 : 0).toString()).join('');
  check('regras presença (200 linhas)', flagsV1 === flagsApi);
} finally {
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(bearer));
  server.close();
  v1.close();
}

const sessionsAfter = (db.prepare(`SELECT COUNT(*) AS c FROM sessions`).get() as { c: number }).c;
check('sessão efêmera removida', sessionsAfter === sessionsBefore, `${sessionsBefore} → ${sessionsAfter}`);

console.log(failures === 0 ? 'COMPARE_ALL_PASS' : `COMPARE_FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
