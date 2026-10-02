# Padrão amplo de movimento — 30/09/2026

- Transição real entre páginas observada em execução: 240 ms, opacity intermediária 0.15 e translateY de 8.5 px. Saídas recebem aria-hidden e inert.
- Configurações: trocas rápidas Google/Calendários/Geral terminam com apenas a aba atual; seleção não salva de calendário preservada entre abas e páginas secundárias.
- Organograma: Kanban/Timeline/Lista, detalhes por teclado, mudança demonstrativa de Ana para Compareceu: 13 cards finais, uma ocorrência na coluna correta, nenhuma saída pendente. Busca preservada ao sair e retornar.
- Resumo, Analytics e Horários Livres: troca de bases/períodos/visualizações sem erro no console.
- Movimento reduzido: 0 s, sem saídas retidas; restaurado ao padrão após teste.
- Viewport móvel: 13 cards, sem overflow horizontal da página. Override removido.
- TypeScript aprovado. Integrações reais não foram exercitadas nesta alteração visual.

# Validação de movimento — 30/09/2026

- TypeScript aprovado. Filtros com AnimateLayout realmente expandem altura; inversões rápidas não deixam regiões vazias.
- Detalhes com SlotTransitionGroup: fechamento por Escape, retorno ao botão de origem, foco inicial no botão Fechar e reabertura durante saída sem duplicar painel.
- Switch Reduzir movimento acionável por teclado, persiste após recarregar; transições computadas passam de 150 ms para 0 s.
- Preferência do sistema emulada: reduz movimento automaticamente; ao restaurar, transições voltam a 150 ms. Emulação removida após teste.
- Pendência demonstrativa concluída: contador 2 → 1, indicadores e histórico atualizados; sem erro no console. Detalhes em viewport móvel: sem overflow horizontal, foco em Fechar, Escape retorna ao botão de origem.
- Build completo aprovado e git diff --check limpo.
- Dados continuam demonstrativos; integração Google não validada nesta alteração.

As verificações de ausência de movimento abaixo são históricas, anteriores à autorização.

# Validação da migração completa do frontend

## Etapa final — 30/09/2026
Padrão aprovado; todas as seis páginas convertidas. Build de produção e TypeScript passaram após a remoção do kit antigo. Backend, auth, API Google e fixtures preservados sem diferenças.

Verificações no navegador:
- Navegação às quatro páginas restantes no mesmo aplicativo e restauração da rota por query após recarga.
- Horários Livres: período Noite retornou cinco janelas; visão Por closer mostrou ocupação correspondente. Popover oficial para detalhes de janela.
- Resumo: reunião em 29/09 retorna 13; criação em 28/09 retorna 13 e zero reuniões na data. Busca Bruno retorna um registro. Botão Exportar dispara exportação e retorna sucesso; conteúdo baixado não foi inspecionado nesta rodada.
- Analytics: todo histórico retorna 16 registros; filtro Antigos retorna três registros e dois closers. DateRangePicker de 14 a 22/08 retorna três exemplos históricos. Calendário responsive usa um mês no celular.
- Configurações: Switch de telefone, RadioGroup de densidade, gravação local e restauração após recarga; Checkbox Luccas por Espaço muda seleção de sete para seis. Preferências restauradas ao padrão confortável com telefones e todos os calendários antes da entrega.
- Temas claros/escuros e ausência de movimento confirmados por estilos computados (animation none, transition 0s). Barras quantitativas usam bg-info-solid oficial, com cor computada RGB 2/133/255.
- Quatro páginas restantes em viewport solicitado 390×844 (zoom do browser: largura CSS 312): documentWidth 303, sem overflow global. Tabela e segmentos rolam internamente. Tema escuro: texto branco / fundo RGB33. Viewport restaurado.
- /conexao convertida visualmente com os mesmos POSTs e payloads existentes. Não foi iniciada autorização Google.

Ainda não validado: Google real/persistência, dispositivo físico, leitor de tela completo, todos os caminhos do calendário por teclado, drag-and-drop em toque. DatePicker/DateRangePicker mantêm limitações oficiais de rótulos mensais e textos internos ingleses; não são inventadas props para corrigi-las.

A migração visual cobre todas as páginas; não equivale à integração operacional real. Histórico de testes da etapa 1 abaixo.

# Validação da etapa 1

## Verificado em 29/09/2026
- Build de produção Vinext passou; exports oficiais conferidos nos tipos npm 0.2.2.
- Início ↔ Organograma e query de navegação.
- Busca Mariana; filtro Luccas com três registros; filtro mantido na lista.
- Kanban, timeline e lista renderizados; data 30/09 vazia e retorno a 29/09.
- Cópia de nome por clique e telefone por Enter, conteúdo conferido no clipboard.
- Alteração de situação no Select do painel, histórico atualizado; observação salva no protótipo.
- Alteração na lista preservou scrollY 660.8 antes/depois.
- Tab/Shift+Tab no painel, Escape, proteção de observação não salva e retorno de foco ao acionador.
- Claro/escuro com cores computadas; sistema conectado ao media query. Preferência mantida no armazenamento existente.
- Elementos amostrados apresentaram animation none e transition 0s; sem spinner animado.
- Estados vazio, erro e carregamento vistos no navegador; exemplos preservados no erro.
- Viewport móvel solicitado 390×844 (zoom do navegador resultou em largura CSS 312): Início e timeline sem overflow global, documentWidth 303. Desktop solicitado 1440×1000, mais layout original 1024. Kanban/tabela usam rolagem horizontal interna intencional.
- Contraste amostrado: texto principal claro ~19:1 e escuro ~16:1; secundário claro ~6.6:1 e escuro ~7.4:1. Alert usa variante soft com cores semânticas. Não equivale a auditoria completa de contraste.
- Diferenças de backend, autenticação, dados de exemplo e rotas Google: nenhuma.

## Não validado / restante
- Aprovação visual ainda pendente; páginas restantes não convertidas.
- Google real, persistência operacional e OAuth não estavam conectados e continuam fora desta etapa.
- Acesso privado da nova versão em produção: não publicado; auth de servidor preservada, local usa o ambiente de desenvolvimento existente.
- Dispositivo físico móvel, todos os tamanhos/combinações de filtros, drag-and-drop em toque, leitor de tela e calendário inteiro por teclado não foram validados.
- DatePicker oficial tem botões mensais sem nome acessível e dias abreviados em inglês; CopyTooltip também tem texto interno inglês. Limitações registradas na arquitetura.

A compilação confirma compatibilidade técnica, não conclusão da migração ou validação de integrações reais.
