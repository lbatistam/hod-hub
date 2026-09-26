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
  getCalendarStatus,
  getCalendars,
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
import {
  animateButtonFeedback,
  animateChartBars,
  animateDataReady,
  animateLayout,
  animatePanel,
  animateToast,
  captureLayout
} from './app/hod-motion.js';
import './neutral-global.css';

const page = document.body.dataset.page;
let events = [];
let dailyCreatedEvents = [];
let activeDate = selectedDate();
let organogramaMutationInFlight = false;
let analyticsChartEntranceShown = false;

function toast(message) {
  const node = document.getElementById('toast');
  if (!node) {
    return;
  }
  node.textContent = message;
  animateToast(node, true);
  clearTimeout(window.__hodToast);
  window.__hodToast = setTimeout(() => {
    animateToast(node, false);
  }, 2400);
}

function nowLabel() {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date()
  );
}

const syncIcon = '<svg class="sync-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 0-15.2-6.5L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.2 6.5L21 16"/><path d="M16 16h5v5"/></svg>';

function decorateSyncButton(button = document.getElementById('btn-sync')) {
  if (!button || button.querySelector('.sync-icon')) {
    return button;
  }
  button.classList.add('icon-button');
  button.title = 'Sincronizar agora';
  button.innerHTML = `${syncIcon}<span class="sr-only">Sincronizar agora</span>`;
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

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function openOverlay(overlay, trigger = document.activeElement) {
  if (!overlay) {
    return;
  }
  overlay.__returnFocus = trigger instanceof HTMLElement ? trigger : null;
  overlay.classList.add('open');
  document.body.classList.add('has-overlay');
  requestAnimationFrame(() => overlay.querySelector(focusableSelector)?.focus());
}

function closeOverlay(overlay) {
  if (!overlay?.classList.contains('open')) {
    return;
  }
  overlay.classList.remove('open');
  document.body.classList.remove('has-overlay');
  overlay.__returnFocus?.focus();
  overlay.__returnFocus = null;
}

function bindOverlay(overlay, closeControl) {
  if (!overlay) {
    return;
  }
  closeControl?.addEventListener('click', () => closeOverlay(overlay));
  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      closeOverlay(overlay);
    }
  });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeOverlay(overlay);
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = [...overlay.querySelectorAll(focusableSelector)];
    if (!focusable.length) {
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function bindSharedMotion() {
  const acknowledge = event => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const control = event.target.closest('button, a[href], [role="button"], [role="tab"]');
    if (!control || control.matches(':disabled, [aria-disabled="true"]')) {
      return;
    }
    animateButtonFeedback(control);
  };
  document.addEventListener('pointerdown', acknowledge);
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
    mark.textContent = 'H';
  });
  document.querySelectorAll('.brand-sub').forEach(node => node.remove());
  document.querySelectorAll('.nav-link').forEach(link => {
    const label = link.textContent.replace(/\d+$/u, '').trim();
    link.title = label;
    link.setAttribute('aria-label', label);
  });
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
  const duration = event.startsAt && event.endsAt
    ? Math.max(0, Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000))
    : 0;
  const icon = {
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    meet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.25"/><path d="M5.5 20c.4-3.2 2.7-5 6.5-5s6.1 1.8 6.5 5"/></svg>'
  };
  return `<article class="kcard${event.attendeeDeclined ? ' lead-declined' : ''}" draggable="true" data-flip-id="consultoria-${event.id}" data-event-id="${event.id}" data-closer="${escapeHtml(eventOwnerLabel(event))}" data-confirm="${escapeHtml(confirmation)}" data-search="${escapeHtml(`${event.leadName} ${event.phone || ''} ${eventOwnerLabel(event)}`.toLowerCase())}">
    <div class="kcard-top"><span class="ktime">${formatTime(event.startsAt)}${duration ? ` <small>· ${duration} min</small>` : ''}</span><span class="kbadges"><span class="badge ${badgeClass}"><span class="badge-dot"></span>${confirmationLabel(confirmation)}</span>${event.isOverbooking ? '<span class="badge badge-over">OVER</span>' : ''}</span></div>
    <div class="kidentity"><div class="kclient">${escapeHtml(event.leadName)}</div><span class="closer-tag" title="Closer: ${escapeHtml(eventOwnerLabel(event))}" aria-label="Closer: ${escapeHtml(eventOwnerLabel(event))}">${icon.user}<strong>${escapeHtml(eventOwnerLabel(event))}</strong></span></div>
    <div class="kphone-row"><span class="kphone">${escapeHtml(phone)}</span><button class="icon-action" type="button" data-act="copy" aria-label="Copiar telefone" title="Copiar telefone" ${event.phone ? '' : 'disabled'}>${icon.copy}</button></div>
    <div class="k-actions">
      <div class="k-status-actions"><button class="card-action action-confirm" type="button" data-act="confirm">Confirmar</button><button class="card-action action-decline" type="button" data-act="decline">Não confirmar</button><button class="card-action action-noshow" type="button" data-act="no-show">No-show</button></div>
      <div class="k-utility-actions">${event.meetingUrl ? `<button class="card-action action-meet" type="button" data-act="meet" aria-label="Abrir Google Meet">${icon.meet}<span>Google Meet</span></button>` : ''}<button class="card-action action-details" type="button" data-act="details">Detalhes</button></div>
    </div></article>`;
}

