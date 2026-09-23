// Cliente TypeScript compartilhado — único ponto de acesso dos 3 frontends à HOD Platform.
// Uso:
//   import { createPlatformClient } from '@hod/platform-client';
//   const api = createPlatformClient({ baseUrl: 'http://localhost:8877', app: 'web-v1' });
//   const day = await api.getEvents({ startDate, endDate });
//   api.subscribe((e) => { if (e.type === 'event.state_changed') refresh(); });
export type AppSource = 'web-v1' | 'heroui' | 'shadcn' | 'platform';

export type ManualStatus =
  | null
  | 'compareceu'
  | 'no_show'
  | 'cancelada'
  | 'reagendar'
  | 'reagendado'
  | 'over_sem_atendimento';

export type Confirmation = 'neutro' | 'confirmado' | 'nao_confirmado';

export interface PlatformEvent {
  id: number;
  googleEventId: string;
  eventDate: string;
  title: string;
  leadName: string;
  phone: string | null;
  meetingUrl: string | null;
  startsAt: string;
  endsAt: string;
  attendeeDeclined: number;
  hasExternalAttendee: number;
  closer: string;
  calendarName: string;
  teamStatus: string;
  isOverbooking: number;
  manualStatus: ManualStatus | string | null;
  confirmation: Confirmation | string;
  notes: string | null;
}

export interface StreamEnvelope {
  type:
    | 'event.state_changed'
    | 'daily_entry.updated'
    | 'settings.updated'
    | 'calendars.synced'
    | 'users.updated'
    | 'server.heartbeat'
    | 'server.hello';
  data: unknown;
  at: string;
}

export interface ClientOptions {
  baseUrl: string;
  app: AppSource;
  /** fetch custom (Electron pode injetar); padrão: globalThis.fetch */
  fetchImpl?: typeof fetch;
  getToken?: () => string | null;
}

export function createPlatformClient(opts: ClientOptions) {
  const fetchImpl = opts.fetchImpl || fetch;
  const base = opts.baseUrl.replace(/\/$/, '');

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-HOD-App': opts.app,
      ...((init.headers as Record<string, string>) || {}),
    };
    const token = opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(`${base}${path}`, { ...init, headers, credentials: 'include' });
    if (res.status === 204) return undefined as T;
    const body = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
    if (!res.ok) {
      const err = new Error((body as { message?: string }).message || `HOD Platform: ${(body as { error?: string }).error || res.status}`) as Error & { code?: string; status?: number };
      err.code = (body as { error?: string }).error;
      err.status = res.status;
      throw err;
    }
    return body;
  }

  const get = <T>(p: string) => request<T>(p);
  const post = <T>(p: string, b?: unknown) => request<T>(p, { method: 'POST', body: b === undefined ? undefined : JSON.stringify(b) });
  const patch = <T>(p: string, b?: unknown) => request<T>(p, { method: 'PATCH', body: b === undefined ? undefined : JSON.stringify(b) });
  const put = <T>(p: string, b?: unknown) => request<T>(p, { method: 'PUT', body: b === undefined ? undefined : JSON.stringify(b) });

  return {
    opts,
    health: () => get<{ ok: boolean; app: string; version: string }>('/api/v1/health'),
    openapi: () => get<unknown>('/api/v1/openapi.json'),
    me: () => get<{ user: unknown }>('/api/v1/auth/me'),
    logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),
    loginUrl: () => `${base}/api/v1/auth/google`,
    calStatus: () => get<unknown>('/api/v1/calendar/status'),
    sync: (b: { startDate: string; endDate: string; force?: boolean }) => post<unknown>('/api/v1/calendar/sync', b),
    calendars: () => get<{ calendars: unknown[] }>('/api/v1/calendar/calendars'),
    availability: (date: string) => get<unknown>(`/api/v1/calendar/availability?date=${encodeURIComponent(date)}`),
    getEvents: (q: { startDate: string; endDate: string; includeFormer?: boolean }) =>
      get<{ startDate: string; endDate: string; events: PlatformEvent[] }>(
        `/api/v1/calendar/events?startDate=${encodeURIComponent(q.startDate)}&endDate=${encodeURIComponent(q.endDate)}${q.includeFormer ? '&includeFormer=1' : ''}`
      ),
    getEvent: (id: number) => get<{ event: PlatformEvent; history: unknown[] }>(`/api/v1/calendar/events/${id}`),
    setEventState: (id: number, b: { manualStatus?: ManualStatus | string | null; confirmation?: Confirmation | string; notes?: string | null }) =>
      patch<unknown>(`/api/v1/calendar/events/${id}/state`, b),
    dailyEntry: (date: string) => get<unknown>(`/api/v1/calendar/daily-entry?date=${encodeURIComponent(date)}`),
    patchDailyEntry: (b: Record<string, unknown>) => patch<unknown>('/api/v1/calendar/daily-entry', b),
    leadHistory: (before?: string) => get<unknown>(`/api/v1/calendar/lead-creation-history${before ? `?before=${encodeURIComponent(before)}` : ''}`),
    matchLeads: (b: { before: string; leads: { leadName?: string; phone?: string | null }[] }) =>
      post<unknown>('/api/v1/calendar/lead-creation-history/matches', b),
    settings: () => get<{ settings: Record<string, unknown> }>('/api/v1/settings'),
    putSetting: (key: string, value: unknown) => put<unknown>(`/api/v1/settings/${encodeURIComponent(key)}`, { value }),
    team: () => get<unknown>('/api/v1/team'),
    history: (q: { date?: string; eventId?: number; limit?: number } = {}) => {
      const p = new URLSearchParams();
      if (q.date) p.set('date', q.date);
      if (q.eventId) p.set('eventId', String(q.eventId));
      if (q.limit) p.set('limit', String(q.limit));
      return get<{ records: unknown[] }>(`/api/v1/history?${p}`);
    },
    dailySummary: (date: string) => get<unknown>(`/api/v1/daily-summary?date=${encodeURIComponent(date)}`),
    analytics: (q: { startDate: string; endDate: string; closer?: string; includeFormer?: boolean }) => {
      const p = new URLSearchParams({ startDate: q.startDate, endDate: q.endDate });
      if (q.closer) p.set('closer', q.closer);
      if (q.includeFormer) p.set('includeFormer', '1');
      return get<unknown>(`/api/v1/analytics?${p}`);
    },
    adminUsers: () => get<unknown>('/api/v1/admin/users'),
    adminUpdate: (id: number, b: { role: string; status: string }) => patch<unknown>(`/api/v1/admin/users/${id}`, b),
    /** SSE: retorna unsubscribe. Requer sessão (cookie). */
    subscribe: (onEvent: (e: StreamEnvelope) => void, onError?: (e: Event) => void) => {
      const src = new EventSource(`${base}/api/v1/stream`, { withCredentials: true });
      const types = ['event.state_changed', 'daily_entry.updated', 'settings.updated', 'calendars.synced', 'users.updated', 'server.heartbeat', 'server.hello'];
      const handler = (ev: MessageEvent) => {
        try {
          onEvent(JSON.parse(ev.data) as StreamEnvelope);
        } catch {
          // ignora parse
        }
      };
      for (const t of types) src.addEventListener(t, handler as EventListener);
      if (onError) src.onerror = onError;
      return () => src.close();
    },
  };
}

export type PlatformClient = ReturnType<typeof createPlatformClient>;
