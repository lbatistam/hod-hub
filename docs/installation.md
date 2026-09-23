# Instalação e configuração

## 1. Clonar

```bash
git clone https://github.com/lbatistam/hod-hub.git
cd hod-hub
```

## 2. Preparar a API

```bash
cd api
cp .env.example .env
pnpm install
pnpm run build
pnpm start
```

Preencha somente as variáveis descritas no `.env.example`. Nunca versiona o `.env` real.

## 3. Preparar o frontend

```bash
cd ../app
pnpm install
pnpm run build
pnpm run app
```

## 4. Validar

- API: `http://localhost:8877/api/v1/openapi.json`
- App: `http://localhost:8787/production/inicio.html`
- Rode os comandos descritos em [validation.md](validation.md).

## Persistência

O banco SQLite é criado localmente e está ignorado pelo Git. Nunca copie uma base operacional para issues, pull requests ou exemplos.