const flowLabels = {
  proximas: 'Agendada',
  andamento: 'Acontecendo',
  concluidas: 'Compareceu',
  no_show: 'No-show',
  cancelada: 'Cancelada',
  reagendar: 'Reagendar',
  reagendado: 'Reagendada'
};

function flowChip(event) {
  const flow = eventFlow(event);
  const tone = flow === 'concluidas' ? 'success'
    : ['no_show', 'cancelada'].includes(flow) ? 'danger'
      : ['reagendar', 'reagendado'].includes(flow) ? 'warn'
        : flow === 'andamento' ? 'accent' : 'muted';
  return `<span class="state-chip state-chip--${tone}">${escapeHtml(flowLabels[flow] || flow)}</span>`;
}

function renderConsultationDetails(item) {
  const modal = document.getElementById('modal');
  if (!modal) {
    return;
  }
  modal.dataset.eventId = String(item.id);
  setText('#modal-title', item.leadName);
  setText('#d-date', formatDate(item.eventDate));
  setText('#d-hora', formatTime(item.startsAt));
  setText('#d-closer', eventOwnerLabel(item));
  setText('#d-fone', item.phone || 'Não informado');
  const confirmation = effectiveConfirmation(item);
  const badgeClass = confirmation === 'confirmado' ? 'badge-success'
    : confirmation === 'nao_confirmado' ? 'badge-danger' : 'badge-warn';
  document.getElementById('detail-chips').innerHTML =
    `${flowChip(item)}<span class="badge ${badgeClass}">${escapeHtml(confirmationLabel(confirmation))}</span>${item.isOverbooking ? '<span class="badge badge-over">OVER</span>' : ''}`;
  const notes = document.getElementById('detail-notes');
  notes.hidden = !item.notes?.trim();
  setText('#d-obs', item.notes || '');
  document.getElementById('modal-copy').disabled = !item.phone;
  document.getElementById('modal-meet').disabled = !item.meetingUrl;
  const column = flowToColumn[eventFlow(item)];
  const actionsByColumn = {
    agendada: [['andamento', 'Iniciar'], ['compareceu', 'Compareceu'], ['cancelada', 'Cancelar']],
    acontecendo: [['compareceu', 'Compareceu'], ['no-show', 'No-show'], ['cancelada', 'Cancelar']],
    compareceu: [['agendada', 'Reabrir'], ['no-show', 'No-show'], ['cancelada', 'Cancelar']],
    'no-show': [['agendada', 'Reabrir'], ['compareceu', 'Compareceu'], ['cancelada', 'Cancelar']],
    cancelada: [['agendada', 'Reabrir'], ['compareceu', 'Compareceu']]
  };
  const actions = actionsByColumn[column] || actionsByColumn.agendada;
  document.getElementById('detail-status-actions').innerHTML =
    actions.map(([status, label]) => `<button class="detail-state-button" type="button" data-detail-status="${status}">${label}</button>`).join('');
}

function cardNode(event) {
  const template = document.createElement('template');
  template.innerHTML = card(event).trim();
  return template.content.firstElementChild;
}

