import {
  addDays,
  attendanceStatus,
  completePlatformLogin,
  confirmationLabel,
  copyText,
  dateKey,
  effectiveConfirmation,
  escapeHtml,
  eventFlow,
  eventOwnerLabel,
  formatDate,
  formatDateInSaoPaulo,
  formatTime,
  getMe,
  isNoShow,
  loadAvailability,
  loadDailySummary,
  loadEvents,
  selectedDate,
  setSelectedDate,
  syncEvents,
  updateEventState
} from './app/hod-data.js';
import './neutral-global.css';

const page = document.body.dataset.page;
let events = [];
let dailyCreatedEvents = [];
let activeDate = selectedDate();

function toast(message) {
  const node = document.getElementById('toast');
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(window.__hodToast);
  window.__hodToast = setTimeout(() => node.classList.remove('show'), 2400);
}

function nowLabel() {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date()
  );
}

const syncIcon = '<svg class="sync-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 8.5A7 7 0 0 1 18.5 7M17.9 15.5A7 7 0 0 1 5.5 17"/></svg>';

function decorateSyncButton(button = document.getElementById('btn-sync')) {
  if (!button || button.querySelector('.sync-icon')) {
    return button;
  }
  button.innerHTML = `${syncIcon}<span>Sincronizar agora</span>`;
  button.setAttribute('aria-label', 'Sincronizar dados agora');
  return button;
}

function setSyncButtonBusy(button, busy) {
  if (!button) {
    return;
  }
  decorateSyncButton(button);
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  button.classList.toggle('is-syncing', busy);
  const label = button.querySelector('span');
  if (label) {
    label.textContent = busy ? 'Sincronizando…' : 'Sincronizar agora';
  }
}

function todayLong(value = activeDate) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date(`${value}T12:00:00`));
}

function bindOperationalDateControls(pickerId, render) {
  const picker = document.getElementById(pickerId);
  const applyDate = value => {
    activeDate = value;
    setSelectedDate(activeDate);
    if (picker) {
      picker.value = activeDate;
    }
    setText('#selected-date', formatDate(activeDate));
    render();
  };
  if (picker) {
    picker.value = activeDate;
    picker.addEventListener('change', () => {
      if (picker.value) {
        applyDate(picker.value);
      }
    });
  }
  document.getElementById('prev-day')?.addEventListener('click', () => applyDate(addDays(activeDate, -1)));
  document.getElementById('next-day')?.addEventListener('click', () => applyDate(addDays(activeDate, 1)));
  document.getElementById('today-btn')?.addEventListener('click', () => applyDate(dateKey()));
  setText('#selected-date', formatDate(activeDate));
}

function shiftMonths(value, amount) {
  const [year, month, day] = value.split('-').map(Number);
  const monthIndex = year * 12 + month - 1 + amount;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) {
    node.textContent = value;
  }
}

function showError(error) {
  toast(error?.message || 'Não foi possível carregar os dados.');
}

function applyThemePreference(value = localStorage.getItem('hod-theme') || 'light') {
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const dark = value === 'dark' || (value === 'system' && systemDark);
  document.documentElement.toggleAttribute('data-theme', dark);
  if (dark) {
    document.documentElement.dataset.theme = 'dark';
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  document.querySelectorAll('[data-theme-btn]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.themeBtn === value));
  });
}

function applyZoomPreference(value = localStorage.getItem('hod-zoom') || '100%') {
  const scale = Math.max(0.9, Math.min(1.25, Number.parseInt(value, 10) / 100 || 1));
  document.documentElement.style.setProperty('--hod-ui-scale', String(scale));
  document.documentElement.style.zoom = value === '100%' ? '' : value;
  document.querySelectorAll('[data-zoom-btn]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.zoomBtn === value));
  });
}

async function common() {
  applyThemePreference();
  if (localStorage.getItem('hod-compact-layout-v1')) {
    localStorage.removeItem('hod-compact-layout-v1');
    localStorage.setItem('hod-zoom', '100%');
  }
  applyZoomPreference();
  await completePlatformLogin();
  const user = await getMe();
  const name = user?.name || user?.email?.split('@')[0] || 'Administrador';
  document.querySelectorAll('.admin-name').forEach(node => {
    node.textContent = name;
  });
  document.querySelectorAll('.avatar').forEach(node => {
    node.textContent = name
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase();
  });
  document.querySelectorAll('.demo-note').forEach(node => node.remove());
  document.querySelectorAll('.brand-mark').forEach(mark => {
    mark.innerHTML = '<img src="/images/hod-hub-app-icon.png" alt="">';
  });
  document.querySelectorAll('.brand-sub').forEach(node => node.remove());
  document.querySelectorAll('.admin-role').forEach(node => {
    node.textContent = 'Administrador';
  });
  document.querySelectorAll('.pagefoot .meta').forEach(node => {
    node.textContent = 'Fonte: Google Agenda · dados reais da HOD Platform';
  });
  setText('#sync-time', nowLabel());
  decorateSyncButton();
  document.querySelectorAll('[data-od-id="btn-nova-consultoria"], #btn-nova').forEach(button => {
    button.addEventListener('click', () =>
      window.open('https://calendar.google.com/calendar/u/0/r/eventedit', '_blank', 'noopener')
    );
  });
  return user;
}

