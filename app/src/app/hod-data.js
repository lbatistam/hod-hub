// Cliente único da HOD Platform. O frontend não mantém banco nem API próprios.
const API_ROOT = 'http://localhost:8877/api/v1';
const PLATFORM_TOKEN_KEY = 'hod-platform-token:v1';
const EVENT_CACHE_PREFIX = 'hod-events:v1:';
const backgroundSyncs = new Map();
const memoryEventCache = new Map();
const inflightEventLoads = new Map();
const inflightAvailabilityLoads = new Map();
let eventCacheGeneration = 0;
let cachedUser = null;
let stopPlatformStream = null;

function syncSignal(type, detail = {}) {
  window.dispatchEvent(new CustomEvent(`hod:sync-${type}`, { detail }));
}

function eventCacheKey(startDate, endDate, includeFormer) {
  return `${EVENT_CACHE_PREFIX}${startDate}:${endDate}:${includeFormer ? 1 : 0}`;
}

function readEventCache(startDate, endDate, includeFormer) {
  const key = eventCacheKey(startDate, endDate, includeFormer);
  if (memoryEventCache.has(key)) {
    return memoryEventCache.get(key);
  }
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (cached?.payload) {
      memoryEventCache.set(key, cached.payload);
      return cached.payload;
    }
    return null;
  } catch {
    return null;
  }
}

function writeEventCache(startDate, endDate, includeFormer, payload) {
  const key = eventCacheKey(startDate, endDate, includeFormer);
  memoryEventCache.set(key, payload);
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        savedAt: Date.now(),
        payload
      })
    );
  } catch {
    // Se o navegador estiver sem espaço, o banco local continua sendo a fonte.
  }
}

function clearEventCache() {
  eventCacheGeneration += 1;
  memoryEventCache.clear();
  inflightEventLoads.clear();
  Object.keys(sessionStorage)
    .filter(key => key.startsWith(EVENT_CACHE_PREFIX))
    .forEach(key => sessionStorage.removeItem(key));
}

export function initPlatformRealtime() {
  if (stopPlatformStream) {
    return stopPlatformStream;
  }
  const source = new EventSource(`${API_ROOT}/stream`, { withCredentials: true });
  const refresh = event => {
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch {
      // Frames de keep-alive não alteram a interface.
    }
    clearEventCache();
    window.dispatchEvent(
      new CustomEvent('hod:data-updated', {
        detail: { startDate: '0000-01-01', endDate: '9999-12-31', platformEvent: payload }
      })
    );
  };
  [
    'event.state_changed',
    'daily_entry.updated',
    'settings.updated',
    'calendars.synced',
    'users.updated'
  ].forEach(type => source.addEventListener(type, refresh));
  stopPlatformStream = () => {
    source.close();
    stopPlatformStream = null;
  };
  return stopPlatformStream;
}

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function selectedDate() {
  const requested = new URLSearchParams(location.search).get('date');
  return /^\d{4}-\d{2}-\d{2}$/.test(requested || '') ? requested : dateKey();
}

export function setSelectedDate(value) {
  const url = new URL(location.href);
  url.searchParams.set('date', value);
  history.replaceState(null, '', url);
}

export function formatDate(value, options = {}) {
  const { short = false, ...dateOptions } = options;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: short ? 'short' : 'long',
    year: 'numeric',
    ...dateOptions
  }).format(new Date(`${value}T12:00:00`));
}

