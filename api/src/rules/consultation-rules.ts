// Regras derivadas oficiais — fonte: V1 src/v4/hod-data.js (isNoShow, eventFlow,
// effectiveConfirmation) + src/v4/hod-daily-rules.js (sameLead/classifyCreatedLeads).
// Estas funções são a verdade central para resumo diário e analytics da Platform.
// Frontends NÃO devem reimplementar — devem consumir /api/v1/daily-summary e /api/v1/analytics.

export type ManualStatus =
  | null
  | 'compareceu'
  | 'no_show'
  | 'cancelada'
  | 'reagendar'
  | 'reagendado'
  | 'over_sem_atendimento';

export type Confirmation = 'neutro' | 'confirmado' | 'nao_confirmado';

export interface ConsultationLike {
  isOverbooking?: boolean;
  manualStatus?: ManualStatus | string | null;
  attendeeDeclined?: boolean | number;
  hasExternalAttendee?: boolean | number;
  confirmation?: Confirmation | string | null;
  startsAt?: string;
  endsAt?: string;
}

const FINAL_NO_SHOW_STATUSES = ['no_show', 'cancelada', 'reagendar', 'reagendado'];

export function isNoShow(event: ConsultationLike): boolean {
  if (event.isOverbooking) return false;
  // Correção manual de comparecimento absolve até evento riscado no Google.
  if (event.manualStatus === 'compareceu') return false;
  if (FINAL_NO_SHOW_STATUSES.includes(String(event.manualStatus))) return true;
  if (event.attendeeDeclined) return true;
  return false;
}

export function effectiveConfirmation(event: ConsultationLike): Confirmation {
  if (FINAL_NO_SHOW_STATUSES.includes(String(event.manualStatus))) return 'nao_confirmado';
  const c = String(event.confirmation || 'neutro');
  return c === 'confirmado' || c === 'nao_confirmado' ? (c as Confirmation) : 'neutro';
}

export function nextConfirmation(value: string): Confirmation {
  return value === 'neutro' ? 'confirmado' : value === 'confirmado' ? 'nao_confirmado' : 'neutro';
}

export function eventFlow(event: ConsultationLike, now = new Date()): string {
  if (event.manualStatus === 'over_sem_atendimento') return 'reagendar';
  if (event.manualStatus === 'reagendar') return 'reagendar';
  if (event.manualStatus === 'reagendado') return 'reagendado';
  if (event.manualStatus === 'cancelada') return 'cancelada';
  if (isNoShow(event)) return 'no_show';
  if (event.manualStatus === 'compareceu') return 'concluidas';
  if (event.manualStatus) return String(event.manualStatus);
  if (!event.startsAt) return 'proximas';
  const start = new Date(event.startsAt);
  const automaticEnd = new Date(start.getTime() + 50 * 60 * 1000);
  if (now < start) return 'proximas';
  if (now < automaticEnd) return 'andamento';
  return 'concluidas';
}

export function attendanceStatus(event: ConsultationLike): string {
  if (event.isOverbooking) return 'over';
  if (event.manualStatus === 'compareceu') return 'attended';
  if (isNoShow(event)) return 'no_show';
  if (event.manualStatus) return String(event.manualStatus);
  if (!event.hasExternalAttendee) return 'ambiguous';
  return 'pending';
}

// --- Regras Novo x Repetido (hod-daily-rules.js, fonte oficial) ---
export function normalizeLeadName(value = ''): string {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizePhone(value = ''): string {
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-11) : '';
}

export function sameLead(
  left: { leadName?: string; phone?: string | null },
  right: { leadName?: string; phone?: string | null }
): boolean {
  const lp = normalizePhone(left.phone || '');
  const rp = normalizePhone(right.phone || '');
  if (lp && rp && lp === rp) return true;
  const ln = normalizeLeadName(left.leadName || '');
  const rn = normalizeLeadName(right.leadName || '');
  return ln.length >= 4 && ln === rn;
}

export function classifyCreatedLeads<T extends { createdAt?: string; leadName?: string; phone?: string | null }>(
  createdEvents: T[],
  historicalEvents: T[]
): { newLeads: T[]; repeated: T[] } {
  const chronological = [...createdEvents].sort(
    (a, b) => Date.parse(a.createdAt || '') - Date.parse(b.createdAt || '')
  );
  const previous = historicalEvents.filter((e) => e.createdAt);
  const newLeads: T[] = [];
  const repeated: T[] = [];
  chronological.forEach((event) => {
    const earlier = [...previous, ...newLeads, ...repeated].find(
      (c) => Date.parse(c.createdAt || '') < Date.parse(event.createdAt || '') && sameLead(c, event)
    );
    if (earlier) repeated.push(event);
    else newLeads.push(event);
  });
  return { newLeads, repeated };
}

// Read model operacional: a coluna acompanha o relógio; presença oficial exige marcação.
export function operationalPresentation(event: ConsultationLike, now = new Date()) {
  const attendance = attendanceStatus(event);
  let column = 'scheduled';
  if (['reagendar', 'over_sem_atendimento'].includes(String(event.manualStatus))) column = 'recovery';
  else if (event.manualStatus === 'reagendado') column = 'rescheduled';
  else if (event.manualStatus === 'cancelada') column = 'cancelled';
  else if (event.manualStatus === 'compareceu') column = 'attended';
  else if (event.manualStatus === 'no_show' || isNoShow(event)) column = 'no_show';
  else if (event.startsAt) {
    const start = Date.parse(event.startsAt);
    const parsedEnd = event.endsAt ? Date.parse(event.endsAt) : NaN;
    const end = Number.isFinite(parsedEnd) && parsedEnd > start ? parsedEnd : start + 50 * 60_000;
    if (Number.isFinite(start) && start <= now.getTime()) {
      column = now.getTime() < end ? 'ongoing' : 'attended';
    }
  }
  return { column, attendance, effectiveConfirmation: effectiveConfirmation(event) };
}