function card(event) {
  const confirmation = effectiveConfirmation(event);
  const badgeClass =
    confirmation === 'confirmado'
      ? 'badge-success'
      : confirmation === 'nao_confirmado'
        ? 'badge-danger'
        : 'badge-warn';
  const phone = event.phone || 'Sem telefone cadastrado';
  const icon = {
    confirm: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    decline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>',
    noShow:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    meet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>',
    details:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>'
  };
  return `<article class="kcard${event.attendeeDeclined ? ' lead-declined' : ''}" draggable="true" data-event-id="${event.id}" data-closer="${escapeHtml(eventOwnerLabel(event))}" data-confirm="${escapeHtml(confirmation)}" data-search="${escapeHtml(`${event.leadName} ${event.phone || ''} ${eventOwnerLabel(event)}`.toLowerCase())}">
    <div class="kcard-top"><span class="ktime">${formatTime(event.startsAt)} <small>· 50 min</small></span><span class="kbadges"><span class="badge ${badgeClass}"><span class="badge-dot"></span>${confirmationLabel(confirmation)}</span>${event.isOverbooking ? '<span class="badge badge-over">OVER</span>' : ''}</span></div>
    <div class="kidentity"><div class="kclient">${escapeHtml(event.leadName)}</div><div class="kmeta"><span>Closer</span><strong>${escapeHtml(eventOwnerLabel(event))}</strong></div></div>
    <div class="kphone-row"><span class="kphone">${escapeHtml(phone)}</span><button class="icon-action" type="button" data-act="copy" aria-label="Copiar telefone" title="Copiar telefone" ${event.phone ? '' : 'disabled'}>${icon.copy}</button></div>
    <div class="k-actions">
      <div class="k-status-actions"><button class="card-action action-confirm" type="button" data-act="confirm">Confirmar</button><button class="card-action action-decline" type="button" data-act="decline">Não confirmar</button><button class="card-action action-noshow" type="button" data-act="no-show">No-show</button></div>
      <div class="k-utility-actions">${event.meetingUrl ? `<button class="card-action action-meet" type="button" data-act="meet" aria-label="Abrir Google Meet">${icon.meet}<span>Google Meet</span></button>` : ''}<button class="card-action action-details" type="button" data-act="details">Detalhes</button></div>
    </div></article>`;
}

const flowToColumn = {
  proximas: 'agendada',
  andamento: 'acontecendo',
  concluidas: 'compareceu',
  no_show: 'no-show',
  cancelada: 'cancelada',
  reagendar: 'no-show',
  reagendado: 'no-show'
};
const columnToStatus = {
  agendada: 'agendada',
  acontecendo: 'andamento',
  compareceu: 'compareceu',
  'no-show': 'no_show',
  cancelada: 'cancelada'
};

function renderOrganograma() {
  const term = (document.getElementById('campo-busca')?.value || '').toLocaleLowerCase('pt-BR');
  const closer = document.getElementById('f-closer')?.value || 'todos';
  const situation = document.getElementById('f-situacao')?.value || 'todas';
  const confirmation = document.getElementById('f-confirm')?.value || 'todas';
  const groups = {
    agendada: [],
    acontecendo: [],
    compareceu: [],
    'no-show': [],
    cancelada: []
  };
  events.forEach(event => {
    const column = flowToColumn[eventFlow(event)];
    if (!column) {
      return;
    }
    const text =
      `${event.leadName} ${event.phone || ''} ${eventOwnerLabel(event)}`.toLocaleLowerCase('pt-BR');
    if (term && !text.includes(term)) {
      return;
    }
    if (closer !== 'todos' && eventOwnerLabel(event) !== closer) {
      return;
    }
    if (situation !== 'todas' && column !== situation) {
      return;
    }
    const currentConfirmation = effectiveConfirmation(event);
    const normalizedFilter =
      confirmation === 'confirmada'
        ? 'confirmado'
        : confirmation === 'nao-confirmada'
          ? 'nao_confirmado'
          : confirmation;
    if (normalizedFilter !== 'todas' && currentConfirmation !== normalizedFilter) {
      return;
    }
    groups[column].push(event);
  });
  document.querySelectorAll('.col[data-col]').forEach(column => {
    const items = groups[column.dataset.col] || [];
    column.querySelectorAll('.kcard').forEach(node => node.remove());
    const empty = column.querySelector('.col-empty');
    items.forEach(event => empty.insertAdjacentHTML('beforebegin', card(event)));
    empty.style.display = items.length ? 'none' : 'block';
    const count = column.querySelector('.col-count');
    if (count) {
      count.textContent = items.length;
    }
  });
  setText('#date-line', `${todayLong()} · ${events.length} consultorias`);
  const closers = [...new Set(events.map(eventOwnerLabel))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );
  const select = document.getElementById('f-closer');
  if (select && select.options.length <= 4) {
    select.innerHTML =
      '<option value="todos">Todos os closers</option>' +
      closers.map(name => `<option>${escapeHtml(name)}</option>`).join('');
  }
}

async function loadOrganograma(force = false) {
  const button = document.getElementById('btn-sync');
  setSyncButtonBusy(button, true);
  try {
    const payload = await syncEvents(activeDate, activeDate, force);
    events = payload.events || [];
    renderOrganograma();
    setText('#sync-time', nowLabel());
  } catch (error) {
    showError(error);
  } finally {
    setSyncButtonBusy(button, false);
  }
}

