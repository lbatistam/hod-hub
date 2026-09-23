// Fonte oficial: V1 server/auth.js. Diferenças Platform:
// - rotas sob /api/v1/auth (montado em app.ts);
// - aceita sessão via cookie hod_session OU Authorization: Bearer (Electron/shadcn);
// - registra X-HOD-App apenas para auditoria (não bloqueia valores desconhecidos).
import express from 'express';
import { config } from './config.js';
import { db } from './db.js';
import { decrypt, encrypt, hashToken, randomToken } from './security.js';

export const authRouter: express.Router = express.Router();
export const sessionCookie = 'hod_session';
const googleScopes = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar'];

function parseCookies(header = ''): Record<string, string> {
  const pairs = header
    .split(';')
    .map((part): [string, string] => {
      const sep = part.indexOf('=');
      if (sep < 0) return [part.trim(), ''];
      const k = part.slice(0, sep).trim();
      const raw = part.slice(sep + 1);
      try {
        return [decodeURIComponent(k), decodeURIComponent(raw)];
      } catch {
        return [k, ''];
      }
    })
    .filter(([k]) => Boolean(k));
  return Object.fromEntries(pairs);
}

function tokenFrom(req: express.Request): string | null {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim() || null;
  return parseCookies(req.headers.cookie || '')[sessionCookie] || null;
}

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  status: string;
}

export function currentUser(req: express.Request): SessionUser | null {
  const token = tokenFrom(req);
  if (!token) return null;
  try {
    return (
      db
        .prepare(
          `SELECT users.id, users.email, users.name, users.avatar_url AS avatarUrl, users.role, users.status
           FROM sessions JOIN users ON users.id = sessions.user_id
           WHERE sessions.token_hash = ? AND sessions.expires_at > ?`
        )
        .get(hashToken(token), Date.now()) as SessionUser | undefined
    ) || null;
  } catch (error) {
    console.warn('Sessão local ignorada.', (error as Error).message);
    return null;
  }
}

export function requireUser(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'authentication_required' });
    return;
  }
  if (user.status !== 'approved') {
    res.status(403).json({ error: 'approval_required', user });
    return;
  }
  (req as unknown as { user: SessionUser }).user = user;
  next();
}

export function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  requireUser(req, res, () => {
    const user = (req as unknown as { user: SessionUser }).user;
    if (user.role === 'admin') next();
    else res.status(403).json({ error: 'admin_required' });
  });
}

// Retorno nativo (Electron): aceita SOMENTE loopback local explícito
// (http://127.0.0.1:<porta>/... ou http://localhost:<porta>/...).
// Qualquer outro destino é rejeitado — sem open redirect. O redirect_uri do
// Google continua sendo o da Platform; o loopback recebe só um ticket de uso único.
export function isLoopbackReturnTo(value: unknown): boolean {
  try {
    const u = new URL(String(value || ''));
    if (u.protocol !== 'http:') return false;
    if (u.username || u.password) return false;
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return false;
    if (!u.port) return false;
    return u.pathname.startsWith('/');
  } catch {
    return false;
  }
}

const TICKET_TTL_MS = 3 * 60 * 1000;

// Cria ticket de uso único vinculado à sessão recém-criada (token criptografado em repouso).
export function createLoginTicket(sessionRaw: string): string {
  const ticket = randomToken();
  db.prepare('INSERT INTO login_tickets (ticket_hash, session_token, expires_at) VALUES (?,?,?)').run(
    hashToken(ticket),
    encrypt(sessionRaw),
    Date.now() + TICKET_TTL_MS
  );
  try {
    db.prepare('DELETE FROM login_tickets WHERE expires_at <= ?').run(Date.now());
  } catch {
    // housekeeping nunca falha o login
  }
  return ticket;
}

// Consome (uso único): segunda tentativa com o mesmo ticket falha.
export function consumeLoginTicket(ticket: unknown): string | null {
  if (!ticket || typeof ticket !== 'string') return null;
  const row = db
    .prepare('DELETE FROM login_tickets WHERE ticket_hash = ? AND expires_at > ? RETURNING session_token')
    .get(hashToken(ticket), Date.now()) as { session_token: string } | undefined;
  if (!row) return null;
  return decrypt(row.session_token);
}

