// Regras operacionais oficiais — port fiel da V1. Qualquer falha aqui bloqueia a migração.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractConsultoriaLead, hasFullLeadName, isConsultoriaTitle, isQualifiedConsultoriaTitle } from '../src/rules/calendar-rules.js';
import {
  addOverbookingCounts,
  buildAvailability,
  buildOverbookingSchedule,
} from '../src/rules/availability-rules.js';
import { closerForCalendar, configuredCloserEmails, formerClosers } from '../src/rules/closers.js';
import {
  classifyCreatedLeads,
  effectiveConfirmation,
  eventFlow,
  isNoShow,
  sameLead,
} from '../src/rules/consultation-rules.js';

describe('consultoria title (V1 calendar-rules)', () => {
  it('aceita prefixo HOD + tolera até 2 erros', () => {
    assert.equal(isConsultoriaTitle('HOD - Consultoria Maria'), true);
    assert.equal(isConsultoriaTitle('Consultooria João'), true); // letra repetida
    assert.equal(isConsultoriaTitle('Consutoria Ana'), true); // letra ausente
    assert.equal(isConsultoriaTitle('Reunião semanal'), false);
    assert.equal(isConsultoriaTitle('Mentoria'), false);
    assert.equal(isConsultoriaTitle('Reunião de Consultoria'), false);
  });
  it('extreai lead após o prefixo', () => {
    assert.equal(extractConsultoriaLead('HOD - Consultoria Maria Silva'), 'Maria Silva');
    assert.equal(extractConsultoriaLead('Reunião X'), null);
  });
  it('qualificado exige Consultoria e nome completo', () => {
    assert.equal(isQualifiedConsultoriaTitle('Consultoria Maria Silva'), true);
    assert.equal(isQualifiedConsultoriaTitle('HOD - Consultoria João da Silva'), true);
    assert.equal(isQualifiedConsultoriaTitle('Consultoria Maria'), false);
    assert.equal(isQualifiedConsultoriaTitle('Follow-up Maria Silva'), false);
    assert.equal(hasFullLeadName('Maria Silva'), true);
    assert.equal(hasFullLeadName('Maria'), false);
  });
});

describe('disponibilidade (V1 availability-rules)', () => {
  it('blocos cheios de 1h em horas cheias; invasão parcial elimina o bloco', () => {
    const a = buildAvailability({
      date: '2026-09-14',
      workStart: '08:00',
      workEnd: '10:00',
      busy: [{ start: '2026-09-14T08:30:00-03:00', end: '2026-09-14T08:40:00-03:00' }],
    });
    // 08–09 invadido => só 09–10 livre
    assert.equal(a.slots.length, 1);
    assert.equal(a.slots[0].startLabel, '09:00');
  });
  it('overCount null quando fonte indisponível (nunca presumir zero)', () => {
    const a = buildAvailability({ date: '2026-09-14', workStart: '08:00', workEnd: '09:00', busy: [] });
    const withNull = addOverbookingCounts(a, null);
    assert.equal(withNull.slots[0].overCount, null);
  });
  it('mapa over cobre todas as horas 07–23', () => {
    const hours = buildOverbookingSchedule({ date: '2026-09-14', events: [] });
    assert.equal(hours.length, 16);
    assert.equal(hours[0].startLabel, '07:00');
  });
});

describe('equipe (V1 closers)', () => {
  it('Rafael é over desde 2026-07-15; Álvaro é sdr; 3 former', () => {
    const rafa = closerForCalendar({ id: 'rafael@metodohod.com', summary: 'Rafael' });
    assert.equal(rafa.isOverbooking, true);
    assert.equal(rafa.overbookingFrom, '2026-07-15');
    const alvaro = closerForCalendar({ id: 'alvaro@metodohod.com', summary: 'Álvaro' });
    assert.equal(alvaro.teamStatus, 'sdr');
    assert.equal(formerClosers.length, 3);
    assert.ok(!configuredCloserEmails.includes('reuniao@metodohod.com'));
  });
});

describe('no-show / confirmação / fluxo (V1 hod-data)', () => {
  it('Over nunca é no-show; compareceu absolve riscado; finais contam; declined conta', () => {
    assert.equal(isNoShow({ isOverbooking: true, attendeeDeclined: true }), false);
    assert.equal(isNoShow({ manualStatus: 'compareceu', attendeeDeclined: true }), false);
    for (const s of ['no_show', 'cancelada', 'reagendar', 'reagendado']) {
      assert.equal(isNoShow({ manualStatus: s }), true, s);
    }
    assert.equal(isNoShow({ attendeeDeclined: true }), true);
    assert.equal(isNoShow({ manualStatus: 'agendada', attendeeDeclined: true }), false);
    assert.equal(isNoShow({ manualStatus: 'andamento', attendeeDeclined: true }), false);
    assert.equal(isNoShow({}), false);
  });
  it('finais forçam nao_confirmado', () => {
    assert.equal(effectiveConfirmation({ manualStatus: 'cancelada', confirmation: 'confirmado' }), 'nao_confirmado');
    assert.equal(effectiveConfirmation({ confirmation: 'confirmado' }), 'confirmado');
  });
  it('reagendar tem fila própria mas conta como no-show', () => {
    assert.equal(eventFlow({ manualStatus: 'reagendar' }), 'reagendar');
    assert.equal(isNoShow({ manualStatus: 'reagendar' }), true);
    assert.equal(eventFlow({ manualStatus: 'cancelada' }), 'cancelada');
    assert.equal(eventFlow({ manualStatus: 'agendada', attendeeDeclined: true }), 'proximas');
    assert.equal(eventFlow({ manualStatus: 'andamento', attendeeDeclined: true }), 'andamento');
  });
});

describe('novo x repetido (V1 hod-daily-rules)', () => {
  it('match por telefone ou nome>=4; classifica cronologicamente', () => {
    assert.equal(sameLead({ leadName: 'Maria', phone: '(11) 99999-0001' }, { leadName: 'Outra', phone: '11999990001' }), true);
    assert.equal(sameLead({ leadName: 'Ana Souza' }, { leadName: 'ana souza' }), true);
    assert.equal(sameLead({ leadName: 'Ana' }, { leadName: 'Ana' }), false); // curto
    const { newLeads, repeated } = classifyCreatedLeads(
      [
        { leadName: 'Maria', phone: '11999990001', createdAt: '2026-09-14T10:00:00-03:00' },
        { leadName: 'Maria', phone: '11999990001', createdAt: '2026-09-14T11:00:00-03:00' },
      ],
      [{ leadName: 'João', phone: '11988880002', createdAt: '2026-09-01T10:00:00-03:00' }]
    );
    assert.equal(newLeads.length, 1);
    assert.equal(repeated.length, 1);
  });
});