export function formatTime(value) {
  if (!value || Number.isNaN(Date.parse(value))) {
    return '—';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value));
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function api(path, options = {}) {
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  const platformToken = localStorage.getItem(PLATFORM_TOKEN_KEY);
  if (platformToken) {
    headers.Authorization = `Bearer ${platformToken}`;
  }
  if (options.body && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }
  let response;
  const attempts = options.method && options.method !== 'GET' ? 2 : 3;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      response = await fetch(`${API_ROOT}${path}`, {
        credentials: 'include',
        mode: 'cors',
        ...options,
        headers,
        signal: window.AbortSignal.timeout(25_000)
      });
      break;
    } catch (error) {
      if (attempt === attempts - 1) {
        const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
        throw new Error(
          timedOut
            ? 'A atualização demorou além do esperado. Seus dados foram preservados; tente novamente.'
            : 'O HOD Hub perdeu a conexão local. Aguarde alguns segundos e tente novamente.',
          {
            cause: error
          }
        );
      }
      await new Promise(resolve => window.setTimeout(resolve, 350 + attempt * 450));
    }
  }
  if (response.status === 401) {
    localStorage.removeItem(PLATFORM_TOKEN_KEY);
    cachedUser = null;
    sessionStorage.removeItem('hod-user:v1');
    location.href = '/production/login.html';
    throw new Error('Sua sessão expirou. Entre novamente.');
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || 'Não foi possível carregar os dados.');
    error.code = payload?.error;
    error.requestId = payload?.requestId;
    throw error;
  }
  return payload;
}

export async function completePlatformLogin() {
  const url = new URL(location.href);
  const ticket = url.searchParams.get('ticket');
  if (!ticket) {
    return null;
  }
  const response = await fetch(`${API_ROOT}/auth/native-exchange`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'X-HOD-App': 'web-v1'
    },
    body: JSON.stringify({ ticket, mode: 'web' }),
    signal: window.AbortSignal.timeout(25_000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.user) {
    throw new Error(payload?.message || 'Não foi possível concluir o login. Tente novamente.');
  }
  // A sessão web fica no cookie HttpOnly da Platform. Remove o token legado
  // para não deixar uma sessão antiga competir com o login atual.
  localStorage.removeItem(PLATFORM_TOKEN_KEY);
  cachedUser = payload.user;
  sessionStorage.setItem('hod-user:v1', JSON.stringify({ user: cachedUser }));
  url.searchParams.delete('ticket');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  return cachedUser;
}

export async function getMe() {
  if (cachedUser) {
    return cachedUser;
  }
  try {
    const stored = JSON.parse(sessionStorage.getItem('hod-user:v1') || 'null');
    if (stored?.user) {
      cachedUser = stored.user;
      return cachedUser;
    }
  } catch {
    // A sessão da API continua sendo a fonte oficial.
  }
  const data = await api('/auth/me');
  cachedUser = data.user;
  try {
    sessionStorage.setItem('hod-user:v1', JSON.stringify({ user: cachedUser }));
  } catch {
    // Cache opcional.
  }
  return cachedUser;
}

export async function loadEvents(startDate, endDate = startDate, { includeFormer = false } = {}) {
  const cached = readEventCache(startDate, endDate, includeFormer);
  if (cached) {
    return cached;
  }
  return fetchEvents(startDate, endDate, includeFormer);
}

export async function loadDailySummary(date) {
  return api(`/daily-summary?${new URLSearchParams({ date, includeFormer: '1' })}`);
}

async function fetchEvents(startDate, endDate, includeFormer) {
  const key = eventCacheKey(startDate, endDate, includeFormer);
  if (inflightEventLoads.has(key)) {
    return inflightEventLoads.get(key);
  }
  const params = new URLSearchParams({ startDate, endDate });
  if (includeFormer) {
    params.set('includeFormer', '1');
  }
  const generation = eventCacheGeneration;
  const task = api(`/calendar/events?${params}`)
    .then(payload => {
      payload.events = sortEventsChronologically(payload.events || []);
      // Uma leitura iniciada antes de uma mudança manual não pode recolocar
      // o card no estado antigo depois que o usuário solta no Kanban.
      if (generation === eventCacheGeneration) {
        writeEventCache(startDate, endDate, includeFormer, payload);
      }
      return payload;
    })
    .finally(() => {
      if (inflightEventLoads.get(key) === task) {
        inflightEventLoads.delete(key);
      }
    });
  inflightEventLoads.set(key, task);
  return task;
}

