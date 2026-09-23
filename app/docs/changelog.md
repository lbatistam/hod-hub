# Changelog

## 2026-09-23 — precisão de Qualificados no dia

O Resumo Diário passou a considerar somente agendas criadas no Google Agenda cujo título atende ao padrão `Consultoria Nome Sobrenome`. A separação é feita pela data e hora de criação em `America/Sao_Paulo`: um nome sem ocorrência qualificada anterior é **Qualificado**; um nome já presente no histórico é **Reagendada**. A tabela agora identifica a coluna como “Criado no Google Agenda” e apresenta a data e o horário de criação sem derivá-los da data da reunião.

O histórico local recebeu marcação de origem para impedir follow-ups e reuniões SDR de contaminarem essa regra. Eventos antigos sem cópia ativa continuam servindo para reconhecer repetição quando preservam nome completo. Validação real de 23/09/2026: 3 criações, 1 qualificado e 2 reagendadas.

## 2026-09-22 — frontend Neutral Modern

As seis telas do HOD Hub foram substituídas pelos HTMLs exportados pelo OpenDesign. Os dados demonstrativos e scripts simulados foram desligados; Início, Organograma, Horários Livres, Resumo Diário, Analytics e Configurações agora usam a HOD Platform em `http://localhost:8877/api/v1`. O launcher, o login, o PWA e a raiz do servidor passam a abrir a tela de Início. O frontend anterior foi preservado em `backups/hod-hub-frontend-before-neutral-modern-2026-09-22/` com checksums SHA-256.

Correções posteriores: as seis colunas do Kanban passaram a caber na largura do desktop; drag-and-drop ganhou indicação de destino e persistência pela API; tema e zoom passaram a usar uma preferência única em todas as páginas; o tema escuro adotou fundo preto; a marca lateral passou a usar o ícone oficial; e o Resumo Diário passou a listar todos os leads criados no dia, com horário de criação, data da reunião e classificação entre novo lead e reagendamento.

## 2026-09-22 — HOD Hub Vanilla Edition

Removidos a casca Gentelella/Colorlib, o adaptador de API inativo, folhas visuais não carregadas, assets e fontes sem referência, configurações de ferramentas sem uso e o backend local duplicado. O servidor 8787 agora entrega somente o frontend; autenticação, calendário, regras e banco continuam na HOD Platform em 8877. A estrutura ativa passou a usar `src/main.js`, `src/app/` e `src/scss/app/`, sem nomes de versões antigas ou kits externos. O backend local removido foi preservado em `backups/hod-hub-legacy-local-backend-2026-09-22/` com checksums SHA-256.

## 2026-09-15 — limpeza do ecossistema

ShadCN e HeroUI foram desinstalados. O Web App é o único cliente mantido. Os LaunchAgents do Web e da Platform foram corrigidos para a raiz ativa `HOD Workspace`, sem movimentação de fontes ou bancos. Leitura e escrita temporária da Platform, sincronização real do Google Agenda e entrega da página inicial foram verificadas. O resumo diário permanece pendente de unificação e sua inicialização atual falha por referência a um botão de copiar removido do HTML.

## 5.0.0

Nova interface do HOD Hub e evolução do design operacional.

## 4.2.0

Resumo diário e consolidação das regras de presença.

## 4.1.3

Recuperação automática de reagendamentos e No-Shows.

## 4.1.2

Navegação rápida entre dias.

## 4.1.1

Disponibilidade simplificada.

## 4.1.0

Horários livres e memória da equipe.

O histórico integral anterior permanece no snapshot de 14/09/2026 em `backups/`.
