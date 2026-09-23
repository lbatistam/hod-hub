# Validação

## Frontend

```bash
cd app
pnpm run lint
pnpm test
pnpm run build
pnpm run smoke
```

O smoke test verifica as sete páginas e os recursos locais do artefato gerado.

## API

```bash
cd api
pnpm run typecheck
pnpm test
pnpm run build
```

## Validação integrada

Testes locais não comprovam autenticação real, sincronização completa ou comportamento do Google Agenda. Antes de declarar uma versão pronta para produção, valide login, sincronização, atualização de estados, drag and drop, resumo diário e Analytics com uma conta de teste.