export function warmEventDates(centerDate, radius = 2) {
  const warm = () => {
    for (let offset = -radius; offset <= radius; offset += 1) {
      if (offset === 0) {
        continue;
      }
      const date = addDays(centerDate, offset);
      loadEvents(date).catch(() => {});
    }
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 1200 });
  } else {
    window.setTimeout(warm, 180);
  }
}

export function sortEventsChronologically(events = []) {
  return [...events].sort((left, right) => {
    const timeDifference = Date.parse(left.startsAt) - Date.parse(right.startsAt);
    if (timeDifference) {
      return timeDifference;
    }
    return String(left.leadName || '').localeCompare(String(right.leadName || ''), 'pt-BR');
  });
}

export async function loadAvailability(
  date,
  { silent = false, force = false, manual = false } = {}
) {
  const cacheKey = `hod-availability:v1:${date}`;
  let cached = null;
  try {
    cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
  } catch {
    // Segue para a consulta real.
  }
  const fetchFresh = async ({ announce = false } = {}) => {
    if (inflightAvailabilityLoads.has(cacheKey)) {
      return inflightAvailabilityLoads.get(cacheKey);
    }
    const params = new URLSearchParams({ date });
    const operationId = `availability:${date}:${Date.now()}`;
    if (announce) {
      syncSignal('start', { operationId, manual });
    }
    const task = api(`/calendar/availability?${params}`)
      .then(payload => {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), payload }));
        } catch {
          // Cache opcional.
        }
        window.dispatchEvent(new CustomEvent('hod:availability-updated', { detail: { date } }));
        if (announce) {
          syncSignal('end', { operationId, manual });
        }
        return payload;
      })
      .catch(error => {
        if (announce) {
          syncSignal('error', { operationId, manual, message: error.message });
        }
        throw error;
      })
      .finally(() => inflightAvailabilityLoads.delete(cacheKey));
    inflightAvailabilityLoads.set(cacheKey, task);
    return task;
  };

  if (!force && cached?.payload) {
    if (Date.now() - cached.savedAt >= 55_000) {
      fetchFresh().catch(() => {});
    }
    return cached.payload;
  }
  return fetchFresh({ announce: force && !silent });
}

export async function syncEvents(
  startDate,
  endDate = startDate,
  force = false,
  includeFormer = false,
  { silent = false } = {}
) {
  const cacheKey = `hod-sync:v3:${startDate}:${endDate}`;
  const lastSync = Number(sessionStorage.getItem(cacheKey) || 0);
  const cachedPayload = readEventCache(startDate, endDate, includeFormer);
  const performSync = async () => {
    const operationId = `calendar:${startDate}:${endDate}:${Date.now()}`;
    const announce = force && !silent;
    if (announce) {
      syncSignal('start', { operationId, manual: force });
    }
    try {
      const result = await api('/calendar/sync', {
        method: 'POST',
        body: JSON.stringify({ startDate, endDate, force })
      });
      if (!result.background) {
        sessionStorage.setItem(cacheKey, String(Date.now()));
        sessionStorage.setItem('hod-last-sync', result.syncedAt || new Date().toISOString());
      } else {
        window.setTimeout(
          () => syncEvents(startDate, endDate, false, includeFormer, { silent }),
          1800
        );
      }
      const payload = await fetchEvents(startDate, endDate, includeFormer);
      window.dispatchEvent(
        new CustomEvent('hod:data-updated', {
          detail: { startDate, endDate, payload }
        })
      );
      if (announce) {
        syncSignal('end', { operationId, manual: force });
      }
      return payload;
    } catch (error) {
      if (announce) {
        syncSignal('error', { operationId, manual: force, message: error.message });
      }
      throw error;
    }
  };

  if (force) {
    return performSync();
  }

  if (Date.now() - lastSync > 55_000 && !backgroundSyncs.has(cacheKey)) {
    const task = performSync()
      .catch(() => null)
      .finally(() => backgroundSyncs.delete(cacheKey));
    backgroundSyncs.set(cacheKey, task);
  }

  if (cachedPayload) {
    return cachedPayload;
  }
  return loadEvents(startDate, endDate, { includeFormer });
}

