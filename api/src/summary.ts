// Resumo diário + analytics DERIVADOS dos mesmos dados (nunca números paralelos).
// Regras: isNoShow/effectiveConfirmation/eventFlow/sameLead (rules/consultation-rules.ts),
// presença só em período verificado (>=2026-06-01; 2026-05-06–31 parcial; anterior legado),
// Over excluído de presença/no-show, Reagendar conta como no-show mas tem fila própria.
import express from 'express';
import { db } from './db.js';
import { requireUser, SessionUser } from './auth.js';
import { saoPauloDate, summarizeConsultations, validDate } from './rules/daily-summary.js';
import {
  attendanceStatus,
  classifyCreatedLeads,
  effectiveConfirmation,
  isNoShow,
  sameLead,
} from './rules/consultation-rules.js';

export const summaryRouter: express.Router = express.Router();
summaryRouter.use(requireUser);

interface EventRow {
  id: number;
  eventDate: string;
  leadName: string;
  phone: string | null;
  startsAt: string;
  endsAt: string;
  attendeeDeclined: number;
  hasExternalAttendee: number;
  createdAt: string | null;
  closer: string;
  isOverbooking: number;
  manualStatus: string | null;
  confirmation: string;
  googleEventId: string;
  title: string;
}

function rowsBetween(startDate: string, endDate: string, includeFormer: boolean): EventRow[] {
  return db
    .prepare(
      `SELECT events.id, COALESCE(events.source_google_event_id, events.google_event_id) AS googleEventId, events.title,
       events.event_date AS eventDate, events.lead_name AS leadName, events.phone,
       events.starts_at AS startsAt, events.ends_at AS endsAt,
       events.attendee_declined AS attendeeDeclined, events.has_external_attendee AS hasExternalAttendee,
       events.created_at_google AS createdAt, calendars.closer_name AS closer,
       CASE WHEN calendars.is_overbooking=1 AND (calendars.overbooking_from IS NULL OR events.event_date >= calendars.overbooking_from)
       THEN 1 ELSE 0 END AS isOverbooking,
       event_states.manual_status AS manualStatus, COALESCE(event_states.confirmation,'neutro') AS confirmation
       FROM events JOIN calendars ON calendars.id=events.calendar_id
       LEFT JOIN event_states ON event_states.event_id=events.id
       WHERE events.event_date BETWEEN ? AND ? AND calendars.active=1
       AND (?=1 OR calendars.team_status IN ('active','support'))
       ORDER BY datetime(events.starts_at)`
    )
    .all(startDate, endDate, includeFormer ? 1 : 0) as EventRow[];
}

function toLike(r: EventRow) {
  return {
    isOverbooking: r.isOverbooking === 1,
    manualStatus: r.manualStatus,
    attendeeDeclined: r.attendeeDeclined === 1,
    hasExternalAttendee: r.hasExternalAttendee === 1,
    confirmation: r.confirmation,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
  };
}

export function verifiedPeriod(date: string): 'ok' | 'partial' | 'legacy' {
  if (date >= '2026-06-01') return 'ok';
  if (date >= '2026-05-06') return 'partial';
  return 'legacy';
}