function bindOrganograma() {
  document.querySelector('.col[data-col="reagendar"]')?.remove();
  document.querySelector('#f-situacao option[value="reagendar"]')?.remove();
  bindOperationalDateControls('board-date', () => loadOrganograma());
  ['campo-busca', 'f-closer', 'f-situacao', 'f-confirm'].forEach(id => {
    const node = document.getElementById(id);
    node?.addEventListener('input', renderOrganograma);
    node?.addEventListener('change', renderOrganograma);
  });
  document.getElementById('btn-sync')?.addEventListener('click', () => loadOrganograma(true));
  document.getElementById('kanban')?.addEventListener('click', async click => {
    const cardNode = click.target.closest('.kcard');
    if (!cardNode) {
      return;
    }
    const item = events.find(event => String(event.id) === cardNode.dataset.eventId);
    if (!item) {
      return;
    }
    const action = click.target.closest('[data-act]')?.dataset.act;
    if (action === 'copy') {
      await copyText(item.phone || '');
      toast('Telefone copiado.');
    }
    if (action === 'meet' && item.meetingUrl) {
      window.open(item.meetingUrl, '_blank', 'noopener');
    }
    if (action === 'details') {
      setText('#modal-title', `Detalhes · ${item.leadName}`);
      setText('#d-cliente', item.leadName);
      setText('#d-hora', formatTime(item.startsAt));
      setText('#d-closer', eventOwnerLabel(item));
      setText('#d-fone', item.phone || 'Não informado');
      document.getElementById('modal')?.classList.add('open');
    }
    const stateByAction = {
      confirm: { confirmation: 'confirmado' },
      decline: { confirmation: 'nao_confirmado' },
      'no-show': { manualStatus: 'no_show', confirmation: 'nao_confirmado' }
    };
    if (stateByAction[action]) {
      try {
        await updateEventState(item.id, stateByAction[action]);
        await loadOrganograma();
        toast(
          action === 'confirm'
            ? 'Consultoria confirmada.'
            : action === 'decline'
              ? 'Consultoria não confirmada.'
              : 'Consultoria marcada como no-show.'
        );
      } catch (error) {
        showError(error);
      }
    }
  });
  let dragged = null;
  document.getElementById('kanban')?.addEventListener('dragstart', event => {
    const cardNode = event.target.closest('.kcard');
    dragged = cardNode?.dataset.eventId || null;
    if (!dragged) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragged);
    cardNode.classList.add('dragging');
  });
  document.getElementById('kanban')?.addEventListener('dragover', event => {
    const column = event.target.closest('.col');
    if (column) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.col.is-drop-target').forEach(node => {
        if (node !== column) {
          node.classList.remove('is-drop-target');
        }
      });
      column.classList.add('is-drop-target');
    }
  });
  document.getElementById('kanban')?.addEventListener('dragend', event => {
    event.target.closest('.kcard')?.classList.remove('dragging');
    document
      .querySelectorAll('.col.is-drop-target')
      .forEach(node => node.classList.remove('is-drop-target'));
    dragged = null;
  });
  document.getElementById('kanban')?.addEventListener('drop', async event => {
    const column = event.target.closest('.col');
    const eventId = dragged || event.dataTransfer.getData('text/plain');
    if (!column || !eventId) {
      return;
    }
    event.preventDefault();
    column.classList.remove('is-drop-target');
    const cardNode = document.querySelector(`[data-event-id="${Number(eventId)}"]`);
    const empty = column.querySelector('.col-empty');
    if (cardNode && empty) {
      empty.before(cardNode);
    }
    try {
      await updateEventState(Number(eventId), { manualStatus: columnToStatus[column.dataset.col] });
      await loadOrganograma();
      toast('Consultoria movida.');
    } catch (error) {
      await loadOrganograma();
      showError(error);
    } finally {
      dragged = null;
    }
  });
  document
    .getElementById('modal-close')
    ?.addEventListener('click', () => document.getElementById('modal')?.classList.remove('open'));
  window.addEventListener('hod:data-updated', event => {
    const { startDate, endDate, payload } = event.detail || {};
    if (startDate <= activeDate && activeDate <= endDate) {
      events = payload?.events || [];
      renderOrganograma();
      setText('#sync-time', nowLabel());
    }
  });
  window.setInterval(() => loadOrganograma(false), 60_000);
  loadOrganograma();
}

async function renderAvailability(force = false) {
  const button = document.getElementById('btn-sync');
  if (force) {
    setSyncButtonBusy(button, true);
  }
  try {
    const payload = await loadAvailability(activeDate, { force, manual: force });
    const closers = (payload.closers || [])
      .map(closer => ({
        ...closer,
        visibleSlots: (closer.slots || []).filter(slot => Date.parse(slot.start) >= Date.now())
      }))
      .filter(closer => closer.visibleSlots.length);
    const closerSelect = document.getElementById('f-closer');
    const previousCloser = closerSelect?.value || 'todos';
    if (closerSelect) {
      closerSelect.innerHTML = '<option value="todos">Todos os closers</option>' + closers
        .map(closer => `<option value="${escapeHtml(closer.closer)}">${escapeHtml(closer.closer)}</option>`)
        .join('');
      closerSelect.value = [...closerSelect.options].some(option => option.value === previousCloser)
        ? previousCloser
        : 'todos';
    }
    const selectedCloser = closerSelect?.value || 'todos';
    const timeGroups = new Map();
    closers.forEach(closer => {
      if (selectedCloser !== 'todos' && closer.closer !== selectedCloser) {
        return;
      }
      closer.visibleSlots.forEach(slot => {
        const key = `${slot.startLabel}–${slot.endLabel}`;
        const group = timeGroups.get(key) || {
          key,
          start: slot.start,
          closers: []
        };
        group.closers.push({ name: closer.closer, color: closer.color || '#2f6feb' });
        timeGroups.set(key, group);
      });
    });
    const groupedSlots = [...timeGroups.values()].sort(
      (first, second) => Date.parse(first.start) - Date.parse(second.start)
    );
    const grid = document.getElementById('daily-grid');
    grid.innerHTML =
      groupedSlots
        .map(group => `<article class="availability-time-card"><div class="availability-time-head"><strong>${escapeHtml(group.key)}</strong><span>${group.closers.length} ${group.closers.length === 1 ? 'closer livre' : 'closers livres'}</span></div><div class="availability-tags">${group.closers.map(closer => `<span class="availability-tag"><i style="background:${escapeHtml(closer.color)}"></i>${escapeHtml(closer.name)}</span>`).join('')}</div></article>`)
        .join('') || '<div class="col-empty">Nenhum horário livre neste dia.</div>';
    setText('#selected-date', formatDate(activeDate));
    setText('#date-line', todayLong());
    setText(
      '#legend-count',
      `${closers.reduce((total, closer) => total + closer.visibleSlots.length, 0)} horários livres`
    );
    if (force) {
      setText('#sync-time', nowLabel());
      toast('Horários sincronizados com o Google Agenda.');
    }
  } catch (error) {
    showError(error);
  } finally {
    if (force) {
      setSyncButtonBusy(button, false);
    }
  }
}