export async function updateEventState(eventId, patch) {
  const result = await api(`/calendar/events/${eventId}/state`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  clearEventCache();
  return result;
}

export async function loadDailyEntry(date) {
  return api(`/calendar/daily-entry?date=${encodeURIComponent(date)}`);
}

export async function updateDailyEntry(date, patch) {
  return api('/calendar/daily-entry', {
    method: 'PATCH',
    body: JSON.stringify({ date, ...patch })
  });
}

export function eventOwnerLabel(event) {
  return event.isOverbooking ? 'Over' : event.closer || 'Sem closer';
}

export function isNoShow(event) {
  if (event.isOverbooking) {
    return false;
  }
  // Uma correção manual explícita de comparecimento pode desfazer um falso
  // positivo. Cancelar ou reagendar localmente, porém, não pode esconder que
  // o dono da agenda recusou o evento no Google.
  if (event.manualStatus === 'compareceu') {
    return false;
  }
  if (['no_show', 'cancelada', 'reagendar', 'reagendado'].includes(event.manualStatus)) {
    return true;
  }
  if (event.attendeeDeclined) {
    return true;
  }
  return false;
}

export function attendanceStatus(event) {
  if (event.isOverbooking) {
    return 'over';
  }
  if (event.manualStatus === 'compareceu') {
    return 'attended';
  }
  if (isNoShow(event)) {
    return 'no_show';
  }
  if (event.manualStatus) {
    return event.manualStatus;
  }
  if (!event.hasExternalAttendee) {
    return 'ambiguous';
  }
  return 'pending';
}

export function eventFlow(event, now = new Date()) {
  if (event.manualStatus === 'over_sem_atendimento') {
    return 'reagendar';
  }
  // Reagendar continua numa fila operacional própria, embora conte como
  // No-Show nos indicadores de presença.
  if (event.manualStatus === 'reagendar') {
    return 'reagendar';
  }
  if (event.manualStatus === 'reagendado') {
    return 'reagendado';
  }
  // Cancelamentos continuam contando no histórico de no-show, mas no
  // Kanban precisam permanecer visualmente na coluna Canceladas.
  if (event.manualStatus === 'cancelada') {
    return 'cancelada';
  }
  if (isNoShow(event)) {
    return 'no_show';
  }
  if (event.manualStatus === 'compareceu') {
    return 'concluidas';
  }
  if (event.manualStatus) {
    return event.manualStatus;
  }
  const start = new Date(event.startsAt);
  const automaticEnd = new Date(start.getTime() + 50 * 60 * 1000);
  if (now < start) {
    return 'proximas';
  }
  if (now < automaticEnd) {
    return 'andamento';
  }
  return 'concluidas';
}

export function whatsappText(event, overPrefix = false) {
  const prefix = overPrefix && event.isOverbooking ? '🚨 *OVER*\n' : '';
  return `${prefix}*${event.leadName} - ${formatTime(event.startsAt)}*\nTelefone: ${event.phone || 'Sem telefone cadastrado'}\nLink: ${event.meetingUrl || 'Sem link cadastrado'}`;
}

export async function copyText(value) {
  await navigator.clipboard.writeText(value);
}

export function confirmationLabel(value) {
  return value === 'confirmado'
    ? 'Confirmado'
    : value === 'nao_confirmado'
      ? 'Não confirmado'
      : 'Confirmação pendente';
}

export function effectiveConfirmation(event) {
  if (['no_show', 'cancelada', 'reagendar', 'reagendado'].includes(event.manualStatus)) {
    return 'nao_confirmado';
  }
  return event.confirmation || 'neutro';
}

export function initials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase() || 'HH'
  );
}
