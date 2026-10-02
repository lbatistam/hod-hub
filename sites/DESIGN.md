# HOD Hub — fundações oficiais

A interface usa React 19, TypeScript, Tailwind 4 e `@openai/apps-sdk-ui` 0.2.2. Consulte `MIGRATION_APPS_UI.md` para fontes, instalação, mapeamento, tipos verificados e exceções.

## Tokens
Use superfícies `bg-surface`, `bg-surface-secondary`, `bg-surface-tertiary`; texto `text-default`, `text-secondary`; bordas `border-default`. Status usa as variantes info, warning, success e danger do Badge. Closers usam Badge discovery. Barras quantitativas usam `bg-info-solid`. Não introduzir paletas paralelas. A marca h mantém seu verde próprio.

## Tipografia e escala
Fonte e pesos oficiais do pacote. Títulos heading-xl/lg/sm/xs conforme hierarquia; corpo text-sm/md; metadados text-xs. Espaçamento pela escala Tailwind conectada às fundações oficiais. Datas em pt-BR, America/Sao_Paulo; métricas e horários com números tabulares.

## Componentes
Button/ButtonLink para ações e navegação; Input/Textarea; Select; SegmentedControl para visualizações e temas; DatePicker e DateRangePicker; Badge/Avatar; Tooltip/CopyTooltip; Popover para detalhes de janela; Checkbox para calendários; RadioGroup para densidade; Switch para mostrar telefones; Alert e EmptyMessage. Componentes sem necessidade no produto não são adicionados.

## Composições
Panel, Choice, CopyAction, StatusBadge e DetailDialog reutilizáveis. Kanban, timeline, tabelas, indicadores e gráficos de barras são composições com tokens oficiais, não imitações de componentes existentes. Tabelas e Kanban têm rolagem horizontal interna; celular usa navegação horizontal e cards empilhados. Controles mantêm o mesmo comportamento entre páginas.

## Temas e movimento
Claro, escuro e sistema via utilitário oficial applyDocumentTheme. Preferência local mantém o contrato hod-theme. Movimento autorizado para este Site: transições internas oficiais e Animate, AnimateLayout, AnimateLayoutGroup e SlotTransitionGroup. Tempos operacionais curtos (180 ms entrada/layout, 150 ms saída, 280 ms detalhes, 240/140 ms troca de conteúdo), com curvas oficiais. Redução do sistema e opção local desativam também transições dos portais. Veja MOTION.md.

## Dados
Exemplos explicitamente identificados. Estados operacionais únicos: Agendadas, Acontecendo, Compareceu, No-show. Nunca inferir presença a partir do horário. Criação e reunião têm datas separadas; histórico de antigos closers permanece visível. Preferências locais não iniciam sincronização.