function bindAvailability() {
  document.querySelector('[data-od-id="resumo-closers"]')?.remove();
  document.querySelectorAll('.legend-item').forEach(item => item.remove());
  document.getElementById('btn-sync')?.addEventListener('click', () => renderAvailability(true));
  document.getElementById('prev-day')?.addEventListener('click', () => {
    activeDate = addDays(activeDate, -1);
    setSelectedDate(activeDate);
    const picker = document.getElementById('availability-date');
    if (picker) {
      picker.value = activeDate;
    }
    renderAvailability();
  });
  document.getElementById('next-day')?.addEventListener('click', () => {
    activeDate = addDays(activeDate, 1);
    setSelectedDate(activeDate);
    const picker = document.getElementById('availability-date');
    if (picker) {
      picker.value = activeDate;
    }
    renderAvailability();
  });
  document.getElementById('today-btn')?.addEventListener('click', () => {
    activeDate = dateKey();
    setSelectedDate(activeDate);
    const picker = document.getElementById('availability-date');
    if (picker) {
      picker.value = activeDate;
    }
    renderAvailability();
  });
  const availabilityDate = document.getElementById('availability-date');
  if (availabilityDate) {
    availabilityDate.value = activeDate;
    availabilityDate.addEventListener('change', () => {
      if (!availabilityDate.value) {
        return;
      }
      activeDate = availabilityDate.value;
      setSelectedDate(activeDate);
      renderAvailability();
    });
  }
  document.getElementById('f-closer')?.addEventListener('change', () => renderAvailability());
  renderAvailability();
}

function summaryMetrics(summary) {
  return [
    summary.qualified?.total ?? 0,
    summary.scheduled,
    summary.pastMeetings,
    summary.happened,
    summary.noShows
  ];
}

async function renderDaily(force = false) {
  const syncButton = document.getElementById('btn-sync');
  const summaryRegion = document.querySelector('[data-od-id="indicadores-resumo"]');
  const summaryTableRegion = document.querySelector('[data-od-id="tabela-recentes"]');
  summaryRegion?.setAttribute('aria-busy', 'true');
  summaryTableRegion?.setAttribute('aria-busy', 'true');
  if (force) {
    setSyncButtonBusy(syncButton, true);
  }
  const legacyLayout = document.querySelector('.cols');
  const summaryTable = document.querySelector('[data-od-id="tabela-recentes"]');
  if (legacyLayout && summaryTable) {
    legacyLayout.before(summaryTable);
    legacyLayout.remove();
    summaryTable.classList.add('daily-summary-table');
  }
  document.querySelector('[data-od-id="linha-do-dia"]')?.remove();
  document.querySelector('[data-od-id="destaque-agora"]')?.remove();
  document.querySelector('[data-od-id="proximas-acoes"]')?.remove();
  try {
    if (force) {
      await syncEvents(activeDate, activeDate, true);
    }
    const [eventResult, summaryResult] = await Promise.allSettled([
      loadEvents(activeDate, activeDate, { includeFormer: true }),
      loadDailySummary(activeDate)
    ]);
    events = eventResult.status === 'fulfilled' ? eventResult.value.events || [] : [];
    let summary;
    if (summaryResult.status === 'fulfilled') {
      summary = summaryResult.value;
    } else {
      const values = metricSet(events);
      summary = {
        scheduled: events.length,
        pastMeetings: events.filter(item => !item.isOverbooking && item.closer).length,
        happened: events.filter(item => attendanceStatus(item) === 'attended').length,
        noShows: values.noShows,
        qualified: { total: 0, events: [] },
        rescheduledEvents: []
      };
    }
    document.querySelectorAll('[data-od-id^="kpi-"] .kpi-value').forEach((node, index) => {
      node.textContent = summaryMetrics(summary)[index] ?? '—';
    });
    const descriptions = [
      'novos leads agendados no dia',
      'consultorias na agenda do dia',
      'reuniões passadas',
      'reuniões ocorridas',
      'faltas registradas'
    ];
    document.querySelectorAll('[data-od-id^="kpi-"] .kpi-sub').forEach((node, index) => {
      node.textContent = descriptions[index];
    });
    setText('#date-line', todayLong());
    const tbody = document.getElementById('tbody');
    const qualified = (summary.qualified?.events || []).map(event => ({
      ...event,
      summaryKind: 'qualified'
    }));
    const rescheduled = (summary.rescheduledEvents || []).map(event => ({
      ...event,
      summaryKind: 'rescheduled'
    }));
    const items = [...qualified, ...rescheduled];
    dailyCreatedEvents = items;
    const table = tbody.closest('table');
    table.querySelector('thead').innerHTML =
      '<tr><th>Lead</th><th>Tipo</th><th>Criado no Google Agenda</th><th>Reunião</th><th>Responsável</th><th>Situação</th></tr>';
    const row = event => {
      const isRescheduled = event.summaryKind === 'rescheduled';
      const kind = isRescheduled ? 'Reagendada' : 'Qualificado';
      const registeredAt = isRescheduled ? event.rescheduledAt || event.createdAt : event.createdAt;
      const state = event.archived ? 'Removida da agenda' : eventFlow(event);
      return `<tr class="${event.attendeeDeclined ? 'lead-declined' : ''}" data-search="${escapeHtml(`${event.leadName} ${event.phone || ''} ${eventOwnerLabel(event)} ${kind}`.toLowerCase())}" data-kind="${event.summaryKind}">
        <td class="created-lead"><strong>${escapeHtml(event.leadName)}</strong><small>${escapeHtml(event.phone || 'Sem telefone')}</small></td>
        <td><span class="created-kind" data-kind="${event.summaryKind === 'rescheduled' ? 'repeated' : 'new'}">${kind}</span></td>
        <td class="date-cell"><strong>${registeredAt ? formatDateInSaoPaulo(registeredAt) : '—'}</strong><span>${registeredAt ? `às ${formatTime(registeredAt)}` : 'Horário indisponível'}</span></td>
        <td class="date-cell"><strong>${formatDate(event.eventDate)}</strong><span>às ${formatTime(event.startsAt)}</span></td>
        <td>${escapeHtml(eventOwnerLabel(event))}</td>
        <td>${escapeHtml(state)}</td>
      </tr>`;
    };
    tbody.innerHTML =
      items.length
        ? `${qualified.length ? `<tr class="table-group" data-group="qualified"><td colspan="6">Qualificados no dia · ${qualified.length}</td></tr>${qualified.map(row).join('')}` : ''}${rescheduled.length ? `<tr class="table-group" data-group="rescheduled"><td colspan="6">Reagendadas · ${rescheduled.length}</td></tr>${rescheduled.map(row).join('')}` : ''}`
        : '<tr><td colspan="6">Nenhum qualificado ou reagendamento encontrado neste dia.</td></tr>';
    document.querySelector('[data-od-id="tabela-recentes"] h2').textContent =
      'Qualificados no dia';
    setText(
      '#table-count',
      `${qualified.length} qualificados · ${rescheduled.length} reagendadas`
    );
  } catch (error) {
    showError(error);
  } finally {
    summaryRegion?.setAttribute('aria-busy', 'false');
    summaryTableRegion?.setAttribute('aria-busy', 'false');
    if (force) {
      setSyncButtonBusy(syncButton, false);
    }
  }
}