function cardSignature(event) {
  return JSON.stringify([
    event.leadName,
    event.phone,
    event.startsAt,
    event.endsAt,
    event.meetingUrl,
    event.attendeeDeclined,
    event.isOverbooking,
    event.manualStatus,
    effectiveConfirmation(event),
    eventOwnerLabel(event)
  ]);
}

function updateCardNode(node, event) {
  const signature = cardSignature(event);
  if (node.dataset.signature === signature) {
    return node;
  }
  const focusedAction = node.contains(document.activeElement)
    ? document.activeElement?.dataset.act
    : null;
  const next = cardNode(event);
  node.className = next.className;
  [...next.attributes].forEach(attribute => node.setAttribute(attribute.name, attribute.value));
  node.innerHTML = next.innerHTML;
  node.dataset.signature = signature;
  if (focusedAction) {
    requestAnimationFrame(() => node.querySelector(`[data-act="${focusedAction}"]`)?.focus());
  }
  return node;
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
  const kanban = document.getElementById('kanban');
  kanban.querySelectorAll('.kcard:not([data-event-id])').forEach(node => node.remove());
  const layoutState = captureLayout(kanban);
  const term = (document.getElementById('campo-busca')?.value || '').toLocaleLowerCase('pt-BR');
  const closerSelect = document.getElementById('f-closer');
  const closers = [...new Set(events.map(eventOwnerLabel))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );
  const requestedCloser = closerSelect?.value || 'todos';
  const closer = requestedCloser === 'todos' || closers.includes(requestedCloser)
    ? requestedCloser
    : 'todos';
  if (closerSelect) {
    closerSelect.innerHTML =
      '<option value="todos">Todos os closers</option>' +
      closers.map(name => `<option>${escapeHtml(name)}</option>`).join('');
    closerSelect.value = closer;
  }
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
  const existingCards = new Map(
    [...kanban.querySelectorAll('.kcard[data-event-id]')].map(node => [node.dataset.eventId, node])
  );
  const visibleIds = new Set();
  document.querySelectorAll('.col[data-col]').forEach(column => {
    const items = groups[column.dataset.col] || [];
    const empty = column.querySelector('.col-empty');
    if (empty) {empty.textContent = 'Nenhuma consultoria neste filtro.';}
    items.forEach(event => {
      const key = String(event.id);
      visibleIds.add(key);
      const node = updateCardNode(existingCards.get(key) || cardNode(event), event);
      empty.before(node);
    });
    empty.style.display = items.length ? 'none' : 'block';
    const count = column.querySelector('.col-count');
    if (count) {
      count.textContent = items.length;
    }
  });
  existingCards.forEach((node, id) => {
    if (!visibleIds.has(id)) {
      node.remove();
    }
  });
  animateLayout(layoutState);
  setText('#date-line', `${todayLong()} · ${events.length} consultorias`);
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

async function loadOrganogramaStable(force = false, scrollTop = window.scrollY) {
  await loadOrganograma(force);
  requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: 'instant' }));
}

