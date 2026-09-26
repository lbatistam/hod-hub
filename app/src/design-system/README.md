# Sistema visual do HOD Hub

Implementação canônica: `src/neutral-global.css` e `src/neutral-main.js`. O arquivo `DESIGN.md` é a fonte de verdade visual.

## Primitivos

- Tokens: cor, tipografia, espaçamento, raio, borda, superfície, estados e foco usam variáveis `--*`.
- Navegação: trilho lateral de ícones no desktop e navegação compacta nos contextos menores.
- Segmented control: `.seg` e `.segmented-control`, com `aria-pressed` para seleção única ou filtro rápido.
- Ações: `.btn`, `.icon-button`, `.card-action` e estados `disabled`/`aria-busy`.
- Feedback: `#toast`, estados vazios `.empty`/`.col-empty`, carregamento com `aria-busy` e mensagens recuperáveis.
- Dados: `.kpi`, tabelas responsivas, badges semânticos e cartões operacionais.
- Overlays: `.filter-panel` e `.modal-back`, com Escape, foco contido e retorno ao acionador.

## Movimento

`src/app/hod-motion.js` concentra o movimento nativo com Web Animations API:

- 150–420 ms, curva `cubic-bezier(0.16, 1, 0.3, 1)`;
- troca de páginas nativa via View Transitions: barra lateral estável, conteúdo com deslocamento lateral curto e saída mais rápida que a entrada;
- FLIP nativo somente para continuidade espacial de listas/Kanban;
- toast, painel e feedback de pressão compartilhado por botões e links, inclusive via teclado, sem coreografia decorativa;
- cancelamento de animações concorrentes;
- `prefers-reduced-motion` respeitado;
- nenhuma função operacional depende da animação para funcionar.

## Regras de uso

- Use componentes existentes antes de criar uma variação.
- Status nunca depende apenas de cor; mantenha texto ou ícone.
- Controles de toque têm alvo mínimo de 44 px.
- Datas e números devem usar `Intl` e o fuso de São Paulo quando aplicável.
- Atualizações preservam foco, filtros, scroll e o elemento DOM quando a entidade continua existindo.
- Não introduza gradientes, glassmorphism, sombras dramáticas ou movimento ornamental.
