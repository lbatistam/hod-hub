// Histórico unificado: quem alterou, o que alterou, quando e em qual aplicativo.
// Fonte: event_state_history (app_source preenchido em cada PATCH).
import express from 'express';
import { db } from './db.js';
import { requireUser } from './auth.js';

export const historyRouter = express.Router();
historyRouter.use(requireUser);

historyRouter.get('/', (req, res, next) => {
  try {
    const date = String(req.query.date || '');
    const eventId = req.query.eventId ? Number(req.query.eventId) : null;
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    let where = '1=1';
    const params: unknown[] = [];
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      where += ' AND h.event_date = ?';
      params.push(date);
    }
    if (eventId && Number.isInteger(eventId)) {
      where += ' AND h.event_id = ?';
      params.push(eventId);
    }
    const records = db
      .prepare(
        `SELECT h.id, h.event_id AS eventId, h.event_date AS eventDate, h.lead_name AS leadName,
         h.closer_name AS closer, h.previous_status AS previousStatus, h.new_status AS newStatus,
         h.previous_confirmation AS previousConfirmation, h.new_confirmation AS newConfirmation,
         h.notes, h.changed_by AS changedBy, u.email AS changedByEmail, u.name AS changedByName,
         h.app_source AS appSource, h.changed_at AS changedAt
         FROM event_state_history h LEFT JOIN users u ON u.id = h.changed_by
         WHERE ${where} ORDER BY datetime(h.changed_at) DESC LIMIT ?`
      )
      .all(...params, limit);
    res.json({ records });
  } catch (error) {
    next(error);
  }
});
