# HOD Platform — Arquitetura proposta (v1.0.0)

## Estado atual em 15/09/2026

O único cliente mantido é o Web App. ShadCN e HeroUI foram desinstalados de forma recuperável. Esta documentação contém registros históricos dos três clientes, que não representam uma implantação atual.

A API executa em `HOD Workspace/services/hod-hub-api`, porta 8877. O cliente executa em `HOD Workspace/apps/hod-hub`, porta 8787, e usa a API central. Seu backend e banco legados ainda existem. O resumo diário não está unificado: o Web calcula métricas locais e o endpoint central ainda precisa corrigir encaminhamento ao closer, presença somente manual e criações independentemente da data da reunião.

## Objetivo
Um backend único em `/Users/leandro/Documents/HOD Workspace/services/hod-hub-api` para o cliente HOD Hub atual. HeroUI e shadcn foram removidos.
Nenhum app acessa o SQLite diretamente. Toda leitura/alteração passa pela API versionada.

## Componentes
```
HOD Platform (Node 24, TS, Express 5, better-sqlite3, porta 8877)
├── src/
│   ├── index.ts / app.ts / config.ts / db.ts / security.ts
│   ├── rules/ (closers, calendar-rules, availability-rules, consultation-rules) — ports fiéis V1
│   ├── auth.ts, calendar.ts, admin.ts, settings.ts, team.ts, history.ts, summary.ts, notifications.ts
│   ├── stream.ts (SSE), archive.ts, error-log.ts, openapi.ts
│   └── scripts/ (migrate-v1.ts, backup.ts, print-openapi.ts)
├── packages/client/src/index.ts (@hod/platform-client: fetch tipado + SSE p/ os 3 frontends)
├── openapi servido em /api/v1/openapi.json
├── data/hod-platform.sqlite (central; criado via migração — nunca é o arquivo da V1)
└── test/ (rules.test.ts, api.test.ts — node --test via tsx)
```

## Schema oficial
V1 integral (users, oauth_tokens, sessions, oauth_states, calendars, events, event_states,
event_state_history, lead_creation_history, daily_summaries + ensureColumns + backfills)
+ `shared_settings(key, value JSON, updated_by, updated_by_app, updated_at)`
+ `schema_migrations(version)`
+ `event_state_history.app_source`, `event_states.updated_by_app`, `daily_summaries.updated_by_app`.
Seed central: `work_hours {08–23}`, `slot_config {60/60}`, `operation {autoClose 50min, overbookingFrom, tz}`,
`business_rules {reschedule=no-show, over fora taxa, declined=no-show, compareceu absolve}`.

## API /api/v1 (contrato em src/openapi.ts)
- `GET /health`, `GET /openapi.json`
- Auth: `GET /auth/google`, `GET /auth/google/callback`, `GET /auth/me`, `POST /auth/logout`
  (cookie `hod_session` OU `Authorization: Bearer`; header `X-HOD-App` p/ auditoria)
- Calendário: `GET /status`, `POST /sync`, `GET /calendars`, `GET /availability?date`,
  `GET /lead-creation-history`, `POST /lead-creation-history/matches`
- Consultorias: `GET /events?startDate&endDate&includeFormer`, `GET /events/:id`,
  `GET /events/:id/history`, `PATCH /events/:id/state`, `GET+PATCH /daily-entry`
- Central novo: `GET /settings`, `GET|PUT /settings/:key` (admin),
  `GET /team`, `GET /history?date&eventId&limit`, `GET /daily-summary?date`, `GET /analytics?startDate&endDate&closer&includeFormer`
- Admin: `GET|PATCH /admin/users` — Notificações: `POST /notifications/macos`
- SSE: `GET /stream` → `event.state_changed, daily_entry.updated, settings.updated, calendars.synced, users.updated`
- Legado `/api/*` (sem v1) responde 410 com `to: /api/v1/...` para detectar clientes antigos.

## Sincronização entre apps
1. Qualquer PATCH (estado, daily, settings, admin) escreve no SQLite central + grava `app_source` + `broadcast()` SSE.
2. Apps abertos assinam `GET /stream` via `@hod/platform-client.subscribe()` e recarregam a fatia afetada.
3. Confirmar/cancelar/reagendar/no-show em qualquer app aparece nos outros em <2 s (SSE) ou no próximo `sync`.

## Central × local
- Central (`shared_settings`, equipe, horários, regras, tudo no SQLite): `work_hours, slot_config, operation, business_rules, notifications`, equipe, consultorias, histórico.
- Local (cada app, nunca na API): tema, zoom, densidade, nav horizontal/vertical, posição/tamanho da janela, foto de perfil local, `reduceMotion`.
- shadcn `hod-shadcn-*` e V1 `hodPreferences` visuais permanecem locais; apenas dados de negócio migram para a API.

## Backup e migração segura
- `npm run migrate:v1` copia a V1 com `Database.backup()` (consistente com WAL) para `DATABASE_PATH`; falha se o destino existir (sem `--force`); nunca escreve na V1; valida contagens pós-cópia; `src/db.ts` aplica ensureColumns/backfills ao iniciar.
- `npm run backup` faz `VACUUM INTO backups/hod-platform-YYYY-MM-DD.sqlite` a quente.
- `ARCHIVE_DIR` (JSON+CSV+JSONL) continua o mesmo da V1 por compatibilidade.
- Nenhum mock do shadcn (`seed.ts`, `@email.com`, `meet.hodhub.com`, `hash%11`) entra no banco.

## Testes
- `npm test`: regras (typo, blocos 1h, over null, equipe, no-show, confirmação, fluxo, novo×repetido) + contrato (health, OpenAPI cobre 7 paths novos, 410 legado, 401 sem sessão).
- Próxima fase (pós-aprovação): teste de sincronização simultânea (2 clientes SSE + PATCH cruzado) e paridade IPC HeroUI.

## Plano de conexão (executado)
1. Fase 1: Platform :8877 + migração segura e comparação com a V1 — concluída.
2. Fase 2: Web App lê/escreve na Platform e recebe atualizações SSE — concluída; backend antigo preservado como rollback.
3. Fase 3: HeroUI usa a Platform por padrão mantendo a fachada IPC — concluída; fallback local ainda preservado.
4. Fase 4: shadcn usa a Platform para dados de negócio; preferências visuais permanecem locais — concluída.
5. Fase 5: sincronização simultânea, builds e validação Web App × HeroUI — concluída; QA manual do shadcn pendente.

## Limitações conhecidas (v1.0.0)
- Sync ex-integrantes via agenda `primary` simplificado (V1 cobre casos-limite adicionais; paridade total na Fase 1).
- `PUT /settings/:key` exige admin (mesma guarda V1); `slot_config` trava 60/60.
- SSE sem replay: cliente recém-aberto faz `GET` inicial + depois assina.
- Google escreve (criar/mover/apagar eventos) ainda via escopo total, mas sem endpoint dedicado — Fase 2.
