# Histórico pessoal de agendamentos — 2026

## Fonte e cobertura

A integração Google do aplicativo continua independente do plugin Calendar. O aplicativo agora sincroniza também agendas com papel `owner`, além das agendas operacionais selecionadas; essa importação não ativa a agenda pessoal como capacidade de closer. As credenciais e chamadas Google continuam no servidor. Eventos completos persistidos em D1 sustentam o cálculo; a interface não recompõe regras de autoria.

Em 02/10/2026, o plugin Calendar estava autenticado em `leandrobatista@metodohod.com`, diferente do endereço `leandrobatistam@metodohod.com` informado na conversa. A listagem completa limitada a 01/01–02/10 trouxe 1.370 eventos, incluindo internos. Isso não é um total de consultorias. O primeiro evento dessa listagem foi em 04/02. O plugin Gmail retornou autorização vencida. A conta pessoal informada ainda precisa ser confirmada e conectada: janeiro não pode ser considerado auditado só pela conta empresarial.

Marcos e Graziela têm convites verificáveis na agenda principal. Há convites usando `endereço pessoal da Graziela`; o proprietário confirmou em 02/10/2026 que é o endereço pessoal da Graziela, consolidado como alias do corporativo. Carina/Karina e Nathan não serão acrescentados com números inventados. Nome de lead contendo Marcos, Karina ou Nathan não identifica o closer.

## Contagem

- Escopo de autoria: e-mail do organizador ou criador deve corresponder à identidade da conexão ou às contas explicitamente informadas pelo proprietário, guardadas nas preferências privadas. Essas identidades não são publicadas no código. A interface distingue autoria considerada de agendas com cobertura completa. Nome de exibição isolado não prova autoria.
- Cópias: identidade canônica existente, baseada em iCalUID e ocorrência recorrente; cada evento/ocorrência conta uma vez.
- Títulos de consultoria, incluindo erros tolerados pela regra operacional, entram; demais títulos exigem closer conhecido e evidência de contato de lead. Dailies, weeklies e reuniões internas são excluídas.
- Closer: participante identificado pelo cadastro oficial. Rafael é desconsiderado como candidato quando há outro closer no convite. Mais de um candidato restante fica em revisão, fora do ranking; o evento permanece no volume pessoal.
- Datas: criação e reunião são dimensões distintas, sempre America/Sao_Paulo. Padrão: criação desde 01/01/2026 até hoje. Reuniões futuras criadas no período entram pela criação. Registros sem criação verificável ficam fora dessa dimensão.
- Histórico: cancelamentos preservados são agendamentos feitos. Cancelamentos apagados antes de a integração existir não são reconstruíveis. Esta análise não calcula no-show nem presença.
- Status: ex-closers conhecidos recebem Antigo membro ou Antiga membra, conforme preferência expressa do proprietário. Álvaro recebe Ex-Closer, pois continua na equipe como SDR. Ausência de agenda compartilhada não prova desligamento de uma pessoa.

## Interface

Componentes oficiais OpenAI Apps SDK UI: Alert, Badge, SegmentedControl, Choice/Select, DateRangePicker, EmptyMessage; painéis e movimento existentes preservados. Gráficos são composição reutilizável de barras HTML e linha SVG com tokens semânticos, sem outro kit. Gráficos têm números textuais acessíveis e alternativa de tabela no ranking. Volume mensal cronológico separado do ranking de meses.

## Validação e pendências

`node tests/historical-analytics.mjs` cobre autoria, duplicação de convites, antigo closer, título alternativo, reunião interna, atribuição ambígua, cancelamento, criação São Paulo e dados faltantes. `node tests/daily-summary.mjs` preserva regras operacionais. Validar ainda a importação hospedada completa, totais após leitura, identidade dos aliases e união com a conta pessoal. Nunca apresentar total parcial como trajetória completa.

A consulta histórica reduz cópias em SQL antes da leitura e projeta apenas os campos necessários; descrições limitadas aos primeiros 4.000 caracteres para detectar contato em títulos não padronizados. Contato presente somente além desse trecho exige revisão. Agendas próprias iniciam com páginas de 250 eventos.

