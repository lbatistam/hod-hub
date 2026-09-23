// Contrato oficial da HOD Platform — OpenAPI 3.0 servido em /api/v1/openapi.json.
// Toda leitura/alteração dos apps passa por aqui; acesso direto ao SQLite é proibido.
export const openapiDocument = {
  openapi: '3.0.0',
  info: {
    title: 'HOD Platform API',
    version: '1.0.0',
    description:
      'API central do HOD Hub. Schema e regras operacionais compartilhados. Header X-HOD-App: web-v1|heroui|shadcn|platform (auditoria). Sessão via cookie hod_session ou Authorization: Bearer.',
  },
  servers: [{ url: 'http://localhost:8877' }],
  tags: [
    { name: 'health' },
    { name: 'auth' },
    { name: 'calendar' },
    { name: 'events' },
    { name: 'settings' },
    { name: 'team' },
    { name: 'history' },
    { name: 'summary' },
    { name: 'admin' },
    { name: 'stream' },
  ],
  paths: {
    '/api/v1/health': { get: { tags: ['health'], summary: 'Saúde', responses: { '200': { description: 'ok' } } } },
    '/api/v1/openapi.json': { get: { tags: ['health'], summary: 'Contrato OpenAPI', responses: { '200': { description: 'ok' } } } },
    '/api/v1/auth/google': {
      get: {
        tags: ['auth'],
        summary: 'Inicia OAuth Google (redirect). Apps nativos passam ?return_to=http://127.0.0.1:PORTA/caminho (loopback; recebe ticket de uso único)',
        parameters: [{ name: 'return_to', in: 'query', schema: { type: 'string' } }],
        responses: { '302': { description: 'redirect Google' }, '400': { description: 'invalid_return_to' } },
      },
    },
    '/api/v1/auth/native-exchange': {
      post: {
        tags: ['auth'],
        summary: 'Troca ticket nativo (uso único, 3 min) por sessão Bearer. mode:web estabelece cookie HttpOnly e retorna {user}; modo legado retorna Bearer.',
        responses: { '200': { description: '{token, user}' }, '400': { description: 'invalid_ticket' } },
      },
    },
    '/api/v1/auth/google/callback': { get: { tags: ['auth'], summary: 'Callback OAuth', responses: { '302': { description: 'redirect app' } } } },
    '/api/v1/auth/me': { get: { tags: ['auth'], summary: 'Usuário atual', responses: { '200': { description: 'ok' } } } },
    '/api/v1/auth/logout': { post: { tags: ['auth'], summary: 'Encerra sessão', responses: { '204': { description: 'ok' } } } },
    '/api/v1/calendar/status': { get: { tags: ['calendar'], summary: 'Status Google Agenda', responses: { '200': { description: 'ok' } } } },
    '/api/v1/calendar/sync': {
      post: {
        tags: ['calendar'],
        summary: 'Sincroniza período (máx 1100 dias, cache 55s)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, force: { type: 'boolean' } } } } } },
        responses: { '200': { description: 'ok' }, '409': { description: 'reconnect required' } },
      },
    },
    '/api/v1/calendar/calendars': { get: { tags: ['calendar'], summary: 'Agendas ativas', responses: { '200': { description: 'ok' } } } },
    '/api/v1/calendar/availability': {
      get: {
        tags: ['calendar'],
        summary: 'Horários livres (08–23, blocos 1h hora-cheia; overCount null = fonte indisponível)',
        parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok' } },
      },
    },
    '/api/v1/calendar/events': {
      get: {
        tags: ['events'],
        summary: 'Consultorias do período, presentation: {column, attendance, effectiveConfirmation} calculada no serviço',
        parameters: [
          { name: 'startDate', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'endDate', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'includeFormer', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'ok' } },
      },
    },
    '/api/v1/calendar/events/{id}': { get: { tags: ['events'], summary: 'Detalhe + histórico (inclui organizerEmail/rawJson p/ derivar leadEmail)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'ok' }, '404': { description: 'not found' } } } },
    '/api/v1/calendar/events/{id}/history': { get: { tags: ['events'], summary: 'Histórico do evento', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'ok' } } } },
    '/api/v1/calendar/events/{id}/state': {
      patch: {
        tags: ['events'],
        summary: 'Atualiza estado operacional (manualStatus + confirmation + notes). Grava histórico com app_source e emite SSE event.state_changed.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  manualStatus: { type: 'string', nullable: true, enum: ['compareceu', 'no_show', 'cancelada', 'reagendar', 'reagendado', 'over_sem_atendimento', null] },
                  confirmation: { type: 'string', enum: ['neutro', 'confirmado', 'nao_confirmado'] },
                  notes: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'ok' }, '400': { description: 'invalid_state' } },
      },
    },
    '/api/v1/calendar/lead-creation-history': { get: { tags: ['calendar'], summary: 'Memória de criação (Novo x Repetido)', responses: { '200': { description: 'ok' } } } },
    '/api/v1/calendar/lead-creation-history/matches': { post: { tags: ['calendar'], summary: 'Match Novo x Repetido (máx 500 leads)', responses: { '200': { description: 'ok' } } } },
    '/api/v1/calendar/daily-entry': {
      get: { tags: ['calendar'], summary: 'Entrada manual do dia', responses: { '200': { description: 'ok' } } },
      patch: { tags: ['calendar'], summary: 'Atualiza entrada do dia (emite SSE)', responses: { '200': { description: 'ok' } } },
    },
    '/api/v1/settings': { get: { tags: ['settings'], summary: 'Configurações compartilhadas (centrais)', responses: { '200': { description: 'ok' } } } },
    '/api/v1/settings/{key}': {
      get: { tags: ['settings'], summary: 'Lê chave central', parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'ok' } } },
      put: { tags: ['settings'], summary: 'Altera chave central (admin; emite SSE settings.updated)', parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'ok' }, '403': { description: 'admin_required' } } },
    },
    '/api/v1/team': { get: { tags: ['team'], summary: 'Equipe (closers + calendars + users)', responses: { '200': { description: 'ok' } } } },
    '/api/v1/history': { get: { tags: ['history'], summary: 'Histórico unificado (quem/o quê/quando/qual app)', responses: { '200': { description: 'ok' } } } },
    '/api/v1/daily-summary': { get: { tags: ['summary'], summary: 'Resumo diário: seis métricas, qualificados (novos leads criados no dia) e lista de reagendadas', responses: { '200': { description: 'ok' } } } },
    '/api/v1/analytics': { get: { tags: ['summary'], summary: 'Analytics derivados (taxas + por closer)', responses: { '200': { description: 'ok' } } } },
    '/api/v1/admin/users': { get: { tags: ['admin'], summary: 'Lista usuários (admin)', responses: { '200': { description: 'ok' } } } },
    '/api/v1/admin/users/{id}': { patch: { tags: ['admin'], summary: 'Atualiza papel/status (admin; emite SSE)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'ok' } } } },
    '/api/v1/notifications/macos': { post: { tags: ['admin'], summary: 'Notificação macOS (501 fora darwin)', responses: { '200': { description: 'ok' } } } },
    '/api/v1/stream': { get: { tags: ['stream'], summary: 'SSE: event.state_changed, daily_entry.updated, settings.updated, calendars.synced, users.updated', responses: { '200': { description: 'stream' } } } },
  },
} as const;
