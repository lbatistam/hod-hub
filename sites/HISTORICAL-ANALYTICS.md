# Histórico pessoal de agendamentos — 2026

## Fonte e cobertura

A integração Google do aplicativo continua independente do plugin Calendar. O aplicativo agora sincroniza também agendas com papel `owner`, além das agendas operacionais selecionadas; essa importação não ativa a agenda pessoal como capacidade de closer. As credenciais e chamadas Google continuam no servidor. Eventos completos persistidos em D1 sustentam o cálculo; a interface não recompõe regras de autoria.

Em 02/10/2026, o plugin Calendar estava autenticado em `leandrobatista@metodohod.com`, diferente do endereço `leandrobatistam@metodohod.com` informado na conversa. A listagem completa limitada a 01/01–02/10 trouxe 1.370 eventos, incluindo internos. Isso não é um total de consultorias. O primeiro evento dessa listagem foi em 04/02. O plugin Gmail retornou autorização vencida. A conta pessoal informada ainda precisa ser confirmada e conectada: janeiro não pode ser considerado auditado só pela conta empresarial.

Marcos e Graziela têm convites verificáveis na agenda principal. Há convites usando `grazielasutero26@gmail.com`; o proprietário confirmou em 02/10/2026 que é o endereço pessoal da Graziela, consolidado como alias do corporativo. Carina/Karina e Nathan não serão acrescentados com números inventados. Nome de lead contendo Marcos, Karina ou Nathan não identifica o closer.

## Contagem

- Escopo de autoria: e-mail do organizador ou criador deve corresponder a uma agenda própria verificável da conexão. Nome de exibição isolado não prova autoria.
- Cópias: identidade canônica existente, baseada em iCalUID e ocorrência recorrente; cada evento/ocorrência conta uma vez.
- Títulos de consultoria, incluindo erros tolerados pela regra operacional, entram; demais títulos exigem closer conhecido e evidência de contato de lead. Dailies, weeklies e reuniões internas são excluídas.
- Closer: participante identificado pelo cadastro oficial. Rafael é desconsiderado como candidato quando há outro closer no convite. Mais de um candidato restante fica em revisão, fora do ranking; o evento permanece no volume pessoal.
- Datas: criação e reunião são dimensões distintas, sempre America/Sao_Paulo. Padrão: criação desde 01/01/2026 até hoje. Reuniões futuras criadas no período entram pela criação. Registros sem criação verificável ficam fora dessa dimensão.
- Histórico: cancelamentos preservados são agendamentos feitos. Cancelamentos apagados antes de a integração existir não são reconstruíveis. Esta análise não calcula no-show nem presença.
- Status: ex-closers conhecidos recebem Desligado. Ausência de agenda compartilhada não prova desligamento de uma pessoa.

## Interface

Componentes oficiais OpenAI Apps SDK UI: Alert, Badge, SegmentedControl, Choice/Select, DateRangePicker, EmptyMessage; painéis e movimento existentes preservados. Gráficos são composição reutilizável de barras HTML e linha SVG com tokens semânticos, sem outro kit. Gráficos têm números textuais acessíveis e alternativa de tabela no ranking. Volume mensal cronológico separado do ranking de meses.

## Validação e pendências

`node tests/historical-analytics.mjs` cobre autoria, duplicação de convites, antigo closer, título alternativo, reunião interna, atribuição ambígua, cancelamento, criação São Paulo e dados faltantes. `node tests/daily-summary.mjs` preserva regras operacionais. Validar ainda a importação hospedada completa, totais após leitura, identidade dos aliases e união com a conta pessoal. Nunca apresentar total parcial como trajetória completa.

A consulta histórica reduz cópias em SQL antes da leitura e projeta apenas os campos necessários; descrições limitadas aos primeiros 4.000 caracteres para detectar contato em títulos não padronizados. Contato presente somente além desse trecho exige revisão. Agendas próprias iniciam com páginas de 250 eventos.