authRouter.get('/google', (req, res) => {
  const returnTo = String(req.query.return_to || '/');
  if (returnTo !== '/' && !isLoopbackReturnTo(returnTo)) {
    res.status(400).json({ error: 'invalid_return_to', message: 'Destino de retorno inválido.' });
    return;
  }
  if (!config.googleClientId || !config.googleClientSecret) {
    res.status(501).json({ error: 'google_not_configured' });
    return;
  }
  const state = randomToken();
  db.prepare('INSERT INTO oauth_states (state_hash, return_to, expires_at) VALUES (?, ?, ?)').run(
    hashToken(state),
    returnTo,
    Date.now() + 10 * 60 * 1000
  );
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: 'code',
    scope: googleScopes.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get('/google/callback', async (req, res, next) => {
  try {
    const stateRow = db
      .prepare('DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > ? RETURNING return_to')
      .get(hashToken(String(req.query.state || '')), Date.now()) as { return_to: string } | undefined;
    if (!stateRow || !req.query.code) {
      res.status(400).send('Autorização inválida ou expirada.');
      return;
    }
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: config.googleRedirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) throw new Error(`Falha ao obter tokens do Google (${tokenResponse.status}).`);
    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) throw new Error('Falha ao carregar o perfil Google.');
    const profile = (await profileResponse.json()) as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
    };
    const email = String(profile.email || '').toLowerCase();
    const existingCount = (db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
    const isInitialAdmin = email === config.initialAdminEmail || existingCount === 0;
    const user = db
      .prepare(
        `INSERT INTO users (google_sub,email,name,avatar_url,role,status) VALUES (?,?,?,?,?,?)
         ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,name=excluded.name,avatar_url=excluded.avatar_url,updated_at=CURRENT_TIMESTAMP
         RETURNING *`
      )
      .get(
        profile.sub,
        email,
        profile.name || email,
        profile.picture || null,
        isInitialAdmin ? 'admin' : 'sdr',
        isInitialAdmin ? 'approved' : 'pending'
      ) as { id: number; status: string };
    db.prepare(
      `INSERT INTO oauth_tokens (user_id,access_token,refresh_token,expires_at,scope) VALUES (?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET access_token=excluded.access_token,refresh_token=COALESCE(excluded.refresh_token,oauth_tokens.refresh_token),expires_at=excluded.expires_at,scope=excluded.scope,updated_at=CURRENT_TIMESTAMP`
    ).run(
      user.id,
      encrypt(tokens.access_token),
      tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      Date.now() + Number(tokens.expires_in || 3600) * 1000,
      tokens.scope || googleScopes.join(' ')
    );
    const session = randomToken();
    db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(
      hashToken(session),
      user.id,
      Date.now() + 30 * 24 * 60 * 60 * 1000
    );
    const finalRedirect = String(
      (stateRow as { return_to?: string }).return_to || '/'
    );
    if (isLoopbackReturnTo(finalRedirect)) {
      // Fluxo nativo: o segredo Google nunca sai da Platform. O app desktop troca
      // o ticket (uso único, 3 min) por sessão em POST /auth/native-exchange.
      const ticket = createLoginTicket(session);
      const sep = finalRedirect.includes('?') ? '&' : '?';
      res.redirect(`${finalRedirect}${sep}ticket=${encodeURIComponent(ticket)}`);
      return;
    }
    res.cookie(sessionCookie, session, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    // Web/shadcn trocam o cookie pelo Bearer lendo /auth/me com credentials:include.
    res.redirect(user.status === 'approved' ? `${config.origin}/` : `${config.origin}/?status=pending`);
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', (req, res) => {
  res.json({ user: currentUser(req) });
});

// Troca ticket nativo (uso único) por sessão Bearer. Sem cookie, sem segredo no app.
authRouter.post('/native-exchange', express.json(), (req, res) => {
  const ticket = (req.body as Record<string, unknown> | undefined)?.ticket;
  const session = consumeLoginTicket(ticket);
  if (!session) {
    res.status(400).json({ error: 'invalid_ticket', message: 'Ticket inválido ou expirado. Inicie o login de novo.' });
    return;
  }
  const user =
    (db
      .prepare(
        `SELECT users.id, users.email, users.name, users.avatar_url AS avatarUrl, users.role, users.status
         FROM sessions JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > ?`
      )
      .get(hashToken(session), Date.now()) as SessionUser | undefined) || null;
  if (!user) {
    res.status(400).json({ error: 'invalid_ticket', message: 'Sessão expirada. Inicie o login de novo.' });
    return;
  }
  // Web local usa cookie HttpOnly; clientes Bearer antigos continuam iguais.
  if (req.body?.mode === 'web') {
    res.cookie(sessionCookie, session, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' });
    res.json({ user });
    return;
  }
  res.json({ token: session, user });
});

authRouter.post('/logout', (req, res) => {
  const token = tokenFrom(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  res.clearCookie(sessionCookie, { path: '/' });
  res.status(204).end();
});
