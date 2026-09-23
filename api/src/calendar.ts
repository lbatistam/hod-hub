// Fonte oficial: V1 server/calendar.js (port para TS + /api/v1 + app_source + SSE).
// Contrato preservado: mesmos paths relativos, mesmos payloads/respostas da V1.
// Novos: GET /events/:id (detail+history), GET /events/:id/history.
import express from 'express';
import { config, parseAppSource } from './config.js';
import {
  attendanceFromGoogle,
  classifySdrMeeting,
  extractConsultoriaLead,
} from './rules/calendar-rules.js';
import { closerForCalendar, configuredCloserEmails, historicalClosers } from './rules/closers.js';
import { db } from './db.js';
import { requireUser } from './auth.js';
import { decrypt, encrypt } from './security.js';
import { archiveDay } from './archive.js';
import { recordServerError, requestId } from './error-log.js';
import {
  addOverbookingCounts,
  buildAvailability,
  buildOverbookingSchedule,
} from './rules/availability-rules.js';
import { broadcast } from './stream.js';
import { operationalPresentation } from './rules/consultation-rules.js';

function presentEvent(row: Record<string, unknown>) {
  return { ...row, presentation: operationalPresentation({ ...row, isOverbooking: Boolean(row.isOverbooking) }) };
}

export const calendarRouter = express.Router();
calendarRouter.use(requireUser);

type AuthedRequest = express.Request & { user: { id: number; email: string } };

const activeSyncUsers = new Set<number>();
const recentSyncRanges = new Map<number, { startDate: string; endDate: string; syncedAt: number }[]>();
const SYNC_FRESHNESS_MS = 55_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';
const GOOGLE_TIMEOUT_MS = 20_000;

function calendarError(
  message: string,
  opts: { status?: number; code?: string; publicMessage?: string } = {}
) {
  const error = new Error(message) as Error & { status?: number; code?: string; publicMessage?: string };
  error.status = opts.status ?? 502;
  error.code = opts.code ?? 'google_calendar_error';
  error.publicMessage = opts.publicMessage ?? message;
  return error;
}

async function googleFetch(url: string | URL, options: RequestInit = {}) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
  } catch (error) {
    if ((error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError') {
      throw calendarError('A consulta ao Google Agenda excedeu o tempo limite.', {
        status: 504,
        code: 'google_calendar_timeout',
        publicMessage: 'O Google Agenda demorou para responder. Seus dados foram preservados; tente atualizar novamente.',
      });
    }
    throw calendarError(`Falha de conexão com o Google Agenda: ${(error as Error).message}`, {
      status: 503,
      code: 'google_calendar_unavailable',
      publicMessage: 'Não foi possível alcançar o Google Agenda agora. Verifique a internet e tente novamente.',
    });
  }
}

function parseLead(title: string): string {
  const lead = extractConsultoriaLead(title);
  if (lead !== null) return lead || 'Lead não identificado';
  return (
    title
      .replace(/\bHOD\s*-?/gi, '')
      .replace(/^(?:follow(?:-?up)?|nova\s+reuni[aã]o|reagendamento|retorno|diagn[oó]stico|treinamento)\s*[-–—:|]?\s*/i, '')
      .replace(/^[\s|:\-–—]+|[\s|:\-–—]+$/g, '')
      .trim() || 'Lead não identificado'
  );
}

function parsePhone(description = ''): string | null {
  const match = description.match(/(?:phone\s*:?\s*-?\s*)?(\+?55\s*)?(\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4})/i);
  return match ? match[0].replace(/^phone\s*:?\s*-?\s*/i, '').trim() : null;
}

function normalizeLeadName(value = ''): string {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeLeadPhone(value = ''): string {
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-11) : '';
}

