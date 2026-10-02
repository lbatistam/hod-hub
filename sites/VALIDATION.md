# Validação da revisão inicial

29/09/2026. Resultado: protótipo local navegável; integração hospedada e persistência ainda não validadas.

## Verificado
- TypeScript sem erros após frontend e endpoints de prova.
- Prévia HTTP de Início respondeu 200 e foi aberta no Codex.
- Início e Organograma; os quatro estados solicitados, sem confirmação ou Canceladas.
- Busca por Mariana abriu apenas seu registro; detalhes exibiram contato, criação separada e observações.
- Filtro Luccas encontrou André, Ana e Pedro; filtro permaneceu ao mudar para Lista.
- Timeline exibiu 13 registros demonstrativos.
- Mudança de Ana para Compareceu refletiu na coluna e indicadores; posição vertical antes/depois 0 → 0. Não foi validada ainda a troca com página previamente rolada nem drag and drop em aparelho físico.
- Observação alterada e salva somente em memória, com entrada de histórico; mudança de situação também acrescentou histórico.
- Cópia de Mariana retornou o nome correto no clipboard do teste.
- Estados Vazio, Carregando e Erro aparecem; carregamento é cancelável; falha preserva exemplos anteriores.
- Google Sans aplicada: computedStyle do título confirmou Google Sans e document.fonts.check retornou true. Fonte variável original hospedada como asset local, com licença OFL.
- Endpoint Google sem identidade retornou sign_in_required; página de conexão sem identidade redirecionou para sign-in. Isso é evidência local, não prova da proteção de produção.

- Layout móvel verificado com viewport solicitado de 390px (312px CSS com zoom do navegador): Início e Timeline sem overflow da página, clientWidth e scrollWidth ambos 300px. Kanban/lista têm contêiner de rolagem próprio.
- Build de produção concluído com rotas dinâmicas e Worker ESM exportando fetch; bindings D1/R2 continuam nulos.

## Pendências obrigatórias
- Integração e validação real adiadas por pedido explícito do usuário. A aprovação visual foi recebida.
- Publicação privada da etapa técnica, configuração OAuth e autorização Google pelo usuário.
- Leitura real hospedada, paginação/reconexão/recusa e acesso anônimo negado no endereço final.
- D1, sincronização, normalização, migração de estados/histórico/notas e consistência entre sessões/dispositivos.
- Validar telefone/Meet reais, métricas e cobertura histórica.
- Uso em celular físico e teclado/zoom amplo na versão integrada.

Não apresentar screenshots, exemplos, build ou testes locais como validação de dados reais.

## Expansão do frontend — 29/09/2026
- Horários Livres: filtro Luccas retorna 12 janelas de 1h e alternância Por closer mantém o filtro. Sobreposição de 14:30–15:20 bloqueia duas janelas completas para Rodrigo.
- Resumo: reunião 29/09 contém 13 agendamentos, 12 qualificados e 1 reagendamento; 5 reuniões encerradas, 3 comparecimentos e 1 no-show. Criação 28/09 contém os 13 registros, mas indicadores pela data da reunião são zero nessa data.
- Analytics: Todo histórico + Antigos retorna 3 exemplos, Misael 2 e Karina 1, ambos identificados como antigos membros. Nenhuma taxa histórica de presença/ausência é criada.
- Preferências: tema escuro, densidade compacta e movimento reduzido salvos localmente e recuperados após reload. Conectar Google produz aviso honesto de integração adiada.
- Viewport móvel 390px solicitado (312px CSS pelo zoom): Horários, Resumo, Analytics e Configurações sem overflow da página; largura documento 300px. Tabela resumo tem rolagem interna e largura 760px. Não equivale a teste em celular físico.
- Google Sans confirmada no estilo computado das novas páginas.

As métricas acima validam exclusivamente fixtures fictícias, não a operação real.
