// Verificação leve de todas as páginas e recursos produzidos pelo build.
// Não depende de Playwright/Puppeteer: usa apenas Node.js e o preview do Vite.

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const filter = process.env.FILTER || '';

async function listPages() {
  const entries = await readdir(path.resolve('dist/production'));
  return entries
    .filter(name => name.endsWith('.html') && name.includes(filter))
    .sort()
    .map(name => `/production/${name}`);
}

function spawnPreview() {
  if (process.env.PREVIEW_URL) {
    return Promise.resolve({ url: process.env.PREVIEW_URL.replace(/\/$/, ''), kill() {} });
  }
  if (!existsSync('dist/production/organograma.html')) {
    throw new Error('Build ausente. Execute pnpm run build antes do smoke.');
  }
  const port = process.env.PREVIEW_PORT || '9174';
  const viteCli = path.resolve('node_modules/vite/bin/vite.js');
  const processHandle = spawn(process.execPath, [viteCli, 'preview', '--port', port, '--host'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, PREVIEW_PORT: port }
  });
  return new Promise((resolve, reject) => {
    let ready = false;
    const onData = chunk => {
      const match = chunk.toString().match(/Local:\s+(https?:\/\/[^\s]+)/);
      if (!match) {
        return;
      }
      ready = true;
      processHandle.stdout.off('data', onData);
      setTimeout(
        () => resolve({ url: match[1].replace(/\/$/, ''), kill: () => processHandle.kill() }),
        250
      );
    };
    processHandle.stdout.on('data', onData);
    processHandle.on('exit', code => {
      if (!ready) {
        reject(new Error(`Preview encerrado antes de iniciar (${code}).`));
      }
    });
  });
}

function localResources(html, pageUrl) {
  const resources = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
    const value = match[1];
    if (/^(?:https?:|data:|mailto:|tel:|#)/i.test(value)) {
      continue;
    }
    const resourceUrl = new URL(value, pageUrl);
    if (resourceUrl.pathname.startsWith('/api/')) {
      continue;
    }
    resources.add(resourceUrl.href);
  }
  return [...resources];
}

async function check(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${response.status} em ${url}`);
  }
  return response;
}

async function main() {
  const preview = await spawnPreview();
  try {
    const pages = await listPages();
    const checkedResources = new Set();
    console.log(`→ verificando ${pages.length} páginas em ${preview.url}`);
    for (const pathname of pages) {
      const pageUrl = preview.url + pathname;
      const response = await check(pageUrl);
      const html = await response.text();
      if (!/<title>[^<]+<\/title>/i.test(html)) {
        throw new Error(`Página sem título: ${pathname}`);
      }
      for (const resource of localResources(html, pageUrl)) {
        if (!checkedResources.has(resource)) {
          await check(resource);
          checkedResources.add(resource);
        }
      }
      console.log(`  ✓ ${pathname.replace('/production/', '')}`);
    }
    console.log(`→ tudo certo: ${pages.length} páginas e ${checkedResources.size} recursos locais`);
  } finally {
    preview.kill();
  }
}

main().catch(error => {
  console.error(`Falha no smoke test: ${error.message}`);
  process.exitCode = 1;
});
