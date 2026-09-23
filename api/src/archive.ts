// Port fiel de server/archive.js da V1: snapshot diário JSON+CSV+JSONL.
// Falha de arquivo nunca falha a operação (retorna archiveWarning).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';

export function archivedStatus(row: {
  manualStatus?: string | null;
  attendeeDeclined?: number | boolean;
  isOverbooking?: number | boolean;
}): string {
  if (row.isOverbooking) return 'over';
  if (row.manualStatus === 'compareceu') return 'compareceu';
  if (row.manualStatus === 'no_show') return 'no_show';
  if (row.manualStatus === 'cancelada') return 'cancelada';
  if (row.manualStatus === 'reagendar' || row.manualStatus === 'reagendado') return 'reagendado';
  if (row.attendeeDeclined) return 'no_show_google';
  if (row.manualStatus) return 'manual';
  return 'fluxo';
}

export function archiveDay(
  date: string,
  change: { eventId: number; leadName: string; from: unknown; to: unknown; by: number | null; app: string }
): { archived: boolean; meetings: number; warning?: string } {
  try {
    fs.mkdirSync(config.archiveDir, { recursive: true });
    const rows = db
      .prepare(
        `SELECT e.*, s.manual_status AS manualStatus, s.confirmation,
                c.closer_name AS closerName, c.is_overbooking AS isOverbooking
         FROM events e
         LEFT JOIN event_states s ON s.event_id = e.id
         JOIN calendars c ON c.id = e.calendar_id
         WHERE e.event_date = ? ORDER BY e.starts_at`
      )
      .all(date) as Record<string, unknown>[];
    const totals = {
      meetings: rows.length,
      noShows: 0,
      reschedules: 0,
      cancelled: 0,
      confirmed: 0,
      overbooking: 0,
    };
    for (const r of rows) {
      const ms = r.manualStatus as string | null;
      if (r.isOverbooking) totals.overbooking += 1;
      if (ms === 'no_show') totals.noShows += 1;
      if (ms === 'reagendar' || ms === 'reagendado') totals.reschedules += 1;
      if (ms === 'cancelada') totals.cancelled += 1;
      if (r.confirmation === 'confirmado') totals.confirmed += 1;
    }
    const snapshot = { date, archivedAt: new Date().toISOString(), totals, events: rows };
    fs.writeFileSync(path.join(config.archiveDir, `${date}.json`), JSON.stringify(snapshot, null, 2));
    const csv = [
      'id,lead,closer,inicio,fim,status,confirmacao',
      ...rows.map((r) =>
        [
          r.id,
          JSON.stringify(r.lead_name || ''),
          JSON.stringify((r as Record<string, unknown>).closerName || ''),
          r.starts_at,
          r.ends_at,
          (r as Record<string, unknown>).manualStatus || archivedStatus(r as never),
          r.confirmation || 'neutro',
        ].join(',')
      ),
    ].join('\n');
    fs.writeFileSync(path.join(config.archiveDir, `${date}.csv`), csv);
    fs.appendFileSync(
      path.join(config.archiveDir, `alteracoes-${date}.jsonl`),
      JSON.stringify({ ...change, at: new Date().toISOString() }) + '\n'
    );
    return { archived: true, meetings: rows.length };
  } catch (error) {
    return {
      archived: false,
      meetings: 0,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}