async function mutateOrganogramaEvent(item, state, feedback, control) {
  if (organogramaMutationInFlight) {
    return false;
  }
  const scrollTop = window.scrollY;
  const cardElement = control?.closest('.kcard');
  const originalControlLabel = control?.textContent;
  if (control) {
    control.disabled = true;
    control.textContent = 'Salvando…';
  }
  cardElement?.setAttribute('aria-busy', 'true');
  organogramaMutationInFlight = true;
  try {
    await updateEventState(item.id, state);
    await loadOrganogramaStable(false, scrollTop);
    toast(feedback);
    return true;
  } catch (error) {
    requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: 'instant' }));
    showError(error);
    return false;
  } finally {
    cardElement?.removeAttribute('aria-busy');
    if (control) {
      control.disabled = false;
      control.textContent = originalControlLabel;
    }
    organogramaMutationInFlight = false;
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
  const filterPanel = document.getElementById('filter-panel');
  const filterToggle = document.getElementById('filter-toggle');
  filterToggle?.addEventListener('click', () => {
    const willOpen = filterPanel?.dataset.motionState === 'closed' || (filterPanel?.hidden ?? true);
    animatePanel(filterPanel, willOpen);
    filterToggle.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('pointerdown', event => {
    if (
      filterPanel &&
      !filterPanel.hidden &&
      !filterPanel.contains(event.target) &&
      !filterToggle?.contains(event.target)
    ) {
      animatePanel(filterPanel, false);
      filterToggle?.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && filterPanel && !filterPanel.hidden) {
      animatePanel(filterPanel, false);
      filterToggle?.setAttribute('aria-expanded', 'false');
      filterToggle?.focus();
    }
  });
  document.querySelectorAll('[data-confirm-value]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-confirm-value]').forEach(item =>
        item.setAttribute('aria-pressed', String(item === button))
      );
      const select = document.getElementById('f-confirm');
      if (select) {
        select.value = button.dataset.confirmValue;
      }
      renderOrganograma();
    });
  });
  const updateFilterCount = () => {
    const count = Number(document.getElementById('f-closer')?.value !== 'todos') +
      Number(document.getElementById('f-situacao')?.value !== 'todas');
    const badge = document.getElementById('filter-count');
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }
  };
  ['f-closer', 'f-situacao'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', updateFilterCount)
  );
  document.getElementById('clear-filters')?.addEventListener('click', () => {
    document.getElementById('f-closer').value = 'todos';
    document.getElementById('f-situacao').value = 'todas';
    updateFilterCount();
    renderOrganograma();
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
      renderConsultationDetails(item);
      openOverlay(document.getElementById('modal'), click.target.closest('[data-act]'));
    }
    const stateByAction = {
      confirm: { confirmation: 'confirmado' },
      decline: { confirmation: 'nao_confirmado' },
      'no-show': { manualStatus: 'no_show', confirmation: 'nao_confirmado' }
    };
    if (stateByAction[action]) {
      const actionButton = click.target.closest('[data-act]');
      await mutateOrganogramaEvent(
        item,
        stateByAction[action],
        action === 'confirm'
          ? 'Consultoria confirmada.'
          : action === 'decline'
            ? 'Consultoria não confirmada.'
            : 'Consultoria marcada como no-show.',
        actionButton
      );
    }
  });
  document.getElementById('modal')?.addEventListener('click', async click => {
    const modal = document.getElementById('modal');
    const item = events.find(event => String(event.id) === modal.dataset.eventId);
    if (!item) {
      return;
    }
    if (click.target.closest('#modal-copy') && item.phone) {
      await copyText(item.phone);
      toast('Telefone copiado.');
    }
    if (click.target.closest('#modal-meet') && item.meetingUrl) {
      window.open(item.meetingUrl, '_blank', 'noopener');
    }
    const statusButton = click.target.closest('[data-detail-status]');
    if (statusButton) {
      const status = statusButton.dataset.detailStatus;
      const updated = await mutateOrganogramaEvent(
        item,
        { manualStatus: columnToStatus[status] },
        `Consultoria atualizada: ${statusButton.textContent.toLowerCase()}.`,
        statusButton
      );
      if (updated) {
        closeOverlay(modal);
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
      const scrollTop = window.scrollY;
      organogramaMutationInFlight = true;
      await updateEventState(Number(eventId), { manualStatus: columnToStatus[column.dataset.col] });
      await loadOrganogramaStable(false, scrollTop);
      toast('Consultoria movida.');
    } catch (error) {
      await loadOrganogramaStable();
      showError(error);
    } finally {
      organogramaMutationInFlight = false;
      dragged = null;
    }
  });
  bindOverlay(document.getElementById('modal'), document.getElementById('modal-close'));
  window.addEventListener('hod:data-updated', event => {
    const { startDate, endDate, payload } = event.detail || {};
    if (startDate <= activeDate && activeDate <= endDate) {
      if (payload?.events) {
        events = payload.events;
        renderOrganograma();
        setText('#sync-time', nowLabel());
      } else if (!organogramaMutationInFlight) {
        loadOrganogramaStable(false);
      }
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
    setText('#date-line', `${todayLong()} · disponibilidade do Google Agenda`);
    setText('#selected-sub', 'Janelas futuras disponíveis para encaixe');
    setText(
      '#legend-count',
      `${closers.reduce((total, closer) => total + closer.visibleSlots.length, 0)} horários livres`
    );
    animateDataReady(grid);
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
      const stateBadge = event.archived
        ? '<span class="state-chip state-chip--muted">Removida da agenda</span>'
        : flowChip(event);
      return `<tr class="${event.attendeeDeclined ? 'lead-declined' : ''}" data-search="${escapeHtml(`${event.leadName} ${event.phone || ''} ${eventOwnerLabel(event)} ${kind}`.toLowerCase())}" data-kind="${event.summaryKind}">
        <td class="created-lead"><strong>${escapeHtml(event.leadName)}</strong><small>${escapeHtml(event.phone || 'Sem telefone')}</small></td>
        <td><span class="created-kind" data-kind="${event.summaryKind === 'rescheduled' ? 'repeated' : 'new'}">${kind}</span></td>
        <td class="date-cell"><strong>${registeredAt ? formatDateInSaoPaulo(registeredAt) : '—'}</strong><span>${registeredAt ? `às ${formatTime(registeredAt)}` : 'Horário indisponível'}</span></td>
        <td class="date-cell"><strong>${formatDate(event.eventDate)}</strong><span>às ${formatTime(event.startsAt)}</span></td>
        <td><span class="person-chip">${escapeHtml(eventOwnerLabel(event))}</span></td>
        <td>${stateBadge}</td>
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
    animateDataReady([summaryRegion, summaryTableRegion]);
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
  let selectedDailyKind = 'todas';
  const applyCreatedFilters = () => {
    const term = (document.getElementById('campo-busca')?.value || '').toLowerCase();
    document.querySelectorAll('#tbody tr[data-search]').forEach(row => {
      const kindMatches = selectedDailyKind === 'todas' || row.dataset.kind === selectedDailyKind;
      row.hidden = !row.dataset.search.includes(term) || !kindMatches;
    });
    document.querySelectorAll('#tbody .table-group').forEach(group => {
      group.hidden = ![...document.querySelectorAll(`#tbody tr[data-kind="${group.dataset.group}"]`)].some(row => !row.hidden);
    });
  };
  document.querySelector('.daily-kind-filter')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-kind]');
    if (!button) {
      return;
    }
    selectedDailyKind = button.dataset.kind;
    document.querySelectorAll('.daily-kind-filter button').forEach(option => {
      option.setAttribute('aria-pressed', String(option === button));
    });
    applyCreatedFilters();
  });
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

