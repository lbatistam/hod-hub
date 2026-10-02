# Atualização de movimento — 30/09/2026

O usuário autorizou animações neste Site; a restrição anterior permanece apenas no Web App antigo. Implementação e exceções em MOTION.md. As notas de ausência de movimento abaixo registram a validação anterior, antes desta autorização.

# HOD Hub — migração Apps SDK UI

## Atualização após aprovação
Padrão visual aprovado em 29/09/2026. Horários Livres, Resumo Diário, Analytics e Configurações convertidos no mesmo frontend. Também convertidos os controles da rota técnica /conexao, preservando os contratos do Google. Checkbox, RadioGroup, Switch, DateRangePicker e Popover passaram a atender necessidades reais dessas páginas. Gráficos são composições semânticas de barras com os tokens oficiais; a biblioteca não oferece chart de negócio.

Kit anterior, componentes/hub, secondary-pages, CSS antigo e dependências visuais comprovadamente sem imports ativos foram removidos neste checkout. Continuam recuperáveis no commit f5407b8, bundle e checkout original. A navegação agora permanece inteira na nova interface. Textos de criação usam America/Sao_Paulo e horários do registro, sem fixar 12:25. Fluxo técnico mantém POST /api/google/start e /api/google/proof, sem dispará-los automaticamente.

Os textos abaixo registram a primeira etapa e suas decisões. Indicações de páginas pendentes referem-se àquele momento; a conversão de todas as páginas foi feita após aprovação. Integração real continua adiada.

# HOD Hub — migração Apps SDK UI, etapa 1

## Estado e recuperação
Prévia local para aprovação visual. Não publicada; a versão hospedada permanece disponível. Branch `codex/apps-sdk-ui`, checkout paralelo `outputs/hod-hub-apps-ui`. Origem preservada em `outputs/hod-hub`, commit `b4a1ec0f81f80c1a6d7cb8066af56c82837e9e08`, tag `hod-hub-before-apps-sdk-ui` e bundle `outputs/hod-hub-before-apps-sdk-ui.bundle`. Não há credenciais no bundle.

## Inventário antes da mudança
O Site existente já usa React 19, TypeScript, Tailwind 4 e Vinext/Vite, com rotas de servidor compatíveis com Workers/Sites. A rota `/` reúne Início, Organograma, Horários Livres, Resumo Diário, Analytics e Configurações por `?pagina=`. `/conexao` e `/api/google/{start,callback,proof}` são o fluxo de conexão/prova Google existente. Autorização do aplicativo via `requireChatGPTUser` preservada. Não há leitura Google validada nem persistência operacional ativa; os dados existentes são demonstrativos e permanecem identificados. Nenhuma integração real foi substituída.

O frontend anterior está em `components/hub.tsx`, com CSS próprio. Seus componentes e dependências antigas estão preservados para recuperação e conclusão das etapas seguintes; não são importados na nova árvore visual. O CSS anterior foi arquivado em `app/legacy-globals.css` e não é carregado.

## Fontes e instalação
- https://developers.openai.com/plugins/concepts/ui-guidelines
- https://openai.github.io/apps-sdk-ui/
- https://github.com/openai/apps-sdk-ui

O portal de documentação não respondeu ao leitor web. A instalação, conceitos, fundações e documentação de componentes foram lidos diretamente no código oficial clonado em `work/apps-sdk-ui`, commit `0f00143c7a639906f1621fe58e1b6be7b5bea46d`. Os exports e tipos da versão instalada foram conferidos separadamente, pois main e npm diferem.

Instalado `@openai/apps-sdk-ui@0.2.2`, React/React DOM 19.2.6 e Tailwind 4.2.1. Luxon é usado para a API DateTime do DatePicker. CSS configurado conforme documentação:

```css
@import "tailwindcss";
@import "@openai/apps-sdk-ui/css";
@source "../node_modules/@openai/apps-sdk-ui";
```

