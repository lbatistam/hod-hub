# HOD Hub no Sites

Aplicativo privado da operação de consultorias, com dados reais do Google Agenda, servidor Cloudflare Workers e persistência D1. Interface React, TypeScript, Tailwind 4 e OpenAI Apps SDK UI oficial. Login do Sites e autorização Google Calendar somente leitura são independentes. Segredos e tokens permanecem protegidos no servidor.

Aplicativo: https://hod-hub-operacao.leandrobm.chatgpt.site

## Telas e regras
Início, Organograma (Kanban, timeline e lista), Detalhes, Horários Livres, Resumo Diário, Analytics e Configurações. Organograma: Agendadas, Acontecendo, Compareceu e No-show. Temas claro, escuro e sistema; animações oficiais com movimento reduzido.

Resumo Diário (regra de 01/10/2026):
- Agendamentos: consultorias marcadas para a data da reunião selecionada.
- Qualificados: primeiras criações dos nomes no histórico verificável, criadas na data selecionada.
- Reagendamentos: novas criações nessa data de nomes que já possuem outro agendamento distinto.
- Passadas: consultorias da data na agenda de outro closer, sem depender do horário.
- Não passadas: continuam no Rafael ou sem closer identificável.
- No-show: consultorias da data riscadas no Google Agenda (declined da própria agenda). Não inferir por horário, repetição de nome ou marcação manual.
- Compareceu não é indicador nem filtro do resumo; permanece no Organograma.

Uma tabela mostra criação e reunião com datas/horários separados. Cópias de convite não duplicam consultorias; recorrências não qualificam novamente o mesmo lead. Histórico indisponível é lacuna explícita.

## Sincronização e desenvolvimento
Atualização incremental automática enquanto a tela está ativa: espera 10 segundos após cada ciclo; retomada ao voltar ao app ou recuperar a rede. Tarefa em nuvem horária, intervalo mínimo do Sites, para app fechado. Sem promessa de push instantâneo.

Instalar com npm run install:ci; desenvolvimento npm run dev -- --port 4318; validar npx tsc --noEmit e node tests/daily-summary.mjs; compilar npm run build. A hospedagem usa Worker ESM, não um servidor Express tradicional.

BACKEND.md documenta arquitetura, segurança, persistência, cobertura e regras. GOOGLE_SETUP.md descreve configuração OAuth. DESIGN.md e MOTION.md documentam a interface oficial. Não versionar .env, tokens, banco ou .sites-runtime. O aplicativo local existente permanece preservado durante a continuidade do produto.

### Acontecidas — 01/10/2026
Regra operacional definida pelo usuário: agendamentos da data menos no-shows Google. O backend retorna o total e IDs da mesma base, sem exigir fim do horário, distribuição para closer ou Compareceu manual. É o complemento das consultorias riscadas, não uma comprovação independente de presença. Categoria dedicada em controle segmentado, com busca e exportação mantendo a base selecionada.
