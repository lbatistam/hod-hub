> Atualização: a prova hospedada do Google foi concluída em 30/09/2026. D1, OAuth offline e as APIs de operação foram implementadas; detalhes atuais em BACKEND.md. O planejamento abaixo é mantido como registro de decisões anteriores.

# Arquitetura — HOD Hub no Sites

## Escolha e estado
React + Vinext + servidor ESM em Cloudflare Workers, conforme o starter oficial Sites. Não hospedar Express, better-sqlite3 ou o processo Node atual. Rotas de domínio e HTTP separadas de componentes visuais. Código e migrações ficam versionados no repositório do Site e podem ser exportados para migração futura.

O frontend em revisão usa exemplos exclusivamente em memória. A revisão visual foi aprovada. Por pedido posterior do usuário, D1 e integração foram adiados; D1 continua desabilitado até a autorização/leitura real hospedada. Não existe ainda persistência operacional, importação ou migração dos dados atuais.

## Identidade e autorização
O dispatcher do Sites mantém o aplicativo privado e faz login com ChatGPT. Páginas protegidas usam `requireChatGPTUser`; rotas Google exigem a identidade no servidor. O Site foi publicado com audiência privada somente do proprietário. O controle de audiência do Sites deverá ser verificado antes/depois da publicação. Não confiar em IDs de usuário fornecidos pelo navegador. A fronteira de proprietário privado restringe o único usuário; qualquer ampliação futura da audiência exige allowlist explícita em cada endpoint e dados isolados por proprietário.

Autorização Google é independente do login: cliente OAuth confidencial com scope de leitura de Calendar. Não se pressupõe que o conector Google disponível ao agente esteja disponível ao Site: `sites_list_plugin_eligibility` não existe nas ferramentas desta sessão. Portanto não há declarações de plugin/connector no manifest.

## Prova Google preparada, ainda não executada
- `/conexao`: tela de prova, com estado honesto de configuração pendente.
- POST `/api/google/start`: identidade, origem exata, state aleatório e fluxo Google externo por navegação de formulário.
- GET `/api/google/callback`: identidade + state associado ao usuário; troca de código no servidor; sem tokens em URL de retorno.
- POST `/api/google/proof`: leitura real de CalendarList e eventos da agenda escolhida, com paginação; resultado informa fonte, horário, intervalo e ausência de persistência.
- Access token temporário, 10min no máximo, cifrado com AES-GCM num cookie Secure/HttpOnly/SameSite=Lax. A chave permanece em segredo do servidor; propósito do cookie autentica a cifra. Não captura refresh token nesta prova.
- Nunca devolve token/segredo em JSON; responses privadas sem cache. Timeout de rede e erros de autorização/configuração distintos. A prova exige HTTPS e sessão do proprietário. Limite explícito de 20 páginas falha como incompleto, sem fingir sucesso.

É necessário verificar que o retorno OAuth mantém a sessão privada do Sites. Se o dispatcher bloquear a callback mesmo com sessão, não enfraquecer a audiência: alternativa é gateway OAuth privado externo que conclui o retorno para o usuário autenticado. Essa alternativa só será escolhida após evidência real do bloqueio.

## Persistência planejada após prova
D1 lógico `DB`, migrações Drizzle geradas e inspecionadas, prepared statements e operações batch. Não criar tabelas em requests. Modelo planejado:
- conexões Google: proprietário, tokens cifrados, escopos, expiração, última falha;
- calendários/closers: Google ID, acesso, seleção, cor, papel e vigência na equipe;
- eventos de fonte: chave proprietário + calendário + Google event ID, iCalUID, recurringEventId, originalStartTime, created/updated/start/end, cancelamento e evidências;
- consultoria canônica/associações: identidade lógica com iCalUID e ocorrência, múltiplos espelhos por agenda; não deduplicar somente por nome/data;
- estados operacionais e histórico imutável de mudanças: autor, valor anterior/novo, data, origem;
- observações, preferências e configurações;
- jobs/cursors de sync por calendário, lease/versão para impedir concorrência duplicada;
- cobertura histórica e qualidade das fontes para cada métrica.

Sync incremental com parâmetros constantes e paginação até nextSyncToken; aplicar eventos por chave idempotente. Avançar cursor apenas depois de páginas gravadas e confirmadas. Falha preserva dados anteriores. 410 invalida cursor, abre nova geração de leitura completa e só marca ausências depois de conclusão. Tombstones Google preservam histórico e decisões manuais. Expansão de recorrência em janelas explícitas, IDs de ocorrência e deduplicação de espelhos. Refresh token cifrado no servidor, refresh em tempo hábil, invalid_grant solicita reconexão; nenhum retry de troca de código sem verificar resultado.

Consultorias criadas para datas futuras precisam de histórico de criação fora da janela de agenda diária. Busca apenas por data da reunião é insuficiente. Backfill separado de migrations e com cobertura registrada.

## Métricas
Calendário comprova criação, agendamento e horário; não comprova comparecimento. Taxas de presença/ausência só com denominador e cobertura suficientes e explícitos. Ranking mostra volume de consultorias atribuídas e período/cobertura, preservando membros antigos. Volume por horário/período somente com start válido e cobertura consistente. Criação e reunião sempre filtradas em dimensões separadas.

## Continuidade do produto
Não mudar portas, dados, credenciais ou código do app atual durante construção. Migração privada deverá transportar observações/estados/histórico do SQLite existente com backup, conciliação e correspondência de IDs antes do corte. Relê-los do Google não reconstrói ações manuais antigas. O novo checkout é ambiente de construção temporário do mesmo produto HOD Hub, não uma nova linha V1/V2.

## Fontes técnicas
- OAuth servidor: https://developers.google.com/identity/protocols/oauth2/web-server
- Sincronização: https://developers.google.com/workspace/calendar/api/guides/sync
- Sites: skills locais de building, authentication, starter-capabilities, persistence e hosting usados nesta construção.