function validDate(value: string): boolean {
  return DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

function addDays(value: string, days: number): string {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function rangeFrom(source: Record<string, unknown>) {
  const startDate = String(source.startDate || source.date || new Date().toISOString().slice(0, 10));
  const endDate = String(source.endDate || startDate);
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) {
    const error = new Error('Período inválido.') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  const days = Math.round((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86_400_000) + 1;
  if (days > 1100) {
    const error = new Error('O período máximo por sincronização é de 1100 dias.') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return { startDate, endDate, days };
}

function dateInSaoPaulo(value: string | number | Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const pick = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

async function refreshAccessToken(userId: number, tokenRow: Record<string, unknown>): Promise<string> {
  if (Number(tokenRow.expires_at) > Date.now() + 60_000) return decrypt(String(tokenRow.access_token)) || '';
  if (!tokenRow.refresh_token) {
    throw calendarError('A conta precisa autorizar o Google Agenda novamente.', {
      status: 409,
      code: 'calendar_reconnect_required',
    });
  }
  const response = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: decrypt(String(tokenRow.refresh_token)) || '',
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    throw calendarError(`Não foi possível renovar a autorização do Google (${response.status}).`, {
      status: response.status === 400 || response.status === 401 ? 409 : 502,
      code: 'calendar_reconnect_required',
      publicMessage: 'O Google Agenda precisa ser conectado novamente nas Configurações.',
    });
  }
  const tokens = (await response.json()) as { access_token: string; expires_in?: number };
  const expiresAt = Date.now() + Number(tokens.expires_in || 3600) * 1000;
  db.prepare('UPDATE oauth_tokens SET access_token=?, expires_at=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(
    encrypt(tokens.access_token),
    expiresAt,
    userId
  );
  return tokens.access_token;
}

async function googleGet(path: string, accessToken: string, params: Record<string, unknown> = {}) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const response = await googleFetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    throw calendarError(`Google Agenda respondeu com erro ${response.status}.`, {
      status: response.status === 401 || response.status === 403 ? 409 : 502,
      code: response.status === 401 || response.status === 403 ? 'calendar_reconnect_required' : 'google_calendar_error',
      publicMessage:
        response.status === 401 || response.status === 403
          ? 'O Google Agenda precisa ser conectado novamente nas Configurações.'
          : 'O Google Agenda recusou temporariamente a atualização. Tente novamente em instantes.',
    });
  }
  return response.json() as Promise<Record<string, unknown>>;
}

async function googleGetAll(path: string, accessToken: string, params: Record<string, unknown> = {}) {
  const items: Record<string, unknown>[] = [];
  let pageToken: string | null = null;
  do {
    const page = await googleGet(path, accessToken, { ...(params as object), ...(pageToken ? { pageToken } : {}) });
    items.push(...((page.items as Record<string, unknown>[]) || []));
    pageToken = (page.nextPageToken as string) || null;
  } while (pageToken && items.length < 10_000);
  return items;
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()!;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function googlePost(path: string, accessToken: string, body: unknown) {
  const response = await googleFetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw calendarError(`Google Agenda respondeu com erro ${response.status}.`, {
      status: response.status === 401 || response.status === 403 ? 409 : 502,
      code: response.status === 401 || response.status === 403 ? 'calendar_reconnect_required' : 'google_calendar_error',
      publicMessage:
        response.status === 401 || response.status === 403
          ? 'O Google Agenda precisa ser conectado novamente nas Configurações.'
          : 'O Google Agenda recusou temporariamente a atualização. Tente novamente em instantes.',
    });
  }
  return response.json() as Promise<Record<string, unknown>>;
}

// SQL do sync exportado para teste de regressão (contagem de placeholders × valores).
// Qualquer divergência aqui derruba o sync com 500 — test/sync-upserts.test.ts trava isso.
export const UPSERT_CALENDAR_SQL = `INSERT INTO calendars
  (owner_user_id,google_calendar_id,display_name,closer_name,color,closer_role,is_overbooking,overbooking_from,active,access_role,team_status)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(google_calendar_id) DO UPDATE SET
    owner_user_id=excluded.owner_user_id,
    display_name=excluded.display_name,
    closer_name=excluded.closer_name,
    color=excluded.color,
    closer_role=excluded.closer_role,
    is_overbooking=excluded.is_overbooking,
    overbooking_from=excluded.overbooking_from,
    active=excluded.active,
    access_role=excluded.access_role,
    team_status=excluded.team_status,
    updated_at=CURRENT_TIMESTAMP
  RETURNING id`;

export const UPSERT_EVENT_SQL = `INSERT INTO events
  (google_event_id,source_google_event_id,calendar_id,event_date,title,lead_name,phone,meeting_url,starts_at,ends_at,attendee_declined,has_external_attendee,self_response_status,organizer_email,meeting_kind,created_at_google,raw_json)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(google_event_id,event_date) DO UPDATE SET
    source_google_event_id=excluded.source_google_event_id,
    calendar_id=excluded.calendar_id,
    title=excluded.title,
    lead_name=excluded.lead_name,
    phone=excluded.phone,
    meeting_url=excluded.meeting_url,
    starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,
    attendee_declined=excluded.attendee_declined,
    has_external_attendee=excluded.has_external_attendee,
    self_response_status=excluded.self_response_status,
    organizer_email=excluded.organizer_email,
    meeting_kind=excluded.meeting_kind,
    created_at_google=excluded.created_at_google,
    raw_json=excluded.raw_json,
    synced_at=CURRENT_TIMESTAMP`;

calendarRouter.get('/status', async (req, res) => {
  const user = (req as AuthedRequest).user;
  const tokenRow = db.prepare('SELECT * FROM oauth_tokens WHERE user_id=?').get(user.id) as Record<string, unknown> | undefined;
  const rawLastSync =
    (db.prepare(`SELECT MAX(events.synced_at) AS lastSync FROM events JOIN calendars ON calendars.id=events.calendar_id WHERE calendars.owner_user_id=?`).get(user.id) as { lastSync?: string } | undefined)?.lastSync || null;
  const lastSync = rawLastSync ? new Date(rawLastSync.includes('T') ? rawLastSync : rawLastSync.replace(' ', 'T') + 'Z').toISOString() : null;
  if (!tokenRow) return res.json({ authorized: false, reachable: false, lastSync, needsReconnect: true });
  try {
    const accessToken = await refreshAccessToken(user.id, tokenRow);
    await googleGet('users/me/calendarList', accessToken, { maxResults: 1 });
    return res.json({ authorized: true, reachable: true, lastSync, needsReconnect: false });
  } catch (error) {
    const needsReconnect = /autoriza|renovar|401|403/i.test((error as Error).message);
    return res.json({
      authorized: true,
      reachable: false,
      lastSync,
      needsReconnect,
      message: needsReconnect ? 'O Google Agenda precisa ser conectado novamente.' : 'O Google Agenda está temporariamente indisponível.',
    });
  }
});

calendarRouter.post('/sync', async (req, res, next) => {
  const user = (req as AuthedRequest).user;
  const userId = user.id;
  const force = (req.body as Record<string, unknown>)?.force === true;
  let ownsSync = false;
  try {
    const { startDate, endDate } = rangeFrom((req.body as Record<string, unknown>) || {});
    const recentRanges = recentSyncRanges.get(userId) || [];
    const covered = recentRanges.some(
      (r) => r.startDate <= startDate && r.endDate >= endDate && Date.now() - r.syncedAt < SYNC_FRESHNESS_MS
    );
    if (covered && !force) {
      const events = db.prepare(`SELECT COUNT(*) AS c FROM events JOIN calendars ON calendars.id=events.calendar_id WHERE calendars.owner_user_id=? AND events.event_date BETWEEN ? AND ?`).get(userId, startDate, endDate) as { c: number };
      res.json({ ok: true, cached: true, startDate, endDate, events: events.c, syncedAt: new Date().toISOString() });
      return;
    }
    if (activeSyncUsers.has(userId)) {
      res.json({ ok: true, background: true, startDate, endDate, syncedAt: new Date().toISOString() });
      return;
    }
    activeSyncUsers.add(userId);
    ownsSync = true;

    const tokenRow = db.prepare('SELECT * FROM oauth_tokens WHERE user_id=?').get(userId) as Record<string, unknown> | undefined;
    if (!tokenRow) {
      res.status(409).json({ error: 'calendar_not_connected' });
      return;
    }
    const accessToken = await refreshAccessToken(userId, tokenRow);
    const list = (await googleGet('users/me/calendarList', accessToken, { maxResults: 250 })) as { items?: Record<string, unknown>[] };
    // Port fiel do núcleo de sync da V1 (server/calendar.js): mesma ordem de SQL,
    // mesmos fallbacks (título 'Consultoria', all-day, hangout/conferenceData, organizer||creator),
    // sdrEmail = usuário logado, espelho DELETE por agenda DENTRO do try (falha de rede
    // nunca apaga o range) e ex-integrantes via agenda primary.
    const timeMin = `${startDate}T00:00:00-03:00`;
    const timeMax = `${addDays(endDate, 1)}T00:00:00-03:00`;
    const upsertCalendar = db.prepare(UPSERT_CALENDAR_SQL);
    const upsertEvent = db.prepare(UPSERT_EVENT_SQL);
    const rememberLeadCreation = db.prepare(
      `INSERT INTO lead_creation_history
       (owner_user_id,source_google_event_id,lead_name,phone,event_date,created_at_google,original_closer_name)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(owner_user_id,source_google_event_id) DO UPDATE SET
         lead_name=excluded.lead_name,
         phone=COALESCE(excluded.phone,lead_creation_history.phone),
         event_date=excluded.event_date,
         original_closer_name=COALESCE(lead_creation_history.original_closer_name,excluded.original_closer_name)`
    );
    db.prepare(`UPDATE calendars SET active=0 WHERE owner_user_id=?`).run(userId);
    let synced = 0;
    const failures: { calendar: string; message: string }[] = [];
    const calendarItems = (list.items || []) as Record<string, unknown>[];
    await mapWithConcurrency(calendarItems, 4, async (calendar) => {
      const closer = closerForCalendar({
        id: String(calendar.id || ''),
        summary: String(calendar.summary || ''),
        backgroundColor: String(calendar.backgroundColor || '#0000FF'),
      });
      const isTrackedCloser = configuredCloserEmails.includes(String(calendar.id || '').toLowerCase());
      const local = upsertCalendar.get(
        userId,
        String(calendar.id || ''),
        String(calendar.summary || calendar.id || ''),
        closer.name,
        closer.color,
        closer.isOverbooking ? 'overbooking' : 'fixed',
        closer.isOverbooking ? 1 : 0,
        closer.overbookingFrom,
        isTrackedCloser ? 1 : 0,
        String(calendar.accessRole || 'reader'),
        closer.teamStatus
      ) as { id: number };
      if (!isTrackedCloser) {
        db.prepare('DELETE FROM events WHERE calendar_id=? AND event_date BETWEEN ? AND ?').run(local.id, startDate, endDate);
        return;
      }
      try {
        const events = await googleGetAll(`calendars/${encodeURIComponent(String(calendar.id))}/events`, accessToken, {
          timeMin,
          timeMax,
          singleEvents: true,
          showDeleted: false,
          orderBy: 'startTime',
          maxResults: 2500,
        });
        const seenEventIds: string[] = [];
        for (const event of events) {
          const ev = event as Record<string, unknown>;
          const classification = classifySdrMeeting(
            ev as unknown as Parameters<typeof classifySdrMeeting>[0],
            { sdrEmail: user.email, closerEmails: configuredCloserEmails }
          );
          if (ev.status === 'cancelled' || !classification.included) continue;
          const evStart = ev.start as Record<string, string> | undefined;
          const evEnd = ev.end as Record<string, string> | undefined;
          const startsAt = evStart?.dateTime || (evStart?.date ? `${evStart.date}T00:00:00-03:00` : null);
          const endsAt = evEnd?.dateTime || (evEnd?.date ? `${evEnd.date}T23:59:59-03:00` : null);
          if (!startsAt || !endsAt) continue;
          const eventDate = dateInSaoPaulo(startsAt);
          if (eventDate < startDate || eventDate > endDate) continue;
          const entryPoints = (ev.conferenceData as { entryPoints?: { entryPointType?: string; uri?: string }[] } | undefined)?.entryPoints;
          const meetingUrl = (ev.hangoutLink as string) || entryPoints?.find((item) => item.entryPointType === 'video')?.uri || null;
          const attendance = attendanceFromGoogle(
            ev as unknown as Parameters<typeof attendanceFromGoogle>[0],
            String(calendar.id || '')
          );
          const eventKey = `${local.id}:${String(ev.id || '')}`;
          upsertEvent.run(
            eventKey,
            String(ev.id || ''),
            local.id,
            eventDate,
            String(ev.summary || 'Consultoria'),
            parseLead(String(ev.summary || '')),
            parsePhone(String(ev.description || '')),
            meetingUrl,
            startsAt,
            endsAt,
            attendance.attendeeDeclined ? 1 : 0,
            attendance.hasExternalAttendee ? 1 : 0,
            attendance.selfResponseStatus,
            ((ev.organizer as Record<string, string> | undefined)?.email ||
              (ev.creator as Record<string, string> | undefined)?.email ||
              null) as string | null,
            classification.kind,
            (ev.created as string) || null,
            JSON.stringify(ev)
          );
          if (ev.created) {
            rememberLeadCreation.run(
              userId,
              String(ev.id || ''),
              parseLead(String(ev.summary || '')),
              parsePhone(String(ev.description || '')),
              eventDate,
              String(ev.created),
              closer.name
            );
          }
          seenEventIds.push(eventKey);
          synced += 1;
        }
        if (seenEventIds.length) {
          const placeholders = seenEventIds.map(() => '?').join(',');
          db.prepare(
            `DELETE FROM events WHERE calendar_id=? AND event_date BETWEEN ? AND ? AND google_event_id NOT IN (${placeholders})`
          ).run(local.id, startDate, endDate, ...seenEventIds);
        } else {
          db.prepare('DELETE FROM events WHERE calendar_id=? AND event_date BETWEEN ? AND ?').run(local.id, startDate, endDate);
        }
      } catch (error) {
        failures.push({ calendar: closer.name, message: (error as Error).message });
      }
    });

    // Ex-integrantes sem agenda direta: histórico via agenda primary (fiel à V1).
    const directCalendarIds = new Set(calendarItems.map((calendar) => String(calendar.id || '').toLowerCase()));
    const historicalWithoutDirectCalendar = historicalClosers.filter((closer) => !directCalendarIds.has(closer.calendar));
    const primaryCalendar = calendarItems.find((calendar) => calendar.primary) as Record<string, unknown> | undefined;
    if (primaryCalendar && historicalWithoutDirectCalendar.length) {
      try {
        const primaryEvents = await googleGetAll(
          `calendars/${encodeURIComponent(String(primaryCalendar.id))}/events`,
          accessToken,
          { timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 2500 }
        );
        const localFormerCalendars = new Map<string, number>();
        const seenByFormer = new Map<string, string[]>();
        for (const historicalCloser of historicalWithoutDirectCalendar) {
          const local = upsertCalendar.get(
            userId,
            `historical:${historicalCloser.calendar}`,
            `${historicalCloser.name} · histórico`,
            historicalCloser.name,
            historicalCloser.color,
            historicalCloser.role,
            0,
            null,
            1,
            'reader',
            historicalCloser.teamStatus
          ) as { id: number };
          localFormerCalendars.set(historicalCloser.calendar, local.id);
          seenByFormer.set(historicalCloser.calendar, []);
        }
        for (const event of primaryEvents) {
          const ev = event as Record<string, unknown>;
          if (ev.status === 'cancelled') continue;
          const attendeeEmails = new Set(
            ((ev.attendees as { email?: string }[]) || []).map((attendee) => String(attendee.email || '').toLowerCase())
          );
          const organizerEmail = String(
            (ev.organizer as Record<string, string> | undefined)?.email ||
              (ev.creator as Record<string, string> | undefined)?.email ||
              ''
          ).toLowerCase();
          const matchedFormer = historicalWithoutDirectCalendar.filter(
            (former) => organizerEmail === former.calendar || attendeeEmails.has(former.calendar)
          );
          if (!matchedFormer.length) continue;
          const classification = classifySdrMeeting(
            ev as unknown as Parameters<typeof classifySdrMeeting>[0],
            { sdrEmail: user.email, closerEmails: configuredCloserEmails }
          );
          if (!classification.included) continue;
          const evStart = ev.start as Record<string, string> | undefined;
          const evEnd = ev.end as Record<string, string> | undefined;
          const startsAt = evStart?.dateTime || (evStart?.date ? `${evStart.date}T00:00:00-03:00` : null);
          const endsAt = evEnd?.dateTime || (evEnd?.date ? `${evEnd.date}T23:59:59-03:00` : null);
          if (!startsAt || !endsAt) continue;
          const eventDate = dateInSaoPaulo(startsAt);
          if (eventDate < startDate || eventDate > endDate) continue;
          const entryPoints = (ev.conferenceData as { entryPoints?: { entryPointType?: string; uri?: string }[] } | undefined)?.entryPoints;
          const meetingUrl = (ev.hangoutLink as string) || entryPoints?.find((item) => item.entryPointType === 'video')?.uri || null;
          for (const former of matchedFormer) {
            const calendarId = localFormerCalendars.get(former.calendar) as number;
            const attendance = attendanceFromGoogle(
              ev as unknown as Parameters<typeof attendanceFromGoogle>[0],
              former.calendar
            );
            const eventKey = `${calendarId}:${String(ev.id || '')}`;
            upsertEvent.run(
              eventKey,
              String(ev.id || ''),
              calendarId,
              eventDate,
              String(ev.summary || 'Consultoria'),
              parseLead(String(ev.summary || '')),
              parsePhone(String(ev.description || '')),
              meetingUrl,
              startsAt,
              endsAt,
              attendance.attendeeDeclined ? 1 : 0,
              attendance.hasExternalAttendee ? 1 : 0,
              attendance.selfResponseStatus,
              ((ev.organizer as Record<string, string> | undefined)?.email ||
                (ev.creator as Record<string, string> | undefined)?.email ||
                null) as string | null,
              classification.kind,
              (ev.created as string) || null,
              JSON.stringify(ev)
            );
            if (ev.created) {
              rememberLeadCreation.run(
                userId,
                String(ev.id || ''),
                parseLead(String(ev.summary || '')),
                parsePhone(String(ev.description || '')),
                eventDate,
                String(ev.created),
                former.name
              );
            }
            seenByFormer.get(former.calendar)?.push(eventKey);
            synced += 1;
          }
        }
        for (const historicalCloser of historicalWithoutDirectCalendar) {
          const calendarId = localFormerCalendars.get(historicalCloser.calendar) as number;
          const seen = seenByFormer.get(historicalCloser.calendar) || [];
          if (seen.length) {
            const placeholders = seen.map(() => '?').join(',');
            db.prepare(
              `DELETE FROM events WHERE calendar_id=? AND event_date BETWEEN ? AND ? AND google_event_id NOT IN (${placeholders})`
            ).run(calendarId, startDate, endDate, ...seen);
          } else {
            db.prepare('DELETE FROM events WHERE calendar_id=? AND event_date BETWEEN ? AND ?').run(calendarId, startDate, endDate);
          }
        }
      } catch (error) {
        failures.push({ calendar: 'Histórico de ex-integrantes', message: (error as Error).message });
      }
    }

    // Memória de criação residual (Over transferido nunca vira lead novo).
    db.prepare(
      `INSERT OR IGNORE INTO lead_creation_history (owner_user_id,source_google_event_id,lead_name,phone,event_date,created_at_google,original_closer_name)
       SELECT calendars.owner_user_id,events.source_google_event_id,events.lead_name,events.phone,events.event_date,events.created_at_google,calendars.closer_name
       FROM events JOIN calendars ON calendars.id=events.calendar_id
       WHERE calendars.owner_user_id=? AND events.source_google_event_id IS NOT NULL AND events.created_at_google IS NOT NULL`
    ).run(userId);
    recentSyncRanges.set(
      userId,
      [{ startDate, endDate, syncedAt: Date.now() }, ...recentRanges.filter((range) => Date.now() - range.syncedAt < 5 * 60_000)].slice(0, 20)
    );
    const syncedAt = new Date().toISOString();
    broadcast('calendars.synced', { startDate, endDate, events: synced, failures, syncedAt });
    res.json({ ok: true, startDate, endDate, calendars: calendarItems.length, events: synced, failures, syncedAt });
  } catch (error) {
    next(error);
  } finally {
    if (ownsSync) activeSyncUsers.delete(userId);
  }
});

calendarRouter.get('/calendars', (req, res) => {
  const calendars = db
    .prepare(
      `SELECT id,display_name AS displayName,closer_name AS closer,color,closer_role AS role,
       is_overbooking AS isOverbooking,overbooking_from AS overbookingFrom,access_role AS accessRole,active
       FROM calendars WHERE active=1 AND team_status='active' ORDER BY closer_name`
    )
    .all();
  res.json({ calendars });
});

calendarRouter.get('/availability', async (req, res, next) => {
  try {
    const user = (req as AuthedRequest).user;
    const { startDate: date } = rangeFrom({ startDate: req.query.date, endDate: req.query.date });
    const tokenRow = db.prepare('SELECT * FROM oauth_tokens WHERE user_id=?').get(user.id) as Record<string, unknown> | undefined;
    if (!tokenRow) {
      res.status(409).json({ error: 'calendar_not_connected' });
      return;
    }
    const calendars = db
      .prepare(
        `SELECT google_calendar_id AS googleCalendarId,display_name AS displayName,closer_name AS closer,color,access_role AS accessRole
         FROM calendars WHERE active=1 AND team_status='active' AND is_overbooking=0 AND closer_role='fixed' ORDER BY closer_name`
      )
      .all() as Record<string, string>[];
    const overbookingCalendars = db
      .prepare(
        `SELECT google_calendar_id AS googleCalendarId,display_name AS displayName,closer_name AS closer
         FROM calendars WHERE active=1 AND team_status='active' AND is_overbooking=1 ORDER BY closer_name`
      )
      .all() as Record<string, string>[];
    if (!calendars.length) {
      res.json({ date, timeZone: SAO_PAULO_TIME_ZONE, durationMinutes: 60, stepMinutes: 60, closers: [] });
      return;
    }
    const accessToken = await refreshAccessToken(user.id, tokenRow);
    const response = (await googlePost('freeBusy', accessToken, {
      timeMin: `${date}T00:00:00-03:00`,
      timeMax: `${addDays(date, 1)}T00:00:00-03:00`,
      timeZone: SAO_PAULO_TIME_ZONE,
      calendarExpansionMax: 50,
      items: calendars.map((c) => ({ id: c.googleCalendarId })),
    })) as { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason?: string }[] }> };
    let overbookingEvents: { title: string; label: string; start: string; end: string }[] = [];
    let overbookingSourceError: string | null = null;
    try {
      const groups = await Promise.all(
        overbookingCalendars.map((cal) =>
          googleGetAll(`calendars/${encodeURIComponent(cal.googleCalendarId)}/events`, accessToken, {
            timeMin: `${date}T00:00:00-03:00`,
            timeMax: `${addDays(date, 1)}T00:00:00-03:00`,
            timeZone: SAO_PAULO_TIME_ZONE,
            singleEvents: true,
            showDeleted: false,
            orderBy: 'startTime',
            maxResults: 2500,
          })
        )
      );
      overbookingEvents = groups.flatMap((events) =>
        events
          .filter((e) => e.status !== 'cancelled' && e.transparency !== 'transparent')
          .filter((e) => (e.start as Record<string, string>)?.dateTime && (e.end as Record<string, string>)?.dateTime)
          .map((e) => {
            const start = ((e.start as Record<string, string>) || {}).dateTime as string;
            const end = ((e.end as Record<string, string>) || {}).dateTime as string;
            const summary = String((e.summary as string) || 'Compromisso de over');
            return { title: summary, label: parseLead(summary), start, end };
          })
      );
    } catch (error) {
      overbookingSourceError = (error as Error & { code?: string }).code || 'overbooking_calendar_unavailable';
      await recordServerError(error, { method: 'GET', originalUrl: '/api/v1/calendar/availability/overbooking' }, requestId());
    }
    const closers = calendars.map((calendar) => {
      const cfg = closerForCalendar({ id: calendar.googleCalendarId, summary: calendar.displayName });
      const googleResult = response.calendars?.[calendar.googleCalendarId];
      const sourceErrors = googleResult?.errors || [];
      if (!googleResult || sourceErrors.length) {
        return { ...calendar, workStart: cfg.workStart, workEnd: cfg.workEnd, busy: [], free: [], slots: [], sourceError: sourceErrors[0]?.reason || 'calendar_unavailable' };
      }
      const availability = buildAvailability({
        date,
        workStart: cfg.workStart,
        workEnd: cfg.workEnd,
        busy: (googleResult.busy as { start: string; end: string }[]) || [],
        durationMinutes: 60,
        stepMinutes: 60,
      });
      return { ...calendar, ...addOverbookingCounts(availability, overbookingSourceError ? null : overbookingEvents), sourceError: null };
    });
    res.json({
      date,
      timeZone: SAO_PAULO_TIME_ZONE,
      durationMinutes: 60,
      stepMinutes: 60,
      closers,
      overbooking: {
        calendars: overbookingCalendars.length,
        events: overbookingEvents.length,
        sourceError: overbookingSourceError,
        hours: buildOverbookingSchedule({ date, events: overbookingSourceError ? null : overbookingEvents }),
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

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

calendarRouter.get('/events', (req, res, next) => {
  try {
    const { startDate, endDate } = rangeFrom((req.query as Record<string, unknown>) || {});
    const includeFormer = req.query.includeFormer === '1' ? 1 : 0;
    const events = db
      .prepare(
        `${EVENTS_SELECT}
         WHERE events.event_date BETWEEN ? AND ? AND calendars.active=1
         AND (?=1 OR calendars.team_status IN ('active','support'))
         ORDER BY datetime(events.starts_at),calendars.closer_name,events.lead_name`
      )
      .all(startDate, endDate, includeFormer);
    res.json({ startDate, endDate, events: (events as Record<string, unknown>[]).map(presentEvent) });
  } catch (error) {
    next(error);
  }
});

calendarRouter.get('/events/:id', (req, res) => {
  const eventId = Number(req.params.id);
  // rawJson/organizerEmail: mesmos dados da linha (para o HeroUI derivar leadEmail
  // como fazia no backend local). A lista (/events) continua enxuta.
  const DETAIL_SELECT = EVENTS_SELECT.replace(
    'FROM events JOIN calendars',
    ', events.organizer_email AS organizerEmail, events.raw_json AS rawJson FROM events JOIN calendars'
  );
  const event = db.prepare(`${DETAIL_SELECT} WHERE events.id=?`).get(eventId) as
    | Record<string, unknown>
    | undefined;
  if (!event) {
    res.status(404).json({ error: 'event_not_found' });
    return;
  }
  const history = db
    .prepare(`SELECT * FROM event_state_history WHERE event_id=? ORDER BY datetime(changed_at) DESC`)
    .all(eventId);
  res.json({ event: presentEvent(event), history: (history as Record<string, unknown>[]).map(row => ({ ...row, changedAt: String(row.changed_at).replace(' ', 'T') + 'Z' })) });
});

calendarRouter.get('/events/:id/history', (req, res) => {
  const eventId = Number(req.params.id);
  const records = db
    .prepare(`SELECT * FROM event_state_history WHERE event_id=? ORDER BY datetime(changed_at) DESC`)
    .all(eventId);
  res.json({ records });
});

calendarRouter.get('/lead-creation-history', (req, res, next) => {
  try {
    const user = (req as AuthedRequest).user;
    const before = String(req.query.before || '9999-12-31T23:59:59.999Z');
    if (Number.isNaN(Date.parse(before))) {
      res.status(400).json({ error: 'invalid_before' });
      return;
    }
    const records = db
      .prepare(
        `SELECT source_google_event_id AS googleEventId, lead_name AS leadName, phone,
         event_date AS eventDate, created_at_google AS createdAt, original_closer_name AS closer
         FROM lead_creation_history WHERE owner_user_id=? AND datetime(created_at_google) < datetime(?)
         ORDER BY datetime(created_at_google)`
      )
      .all(user.id, before);
    res.json({ records });
  } catch (error) {
    next(error);
  }
});

calendarRouter.post('/lead-creation-history/matches', express.json(), (req, res, next) => {
  try {
    const user = (req as AuthedRequest).user;
    const body = (req.body as Record<string, unknown>) || {};
    const before = String(body.before || '9999-12-31T23:59:59.999Z');
    const leads = Array.isArray(body.leads) ? (body.leads as Record<string, unknown>[]).slice(0, 500) : [];
    if (Number.isNaN(Date.parse(before))) {
      res.status(400).json({ error: 'invalid_before' });
      return;
    }
    const names = new Set(leads.map((l) => normalizeLeadName(String(l.leadName || ''))).filter((n) => n.length >= 4));
    const phones = new Set(leads.map((l) => normalizeLeadPhone(String(l.phone || ''))).filter(Boolean));
    if (!names.size && !phones.size) {
      res.json({ records: [] });
      return;
    }
    const candidates = db
      .prepare(
        `SELECT source_google_event_id AS googleEventId, lead_name AS leadName, phone,
         event_date AS eventDate, created_at_google AS createdAt, original_closer_name AS closer
         FROM lead_creation_history WHERE owner_user_id=? AND datetime(created_at_google) < datetime(?)
         ORDER BY datetime(created_at_google)`
      )
      .all(user.id, before) as Record<string, string>[];
    const records = candidates.filter((r) => {
      const phone = normalizeLeadPhone(String(r.phone || ''));
      const name = normalizeLeadName(String(r.leadName || ''));
      return (phone && phones.has(phone)) || (name.length >= 4 && names.has(name));
    });
    res.json({ records });
  } catch (error) {
    next(error);
  }
});

calendarRouter.get('/daily-entry', (req, res, next) => {
  try {
    const user = (req as AuthedRequest).user;
    const { startDate: date } = rangeFrom({ date: req.query.date });
    const entry = db
      .prepare(
        `SELECT summary_date AS date,contacted_count AS contactedCount,
         over_called_count AS overCalledCount,attended_count AS attendedCount,
         no_show_ps_count AS noShowPsCount, notes,updated_at AS updatedAt
         FROM daily_summaries WHERE user_id=? AND summary_date=?`
      )
      .get(user.id, date);
    res.json(
      entry || { date, contactedCount: 0, overCalledCount: null, attendedCount: null, noShowPsCount: null, notes: null, updatedAt: null }
    );
  } catch (error) {
    next(error);
  }
});

calendarRouter.patch('/daily-entry', express.json(), (req, res, next) => {
  try {
    const user = (req as AuthedRequest).user;
    const app = parseAppSource(req.headers['x-hod-app']);
    const body = (req.body as Record<string, unknown>) || {};
    const { startDate: date } = rangeFrom({ date: body.date });
    const contactedCount = Number(body.contactedCount);
    const nullableCount = (value: unknown, field: string) => {
      if (value === null || value === undefined || value === '') return null;
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 100000) {
        const error = new Error(`Informe uma quantidade válida para ${field}.`) as Error & { status?: number };
        error.status = 400;
        throw error;
      }
      return n;
    };
    const overCalledCount = nullableCount(body.overCalledCount, 'Overs chamados');
    const attendedCount = nullableCount(body.attendedCount, 'Aconteceram');
    const noShowPsCount = nullableCount(body.noShowPsCount, 'No-show PS');
    const notes = String(body.notes || '').trim();
    if (!Number.isInteger(contactedCount) || contactedCount < 0 || contactedCount > 100000) {
      res.status(400).json({ error: 'invalid_contacted_count', message: 'Informe uma quantidade de contatos válida.' });
      return;
    }
    if (notes.length > 2000) {
      res.status(400).json({ error: 'notes_too_long', message: 'As observações podem ter até 2.000 caracteres.' });
      return;
    }
    db.prepare(
      `INSERT INTO daily_summaries(user_id,summary_date,contacted_count,over_called_count,attended_count,no_show_ps_count,notes,updated_by_app)
       VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,summary_date) DO UPDATE SET
       contacted_count=excluded.contacted_count,over_called_count=excluded.over_called_count,
       attended_count=excluded.attended_count,no_show_ps_count=excluded.no_show_ps_count,
       notes=excluded.notes,updated_by_app=excluded.updated_by_app,updated_at=CURRENT_TIMESTAMP`
    ).run(user.id, date, contactedCount, overCalledCount, attendedCount, noShowPsCount, notes || null, app);
    const entry = db
      .prepare(
        `SELECT summary_date AS date,contacted_count AS contactedCount,
         over_called_count AS overCalledCount,attended_count AS attendedCount,
         no_show_ps_count AS noShowPsCount, notes,updated_at AS updatedAt
         FROM daily_summaries WHERE user_id=? AND summary_date=?`
      )
      .get(user.id, date);
    broadcast('daily_entry.updated', { date, entry, by: user.id, app });
    res.json(entry);
  } catch (error) {
    next(error);
  }
});

calendarRouter.patch('/events/:id/state', express.json(), (req, res) => {
  const user = (req as unknown as AuthedRequest).user;
  const app = parseAppSource(req.headers['x-hod-app']);
  const eventId = Number(req.params.id);
  const body = (req.body as Record<string, unknown>) || {};
  const event = db
    .prepare(
      `SELECT events.id,events.event_date AS eventDate,events.lead_name AS leadName,
       calendars.closer_name AS closer FROM events JOIN calendars ON calendars.id=events.calendar_id WHERE events.id=?`
    )
    .get(eventId) as { id: number; eventDate: string; leadName: string; closer: string } | undefined;
  if (!event) {
    res.status(404).json({ error: 'event_not_found' });
    return;
  }
  const existing = (db.prepare('SELECT manual_status AS manualStatus,confirmation,notes FROM event_states WHERE event_id=?').get(eventId) as { manualStatus: string | null; confirmation: string; notes: string | null } | undefined) || {
    manualStatus: null,
    confirmation: 'neutro',
    notes: null,
  };
  const manualStatus = Object.hasOwn(body, 'manualStatus') ? (body.manualStatus as string | null) : existing.manualStatus;
  const confirmation = Object.hasOwn(body, 'confirmation') ? String(body.confirmation) : existing.confirmation;
  const notes = Object.hasOwn(body, 'notes') ? (body.notes as string | null) : existing.notes;
  const allowedStatus = [null, 'compareceu', 'no_show', 'cancelada', 'reagendar', 'reagendado', 'over_sem_atendimento'];
  const allowedConfirmation = ['neutro', 'confirmado', 'nao_confirmado'];
  if (!allowedStatus.includes(manualStatus as string) || !allowedConfirmation.includes(confirmation)) {
    res.status(400).json({ error: 'invalid_state' });
    return;
  }
  db.prepare(
    `INSERT INTO event_states(event_id,manual_status,confirmation,notes,updated_by,updated_by_app) VALUES(?,?,?,?,?,?)
     ON CONFLICT(event_id) DO UPDATE SET manual_status=excluded.manual_status,confirmation=excluded.confirmation,
     notes=excluded.notes,updated_by=excluded.updated_by,updated_by_app=excluded.updated_by_app,updated_at=CURRENT_TIMESTAMP`
  ).run(eventId, manualStatus, confirmation, notes || null, user.id, app);
  db.prepare(
    `INSERT INTO event_state_history (event_id,event_date,lead_name,closer_name,previous_status,new_status,previous_confirmation,new_confirmation,notes,changed_by,app_source)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    eventId,
    event.eventDate,
    event.leadName,
    event.closer,
    existing.manualStatus,
    manualStatus,
    existing.confirmation,
    confirmation,
    notes || null,
    user.id,
    app
  );
  let archive: { meetings?: number } | null = null;
  let archiveWarning: string | null = null;
  try {
    archive = archiveDay(event.eventDate, {
      eventId,
      leadName: event.leadName,
      from: { status: existing.manualStatus, confirmation: existing.confirmation },
      to: { status: manualStatus, confirmation },
      by: user.id,
      app,
    }) as unknown as { meetings?: number };
  } catch (error) {
    const id = requestId();
    (error as Error & { code?: string }).code = (error as Error & { code?: string }).code || 'daily_archive_failed';
    void recordServerError(error, { method: 'PATCH', originalUrl: `/api/v1/calendar/events/${eventId}/state` }, id);
    archiveWarning = id;
  }
  const state = { manualStatus, confirmation, notes: notes || null };
  broadcast('event.state_changed', { eventId, eventDate: event.eventDate, leadName: event.leadName, closer: event.closer, state, by: user.id, app });
  res.json({ ok: true, state, archived: Boolean(archive), archiveDate: event.eventDate, archiveMeetings: archive?.meetings ?? null, archiveWarning });
});

export { historicalClosers };
