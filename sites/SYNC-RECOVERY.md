# Recuperação de sincronização — 05/10/2026

A leitura mantém cursores por agenda e processa 250 eventos por chamada, inclusive no primeiro lote. Cada página é persistida antes de avançar o cursor; apenas a página final conclui a cobertura. Falhas não apagam os registros anteriores.

Quando uma agenda compartilhada retorna 404, o servidor tenta as outras contas autorizadas. Se nenhuma conseguir acesso, retira a fonte da operação ativa e preserva o histórico com aviso explícito. A fonte é reativada pela descoberta quando o compartilhamento volta. Agendas próprias nunca são desativadas automaticamente.

A consulta histórica deixou de ordenar cópias completas de eventos em funções de janela desnecessárias; a classificação continua mesclando todas as cópias. A verificação de atualização não examina JSON bruto de todos os eventos. O cliente acompanha mudanças de cursores e conclusão das páginas, permite 60 segundos para leitura e oferece nova sincronização no botão de recuperação.

Validação: sync-recovery testa paginação, persistência, fallback entre contas, histórico preservado após perda de acesso e proteção das agendas próprias. Os testes existentes de contas, resumo diário, ranking e exportação são mantidos.

## Janeiro de 2026
Somente reservas com título exato AGENDA HOD (Leandro Batista), presentes na agenda pessoal leandrobatsta@gmail.com, com esse endereço e marcos@metodohod.com no convite. Uma unidade por evento canônico, sem deduplicar títulos idênticos nem exigir lead. Data da reunião ancora janeiro em ambas as bases, com nota explícita. Nenhuma outra reunião de janeiro incluída. Leitura real em 05/10/2026: 21 eventos, todos persistidos; outras métricas mantêm a deduplicação de leads.