function bindDaily() {
  document.querySelectorAll('[data-od-id^="kpi-"] .kpi-value').forEach(node => {
    node.textContent = '—';
  });
  const initialBody = document.getElementById('tbody');
  if (initialBody) {
    initialBody.innerHTML = '<tr><td colspan="6" class="daily-loading">Carregando dados do dia…</td></tr>';
  }
  bindOperationalDateControls('daily-date', () => renderDaily());
  document
    .getElementById('btn-export')
    ?.addEventListener('click', () =>
      exportCreatedEvents(dailyCreatedEvents, `hod-agendamentos-${activeDate}.csv`)
    );
  document.getElementById('btn-sync')?.addEventListener('click', () => renderDaily(true));
  const applyCreatedFilters = () => {
    const term = (document.getElementById('campo-busca')?.value || '').toLowerCase();
    const kind = document.getElementById('f-situacao')?.value || 'todas';
    document.querySelectorAll('#tbody tr[data-search]').forEach(row => {
      const kindMatches = kind === 'todas' || row.dataset.kind === kind;
      row.hidden = !row.dataset.search.includes(term) || !kindMatches;
    });
    document.querySelectorAll('#tbody .table-group').forEach(group => {
      group.hidden = ![...document.querySelectorAll(`#tbody tr[data-kind="${group.dataset.group}"]`)].some(row => !row.hidden);
    });
  };
  const situation = document.getElementById('f-situacao');
  if (situation) {
    situation.innerHTML =
      '<option value="todas">Todos</option><option value="qualified">Qualificados</option><option value="rescheduled">Reagendadas</option>';
    situation.addEventListener('change', applyCreatedFilters);
  }
  document.getElementById('campo-busca')?.addEventListener('input', applyCreatedFilters);
  renderDaily();
}

function metricSet(items) {
  const normal = items.filter(item => !item.isOverbooking);
  const attended = normal.filter(item => attendanceStatus(item) === 'attended');
  const noShows = normal.filter(isNoShow);
  const confirmed = normal.filter(item => effectiveConfirmation(item) === 'confirmado');
  return {
    total: normal.length,
    confirmed: normal.length ? Math.round((confirmed.length / normal.length) * 100) : 0,
    attended: normal.length ? Math.round((attended.length / normal.length) * 100) : 0,
    noShows: noShows.length,
    cancelled: normal.filter(item => item.manualStatus === 'cancelada').length,
    rescheduled: normal.filter(item => ['reagendar', 'reagendado'].includes(item.manualStatus))
      .length
  };
}