Tokens oficiais de texto, superfície, borda, status, tipografia e escala; ícones exportados pelo SDK. Nenhum kit alternativo na árvore nova. A marca HOD mantém somente seu símbolo e verde; a tipografia usa a fundação oficial, substituindo Google Sans nesta prévia. Temas claro/escuro/sistema usam `applyDocumentTheme`, preferência existente e `prefers-color-scheme` com assinatura de mudanças. Não foram adicionadas superfícies ChatGPT, MCP ou chat: este é um Site independente.

## Mapeamento
| Necessidade existente | Peça oficial / composição |
| --- | --- |
| Navegação e ações | Button, ButtonLink, ícones oficiais |
| Tema e Kanban/timeline/lista | SegmentedControl |
| Busca | Input |
| Situação, closer e cenário | Select |
| Data operacional | DatePicker + Luxon America/Sao_Paulo |
| Status e closer | Badge |
| Perfil e contatos | Avatar |
| Dicas e cópia | Tooltip, CopyTooltip |
| Observações | Textarea |
| Erro, sucesso e informações | Alert |
| Sem registros | EmptyMessage |
| Filtros | Popover, Select |
| Indicadores, cards, timeline e tabela | Composições semânticas reutilizáveis com tokens oficiais |
| Detalhes laterais | Composição dialog com controles oficiais |

Outros componentes pedidos (DateRangePicker, Menu, Checkbox, RadioGroup, Switch, Slider) foram consultados; serão escolhidos apenas onde as páginas restantes precisarem deles. Não foram incluídos exemplos artificiais.

## Exceções documentadas
- O SDK instalado não exporta Dialog/Drawer ou Kanban/tabela de negócio. `detail-dialog.tsx` compõe o painel com role dialog, aria-modal, isolamento inert do fundo, bloqueio de rolagem, Escape, ciclo de foco e retorno ao acionador. Portais do Select continuam interativos; um dialog nativo tornava esses portais inertes.
- `Choice` inclui o nome do campo no TriggerView do Select, pois o id oficial fica no input oculto.
- CopyTooltip oficial recebe um complemento de cópia por Enter/Espaço, com retorno em português e falha explícita.
- DatePicker 0.2.2 fixa abreviações de dias em inglês e botões de navegação mensal sem rótulos acessíveis. CopyTooltip fixa Copy/Copied em inglês. Essas limitações não foram escondidas por props inexistentes; calendário e cópia permanecem oficiais. Resolver localização/acessibilidade completa requer suporte upstream ou um adaptador dedicado, a avaliar antes do corte final.

## Escopo e regras
Início e Organograma (Kanban/timeline/lista), busca, filtros, data, detalhes, cópia, observações e estados operacionais foram convertidos. Agendadas, Acontecendo, Compareceu e No-show permanecem os únicos estados. Histórico, reagendamento e separação entre criação e reunião são mantidos. Alterações no protótipo são temporárias, como no app existente.
As quatro páginas seguintes apontam para a versão publicada atual e aguardam aprovação para conversão. Backend, autenticação, dados de exemplo e rotas Google não foram editados. Nenhum segredo foi lido ou impresso.

## Movimento — proposta separada, inativa
Foram lidos Animate, AnimateLayout, AnimateLayoutGroup, TransitionGroup e SlotTransitionGroup. Nenhum é utilizado. A regra global desativa animation, transition e rolagem suave, incluindo portais e transições internas. Carregamento usa texto estático.
Se aprovado futuramente: Animate para entrada/saída de avisos (120–160 ms); AnimateLayout para expansão de filtros (150–180 ms); AnimateLayoutGroup para inserções/remoções de listas. TransitionGroup e SlotTransitionGroup somente quando a coordenação de saída for necessária. Todas precisariam respeitar movimento reduzido e interrupção. Não há proposta de movimento automático do Kanban nem nova dependência de animação.

## Continuação
Após aprovação: converter Horários Livres, Resumo Diário, Analytics e Configurações; validar contratos e acesso privado no ambiente hospedado; só então remover visuais antigos comprovadamente sem uso. A integração Google continua adiada conforme orientação do usuário e não pode ser declarada validada pela migração visual.
