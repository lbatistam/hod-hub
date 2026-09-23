# Arquitetura

## Visão geral

O HOD Hub separa apresentação e domínio. `app/` serve a experiência web; `api/` controla autenticação, ingestão, persistência e regras. Essa separação permite criar outros clientes sem duplicar banco ou lógica operacional.

## Componentes

### Frontend

- `production/`: documentos HTML das telas.
- `src/neutral-main.js`: integração das páginas Neutral Modern com a API.
- `src/neutral-global.css`: tokens, layout, temas e responsividade.
- `server/`: entrega estática, headers de segurança e fallback de rotas.
- `public/`: manifest e service worker.

### API

- `auth.ts`: OAuth e sessão do Google.
- `calendar.ts`: leitura e sincronização do calendário.
- `db.ts`: persistência SQLite.
- `summary.ts`: visão diária consolidada.
- `history.ts`: trajetória e classificação histórica.
- `team.ts`: closers e equipe.
- `stream.ts`: notificações em tempo real.
- `rules/`: disponibilidade, calendário, closers e consultorias.
- `openapi.ts`: contrato público da API.

## Fluxo de dados

1. A API autentica a conta Google configurada.
2. Eventos relevantes são lidos, normalizados e persistidos.
3. As regras classificam situação, confirmação, closer e histórico.
4. O frontend consulta endpoints REST e atualiza a interface.
5. O stream SSE sinaliza alterações para clientes conectados.
6. Ações manuais retornam à API e passam a integrar o estado central.

## Portas padrão

| Serviço | Porta | Papel |
| --- | ---: | --- |
| HOD Hub Web | 8787 | Interface local |
| HOD Platform API | 8877 | API e banco central |

## Princípios

- Uma fonte de verdade para o estado operacional.
- Regras de negócio fora da camada visual.
- Operação manual sempre disponível ao administrador.
- Histórico preservado para auditoria e classificação.
- Dados e segredos locais nunca versionados.

