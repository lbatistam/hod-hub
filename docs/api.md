# API e integração

A especificação executável fica disponível em `/api/v1/openapi.json` quando a API está rodando.

## Domínios expostos

- autenticação Google;
- sincronização e leitura de calendário;
- disponibilidade;
- eventos e estados;
- equipe e closers;
- configurações;
- resumo diário;
- Analytics;
- histórico;
- stream SSE em `/api/v1/stream`.

Clientes devem depender do contrato HTTP e não acessar o SQLite diretamente. Mudanças incompatíveis devem ser documentadas antes de uma release versionada.

