// Fonte oficial: V1 server/availability-rules.js — port fiel.
// Regra: expediente 08–23, blocos cheios de 1h em horas cheias; qualquer invasão elimina o bloco.
// overCount null = fonte indisponível (nunca presumir zero).
const SAO_PAULO_OFFSET = '-03:00';
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function timeValue(date: string, time: string): number {
  if (!TIME_PATTERN.test(time)) throw new Error(`Horário de expediente inválido: ${time}`);
  return Date.parse(`${date}T${time}:00${SAO_PAULO_OFFSET}`);
}

function timeLabel(value: number | string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function interval(value: { start: number; end: number }) {
  return {
    start: new Date(value.start).toISOString(),
    end: new Date(value.end).toISOString(),
    startLabel: timeLabel(value.start),
    endLabel: timeLabel(value.end),
  };
}

export interface BusyInput {
  start: string;
  end: string;
}

export function buildAvailability(opts: {
  date: string;
  workStart?: string;
  workEnd?: string;
  busy?: BusyInput[];
  durationMinutes?: number;
  stepMinutes?: number;
}) {
  const { date, workStart = '08:00', workEnd = '23:00', busy = [], durationMinutes = 60, stepMinutes = 60 } = opts;
  const windowStart = timeValue(date, workStart);
  const windowEnd = timeValue(date, workEnd);
  if (windowEnd <= windowStart) throw new Error('O fim do expediente precisa ocorrer depois do início.');

  const mergedBusy = busy
    .map((item) => ({
      start: Math.max(windowStart, Date.parse(item.start)),
      end: Math.min(windowEnd, Date.parse(item.end)),
    }))
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .sort((a, b) => a.start - b.start)
    .reduce<{ start: number; end: number }[]>((acc, item) => {
      const prev = acc.at(-1);
      if (prev && item.start <= prev.end) prev.end = Math.max(prev.end, item.end);
      else acc.push({ ...item });
      return acc;
    }, []);

  const free: { start: number; end: number }[] = [];
  let cursor = windowStart;
  mergedBusy.forEach((item) => {
    if (item.start > cursor) free.push({ start: cursor, end: item.start });
    cursor = Math.max(cursor, item.end);
  });
  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd });

  const duration = durationMinutes * 60_000;
  const step = stepMinutes * 60_000;
  const slots: ReturnType<typeof interval>[] = [];
  for (let s = windowStart; s + duration <= windowEnd; s += step) {
    const e = s + duration;
    if (free.some((f) => s >= f.start && e <= f.end)) slots.push(interval({ start: s, end: e }));
  }

  return {
    workStart,
    workEnd,
    durationMinutes,
    stepMinutes,
    busy: mergedBusy.map(interval),
    free: free.map(interval),
    slots,
  };
}

export function overbookingCountForSlot(
  slot: { start: string; end: string },
  events: { start: string; end: string }[] = []
): number {
  const s = Date.parse(slot.start);
  const e = Date.parse(slot.end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return events.reduce((count, ev) => {
    const es = Date.parse(ev.start);
    const ee = Date.parse(ev.end);
    return Number.isFinite(es) && Number.isFinite(ee) && es < e && ee > s ? count + 1 : count;
  }, 0);
}

export function addOverbookingCounts<T extends { slots: { start: string; end: string }[] }>(
  availability: T,
  events: { start: string; end: string }[] | null = []
) {
  return {
    ...availability,
    slots: availability.slots.map((slot) => ({
      ...slot,
      overCount: events === null ? null : overbookingCountForSlot(slot, events),
    })),
  };
}

export function buildOverbookingSchedule(opts: {
  date: string;
  events?: { start: string; end: string; title?: string; label?: string }[] | null;
  workStart?: string;
  workEnd?: string;
}) {
  const { date, events = [], workStart = '07:00', workEnd = '23:00' } = opts;
  const windowStart = timeValue(date, workStart);
  const windowEnd = timeValue(date, workEnd);
  const duration = 60 * 60_000;
  const hours: (ReturnType<typeof interval> & {
    overCount: number | null;
    events: { title: string; label: string; startLabel: string; endLabel: string }[];
  })[] = [];
  for (let s = windowStart; s < windowEnd; s += duration) {
    const slot = interval({ start: s, end: s + duration });
    const matching =
      events === null ? [] : (events || []).filter((ev) => overbookingCountForSlot(slot, [ev]) > 0);
    hours.push({
      ...slot,
      overCount: events === null ? null : matching.length,
      events: matching.map((ev) => ({
        title: ev.title || ev.label || 'Compromisso de over',
        label: ev.label || ev.title || 'Compromisso de over',
        startLabel: timeLabel(ev.start),
        endLabel: timeLabel(ev.end),
      })),
    });
  }
  return hours;
}
