// Fonte oficial: V1 server/calendar-rules.js — port fiel para TypeScript.
const SALES_TITLE = /^(?:follow(?:-?up)?|nova\s+reuni[aã]o|reagendamento|retorno|diagn[oó]stico|treinamento)\b/i;
const CONTACT_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const CONTACT_PHONE = /(?:\+?\d{1,3}[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]*\d{4}\b/;

interface Person {
  email?: string;
  self?: boolean;
  responseStatus?: string;
}

interface GoogleEventLike {
  summary?: string;
  description?: string;
  organizer?: Person & { email?: string };
  creator?: Person & { email?: string };
  attendees?: (Person & { email?: string; self?: boolean; responseStatus?: string })[];
}

function emailOf(person: Person = {}): string {
  return String(person.email || '').trim().toLowerCase();
}

function descriptionHasLeadContact(description = ''): boolean {
  const value = String(description);
  const externalEmail = value.match(CONTACT_EMAIL)?.[0]?.toLowerCase();
  return Boolean(
    (externalEmail && !externalEmail.endsWith('@metodohod.com')) || CONTACT_PHONE.test(value)
  );
}

function normalizeWord(value = ''): string {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let col = 1; col <= right.length; col += 1) {
      current[col] = Math.min(
        current[col - 1] + 1,
        previous[col] + 1,
        previous[col - 1] + (left[row - 1] === right[col - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function consultoriaPrefix(title = ''): number | null {
  const match = /^\s*(?:HOD\s*[-–—:|]\s*)?([A-Za-zÀ-ÿ]+)/i.exec(String(title));
  if (!match) return null;
  const word = normalizeWord(match[1]);
  // Tolera até dois erros de digitação, exige tamanho próximo (9–12).
  if (word.length < 9 || word.length > 12 || editDistance(word, 'consultoria') > 2) return null;
  return match[0].length;
}

export function isConsultoriaTitle(title = ''): boolean {
  return consultoriaPrefix(title) !== null;
}

export function extractConsultoriaLead(title = ''): string | null {
  const len = consultoriaPrefix(title);
  if (len === null) return null;
  return String(title)
    .slice(len)
    .replace(/^[\s|:\-–—]+/, '')
    .trim();
}

// Regra oficial do Resumo Diário: só uma agenda intitulada
// "Consultoria Nome Sobrenome" gera um qualificado. Um título genérico, um
// follow-up ou apenas "Consultoria" não pode contaminar a base de novos leads.
export function isQualifiedConsultoriaTitle(title = ''): boolean {
  const lead = extractConsultoriaLead(title);
  return Boolean(lead && hasFullLeadName(lead));
}

export function hasFullLeadName(value = ''): boolean {
  const words = String(value).trim().split(/\s+/).filter((word) => /[A-Za-zÀ-ÿ]/.test(word));
  return words.length >= 2;
}

export function attendanceFromGoogle(event: GoogleEventLike = {}, calendarEmail = ''): {
  selfResponseStatus: string;
  attendeeDeclined: boolean;
  hasExternalAttendee: boolean;
} {
  const attendees = event.attendees || [];
  const normalized = String(calendarEmail).toLowerCase();
  const calendarAttendee =
    attendees.find((a) => emailOf(a) === normalized) || attendees.find((a) => a.self === true);
  const organizerEmail = emailOf(event.organizer as Person);
  const hasExternalAttendee =
    attendees.some((a) => {
      const email = emailOf(a);
      return email && email !== organizerEmail && !email.endsWith('@metodohod.com');
    }) || descriptionHasLeadContact(event.description);
  return {
    selfResponseStatus: calendarAttendee?.responseStatus || 'needsAction',
    attendeeDeclined: calendarAttendee?.responseStatus === 'declined',
    hasExternalAttendee,
  };
}

export function classifySdrMeeting(
  event: GoogleEventLike = {},
  opts: { sdrEmail?: string; closerEmails?: string[] } = {}
): { included: boolean; kind: string; reason: string } {
  if (isConsultoriaTitle(event.summary)) {
    return { included: true, kind: 'consultoria', reason: 'title' };
  }
  const organizer = emailOf(event.organizer as Person);
  const creator = emailOf(event.creator as Person);
  const normalizedSdr = String(opts.sdrEmail || '').toLowerCase();
  const known = new Set((opts.closerEmails || []).map((e) => String(e).toLowerCase()));
  const invited = (event.attendees || []).filter((a) => known.has(emailOf(a)));
  const hostedBySdr = organizer === normalizedSdr || creator === normalizedSdr;
  const attendance = attendanceFromGoogle(event);
  const salesLikeTitle = SALES_TITLE.test(String(event.summary || '').trim());
  const singleCloserConversation = invited.length === 1 && salesLikeTitle;
  const leadEvidence = attendance.hasExternalAttendee;
  if (hostedBySdr && invited.length >= 1 && (leadEvidence || singleCloserConversation)) {
    return {
      included: true,
      kind: salesLikeTitle ? 'follow_up' : 'sdr_meeting',
      reason: leadEvidence ? 'host_closer_lead' : 'host_single_closer_title',
    };
  }
  return { included: false, kind: 'other', reason: 'not_sdr_meeting' };
}
