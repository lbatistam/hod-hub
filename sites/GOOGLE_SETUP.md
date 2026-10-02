> Integração adiada pelo usuário em 29/09/2026. Este documento é referência para a próxima etapa; o frontend publicado usa exemplos.

# Configurar a prova Google hospedada

Situação: o cliente atual existe e tem Client ID/Client Secret; seu redirect URI é local. Valores nunca devem ser colocados em código ou chat. Não alterar a URI atual.

## Passo necessário no Google
No Google Cloud, abrir Google Auth Platform → Clients → cliente Web usado pelo app atual. Acrescentar, preservando todos os endereços existentes:

```
https://hod-hub-operacao.leandrobm.chatgpt.site/api/google/callback
```

Confirmar Google Calendar API habilitada, acesso da conta pretendida e configurações de público/test users. Se o cliente atual for Desktop e não permitir retorno web, criar um cliente Web dedicado; não mudar nem revogar o atual. O tipo do cliente ainda não foi verificado no console.

## Configuração do Site
Pela ferramenta de ambiente do Sites, salvar:
- `APP_ORIGIN`: `https://hod-hub-operacao.leandrobm.chatgpt.site`
- `GOOGLE_CLIENT_ID`: Client ID atual, se Web e elegível para reutilização.
- `GOOGLE_CLIENT_SECRET`: marcar `is_secret: true`.
- `OAUTH_COOKIE_KEY`: segredo novo com 32 bytes aleatórios em base64url, marcar `is_secret: true`.

As variáveis foram instaladas no ambiente protegido do Sites antes do adiamento da integração pelo usuário. A URI no Google ainda não foi confirmada, e não houve autorização nem leitura real. Não copiar o .env inteiro nem a chave do serviço atual. Um identificador de cliente não é token de leitura; ainda será necessária autorização Google pelo usuário.

## Prova obrigatória antes de D1
Após publicar a etapa privada autorizada e configurar o servidor:
1. Abrir `/conexao` autenticado como proprietário.
2. Autorizar Google Agenda independentemente do login ChatGPT.
3. Provar leitura real e escolher agenda; registrar horário, intervalo, contagem e paginação.
4. Atualizar leitura e confirmar retorno de fonte real.
5. Testar autorização recusada, sessão expirada, agenda sem permissão e acesso anônimo negado.
6. Confirmar nenhum token/segredo em resposta, bundle ou URL de retorno.
7. Somente depois adicionar persistência de tokens e eventos.

A prova usa token temporário, sem offline/refresh e sem gravação de eventos. Ela valida conectividade e consentimento; não é a integração definitiva.
