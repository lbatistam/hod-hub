# HOD Hub Web

Aplicativo local de operação de consultorias integrado ao Google Agenda.

## Regras essenciais

- Consultorias toleram pequenos erros de digitação no título.
- Reagendar conta como No-Show e permanece na recuperação.
- Over não entra na taxa de No-Show.
- Eventos riscados no Google permanecem visíveis.
- Datas e horários usam `America/Sao_Paulo`.
- Ex-integrantes permanecem no histórico.
- Agendamentos usam `createdAt`, não a data da reunião.

## Fronteira

O Web é o único cliente do HOD Hub. Seu frontend usa `http://localhost:8877/api/v1`. A porta 8787 serve apenas os arquivos do app; autenticação, calendário, regras e banco pertencem à HOD Platform.

O frontend é Vanilla JavaScript e SCSS, sem framework de interface, Gentelella, Bootstrap, jQuery ou backend duplicado. As seis telas ativas são login, Organograma, Horários Livres, Resumo Diário, Analytics e Configurações.
