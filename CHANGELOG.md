# Changelog

## Estado atual — 2026-09-23

- Resumo Diário corrigido: “Qualificados no dia” usa somente criações no Google
  Agenda com título `Consultoria Nome Sobrenome`, no fuso America/Sao_Paulo.
  Nomes/telefones já presentes no histórico qualificado aparecem em
  “Reagendadas”; a tabela separa criação no Google da data e hora da reunião.
- A sincronização captura as criações do dia mesmo quando a consultoria foi
  marcada para outra data. Em 23/09, a validação real encontrou 12 criações:
  10 qualificadas e 2 reagendadas.

- Frontend Neutral Modern consolidado como interface oficial.
- Kanban responsivo com ações manuais e drag and drop.
- Seletores de data padronizados.
- Horários livres agrupados por horário.
- Resumo diário e Analytics conectados à API central.
- Temas claro e escuro.
- API universal com Google Agenda, histórico, resumo, Analytics e SSE.
- Controle administrativo total no Kanban: qualquer consulta pode ser movida
  manualmente para qualquer coluna, inclusive eventos riscados ou recusados no
  Google Agenda. O sinal visual do Google é preservado, mas o estado manual
  escolhido pelo administrador prevalece no fluxo operacional.

Atualizações rotineiras podem substituir o estado atual. Releases semânticas serão criadas quando uma mudança maior exigir versionamento explícito.
