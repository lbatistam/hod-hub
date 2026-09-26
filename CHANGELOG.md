# Changelog

## Estado atual — 2026-09-26

- Interface operacional refinada nas seis páginas principais, com navegação por ícones, controles segmentados, filtros e ações mais consistentes.
- Início exibe indicadores da data selecionada, próxima consultoria, próximas do dia, pendências e acessos rápidos, sempre com dados da API após o carregamento.
- Organograma preserva busca, filtros e posição de rolagem durante atualizações; cards mostram confirmação, closer, telefone e ações operacionais.
- Movimento próprio e nativo: View Transitions na navegação, Web Animations API para feedback, painéis e continuidade dos cards; sem GSAP. A interface respeita `prefers-reduced-motion`.
- Movimento refinado com os critérios de Emil Kowalski: navegação em 240 ms (saída em 120 ms), resposta ao clique em 150 ms sem animar o teclado, FLIP do Kanban em 240 ms, gráficos animados só na primeira exibição e pulso decorativo removido. Adicionados cinco testes do motor de animação; lint, build e smoke das sete páginas aprovados.
- O frontend foi validado com lint, build e smoke das sete páginas. O código da API foi alinhado ao backend local já funcional: Luccas ativo, Misael histórico e origens de desenvolvimento locais. Typecheck, build e 33 testes da API passaram; banco, credenciais e serviço em execução não foram alterados.

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
