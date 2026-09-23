import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rescheduledConsultations, saoPauloDate, summarizeConsultations, validDate } from '../src/rules/daily-summary.js';
import { attendanceStatus } from '../src/rules/consultation-rules.js';

test('resumo distingue atribuição, presença, overs e reagendamento', () => {
  const rows = [
    { leadName: 'Ana', closer: 'Rodrigo', isOverbooking: 0, manualStatus: 'compareceu' },
    { leadName: 'Bia', closer: 'Rodrigo', isOverbooking: 0, manualStatus: 'reagendar' },
    { leadName: 'Caio', closer: 'Over', isOverbooking: 1, attendeeDeclined: 1 },
    { leadName: 'Dora', closer: '', isOverbooking: 0 },
    { leadName: 'Eva Silva', closer: 'Rodrigo', isOverbooking: 0, createdAt: '2026-09-15T15:00:00Z' },
  ];
  const summary = summarizeConsultations(rows, [{ leadName: 'Eva Silva', isOverbooking: 0, createdAt: '2026-09-14T15:00:00Z' }]);
  assert.equal(summary.scheduled, 5);
  assert.equal(summary.pastMeetings, 3);
  assert.equal(summary.happened, 1);
  assert.equal(summary.notPassed, 2);
  assert.equal(summary.noShows, 1);
  assert.equal(summary.rescheduled, 2);
});

test('acontecidas inclui conclusões do fluxo, sem inventar presença marcada', () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({
    leadName: `Lead ${i + 1}`,
    closer: 'Closer',
    isOverbooking: 0,
    startsAt: '2020-09-15T13:00:00Z',
    endsAt: '2020-09-15T13:50:00Z',
    hasExternalAttendee: true,
    attendeeDeclined: i >= 3,
  }));
  const summary = summarizeConsultations(rows);
  assert.equal(summary.happened, 3);
  assert.equal(summary.noShows, 3);
  assert.equal(summary.markedAttendance, 0);
  assert.equal(summary.rates.attendance, 0);
});

test('lista de reagendadas usa a mesma classificação e contagem do resumo', () => {
  const previous = [{ leadName: 'Lead repetido', phone: '11999990000', isOverbooking: 0, createdAt: '2020-09-14T12:00:00Z' }];
  const rows = [
    { leadName: 'Lead repetido', phone: '11999990000', isOverbooking: 0, createdAt: '2020-09-15T12:00:00Z' },
    { leadName: 'Recuperação manual', isOverbooking: 0, manualStatus: 'reagendar' },
    { leadName: 'Novo', isOverbooking: 0, createdAt: '2020-09-15T13:00:00Z' },
  ];
  const list = rescheduledConsultations(rows, previous);
  assert.deepEqual(list.map(row => row.leadName), ['Lead repetido', 'Recuperação manual']);
  assert.equal(summarizeConsultations(rows, previous).rescheduled, list.length);
});

test('hora encerrada não comprova presença', () => {
  assert.equal(attendanceStatus({ startsAt: '2020-01-01T12:00:00Z', endsAt: '2020-01-01T13:00:00Z', hasExternalAttendee: true }), 'pending');
});

test('data de criação usa São Paulo e rejeita datas impossíveis', () => {
  assert.equal(saoPauloDate('2026-09-16T01:30:00Z'), '2026-09-15');
  assert.equal(saoPauloDate(undefined), '');
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-09-15'), true);
});
