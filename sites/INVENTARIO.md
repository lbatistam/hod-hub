> Estado atual em README.md e BACKEND.md; inventário abaixo preserva a etapa inicial de construção.

# Inventário funcional e decisões — HOD Hub

Fontes lidas em 29/09/2026:
- GitHub: https://github.com/lbatistam/hod-hub — main, commit baedd1cc9f64e7fa00e53c39a3858acbc7df9bc5.
- Notion: https://app.notion.com/p/3cda729118738173827efd93c877e0e0 — conteúdo retornado com última edição em 26/09/2026.
- Documentos de arquitetura, instalação, regras, API, segurança e README; implementação de calendar, summary, history, db e módulos de regras de título, closer, disponibilidade, consultorias e resumo diário.
- Configuração privada da API atual: confirmada apenas a presença de GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e retorno local. Nenhum segredo foi exibido ou copiado para o código, e nenhum serviço atual foi alterado.

As duas fontes solicitadas estavam acessíveis. O GitHub não contém os bancos, tokens, notas ou histórico privado; essa ausência é intencional. A verificação de funcionalidades aqui é leitura de documentação/código, não uma nova validação dos fluxos reais do app existente.

## Telas e contrato

| Tela | Funcionalidades e dados | Entrega atual |
|---|---|---|
| Início | Data compartilhada, indicadores, próxima reunião, sequência, pendências derivadas, atalhos | Frontend completo com exemplos |
| Organograma | Data, busca por nome/telefone/closer, filtros, Kanban/timeline/lista, copiar, Meet, estado manual | Frontend completo com exemplos |
| Detalhes | Contato, reunião, closer, estado, Meet, criação separada, histórico, observação editável | Painel navegável com exemplos |
| Horários Livres | Disponibilidade 08–23, blocos completos de 1h, qualquer sobreposição elimina bloco; closers ativos e Over separados | Frontend completo com exemplos |
| Resumo Diário | Qualificados, agendamentos, passadas, não passadas, no-shows Google, reagendamentos; criação e reunião separadas | Frontend completo com exemplos |
| Analytics | Volume e ranking histórico como foco; equipe histórica preservada; cobertura dos registros explícita | Frontend completo com exemplos |
| Configurações | Aparência, preferências, conta Google, calendários, sincronização e recuperação | Frontend completo; preferências locais; conexão demonstrativa |

## Regras preservadas e atualizadas
- Colunas únicas: Agendadas, Acontecendo, Compareceu e No-show. Não haverá confirmação, não confirmação ou coluna Canceladas.
- Presença exige marcação explícita. O código antigo possui uma apresentação que coloca reunião encerrada em coluna de presença pelo relógio: não reutilizar. Sem resultado registrado, uma reunião passada continua com pendência.
- Acontecendo usa início e fim reais; 50min é apenas fallback documentado, se realmente faltar fim válido.
- Estado manual administrativo prevalece; recusa/cancelamento da fonte é evidência com origem, não bloqueio de decisão. Cancelamento Google será tombstone/fato de fonte, sem nova coluna e sem inferir automaticamente presença/ausência histórica.
- Apenas título de Consultoria com nome completo gera base qualificada; follow-ups e reuniões SDR ficam separados. Título antigo aceita prefixo HOD e até dois erros de digitação; preservar tolerância com testes de regressão.
- Qualificado versus reagendado usa nome normalizado ou telefone no histórico anterior, comparando `createdAt`. Google created, updated e start são campos diferentes.
- Primeira ocorrência só pode ser chamada de primeira no histórico consultado; cobertura incompleta deve gerar ressalva nos dados e na métrica. Não apresentar histórico limitado como vida inteira do lead.
- Consultoria criada hoje para outro dia deve entrar no Resumo de criação de hoje, além da agenda do dia da reunião.
- Reagendamento não equivale automaticamente a No-show. Alteração de horário no mesmo evento e novo evento repetido precisam ser identificados sem apagar a trajetória.
- Over separado da capacidade, ranking e taxas dos closers; Rafael tem regra de over a partir de 15/07/2026.
- Luccas ativo; Misael, Karina, Marcos e Graziela antigos; Álvaro atualmente SDR, ainda consultável no histórico. Identificação por calendário e, para históricos sem agenda direta, convidados da agenda principal.
- Disponibilidade indisponível é desconhecida, nunca zero. Todos os compromissos bloqueantes contam para ocupação, mesmo quando não são consultorias.
- Datas operacionais em America/Sao_Paulo. Eventos de dia inteiro usam datas locais, não UTC inventado.

## Riscos encontrados na fonte
A API existente faz leitura paginada limitada a 10.000 itens e espelho por intervalo, sem syncToken. A nova implementação precisa sinalizar incompletude, lidar com 410 e só avançar cursor após gravação completa. Reunião passada, presença registrada e recusa devem ser dimensões separadas. Taxas do legado não serão reaproveitadas quando a cobertura de registros de presença for insuficiente.

## Escopo atualizado em 29/09/2026
O usuário aprovou a direção visual e autorizou todas as telas. Depois adiou explicitamente Google e backend: “FAÇA SO O FRONT END INTEIRO”. Todas as telas foram expandidas no mesmo padrão visual. Google, D1, sincronização e migração permanecem trabalho futuro, sem bloquear a entrega visual. A configuração protegida de credenciais feita antes dessa mudança não representa autorização nem leitura real.

Nenhuma base operacional foi migrada, nenhum evento real foi alterado e o aplicativo atual continua independente desta construção.