function analyticsSeries(items, start, end) {
  const useMonths = Math.ceil((Date.parse(end) - Date.parse(start)) / 86400000) > 90;
  const buckets = new Map();
  items.filter(item => !item.isOverbooking).forEach(item => {
    const key = useMonths ? item.eventDate.slice(0, 7) : item.eventDate;
    const bucket = buckets.get(key) || { label: key, scheduled: 0, attended: 0, noShows: 0 };
    bucket.scheduled += 1;
    bucket.attended += attendanceStatus(item) === 'attended' ? 1 : 0;
    bucket.noShows += isNoShow(item) ? 1 : 0;
    buckets.set(key, bucket);
  });
  return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function _renderAnalyticsCharts(items, start, end) {
  const normal = items.filter(item => !item.isOverbooking);
  const metric = metricSet(normal);
  const series = analyticsSeries(normal, start, end);
  const maxSeries = Math.max(1, ...series.map(item => Math.max(item.attended, item.noShows)));
  const width = 560;
  const height = 180;
  const points = series.map((item, index) => {
    const x = series.length === 1 ? width / 2 : 40 + (index * (width - 70)) / (series.length - 1);
    const y = 15 + (1 - item.attended / maxSeries) * (height - 35);
    return { ...item, x, y };
  });
  const line = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const evolution = document.querySelector('[data-od-id="grafico-evolucao"]');
  if (evolution) {
    evolution.innerHTML = `<div class="section-head"><h2>Evolução de comparecimentos</h2><span class="meta">${series.length} períodos</span></div>
      <svg viewBox="0 0 560 210" width="100%" role="img" aria-label="Evolução real de comparecimentos"><line x1="40" y1="180" x2="540" y2="180" stroke="var(--border)"/><polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="3.5" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"><title>${escapeHtml(point.label)}: ${point.attended}</title></circle>`).join('')}<text x="40" y="202" font-size="11" fill="var(--muted)">${escapeHtml(points[0]?.label || start)}</text><text x="540" y="202" text-anchor="end" font-size="11" fill="var(--muted)">${escapeHtml(points.at(-1)?.label || end)}</text></svg>`;
  }
  const confirmed = normal.filter(item => effectiveConfirmation(item) === 'confirmado').length;
  const notConfirmed = Math.max(0, normal.length - confirmed);
  const confirmation = document.querySelector('[data-od-id="grafico-confirmadas"]');
  if (confirmation) {
    const max = Math.max(1, confirmed, notConfirmed);
    confirmation.innerHTML = `<div class="section-head"><h2>Confirmação</h2><span class="meta">${confirmed} confirmadas</span></div>
      <div class="bar-row"><span class="bar-label">Confirmadas</span><span class="bar-track"><span class="bar-fill" style="width:${(confirmed / max) * 100}%;background:var(--accent)"></span></span><span class="bar-num">${confirmed}</span></div>
      <div class="bar-row"><span class="bar-label">Não confirmadas</span><span class="bar-track"><span class="bar-fill" style="width:${(notConfirmed / max) * 100}%;background:var(--muted)"></span></span><span class="bar-num">${notConfirmed}</span></div>`;
  }
  const attended = normal.filter(item => attendanceStatus(item) === 'attended').length;
  const noShows = normal.filter(isNoShow).length;
  const cancelled = normal.filter(item => item.manualStatus === 'cancelada').length;
  const rescheduled = normal.filter(item => ['reagendar', 'reagendado'].includes(item.manualStatus)).length;
  const other = Math.max(0, normal.length - attended - noShows);
  const total = Math.max(1, attended + noShows + other);
  const distribution = document.querySelector('[data-od-id="grafico-distribuicao"]');
  if (distribution) {
    const attendedEnd = (attended / total) * 100;
    const noShowEnd = attendedEnd + (noShows / total) * 100;
    distribution.innerHTML = `<div class="section-head"><h2>Distribuição por situação</h2><span class="meta">${normal.length} consultorias</span></div><div class="analytics-donut-layout"><div class="analytics-donut" role="img" aria-label="Gráfico de pizza das situações" style="background:conic-gradient(var(--success) 0 ${attendedEnd}%,var(--danger) ${attendedEnd}% ${noShowEnd}%,var(--muted) ${noShowEnd}% 100%)"></div><div class="legend"><span><i style="background:var(--success)"></i>Compareceu · ${attended}</span><span><i style="background:var(--danger)"></i>No-show · ${noShows}</span><span><i style="background:var(--muted)"></i>Outras · ${other}</span><span><i style="background:var(--warn)"></i>Reagendadas · ${rescheduled}</span><span>Canceladas · ${cancelled}</span></div></div>`;
  }
  const hourly = Array.from({ length: 15 }, (_, index) => ({ hour: index + 8, count: 0 }));
  normal.forEach(item => {
    const hour = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date(item.startsAt)));
    const bucket = hourly.find(entry => entry.hour === hour);
    if (bucket) {
      bucket.count += 1;
    }
  });
  const maxHour = Math.max(1, ...hourly.map(item => item.count));
  const volume = document.querySelector('[data-od-id="grafico-volume"]');
  if (volume) {
    const peak = hourly.reduce((best, item) => item.count > best.count ? item : best, hourly[0]);
    volume.innerHTML = `<div class="section-head"><h2>Volume por horário</h2><span class="meta">pico às ${String(peak.hour).padStart(2, '0')}h · ${peak.count}</span></div><div class="vbars" role="img" aria-label="Volume real por horário">${hourly.map(item => `<div class="vcol"><span class="vbar" title="${item.count} consultorias" style="height:${Math.max(6, (item.count / maxHour) * 132)}px;background:${item.count === peak.count ? 'var(--accent)' : 'color-mix(in oklab, var(--fg), transparent 62%)'}"></span><span class="vlabel">${String(item.hour).padStart(2, '0')}h</span></div>`).join('')}</div>`;
  }
  return metric;
}

async function renderAnalytics(force = false) {
  const period =
    document.querySelector('[data-period][aria-pressed="true"]')?.dataset.period || 'history';
  const today = dateKey();
  const customStart = document.getElementById('range-start')?.value;
  const customEnd = document.getElementById('range-end')?.value;
  const end = period === 'custom' ? customEnd : today;
  const startByPeriod = {
    hoje: today,
    '7d': addDays(today, -6),
    '30d': addDays(today, -29),
    '6m': shiftMonths(today, -6),
    '12m': shiftMonths(today, -12),
    history: '2026-02-01'
  };
  const start = period === 'custom' ? customStart : startByPeriod[period] || addDays(today, -6);
  if (!start || !end || start > end) {
    toast('Escolha um intervalo válido.');
    return;
  }
  try {
    const payload = force
      ? await syncEvents(start, end, true, true)
      : await loadEvents(start, end, { includeFormer: true });
    events = payload.events || [];
    const selectedCloser = document.getElementById('f-closer')?.value || 'todos';
    const selectedSituation = document.getElementById('f-sit')?.value || 'todas';
    const visible = events.filter(
      item =>
        (selectedCloser === 'todos' || eventOwnerLabel(item) === selectedCloser) &&
        (selectedSituation === 'todas' || flowToColumn[eventFlow(item)] === selectedSituation)
    );
    const m = metricSet(visible);
    [
      ['#k-agend', m.total],
      ['#k-conf', `${m.confirmed}%`],
      ['#k-comp', `${m.attended}%`],
      ['#k-ns', m.noShows],
      ['#k-ca', m.cancelled],
      ['#k-re', m.rescheduled]
    ].forEach(([selector, value]) => setText(selector, value));
    const confirmedCount = Math.round((m.total * m.confirmed) / 100);
    const attendedCount = Math.round((m.total * m.attended) / 100);
    setText('[data-od-id="kpi-taxa-confirmacao"] .kpi-sub', `${confirmedCount} de ${m.total} confirmadas`);
    setText('[data-od-id="kpi-taxa-comparecimento"] .kpi-sub', `${attendedCount} comparecimentos registrados`);
    setText('[data-od-id="kpi-noshow"] .kpi-sub', `${m.total ? Math.round((m.noShows / m.total) * 100) : 0}% das agendadas`);
    setText('[data-od-id="kpi-cancel"] .kpi-sub', `${m.cancelled} cancelamentos registrados`);
    setText('[data-od-id="kpi-reag"] .kpi-sub', `${m.rescheduled} registros no período`);
    const displayStart = period === 'history' && events.length
      ? events.map(item => item.eventDate).sort()[0]
      : start;
    setText(
      '#date-line',
      `${formatDate(displayStart)} a ${formatDate(end)} · ${m.total} consultorias no período`
    );
    const groups = Object.entries(
      visible.reduce((map, item) => {
        const owner = eventOwnerLabel(item);
        if (owner === 'Over') {
          return map;
        }
        (map[owner] ||= []).push(item);
        return map;
      }, {})
    );
    const rankedGroups = groups.sort(([, a], [, b]) => {
      const metricA = metricSet(a);
      const metricB = metricSet(b);
      return metricB.total - metricA.total || metricB.attended - metricA.attended;
    });
    document.getElementById('tbody').innerHTML =
      rankedGroups
        .map(([owner, items], index) => {
          const x = metricSet(items);
          const share = m.total ? Math.round((x.total / m.total) * 100) : 0;
          return `<tr data-closer="${escapeHtml(owner)}"><td><span class="analytics-rank">${index + 1}</span></td><td><strong>${escapeHtml(owner)}</strong></td><td class="num">${x.total}</td><td><span class="conv"><span class="conv-track"><span class="conv-fill" style="width:${share}%;background:var(--accent)"></span></span><span class="num">${share}%</span></span></td></tr>`;
        })
        .join('') || '<tr><td colspan="4">Sem dados no período.</td></tr>';
    setText('#table-count', `${rankedGroups.length} closers · ranking por volume`);
    const select = document.getElementById('f-closer');
    const names = groups.map(([name]) => name).sort();
    if (select.options.length <= 4) {
      select.innerHTML =
        '<option value="todos">Todos os closers</option>' +
        names.map(name => `<option>${escapeHtml(name)}</option>`).join('');
    }
  } catch (error) {
    showError(error);
  }
}

function exportEvents(items, filename) {
  const rows = [
    ['Data', 'Horário', 'Lead', 'Responsável', 'Situação'],
    ...items.map(item => [
      item.eventDate,
      formatTime(item.startsAt),
      item.leadName,
      eventOwnerLabel(item),
      eventFlow(item)
    ])
  ];
  const blob = new Blob(
    [
      rows
        .map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';'))
        .join('\n')
    ],
    { type: 'text/csv;charset=utf-8' }
  );
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportCreatedEvents(items, filename) {
  const rows = [
    ['Lead', 'Telefone', 'Tipo', 'Criado em', 'Data da reunião', 'Horário', 'Responsável'],
    ...items.map(item => [
      item.leadName,
      item.phone || '',
      item.creationKind === 'repeated' ? 'Reagendada' : 'Novo lead',
      item.createdAt || '',
      item.eventDate || '',
      formatTime(item.startsAt),
      eventOwnerLabel(item)
    ])
  ];
  const blob = new Blob(
    [
      rows
        .map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';'))
        .join('\n')
    ],
    { type: 'text/csv;charset=utf-8' }
  );
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function bindAnalytics() {
  document.querySelector('[data-od-id="indicadores-analytics"]')?.remove();
  document.querySelectorAll('[data-od-id^="grafico-"]').forEach(node => node.remove());
  document.getElementById('f-sit')?.closest('.field')?.remove();
  const rankingTitle = document.querySelector('[data-od-id="tabela-closers"] h2');
  if (rankingTitle) {
    rankingTitle.textContent = 'Ranking dos closers';
  }
  const rankingHead = document.querySelector('[data-od-id="tabela-closers"] .section-head');
  if (rankingHead) {
    rankingHead.insertAdjacentHTML(
      'afterend',
      '<p class="analytics-note">Ranking pelo volume de consultorias no período selecionado.</p>'
    );
  }
  const rangeStart = document.getElementById('range-start');
  const rangeEnd = document.getElementById('range-end');
  if (rangeStart && rangeEnd) {
    rangeStart.value = addDays(dateKey(), -29);
    rangeEnd.value = dateKey();
  }
  document.querySelectorAll('[data-period]').forEach(button =>
    button.addEventListener('click', () => {
      document
        .querySelectorAll('[data-period]')
        .forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      document.getElementById('custom-range').hidden = button.dataset.period !== 'custom';
      renderAnalytics();
    })
  );
  [rangeStart, rangeEnd].forEach(input =>
    input?.addEventListener('change', () => {
      document
        .querySelectorAll('[data-period]')
        .forEach(item => item.setAttribute('aria-pressed', String(item.dataset.period === 'custom')));
      document.getElementById('custom-range').hidden = false;
      renderAnalytics();
    })
  );
  document.getElementById('f-closer')?.addEventListener('change', () => renderAnalytics());
  document.getElementById('f-sit')?.addEventListener('change', () => renderAnalytics());
  document.getElementById('btn-sync')?.addEventListener('click', async () => {
    const button = document.getElementById('btn-sync');
    setSyncButtonBusy(button, true);
    try {
      await renderAnalytics(true);
      setText('#sync-time', nowLabel());
      toast('Dados sincronizados.');
    } finally {
      setSyncButtonBusy(button, false);
    }
  });
  document
    .getElementById('btn-export')
    ?.addEventListener('click', () => exportEvents(events, 'hod-analytics.csv'));
  document.getElementById('btn-report')?.addEventListener('click', () => window.print());
  renderAnalytics();
}

async function renderHome(force = false) {
  const syncButton = document.getElementById('btn-sync');
  if (force) {
    setSyncButtonBusy(syncButton, true);
  }
  try {
    const payload = await syncEvents(activeDate, activeDate, force);
    events = payload.events || [];
    const m = metricSet(events);
    setText('#saudacao', 'Boa tarde');
    setText('#data-atual', todayLong(activeDate));
    setText('#kpi-total-val', m.total);
    setText('#kpi-conf-val', Math.round((m.total * m.confirmed) / 100));
    setText('#kpi-agora-val', events.filter(item => eventFlow(item) === 'andamento').length);
    setText(
      '[data-od-id="kpi-comparecimentos"] .kpi-value',
      events.filter(item => attendanceStatus(item) === 'attended').length
    );
    setText('[data-od-id="kpi-noshow"] .kpi-value', events.filter(isNoShow).length);
    try {
      const availability = await loadAvailability(activeDate);
      const freeCount = (availability.closers || []).reduce(
        (total, closer) =>
          total + (closer.slots || []).filter(slot => Date.parse(slot.start) >= Date.now()).length,
        0
      );
      setText('[data-od-id="kpi-livres"] .kpi-value', freeCount);
      setText(
        '[data-od-id="acesso-horarios"] .quick-desc',
        `${freeCount} janelas para encaixe hoje.`
      );
    } catch {
      setText('[data-od-id="kpi-livres"] .kpi-value', '—');
    }
    const next = events.find(item => Date.parse(item.startsAt) >= Date.now());
    const nextSection = document.querySelector('[data-od-id="proxima-consultoria"]');
    if (next && nextSection) {
      nextSection.hidden = false;
      setText('[data-od-id="cartao-proxima"] .client-name', next.leadName);
      setText('[data-od-id="cartao-proxima"] .client-meta', eventOwnerLabel(next));
      setText(
        '[data-od-id="cartao-proxima"] .client-avatar',
        next.leadName
          .split(/\s+/)
          .slice(0, 2)
          .map(part => part[0])
          .join('')
          .toUpperCase()
      );
      const values = nextSection.querySelectorAll('.next-item-value');
      if (values[0]) {
        values[0].textContent = formatTime(next.startsAt);
      }
      if (values[1]) {
        values[1].textContent = eventOwnerLabel(next);
      }
      if (values[2]) {
        values[2].textContent = next.meetingUrl ? 'Google Meet' : 'Sem sala informada';
      }
      if (values[3]) {
        values[3].textContent = confirmationLabel(effectiveConfirmation(next));
      }
      const badge = nextSection.querySelector('.badge');
      if (badge) {
        badge.textContent = confirmationLabel(effectiveConfirmation(next));
      }
      const meet = nextSection.querySelector('[data-od-id="btn-abrir-meet"]');
      if (meet) {
        meet.disabled = !next.meetingUrl;
        meet.onclick = () => next.meetingUrl && window.open(next.meetingUrl, '_blank', 'noopener');
      }
      nextSection
        .querySelector('[data-od-id="btn-ver-ficha"]')
        ?.addEventListener('click', () => location.assign('organograma.html'));
      setText('#contagem', formatTime(next.startsAt));
      setText(
        '#countdown-line',
        `${formatDate(next.eventDate)} · ${confirmationLabel(effectiveConfirmation(next))}`
      );
    } else {
      if (nextSection) {
        nextSection.hidden = true;
      }
    }
    const list = document.getElementById('lista-consultas');
    list.innerHTML =
      events
        .slice(0, 12)
        .map(
          item =>
            `<div class="consulta${item.attendeeDeclined ? ' lead-declined' : ''}" data-status="${escapeHtml(effectiveConfirmation(item))}" data-search="${escapeHtml(`${item.leadName} ${eventOwnerLabel(item)}`.toLowerCase())}"><strong>${escapeHtml(item.leadName)}</strong><span>${formatTime(item.startsAt)} · ${escapeHtml(eventOwnerLabel(item))}</span><span class="badge">${escapeHtml(eventFlow(item))}</span></div>`
        )
        .join('') || '<p class="empty">Nenhuma consultoria hoje.</p>';
    const pending = events.filter(
      item =>
        effectiveConfirmation(item) === 'neutro' ||
        ['reagendar', 'no_show'].includes(eventFlow(item))
    );
    const pendingSection = document.querySelector('[data-od-id="pendencias"]');
    if (pendingSection) {
      pendingSection.innerHTML = `<div class="section-head"><h2>Pendências</h2><span class="meta num">${pending.length} itens</span></div>${pending.map(item => `<div class="pend-item${item.attendeeDeclined ? ' lead-declined' : ''}"><div class="pend-info"><div class="pend-name">${escapeHtml(item.leadName)}</div><div class="pend-detail">${formatTime(item.startsAt)} · ${escapeHtml(eventOwnerLabel(item))} · ${escapeHtml(eventFlow(item))}</div></div><a class="mini-btn" href="organograma.html">Abrir</a></div>`).join('') || '<p class="empty">Nenhuma pendência hoje.</p>'}`;
    }
    setText('#sync-time', nowLabel());
  } catch (error) {
    showError(error);
  } finally {
    if (force) {
      setSyncButtonBusy(syncButton, false);
    }
  }
}

function bindHome() {
  bindOperationalDateControls('home-date', () => renderHome());
  document.getElementById('btn-sync')?.addEventListener('click', () => renderHome(true));
  document.getElementById('campo-busca')?.addEventListener('input', event => {
    const term = event.target.value.toLowerCase();
    document.querySelectorAll('#lista-consultas [data-search]').forEach(row => {
      row.hidden = !row.dataset.search.includes(term);
    });
  });
  document.querySelectorAll('[data-filter]').forEach(button =>
    button.addEventListener('click', () => {
      const value = button.dataset.filter;
      document.querySelectorAll('#lista-consultas [data-status]').forEach(row => {
        row.hidden = value !== 'todas' && row.dataset.status !== value;
      });
    })
  );
  renderHome();
}

function bindSettings() {
  document.querySelectorAll('[data-theme-btn]').forEach(button => {
    button.addEventListener('click', () => {
      const value = button.dataset.themeBtn;
      localStorage.setItem('hod-theme', value);
      applyThemePreference(value);
      toast(
        value === 'system'
          ? 'Tema seguindo o sistema.'
          : `Tema ${value === 'dark' ? 'escuro' : 'claro'} ativado.`
      );
    });
  });
  document.querySelectorAll('[data-zoom-btn]').forEach(button => {
    button.addEventListener('click', () => {
      const value = button.dataset.zoomBtn;
      localStorage.setItem('hod-zoom', value);
      applyZoomPreference(value);
      toast(`Zoom da interface em ${value}.`);
    });
  });
  document.getElementById('btn-sync')?.addEventListener('click', async () => {
    const button = document.getElementById('btn-sync');
    setSyncButtonBusy(button, true);
    try {
      await syncEvents(dateKey(), dateKey(), true);
      setText('#last-sync', nowLabel());
      setText('#sync-time', nowLabel());
      toast('Google Agenda sincronizada.');
    } catch (error) {
      showError(error);
    } finally {
      setSyncButtonBusy(button, false);
    }
  });
}

async function start() {
  try {
    await common();
  } catch (error) {
    showError(error);
    return;
  }
  if (page === 'hod-home') {
    bindHome();
  }
  if (page === 'hod-organograma') {
    bindOrganograma();
  }
  if (page === 'hod-availability') {
    bindAvailability();
  }
  if (page === 'hod-daily-summary') {
    bindDaily();
  }
  if (page === 'hod-analytics') {
    bindAnalytics();
  }
  if (page === 'hod-settings') {
    bindSettings();
  }
}

start();