// GET /api/v1/daily-summary?date=YYYY-MM-DD — métricas oficiais e listas derivadas
summaryRouter.get('/daily-summary', (req, res, next) => {
  try {
    const date = String(req.query.date || saoPauloDate(new Date().toISOString()));
    if (!validDate(date)) {
      res.status(400).json({ error: 'invalid_date' });
      return;
    }
    const includeFormer = req.query.includeFormer === '1';
    const user = (req as express.Request & { user: SessionUser }).user;
    const rows = rowsBetween(date, date, includeFormer);
    const nextDay = new Date(`${date}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const before = `${nextDay.toISOString().slice(0, 10)}T00:00:00-03:00`;
    const historical = db
      .prepare(
        `SELECT id, source_google_event_id AS googleEventId, lead_name AS leadName, phone,
         event_date AS eventDate, created_at_google AS createdAt, original_closer_name AS closer
         FROM lead_creation_history
         WHERE owner_user_id=? AND qualified_consultoria=1 AND datetime(created_at_google) < datetime(?)
         ORDER BY datetime(created_at_google)`
      )
      .all(user.id, before) as { id: number; googleEventId: string; leadName: string; phone: string | null; createdAt: string; eventDate: string; closer: string }[];
    const createdToday = historical.filter(r => saoPauloDate(r.createdAt) === date);
    // A criação é permanente: não depende da reunião continuar na agenda ou da sua data atual.
    const liveRows = rowsBetween('0001-01-01', '9999-12-31', true);
    const liveByGoogleId = new Map(liveRows.map(r => [r.googleEventId, r]));
    const { newLeads, repeated } = classifyCreatedLeads(
      createdToday,
      historical
    );
    const createdEvent = (r: typeof historical[number], creationKind: string) => {
      const live = liveByGoogleId.get(r.googleEventId);
      return { ...r, ...live, id: live?.id ?? `history-${r.id}`, createdAt: r.createdAt, creationKind,
        archived: !live, isOverbooking: live?.isOverbooking ?? 0,
        repeatedFrom: creationKind === 'repeated' ? historical.find(h => Date.parse(h.createdAt) < Date.parse(r.createdAt) && sameLead(h, r)) : undefined };
    };
    const monday = new Date(`${date}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const weekRows = rowsBetween(monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10), includeFormer);
    const week = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday);
      day.setUTCDate(day.getUTCDate() + index);
      const dayKey = day.toISOString().slice(0, 10);
      const metrics = summarizeConsultations(weekRows.filter(r => r.eventDate === dayKey));
      return { day: dayKey, scheduled: metrics.scheduled, passed: metrics.pastMeetings, over: metrics.pendingOvers };
    });
    res.json({
      date,
      week,
      ...summarizeConsultations(rows, historical.map(r => ({ ...r, isOverbooking: 0 }))),
      qualified: { total: newLeads.length, events: newLeads.map(r => createdEvent(r, 'new')) },
      // Reagendada no quadro de criação = nova agenda do dia para um nome que
      // já existia no histórico qualificado. Status manual não altera essa lista.
      rescheduledEvents: repeated.map(r => ({ ...createdEvent(r, 'repeated'), rescheduledAt: r.createdAt, rescheduleSource: 'creation_history' })),
      created: { total: createdToday.length, new: newLeads.length, repeated: repeated.length,
        events: [...newLeads.map(r => createdEvent(r, 'new')), ...repeated.map(r => createdEvent(r, 'repeated'))].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) },
      verified: verifiedPeriod(date),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/analytics?startDate&endDate&closer&includeFormer — agregado por closer + taxas
summaryRouter.get('/analytics', (req, res, next) => {
  try {
    const startDate = String(req.query.startDate || '2026-06-01');
    const endDate = String(req.query.endDate || saoPauloDate(new Date().toISOString()));
    if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) {
      res.status(400).json({ error: 'invalid_range' });
      return;
    }
    const includeFormer = req.query.includeFormer === '1';
    const closerFilter = String(req.query.closer || '');
    const rows = rowsBetween(startDate, endDate, includeFormer).filter(
      (r) => !closerFilter || r.closer === closerFilter
    );
    const metric = rows.filter((r) => r.isOverbooking !== 1);
    const byCloser: Record<string, { scheduled: number; confirmed: number; attended: number; noShows: number; overs: number }> = {};
    for (const r of rows) {
      const k = r.closer || 'Sem closer';
      byCloser[k] = byCloser[k] || { scheduled: 0, confirmed: 0, attended: 0, noShows: 0, overs: 0 };
      if (r.isOverbooking === 1) {
        byCloser[k].overs += 1;
        continue;
      }
      byCloser[k].scheduled += 1;
      if (effectiveConfirmation(toLike(r)) === 'confirmado' || r.manualStatus === 'compareceu') byCloser[k].confirmed += 1;
      if (attendanceStatus(toLike(r)) === 'attended' || r.manualStatus === 'compareceu') byCloser[k].attended += 1;
      if (isNoShow(toLike(r))) byCloser[k].noShows += 1;
    }
    const total = {
      scheduled: metric.length,
      confirmed: metric.filter((r) => effectiveConfirmation(toLike(r)) === 'confirmado' || r.manualStatus === 'compareceu').length,
      attended: metric.filter((r) => r.manualStatus === 'compareceu').length,
      noShows: metric.filter((r) => isNoShow(toLike(r))).length,
    };
    const daily = Array.from(new Set(rows.map(r => r.eventDate))).sort().map(date => {
      const group = rows.filter(r => r.eventDate === date);
      const regular = group.filter(r => r.isOverbooking !== 1);
      return { date, scheduled: regular.length, attended: regular.filter(r => r.manualStatus === 'compareceu').length,
        noShows: regular.filter(r => isNoShow(toLike(r))).length,
        rescheduled: regular.filter(r => ['reagendar','reagendado'].includes(String(r.manualStatus))).length };
    });
    res.json({
      daily,
      rescheduled: metric.filter(r => ['reagendar','reagendado'].includes(String(r.manualStatus))).length,
      startDate,
      endDate,
      verified: verifiedPeriod(startDate) === 'ok' && verifiedPeriod(endDate) === 'ok' ? 'ok' : 'mixed',
      total,
      rates: {
        confirmation: total.scheduled ? total.confirmed / total.scheduled : 0,
        attendance: total.scheduled ? total.attended / total.scheduled : 0,
        noShow: total.scheduled ? total.noShows / total.scheduled : 0,
      },
      byCloser,
    });
  } catch (error) {
    next(error);
  }
});
