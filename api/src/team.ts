// Equipe central: deriva de closers (código, fonte oficial V1) + calendars (Google) + users (aprovados).
// Frontends não mantêm lista própria — consomem este endpoint.
import express from 'express';
import { db } from './db.js';
import { requireUser } from './auth.js';
import { configuredClosers } from './rules/closers.js';

export const teamRouter = express.Router();
teamRouter.use(requireUser);

teamRouter.get('/', (req, res) => {
  const calendars = db
    .prepare(
      `SELECT closer_name AS closer, color, closer_role AS role, is_overbooking AS isOverbooking,
       overbooking_from AS overbookingFrom, team_status AS teamStatus, active FROM calendars ORDER BY closer_name`
    )
    .all() as Record<string, unknown>[];
  const users = db
    .prepare(`SELECT id,email,name,avatar_url AS avatarUrl,role,status FROM users ORDER BY name`)
    .all();
  res.json({
    configured: configuredClosers,
    calendars,
    users,
  });
});
