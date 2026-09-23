import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import './db.js';
import { authRouter } from './auth.js';
import { calendarRouter } from './calendar.js';
import { adminRouter } from './admin.js';
import { notificationsRouter } from './notifications.js';
import { settingsRouter } from './settings.js';
import { teamRouter } from './team.js';
import { historyRouter } from './history.js';
import { summaryRouter } from './summary.js';
import { addStreamClient, broadcast, streamClientCount } from './stream.js';
import { requireUser } from './auth.js';
import { recordServerError, requestId } from './error-log.js';
import { openapiDocument } from './openapi.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (config.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '100kb' }));

  // Saúde + contrato
  app.get('/api/v1/health', (req, res) =>
    res.json({ ok: true, app: 'HOD Platform', version: '1.0.0', streamClients: streamClientCount() })
  );
  app.get('/api/v1/openapi.json', (req, res) => res.json(openapiDocument));

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/calendar', calendarRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/settings', settingsRouter);
  app.use('/api/v1/team', teamRouter);
  app.use('/api/v1/history', historyRouter);
  // Resumo + analytics sob /api/v1 (derivados dos mesmos dados)
  app.use('/api/v1', summaryRouter);

  // SSE — atualizações em tempo real para os 3 apps abertos
  app.get('/api/v1/stream', requireUser, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`event: server.hello\ndata: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`);
    const remove = addStreamClient(res);
    const ping = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        // noop
      }
    }, 20_000);
    req.on('close', () => {
      clearInterval(ping);
      remove();
    });
  });

  // Compat: informa que a V1 legada (/api/...) foi movida para /api/v1
  app.use('/api/auth', (req, res) => res.status(410).json({ error: 'moved', to: `/api/v1/auth${req.path}` }));
  app.use('/api/calendar', (req, res) => res.status(410).json({ error: 'moved', to: `/api/v1/calendar${req.path}` }));
  app.use('/api/admin', (req, res) => res.status(410).json({ error: 'moved', to: `/api/v1/admin${req.path}` }));

  app.get('/', (req, res) =>
    res.json({ ok: true, app: 'HOD Platform', docs: '/api/v1/openapi.json', stream: '/api/v1/stream' })
  );

  // Erros PT-BR no padrão V1
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use(async (error: Error & { status?: number; code?: string; publicMessage?: string }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    const status = Number(error.status || 500);
    const id = requestId();
    if (status >= 500) {
      console.error(`[${new Date().toISOString()}] [${id}] ${req.method} ${req.originalUrl}`, error);
      await recordServerError(error, req, id);
    }
    res.status(status).json({
      error: error.code || (status >= 500 ? 'internal_error' : 'invalid_request'),
      message: error.publicMessage || (status >= 500 ? `Não foi possível concluir esta atualização. Tente novamente. Código: ${id}` : error.message),
      ...(status >= 500 ? { requestId: id } : {}),
    });
  });

  return app;
}

export { broadcast };