O proprietário confirmou a identidade pessoal de Nina como Karina e a conta pessoal de Larissa como a mesma pessoa do corporativo. Mapeamentos de pessoa são guardados em preferências privadas; não dependem de agendas antigas ainda compartilhadas. Reunião é um calendário genérico, nunca uma pessoa. A identidade do autor é excluída dos convidados candidatos.

## Duas contas e exportação (02/10/2026)

- `google_accounts` mantém um envelope AES-GCM e expiração por `(owner,account)`. A conta é comprovada pela propriedade `primary` de CalendarList, não pelo e-mail digitado ou pela conta ChatGPT. O OAuth continua Calendar somente leitura, offline, com consentimento e seleção de conta. Um `login_hint` também é validado no retorno. Sem identidade correspondente, nada é substituído.
- Migração aditiva 0002: credencial original em `google_connections` preservada; migração idempotente para conta verificada; calendários existentes recebem `connection_account`. Adicionar outra conta nunca herda o refresh token de outra identidade.
- A mesma agenda compartilhada mantém uma linha e cursor global; a agenda principal da segunda conta passa a ser importada automaticamente. Cada fonte usa sua credencial. Eventos em agendas diferentes continuam unificados pelo iCalUID + ocorrência, sem deduplicação por nome. Renovação/erro de uma conta não deve apagar dados ou credenciais da outra.
- Configurações → Google Agenda mostra contas individualmente e oferece adicionar Gmail pessoal/qualquer outra conta, além de renovação específica. Se o OAuth Google estiver como interno, a conta pessoal exige configuração externa e inclusão nos usuários de teste; isso depende da política Google.
- Analytics exporta somente o filtro atual por endpoint autenticado: Excel OOXML genuíno com Agendamentos/Ranking/Meses/Metodologia, CSV de agendamentos/ranking/meses e JSON com registros normalizados + cobertura. Não há tokens ou payload bruto nas exportações. Datas em São Paulo; revisões no volume, fora do ranking; CSV protegido contra fórmulas; XLSX usa células de texto para contatos. fflate apenas compacta o OOXML, sem outro kit visual.
- Nome canônico do closer Luccas passa a Lucas, conforme confirmação do usuário. Endereços antigos são mapeados por pessoa em preferências privadas; alias Felipe pode ser limitado a um único evento, sem transformar todo o histórico organizado por Felipe em trabalho de Lucas ou do usuário.
- Os meses permanecem explicitamente parciais até importar a segunda conta e revisar o material disponível. Zero nesta base não comprova ausência de reuniões. Outubro é um mês ainda em andamento.

Auditoria de cobertura de 02/10: na agenda principal acessível foram encontrados 55 eventos em agosto, 60 em setembro e 4 até 02/10, mas nenhum classificado como consultoria nessa fonte. Nas agendas compartilhadas existem consultorias recentes organizadas/criadas por Rafael e pelos próprios closers. Isso não comprova que o usuário fez esses agendamentos; a base pessoal e eventual auditoria de convites são necessárias antes de atribuir autoria. Não transformar o total geral da operação em total pessoal. As barras sem registros, enquanto parcial, mostram 'A conferir'.

03/10/2026: nome canônico corrigido para Luccas (dois C). Preferências privadas antigas com Lucas continuam resolvendo para a mesma pessoa, inclusive a atribuição pontual de Felipe. Nenhum registro ou total alterado.

## Regra vigente — 04/10/2026
A participação de uma das contas do proprietário no convite é suficiente quando também há closer reconhecido e convidado externo. Não exigir autoria/organização própria para esses eventos, incluindo títulos alternativos. Daily, weekly, alinhamentos e reuniões internas continuam excluídos. Consultorias de autoria própria sem closer identificável permanecem em revisão, preservando o histórico. Mais de um closer permanece ambíguo; aliases da mesma pessoa não duplicam a atribuição. SQL inclui participação em attendees e a classificação centralizada valida closer/convidado. Interface e exportações usam esta mesma regra. Data de criação é do evento Google, não prova de quem executou o agendamento.
