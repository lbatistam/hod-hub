// Fonte oficial: V1 server/admin.js + broadcast users.updated.
import express from 'express';
import { db } from './db.js';
import { requireAdmin } from './auth.js';
import { broadcast } from './stream.js';
import { parseAppSource } from './config.js';

export const adminRouter: express.Router = express.Router();
adminRouter.use(requireAdmin);

adminRouter.get('/users', (req, res) => {
  const users = db
    .prepare(
      `SELECT id,email,name,avatar_url AS avatarUrl,role,status,created_at AS createdAt FROM users ORDER BY name`
    )
    .all();
  res.json({ users });
});

adminRouter.patch('/users/:id', express.json(), (req, res) => {
  const app = parseAppSource(req.headers['x-hod-app']);
  const body = (req.body as Record<string, unknown>) || {};
  const role = String(body.role || '');
  const status = String(body.status || '');
  if (!['admin', 'sdr', 'closer'].includes(role) || !['pending', 'approved', 'suspended'].includes(status)) {
    res.status(400).json({ error: 'invalid_user_update' });
    return;
  }
  const user = db
    .prepare(
      `UPDATE users SET role=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING id,email,name,role,status`
    )
    .get(role, status, Number(req.params.id)) as Record<string, unknown> | undefined;
  if (!user) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }
  broadcast('users.updated', { user, app });
  res.json({ user });
});
