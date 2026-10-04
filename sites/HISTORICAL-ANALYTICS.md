# Analytics histórico — regra vigente em 04/10/2026

## Fontes e privacidade

O backend consulta Google Calendar com OAuth somente leitura, separado do login privado do aplicativo. As contas corporativa e pessoal possuem credenciais independentes, protegidas por AES-GCM no servidor. Ambas as agendas próprias e todas as agendas operacionais selecionadas são sincronizadas e persistidas em D1. Uma agenda compartilhada tem identidade/cursor únicos, mesmo quando acessível por duas contas. Falhas de uma conexão não apagam a outra. A cobertura exige todas as fontes selecionadas concluídas, sem erro nem paginação pendente.

O plugin Google Calendar é uma fonte adicional de conferência; não substitui as credenciais de produção. Leitura integral de janeiro até a data da extração não transforma compromissos internos em consultorias.

## Seleção histórica

O proprietário confirmou que, após adoção do GoHighLevel, **Consultoria no título identifica seu agendamento**, mesmo quando seus e-mails não constam no convite. Não exigir participação ou autoria Google nesses títulos. Usar a regra operacional tolerante a erros de digitação e também a palavra Consultoria no título.

Eventos antigos sem esse título entram somente quando há autoria/participação de uma conta própria, closer conhecido e evidência de lead. Dailies, weeklies e reuniões internas continuam excluídas. Eventos atribuídos explicitamente pelo proprietário a outros SDRs (por exemplo, Ana Paula) são excluídos. A confirmação do título não apaga essas exclusões individuais.

Closer reconhecido e lead são obrigatórios. Sem closer, preservar o evento bruto e excluir da contagem/ranking. A recorrência de um convidado não o transforma em closer. Cadastro oficial e aliases confirmados identificam pessoas; o alias pontual de Felipe permanece restrito ao evento autorizado. Luccas usa dois C; Reunião e a identidade do próprio SDR não são closers. Antigos membros mantêm seus créditos com Antigo membro / Antiga membra; Álvaro permanece Ex-Closer.

## Deduplicação e datas

1. Unificar cópias do mesmo convite por identidade canônica Google (iCalUID e ocorrência). Manter todos os convidados das cópias para não perder closers.
2. No Analytics, unificar eventos elegíveis com **nome de lead igual**, sem diferença de maiúsculas, acentos, pontuação ou espaços. Sufixos explícitos de reagendamento/retorno são removidos. Não usar correspondência aproximada.
3. Cada lead conta uma única vez em todo o histórico desde janeiro de 2026, ainda que tenha sido agendado quatro vezes. Homônimos exatos são unidos por esta regra solicitada pelo proprietário.
4. O registro de referência é o de primeira criação verificada. Esse dia determina o mês padrão; a dimensão reunião usa a reunião desse registro. As duas datas permanecem separadas em America/Sao_Paulo. Reagendamentos não reaparecem como novos leads em meses posteriores.
5. Unir todos os closers associados ao lead elegível, concedendo **um crédito por lead por closer**. Dois closers no convite recebem ambos o crédito. A soma do ranking pode superar o total de leads.

Deduplicar a base completa antes de aplicar filtros de período/equipe. Cada filtro usa a mesma base e os mesmos créditos nas telas e exportações. O Organograma, estados operacionais, histórico, observações e reuniões individuais no banco permanecem intactos; esta deduplicação é exclusiva da contagem histórica.

## Exportações e interface

Endpoint privado autenticado exporta Excel OOXML com Agendamentos/Ranking/Meses/Metodologia, CSV de agendamentos/ranking/meses e JSON com dados normalizados e cobertura. Sem tokens ou payload bruto. CSV protegido contra fórmulas; contatos em XLSX são células de texto. Todos os formatos compartilham filtros e metodologia do dashboard.

Componentes oficiais OpenAI Apps SDK UI existentes preservados. Gráficos são barras HTML e linha SVG acessíveis, com tokens oficiais e tabela no ranking. Meses cronológicos e ranking de meses usam a primeira criação do lead; mês atual fica identificado como em andamento.

## Validação e limites

Testes históricos verificam título sem SDR, eventos antigos com participante, cópias de agenda, dois closers, aliases, quatro repetições em meses distintos, normalização de nomes, exclusões internas/outros SDRs, cancelamento e horário São Paulo. Testes de exportação verificam filtros, ranking, CSV e XLSX reais. TypeScript e build de produção passaram. Backend hospedado e dashboard privado foram conferidos após publicação, com meses recentes e Paulo/Luigi incluídos.

Datas Google comprovam criação do evento, não a pessoa que executou o agendamento; a atribuição por título é uma regra expressamente confirmada pelo proprietário. Cancelamentos preservados continuam como agendamentos feitos. Eventos apagados antes da conexão não são reconstruídos. Não há métricas de presença/no-show neste Analytics. Janeiro reflete apenas os registros que atendem à regra nas fontes conectadas; não preencher lacunas com estimativas.
