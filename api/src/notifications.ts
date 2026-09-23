// Fonte oficial: V1 server/notifications.js (macOS via osascript; 501 fora darwin).
import express from 'express';
import { execFile } from 'node:child_process';
import { requireUser } from './auth.js';

export const notificationsRouter = express.Router();
notificationsRouter.use(requireUser);

notificationsRouter.post('/macos', async (req, res, next) => {
  try {
    if (process.platform !== 'darwin') {
      res.status(501).json({ error: 'notifications_unavailable' });
      return;
    }
    const body = (req.body as Record<string, unknown>) || {};
    const title = String(body.title || 'HOD Platform').slice(0, 100);
    const text = String(body.body || '');
    if (!text) {
      res.status(400).json({ error: 'body_required' });
      return;
    }
    const sound = body.sound ? String(body.sound) : null;
    const script = sound
      ? `display notification ${JSON.stringify(text.slice(0, 300))} with title ${JSON.stringify(title)} sound name ${JSON.stringify(sound)}`
      : `display notification ${JSON.stringify(text.slice(0, 300))} with title ${JSON.stringify(title)}`;
    await new Promise<void>((resolve, reject) => {
      execFile('/usr/bin/osascript', ['-e', script], (error) => (error ? reject(error) : resolve()));
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
