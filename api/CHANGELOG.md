# Changelog

## 23/09/2026 · precisão de qualificados no Resumo Diário

- **Regra oficial:** só um evento criado no Google Agenda com título `Consultoria Nome Sobrenome` integra a base de criação. A data do filtro é a data/hora de criação em `America/Sao_Paulo`, nunca a data da reunião.
- `qualified` contém somente o primeiro registro de cada nome/telefone no histórico qualificado; `rescheduledEvents` contém as criações do dia cujo nome/telefone já existia. Status manual não modifica essa separação.
- `lead_creation_history.qualified_consultoria` isola follow-ups e reuniões SDR. Registros históricos sem cópia ativa preservam a capacidade de reconhecer nomes repetidos quando têm nome completo.
- A resposta mantém, de forma independente, `createdAt` (criação no Google) e `eventDate`/`startsAt` (reunião). Regressão cobre novo, repetido e registro não qualificado; 32 testes, typecheck e build aprovados.

## 16/09/2026 · Qualificados e lista de reagendadas

- O resumo compartilhado passou a expor `qualified` como nome operacional dos novos leads criados no Google na data selecionada, sem cálculo paralelo: `qualified.total = created.new`. A lista inclui lead, criação e data da reunião, inclusive registros históricos não mais presentes na agenda.
- `rescheduledEvents` detalha a contagem existente de `rescheduled`: lead, closer, data e horário da reunião, origem e momento comprovado do reagendamento quando disponível. A classificação e a contagem usam a mesma regra central; V1 mantém o contrato anterior.
- Testes isolados, typecheck e build aprovados. Serviço real reiniciado e saúde/leitura do cliente web conferidas. Listas novas validadas na API isolada.

## 16/09/2026 · Acontecidas no Resumo Diário

- **Correção validada:** a API compartilhada inclui em `Acontecidas` consultorias concluídas no fluxo operacional, além de Compareceu marcado. Antes, contava apenas Compareceu manual e mostrava zero para 15/09.
- Presença confirmada e taxa de presença continuam restritas a Compareceu; no-show, reagendamento e Over mantêm as regras existentes.
- Regressão com seis consultorias fictícias: 3 acontecidas, 3 no-shows e nenhuma presença manual. Testes isolados, typecheck e build aprovados.

## 15/09/2026 · contrato central

- Troca `mode:web` estabelece cookie HttpOnly e não retorna token ao JavaScript. Fluxo Bearer anterior permanece compatível.
- Eventos expõem apresentação operacional central; hora passada nunca comprova Compareceu.
- Resumo expõe taxas oficiais sem Over; analytics inclui série diária e reagendamentos marcados.
- **Correção validada:** último sync SQL UTC agora retorna ISO explícito. Detalhes adicionam horário histórico ISO para apresentação em São Paulo.
