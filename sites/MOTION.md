# Movimento oficial do HOD Hub Site

Autorizado em 30/09/2026. A desativação anterior era específica do Web App antigo.

## Biblioteca e regras

@openai/apps-sdk-ui 0.2.2. Imports e tipos verificados em components/Transition. Foram lidas as documentações de Animate, AnimateLayout, AnimateLayoutGroup, TransitionGroup e SlotTransitionGroup. Nenhuma dependência nova.

| Uso | Componente | Entrada / saída |
| --- | --- | --- |
| Avisos e filtros expansíveis | AnimateLayout | 180 / 150 ms |
| Feedback nos detalhes | Animate | 180 / 150 ms |
| Pendências: inserção, remoção, reposicionamento | AnimateLayoutGroup | 180 / 150 ms; movimento 180 ms |
| Painel de detalhes e fundo | SlotTransitionGroup | 220 / 150 ms |
| Controles, menus, seletores e dicas | Componentes oficiais | Transições internas da biblioteca |

Curvas: var(--cubic-enter), var(--cubic-exit), var(--cubic-move). Os tempos foram escolhidos para este aplicativo usando propriedades documentadas; não são tempos impostos pelas UI Guidelines. TransitionGroup é usado internamente pelos wrappers oficiais, sem composição direta desnecessária.

## Exceção composta

A biblioteca não oferece Drawer/Dialog para esta necessidade. O painel existente usa SlotTransitionGroup, atributos oficiais de ciclo e transform/opacity com tokens oficiais. Fechamento mantém o elemento visual até terminar; torna-o inert e aria-hidden imediatamente. Foco, Escape, bloqueio de rolagem e proteção de observações continuam preservados. Reabertura interrompe a saída do mesmo elemento.

## Acessibilidade e persistência

MotionProvider observa prefers-reduced-motion ao vivo. A opção Reduzir movimento em Configurações salva hod-motion-preference. O sistema sempre prevalece se pedir redução. Wrappers ficam imediatos e CSS remove também animações de controles/portais. A biblioteca não aplica essa preferência automaticamente nesta versão, por isso o tratamento é explícito. O antigo reduceMotion forçado não é interpretado como escolha pessoal nesta nova implementação.

Sem animações automáticas de páginas, números, gráficos ou Kanban. Sem movimento durante busca. Dados operacionais não são atrasados para completar uma transição.

## Ampliação do padrão — 30/09/2026

Pedido atualizado: movimento fluido em todo o aplicativo, inclusive Kanban.

- TransitionGroup coordena troca de páginas, títulos, abas de Configurações e Resumo, visualizações do Organograma, disponibilidade e resultados do Analytics. Entrada: 240 ms, opacity e 10 px verticais; saída: 140 ms e -4 px, curvas oficiais. O conteúdo novo recebe ações imediatamente. O anterior fica absoluto, inert e aria-hidden até desaparecer.
- AnimateLayoutGroup cobre os cards das colunas do Kanban: entrada com 8 px e escala 0.985, saída, altura e acomodação dos demais cards. Sem atraso adicional. Não há promessa de voo entre colunas: saída e entrada são coordenadas em cada coluna.
- Detalhes entram em 280 ms com deslocamento de 64 px; saída 150 ms. Interrupções reutilizam o painel existente.
- Cards têm feedback de elevação 2 px apenas com mouse; medidores usam scaleX e transição 240 ms, sem animar largura. Filtros, avisos e controles mantêm os padrões oficiais anteriores.
- Hooks e estado dos filtros/preferências permanecem fora das áreas substituídas. Redução de movimento continua imediata e sem retenção de saída.

A nota anterior sobre ausência de transições de páginas/Kanban fica supersedida por este pedido. Nenhum movimento decorativo contínuo foi adicionado.
