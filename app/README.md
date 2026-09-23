# HOD Hub

Aplicativo local para acompanhar consultorias, closers, disponibilidade, presença e produção diária usando dados do Google Agenda.

## Abrir o aplicativo

Use `/Applications/HOD Hub (Web).app` ou abra `http://localhost:8787/production/inicio.html`.

Para iniciar manualmente a partir desta pasta:

```bash
pnpm run app
```

O LaunchAgent `com.metodohod.hod-hub` inicia o servidor na porta 8787. A HOD Platform inicia separadamente na porta 8877.

## Arquitetura

- `src/app/hod-data.js` acessa `http://localhost:8877/api/v1` para autenticação e dados de negócio.
- Node.js + Express entrega somente o frontend na porta 8787.
- O backend e o banco operacional ficam em `../../services/hod-hub-api/`.
- Vite + Vanilla JavaScript + SCSS no frontend.
- O frontend, o shell e o design system são próprios do HOD Hub.
- Páginas em `production/`, com artefato servido em `dist/production/`.
- Movimento centralizado em `src/app/hod-motion.js`. A preferência local de animações e a redução de movimento do sistema são respeitadas.

## Comandos

```bash
pnpm run build     # gera dist/
pnpm run lint      # valida o JavaScript
pnpm test          # testa regras de agenda e classificação
pnpm run smoke     # confere páginas e recursos do build
pnpm run app       # inicia o servidor local
```

## Estrutura essencial

```text
production/              HTML das seis telas
src/neutral-main.js      integração das telas Neutral Modern
src/main.js              entrada técnica da tela de login
src/app/hod-data.js      cliente da API universal
src/scss/app/            estilos preservados da tela de login
server/                  servidor estático local
public/                  marca, ícones e PWA
data/                    logs locais do launcher
```

## Regras críticas

- “Reagendar” também contabiliza No-Show, mas permanece visível para recuperação.
- “Acontecidas” no Resumo Diário inclui concluídas no fluxo e Compareceu. A taxa de presença só considera Compareceu marcado.
- Over fica separado dos closers e da taxa de No-Show.
- Títulos com pequenos erros de digitação em “Consultoria” devem continuar reconhecidos.
- Horários e datas são calculados em `America/Sao_Paulo`.
- O Organograma usa Kanban como visão única da operação.

Antes de alterar o app, execute lint, teste, build e smoke.

## Estado atual

Este é o único frontend ativo. As seis telas usam a direção Neutral Modern exportada pelo OpenDesign e consomem a API universal da HOD Platform. O Resumo Diário usa `/api/v1/daily-summary`; as regras ficam no serviço central. Todos os cards do Kanban podem ser arrastados entre colunas e continuam oferecendo ações para mudar de estado ou voltar ao fluxo.
