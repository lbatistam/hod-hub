# HOD Hub API

Serviço central de dados, autenticação, Google Agenda, histórico e regras operacionais do HOD Hub. O HOD Briefing permanece independente.

## Executar

A instância ativa usa `dist/index.js`, porta 8877 e LaunchAgent `com.metodohod.hod-platform`.

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm start
```

[Saúde](http://localhost:8877/api/v1/health) · [OpenAPI](http://localhost:8877/api/v1/openapi.json).

Preserve o `.env` existente, banco, sessões e tokens. Não copie configuração da V1 nem execute migração para iniciar um cliente novo. O banco operacional permanece em `data/hod-platform.sqlite`.

## Arquitetura

```text
src/
├── app.ts                 HTTP, CORS e rotas
├── auth.ts                OAuth, sessões e tickets únicos
├── calendar.ts            Google, eventos, estado e disponibilidade
├── summary.ts             resumo e analytics oficiais
├── rules/                 classificações e regras centrais
├── db.ts                  banco e evolução histórica de schema
├── stream.ts              atualização SSE
├── admin.ts               permissões
└── settings.ts            configurações compartilhadas
packages/client/           cliente TypeScript reutilizável
test/                     testes isolados, sem dados reais
docs/architecture.md      detalhes da arquitetura
```

Versão do serviço: 1.0.0.

## Contrato dos clientes

`X-HOD-App: web-v1`. Identificadores históricos HeroUI/ShadCN continuam preservados na auditoria.

- Autenticação: cookie HttpOnly `hod_session` ou Bearer legado.
- Login com `return_to` local entrega ticket único. `POST auth/native-exchange` com `mode:web` cria cookie e retorna apenas usuário; modo legado mantém `{token,user}`.
- Eventos incluem `presentation`: coluna operacional, presença e confirmação efetiva, calculadas no serviço.
- `daily-summary` fornece seis métricas, taxas sem Over e criações pelo histórico do Google. `qualified.total` e `qualified.events` representam exclusivamente novos leads criados na data selecionada (`created.new`); não existe etapa adicional de qualificação. `rescheduledEvents` detalha as mesmas consultorias contadas por `rescheduled`, ordenadas pelo horário da reunião.
- `analytics` fornece agregados, taxas e série diária. Comparação usa dois períodos consultados pelo cliente.
- Alterações de estado gravam histórico/exportação e notificam os clientes por SSE.
- Horário de sincronização e histórico de detalhes têm UTC explícito para apresentação em São Paulo.

## Regras

`Acontecidas` inclui consultorias concluídas no fluxo operacional ou marcadas Compareceu. A conclusão automática pelo horário não comprova presença: presença confirmada e sua taxa contam somente Compareceu. Reagendar contabiliza no-show e permanece em recuperação; Over separado; passadas significa encaminhadas a closer; criação pela data Google com memória histórica; horários em America/Sao_Paulo. A data do filtro determina o dia da reunião para `rescheduledEvents`, mas o dia de criação no Google para `qualified.events`. Cada reagendamento expõe `startsAt` (reunião) e `rescheduledAt` (registro manual ou nova criação no Google); `rescheduledAt` é nulo quando o instante não está comprovado no histórico.

## Validação e limites

Testes isolados, typecheck e build validam o contrato do serviço. As regras de resumo, histórico e sincronização ficam na API; o cliente web é o consumidor ativo.

Escrita destrutiva e callback Google simulado usam somente banco temporário. Combinações de exclusão e reagendamento no Google real exigem validação no fluxo ativo.

[Changelog](CHANGELOG.md).
