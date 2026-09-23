import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// OAuth cookies are scoped by hostname. Keep the browser on localhost so a
// login performed against HOD Platform is not lost when the app was opened as
// 127.0.0.1 (same machine, but a different cookie domain to the browser).
app.use((req, res, next) => {
  if (req.hostname === '127.0.0.1' && req.method === 'GET' && req.accepts('html')) {
    return res.redirect(307, `http://localhost:${config.port}${req.originalUrl}`);
  }
  return next();
});

app.get('/health', (req, res) => res.json({ ok: true, app: 'HOD Hub Web' }));
// A Home foi removida, mas links e favoritos antigos continuam válidos.
// Este redirecionamento precisa ficar antes dos arquivos estáticos para que
// uma URL antiga nunca resulte em "Cannot GET".
app.get('/production/index.html', (req, res) => {
  res.redirect(308, '/production/inicio.html');
});
// A autenticação e os dados de negócio agora pertencem à HOD Platform.
// As páginas locais podem carregar; chamadas sem sessão são encaminhadas pelo
// frontend para a tela de login central.
// Este é um app local em evolução constante. Obrigue o navegador a validar os
// arquivos novamente para que uma atualização do HOD Hub apareça ao recarregar.
app.use(
  express.static(config.staticDir, {
    index: false,
    maxAge: 0,
    setHeaders(res, filePath) {
      if (/\/(?:js|assets|images|fonts)\//.test(filePath) && /-[a-zA-Z0-9_]{8,}\./.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (/\.html$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  })
);
app.get('/', (req, res) => res.redirect('/production/inicio.html'));

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  const status = Number(error.status || 500);
  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, error);
  }
  res.status(status).json({
    error: error.code || (status >= 500 ? 'internal_error' : 'invalid_request'),
    message:
      error.publicMessage ||
      (status >= 500 && process.env.NODE_ENV !== 'development'
        ? 'Não foi possível abrir esta página. Tente novamente.'
        : error.message)
  });
});

export const server = app.listen(config.port, '0.0.0.0', error => {
  if (error) {
    throw error;
  }
  console.log(`HOD Hub disponível em ${config.origin}`);
});

export { app };
