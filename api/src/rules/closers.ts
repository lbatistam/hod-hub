// Fonte oficial: V1 server/closers.js — NÃO alterar nomes/cores/regras sem aprovação.
// Qualquer mudança aqui afeta os 3 apps (é regra central de negócio).
export interface CloserConfig {
  match: string;
  name: string;
  color: string;
  role: 'fixed' | 'overbooking';
  overbookingFrom?: string | null;
  workStart?: string;
  workEnd?: string;
  teamStatus?: 'active' | 'sdr' | 'former' | 'support';
}

const closerConfigs: CloserConfig[] = [
  { match: 'leandro@metodohod.com', name: 'Leandro Galvão', color: '#7c3aed', role: 'fixed' },
  { match: 'rafael@metodohod.com', name: 'Rafael', color: '#f59e0b', role: 'overbooking', overbookingFrom: '2026-07-15' },
  { match: 'misael@metodohod.com', name: 'Misael', color: '#22c55e', role: 'fixed' },
  { match: 'larissa@metodohod.com', name: 'Larissa', color: '#0000ff', role: 'fixed' },
  { match: 'eduardo@metodohod.com', name: 'Eduardo', color: '#eab308', role: 'fixed' },
  { match: 'tulio@metodohod.com', name: 'Túlio', color: '#ec4899', role: 'fixed' },
  { match: 'luigi@metodohod.com', name: 'Luigi', color: '#06b6d4', role: 'fixed' },
  // Álvaro permanece consultável apenas no histórico: hoje atua como SDR, não como closer.
  { match: 'alvaro@metodohod.com', name: 'Álvaro', color: '#84cc16', role: 'fixed', teamStatus: 'sdr' },
  { match: 'paulohenrique@metodohod.com', name: 'Paulo Henrique', color: '#64748b', role: 'fixed' },
  { match: 'reuniao@metodohod.com', name: 'Reunião', color: '#0f766e', role: 'fixed' },
  { match: 'rodrigopereira@metodohod.com', name: 'Rodrigo Pereira', color: '#0d9488', role: 'fixed', teamStatus: 'active' },
  { match: 'karina@metodohod.com', name: 'Karina', color: '#8b5cf6', role: 'fixed', teamStatus: 'former' },
  { match: 'marcos@metodohod.com', name: 'Marcos', color: '#64748b', role: 'fixed', teamStatus: 'former' },
  { match: 'graziela@metodohod.com', name: 'Graziela', color: '#db2777', role: 'fixed', teamStatus: 'former' },
];

export const defaultWorkingHours = { workStart: '08:00', workEnd: '23:00' };

function titleFromCalendar(calendar: { summary?: string; id?: string }): string {
  const source = calendar.summary || calendar.id || 'Agenda';
  const localPart = source.includes('@') ? source.split('@')[0] : source;
  return localPart.replace(/[._-]+/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export interface ResolvedCloser {
  name: string;
  color: string;
  role: 'fixed' | 'overbooking';
  isOverbooking: boolean;
  overbookingFrom: string | null;
  workStart: string;
  workEnd: string;
  teamStatus: 'active' | 'sdr' | 'former' | 'support';
}

export function closerForCalendar(calendar: {
  id?: string;
  summary?: string;
  backgroundColor?: string;
}): ResolvedCloser {
  const haystack = `${calendar.id || ''} ${calendar.summary || ''}`.toLowerCase();
  const configured = closerConfigs.find((c) => haystack.includes(c.match));
  if (configured) {
    return {
      name: configured.name,
      color: configured.color,
      role: configured.role,
      isOverbooking: configured.role === 'overbooking',
      overbookingFrom: configured.overbookingFrom || null,
      workStart: configured.workStart || defaultWorkingHours.workStart,
      workEnd: configured.workEnd || defaultWorkingHours.workEnd,
      teamStatus: configured.teamStatus || 'active',
    };
  }
  return {
    name: titleFromCalendar(calendar),
    color: calendar.backgroundColor || '#0000ff',
    role: 'fixed',
    isOverbooking: false,
    overbookingFrom: null,
    teamStatus: 'active',
    ...defaultWorkingHours,
  };
}

export const configuredClosers = closerConfigs.map(({ match, ...c }) => ({ calendar: match, ...c }));
export const formerClosers = configuredClosers.filter((c) => c.teamStatus === 'former');
export const historicalClosers = configuredClosers.filter((c) =>
  ['former', 'sdr'].includes(c.teamStatus || '')
);
export const configuredCloserEmails = closerConfigs
  .filter((c) => c.match !== 'reuniao@metodohod.com')
  .map((c) => c.match);