function renderAnalyticsCharts(items, start, end) {
  const normal = items.filter(item => !item.isOverbooking);
  const metric = metricSet(normal);
  if (!normal.length) {
    document.querySelectorAll('[data-od-id^="grafico-"]').forEach(node => {
      node.innerHTML = `<div class="section-head"><h2>${escapeHtml(node.getAttribute('aria-label') || 'Gráfico')}</h2></div><p class="empty">Sem dados neste período.</p>`;
    });
    return metric;
  }
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
      <div class="bar-row"><span class="bar-label">Pendentes ou não confirmadas</span><span class="bar-track"><span class="bar-fill" style="width:${(notConfirmed / max) * 100}%;background:var(--muted)"></span></span><span class="bar-num">${notConfirmed}</span></div>`;
  }
  const attended = normal.filter(item => attendanceStatus(item) === 'attended').length;
  const cancelled = normal.filter(item => item.manualStatus === 'cancelada').length;
  const rescheduled = normal.filter(item => ['reagendar', 'reagendado'].includes(item.manualStatus)).length;
  const noShows = normal.filter(item => isNoShow(item) && !['cancelada', 'reagendar', 'reagendado'].includes(item.manualStatus)).length;
  const other = Math.max(0, normal.length - attended - noShows - cancelled - rescheduled);
  const total = Math.max(1, normal.length);
  const distribution = document.querySelector('[data-od-id="grafico-distribuicao"]');
  if (distribution) {
    const attendedEnd = (attended / total) * 100;
    const noShowEnd = attendedEnd + (noShows / total) * 100;
    const cancelledEnd = noShowEnd + (cancelled / total) * 100;
    const rescheduledEnd = cancelledEnd + (rescheduled / total) * 100;
    distribution.innerHTML = `<div class="section-head"><h2>Distribuição por situação</h2><span class="meta">${normal.length} consultorias</span></div><div class="analytics-donut-layout"><div class="analytics-donut" role="img" aria-label="${attended} compareceram, ${noShows} no-show, ${cancelled} canceladas, ${rescheduled} reagendadas e ${other} outras" style="background:conic-gradient(var(--success) 0 ${attendedEnd}%,var(--danger) ${attendedEnd}% ${noShowEnd}%,var(--fg) ${noShowEnd}% ${cancelledEnd}%,var(--warn) ${cancelledEnd}% ${rescheduledEnd}%,var(--muted) ${rescheduledEnd}% 100%)"></div><div class="legend"><span><i style="background:var(--success)"></i>Compareceu · ${attended}</span><span><i style="background:var(--danger)"></i>No-show · ${noShows}</span><span><i style="background:var(--fg)"></i>Canceladas · ${cancelled}</span><span><i style="background:var(--warn)"></i>Reagendadas · ${rescheduled}</span><span><i style="background:var(--muted)"></i>Outras · ${other}</span></div></div>`;
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
    const closerSelect = document.getElementById('f-closer');
    const closerNames = [...new Set(events.map(eventOwnerLabel).filter(name => name !== 'Over'))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const requestedCloser = closerSelect?.value || 'todos';
    const selectedCloser = requestedCloser === 'todos' || closerNames.includes(requestedCloser)
      ? requestedCloser
      : 'todos';
    if (closerSelect) {
      closerSelect.innerHTML =
        '<option value="todos">Todos os closers</option>' +
        closerNames.map(name => `<option>${escapeHtml(name)}</option>`).join('');
      closerSelect.value = selectedCloser;
    }
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
          return `<tr data-closer="${escapeHtml(owner)}"><td><span class="analytics-rank">${index + 1}</span></td><td><span class="person-chip">${escapeHtml(owner)}</span></td><td class="num">${x.total}</td><td><span class="conv"><span class="conv-track"><span class="conv-fill" style="width:${share}%;background:var(--accent)"></span></span><span class="num">${share}%</span></span></td></tr>`;
        })
        .join('') || '<tr><td colspan="4">Sem dados no período.</td></tr>';
    setText('#table-count', `${rankedGroups.length} closers · ranking por volume`);
    renderAnalyticsCharts(visible, start, end);
    animateDataReady([
      document.querySelector('[data-od-id="indicadores-analytics"]'),
      document.querySelector('[data-od-id="tabela-closers"]'),
      ...document.querySelectorAll('[data-od-id^="grafico-"]')
    ]);
    if (!analyticsChartEntranceShown) {
      analyticsChartEntranceShown = animateChartBars() > 0;
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
    setText('[data-od-id="kpi-total"] .kpi-sub', 'consultorias na data selecionada');
    setText('[data-od-id="kpi-confirmadas"] .kpi-sub', `${m.confirmed}% de confirmação`);
    setText('#kpi-agora-val', events.filter(item => eventFlow(item) === 'andamento').length);
    setText('[data-od-id="kpi-agora"] .kpi-sub', 'consultorias em andamento');
    setText(
      '[data-od-id="kpi-comparecimentos"] .kpi-value',
      events.filter(item => attendanceStatus(item) === 'attended').length
    );
    setText('[data-od-id="kpi-noshow"] .kpi-value', events.filter(isNoShow).length);
    setText('[data-od-id="kpi-noshow"] .kpi-sub', 'na data selecionada');
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
          item => {
            const confirmation = effectiveConfirmation(item);
            const badgeClass = confirmation === 'confirmado' ? 'badge-success' : confirmation === 'nao_confirmado' ? 'badge-danger' : 'badge-warn';
            const duration = item.endsAt && item.startsAt ? Math.max(0, Math.round((new Date(item.endsAt) - new Date(item.startsAt)) / 60000)) : null;
            return `<article class="consulta upcoming-item${item.attendeeDeclined ? ' lead-declined' : ''}" data-status="${escapeHtml(confirmation)}" data-search="${escapeHtml(`${item.leadName} ${eventOwnerLabel(item)} ${item.phone || ''}`.toLowerCase())}"><div class="hora">${formatTime(item.startsAt)}${duration ? `<small>${duration} min</small>` : ''}</div><div class="consulta-main"><div class="consulta-cliente">${escapeHtml(item.leadName)}</div><div class="consulta-sub">${escapeHtml(eventOwnerLabel(item))}${item.phone ? ` · ${escapeHtml(item.phone)}` : ''}</div></div><div class="consulta-side"><span class="badge ${badgeClass}">${escapeHtml(confirmationLabel(confirmation))}</span><a class="upcoming-open" href="organograma.html" aria-label="Abrir ${escapeHtml(item.leadName)} no organograma" title="Abrir no organograma"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></a></div></article>`;
          }
        )
        .join('') || '<p class="empty">Nenhuma consultoria hoje.</p>';
    const pending = events.filter(
      item =>
        effectiveConfirmation(item) === 'neutro' ||
        ['reagendar', 'no_show'].includes(eventFlow(item))
    );
    const pendingSection = document.querySelector('[data-od-id="pendencias"]');
    if (pendingSection) {
      pendingSection.innerHTML = `<div class="section-head"><h2>Pendências</h2><span class="meta num">${pending.length} itens</span></div>${pending.map(item => `<div class="pend-item${item.attendeeDeclined ? ' lead-declined' : ''}"><div class="pend-info"><div class="pend-name">${escapeHtml(item.leadName)}</div><div class="pending-meta"><span class="time-chip">${formatTime(item.startsAt)}</span><span class="person-chip">${escapeHtml(eventOwnerLabel(item))}</span>${flowChip(item)}</div></div><a class="mini-btn" href="organograma.html" aria-label="Abrir ${escapeHtml(item.leadName)} no organograma">Abrir</a></div>`).join('') || '<p class="empty">Nenhuma pendência hoje.</p>'}`;
    }
    animateDataReady([
      document.querySelector('[data-od-id="indicadores-hoje"]'),
      document.getElementById('lista-consultas'),
      pendingSection
    ]);
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
  let activeHomeFilter = 'todas';
  const applyHomeFilters = () => {
    const term = (document.getElementById('campo-busca')?.value || '').toLocaleLowerCase('pt-BR');
    let visible = 0;
    document.querySelectorAll('#lista-consultas [data-search]').forEach(row => {
      const matches = (!term || row.dataset.search.includes(term)) &&
        (activeHomeFilter === 'todas' || row.dataset.status === activeHomeFilter);
      row.hidden = !matches;
      if (matches) {
        visible += 1;
      }
    });
    const empty = document.getElementById('lista-vazia');
    if (empty) {
      empty.style.display = visible ? 'none' : 'block';
    }
  };
  document.getElementById('campo-busca')?.addEventListener('input', applyHomeFilters);
  document.querySelectorAll('[data-filter]').forEach(button =>
    button.addEventListener('click', () => {
      activeHomeFilter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(item =>
        item.setAttribute('aria-pressed', String(item === button))
      );
      applyHomeFilters();
    })
  );
  renderHome();
}

function bindSettings() {
  async function refreshCalendarStatus() {
    const badge = document.getElementById('badge-agenda');
    const info = document.querySelector('.conn .row-sub');
    try {
      const [status, calendarData] = await Promise.all([getCalendarStatus(), getCalendars()]);
      const count = calendarData.calendars?.length || 0;
      const connected = status.authorized && status.reachable;
      if (badge) {
        badge.className = `badge ${connected ? 'badge-success' : 'badge-warn'}`;
        badge.textContent = connected ? 'Conectado' : status.needsReconnect ? 'Reconectar' : 'Indisponível';
      }
      if (info) {info.textContent = `${count} ${count === 1 ? 'agenda' : 'agendas'} · ${connected ? 'sincronização ativa' : (status.message || 'verifique a conexão')}`;}
      if (status.lastSync) {setText('#last-sync', new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(status.lastSync)));}
    } catch (error) {
      if (badge) { badge.className = 'badge badge-warn'; badge.textContent = 'Indisponível'; }
      if (info) {info.textContent = error.message;}
    }
  }
  refreshCalendarStatus();
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
      refreshCalendarStatus();
    } catch (error) {
      showError(error);
    } finally {
      setSyncButtonBusy(button, false);
    }
  });
}

function clearDemonstrationContent() {
  document.querySelectorAll('.nav-count, .nav-badge').forEach(node => node.remove());
  document.querySelectorAll('.demo-note').forEach(node => node.remove());
  document.querySelectorAll('.sync-card').forEach(node => node.remove());
  if (page === 'hod-organograma') {
    document.querySelectorAll('#kanban .kcard').forEach(node => node.remove());
    const select = document.getElementById('f-closer');
    if (select) {
      select.innerHTML = '<option value="todos">Todos os closers</option>';
    }
    document.querySelectorAll('#kanban .col-count').forEach(node => { node.textContent = '—'; });
    document.querySelectorAll('#kanban .col-empty').forEach(node => {
      node.textContent = 'Carregando consultorias…';
      node.style.display = 'block';
    });
    setText('#date-line', 'Carregando consultorias do Google Agenda…');
  }
  if (page === 'hod-home') {
    document.querySelectorAll('[data-od-id^="kpi-"] .kpi-value').forEach(node => {
      const value = node.querySelector('[id]');
      (value || node).textContent = '—';
    });
    document.querySelectorAll('[data-od-id^="kpi-"] .kpi-sub').forEach(node => { node.textContent = ''; });
    document.querySelector('[data-od-id="proxima-consultoria"]')?.setAttribute('hidden', '');
    const list = document.getElementById('lista-consultas');
    if (list) {list.innerHTML = '<p class="empty">Carregando consultorias do Google Agenda…</p>';}
    const pending = document.querySelector('[data-od-id="pendencias"]');
    if (pending) {pending.innerHTML = '<div class="section-head"><h2>Pendências</h2></div><p class="empty">Carregando pendências…</p>';}
    setText('[data-od-id="acesso-horarios"] .quick-desc', 'Carregando horários…');
  }
  if (page === 'hod-availability') {
    document.querySelector('[data-od-id="resumo-closers"]')?.remove();
    const grid = document.getElementById('daily-grid');
    if (grid) {grid.innerHTML = '<p class="empty">Carregando disponibilidade do Google Agenda…</p>';}
    const week = document.getElementById('week-grid');
    if (week) {week.innerHTML = '';}
    const select = document.getElementById('f-closer');
    if (select) {select.innerHTML = '<option value="todos">Todos os closers</option>';}
    setText('#date-line', 'Carregando disponibilidade do Google Agenda…');
    setText('#selected-date', formatDate(activeDate));
    setText('#selected-sub', 'Janelas futuras disponíveis para encaixe');
    setText('#legend-count', 'Carregando horários…');
  }
  if (page === 'hod-daily-summary' || page === 'hod-analytics') {
    document.querySelectorAll('.kpi-value').forEach(node => { node.textContent = '—'; });
    const body = document.getElementById('tbody');
    if (body) {body.innerHTML = '<tr><td colspan="8">Carregando dados do Google Agenda…</td></tr>';}
    setText('#table-count', 'Carregando registros…');
    document.querySelectorAll('[data-od-id="linha-do-dia"], [data-od-id="destaque-agora"], [data-od-id="proximas-acoes"]').forEach(node => node.remove());
    if (page === 'hod-analytics') {
      document.querySelectorAll('[data-od-id^="grafico-"]').forEach(node => {
        node.innerHTML = `<div class="section-head"><h2>${escapeHtml(node.getAttribute('aria-label') || 'Gráfico')}</h2></div><p class="empty">Carregando dados do Google Agenda…</p>`;
      });
    }
    const select = document.getElementById('f-closer');
    if (select) {select.innerHTML = '<option value="todos">Todos os closers</option>';}
    setText('#date-line', 'Carregando dados do Google Agenda…');
  }
  if (page === 'hod-settings') {
    const badge = document.getElementById('badge-agenda');
    if (badge) { badge.className = 'badge badge-muted'; badge.textContent = 'Verificando conexão…'; }
    const agendaInfo = document.querySelector('.conn .row-sub');
    if (agendaInfo) {agendaInfo.textContent = 'Verificando Google Agenda…';}
    setText('#last-sync', '—');
  }
  document.documentElement.removeAttribute('data-hod-boot');
}

async function start() {
  clearDemonstrationContent();
  decorateSyncButton();
  bindSharedMotion();
  document.querySelectorAll('.brand-sub').forEach(node => node.remove());
  document.querySelectorAll('.nav-link').forEach(link => {
    const label = link.textContent.replace(/\d+$/u, '').trim();
    link.title = label;
    link.setAttribute('aria-label', label);
  });
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
