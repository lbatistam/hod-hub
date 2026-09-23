import { classifyCreatedLeads, effectiveConfirmation, eventFlow, isNoShow } from './consultation-rules.js';

export interface SummaryEvent {
  leadName: string;
  phone?: string | null;
  createdAt?: string | null;
  closer?: string | null;
  isOverbooking: boolean | number;
  manualStatus?: string | null;
  attendeeDeclined?: boolean | number;
  confirmation?: string;
  startsAt?: string;
  endsAt?: string;
}

export function saoPauloDate(value: string | null | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export function createdWithinRange(value: string | null | undefined, startDate: string, endDate: string): boolean {
  const date = saoPauloDate(value);
  return Boolean(date && date >= startDate && date <= endDate);
}

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function rescheduledConsultations<T extends SummaryEvent>(rows: T[], historical: SummaryEvent[] = []): T[] {
  const candidates = rows.filter(r => r.createdAt).map(r => ({ ...r, createdAt: r.createdAt!, original: r }));
  const { repeated } = classifyCreatedLeads(candidates, historical.map(r => ({ ...r, createdAt: r.createdAt || undefined, original: r })));
  const repeatedRows = new Set(repeated.map(r => r.original));
  return rows.filter(r => ['reagendar', 'reagendado'].includes(String(r.manualStatus)) || repeatedRows.has(r));
}

export function summarizeConsultations(rows: SummaryEvent[], historical: SummaryEvent[] = []) {
  const normal = rows.filter(r => !r.isOverbooking);
  const overs = rows.filter(r => Boolean(r.isOverbooking));
  const rescheduled = rescheduledConsultations(rows, historical).length;
  const noShows = normal.filter(r => isNoShow({ ...r, isOverbooking: false })).length;
  const markedAttendance = normal.filter(r => r.manualStatus === 'compareceu').length;
  const happened = normal.filter(r => eventFlow({ ...r, isOverbooking: false }) === 'concluidas').length;
  return {
    rates: { base: normal.length, attendance: normal.length ? markedAttendance / normal.length : 0, noShow: normal.length ? noShows / normal.length : 0 },
    scheduled: rows.length,
    pastMeetings: normal.filter(r => Boolean(r.closer)).length,
    pendingOvers: overs.length,
    happened,
    markedAttendance,
    noShows,
    notPassed: overs.length + normal.filter(r => !r.closer).length,
    rescheduled,
    manualNoShows: normal.filter(r => ['no_show', 'cancelada', 'reagendar', 'reagendado'].includes(String(r.manualStatus))).length,
    suggestedNoShows: noShows,
    pendingConfirmations: normal.filter(r => effectiveConfirmation({ ...r, isOverbooking: false }) === 'neutro').length,
  };
}
