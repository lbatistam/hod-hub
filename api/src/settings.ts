// Configurações COMPARTILHADAS (centrais, propagadas via SSE).
// Preferências visuais locais (tema, zoom, densidade, posição da janela) NÃO passam por aqui:
// continuam em localStorage de cada app.
// Regras operacionais, equipe (via /team + closers), horários e negócio: centrais.
import express from 'express';
import { db, getSharedSetting } from './db.js';
import { requireUser } from './auth.js';
import { broadcast } from './stream.js';
import { config, parseAppSource } from './config.js';

export const settingsRouter = express.Router();
settingsRouter.use(requireUser);

type Authed = express.Request & { user: { id: number } };

const EDITABLE_KEYS = ['work_hours', 'slot_config', 'operation', 'business_rules', 'notifications'] as const;
type EditableKey = (typeof EDITABLE_KEYS)[number];

function isEditable(key: string): key is EditableKey {
  return (EDITABLE_KEYS as readonly string[]).includes(key);
}

settingsRouter.get('/', (req, res) => {
  const rows = db.prepare(`SELECT key, value, updated_by AS updatedBy, updated_by_app AS updatedByApp, updated_at AS updatedAt FROM shared_settings ORDER BY key`).all() as {
    key: string;
    value: string;
    updatedBy: number | null;
    updatedByApp: string;
    updatedAt: string;
  }[];
  const settings: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      settings[r.key] = { value: JSON.parse(r.value), updatedBy: r.updatedBy, updatedByApp: r.updatedByApp, updatedAt: r.updatedAt };
    } catch {
      settings[r.key] = { value: r.value, updatedBy: r.updatedBy, updatedByApp: r.updatedByApp, updatedAt: r.updatedAt };
    }
  }
  res.json({ settings });
});

settingsRouter.get('/:key', (req, res) => {
  const row = db.prepare(`SELECT key, value, updated_by AS updatedBy, updated_by_app AS updatedByApp, updated_at AS updatedAt FROM shared_settings WHERE key=?`).get(req.params.key) as
    | { key: string; value: string; updatedBy: number | null; updatedByApp: string; updatedAt: string }
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'setting_not_found' });
    return;
  }
  try {
    res.json({ key: row.key, value: JSON.parse(row.value), updatedBy: row.updatedBy, updatedByApp: row.updatedByApp, updatedAt: row.updatedAt });
  } catch {
    res.json({ key: row.key, value: row.value, updatedBy: row.updatedBy, updatedByApp: row.updatedByApp, updatedAt: row.updatedAt });
  }
});

settingsRouter.put('/:key', express.json(), (req, res) => {
  const user = (req as unknown as Authed).user;
  // Apenas admin altera regra operacional central (mesma guarda da V1 para /admin).
  const me = db.prepare(`SELECT role FROM users WHERE id=?`).get(user.id) as { role: string } | undefined;
  if (me?.role !== 'admin') {
    res.status(403).json({ error: 'admin_required' });
    return;
  }
  const key = req.params.key;
  if (!isEditable(key)) {
    res.status(400).json({ error: 'setting_not_editable', editable: EDITABLE_KEYS });
    return;
  }
  const body = (req.body as Record<string, unknown>) || {};
  if (!Object.hasOwn(body, 'value')) {
    res.status(400).json({ error: 'value_required' });
    return;
  }
  // Validação mínima por chave (regras operacionais nunca podem ficar inválidas)
  if (key === 'work_hours') {
    const v = body.value as Record<string, string>;
    if (!/^\d{2}:\d{2}$/.test(String(v.workStart)) || !/^\d{2}:\d{2}$/.test(String(v.workEnd))) {
      res.status(400).json({ error: 'invalid_work_hours' });
      return;
    }
  }
  if (key === 'slot_config') {
    const v = body.value as Record<string, number>;
    if (![30, 45, 60].includes(Number(v.durationMinutes)) && Number(v.durationMinutes) !== 60) {
      // Platform fixa 60/60 (regra V1 4.1.1); aceita apenas 60 por enquanto.
      res.status(400).json({ error: 'invalid_slot_config', message: 'durationMinutes deve ser 60 (regra V1 4.1.1).' });
      return;
    }
  }
  const app = parseAppSource(req.headers['x-hod-app']);
  const value = JSON.stringify(body.value);
  db.prepare(
    `INSERT INTO shared_settings (key, value, updated_by, updated_by_app, updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_by_app=excluded.updated_by_app, updated_at=CURRENT_TIMESTAMP`
  ).run(key, value, user.id, app);
  broadcast('settings.updated', { key, value: body.value, by: user.id, app });
  res.json({ key, value: body.value, updatedBy: user.id, updatedByApp: app });
});

export function readWorkHours(): { workStart: string; workEnd: string } {
  return getSharedSetting('work_hours', { workStart: '08:00', workEnd: '23:00' });
}

export { config };
