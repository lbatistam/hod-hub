import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const HOD_RELEASE = 'r38';

// Auto-detect every entry HTML in production/ and register it as a Rollup
// input. Uma página nova entra no build ao ser adicionada a production/.
function discoverEntries() {
  const dir = resolve(import.meta.dirname, 'production');
  const out = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.html')) continue;
    const stem = file.replace(/\.html$/, '');
    out[stem] = `production/${file}`;
  }
  return out;
}

// Add the metadata shared by every HOD Hub page at build and dev time.
function hodMetadataPlugin() {
  let base = '/';
  return {
    name: 'hod-hub-metadata',
    configResolved(config) { base = config.base || '/'; },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        let out = html;
        const metaPwa = `<link rel="icon" href="${base}images/hod-hub-app-icon.png" type="image/png">
<link rel="manifest" href="${base}site.webmanifest">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#07101F" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="${base}images/hod-hub-icon-192.png">`;
        out = out.replace(/<\/head>/i, `${metaPwa}\n</head>`);

        // SEO + Open Graph meta. Skip if the page already declares a
        // description (page-specific copy wins). Title falls back to "HOD Hub"
        // if the page has none. The description is derived from the breadcrumb
        // when present so each page gets distinct copy without per-page edits.
        if (!/name=["']description["']/i.test(out)) {
          const titleMatch = /<title>([^<]+)<\/title>/i.exec(out);
          const title = titleMatch ? titleMatch[1].replace(/\s+\|\s+.*$/, '').trim() : 'HOD Hub';
          const bcMatch = /data-breadcrumb=["']([^"']+)["']/i.exec(out);
          const breadcrumb = bcMatch ? bcMatch[1].replace(/^Home\s*>\s*/, '').trim() : '';
          const desc = breadcrumb
            ? `${title} — ${breadcrumb}. Calendários, consultorias, closers e indicadores no HOD Hub.`
            : 'HOD Hub — calendários, consultorias, closers e indicadores em um só lugar.';
          const seo = `<meta name="description" content="${desc.replace(/"/g, '&quot;')}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title.replace(/"/g, '&quot;')}">
<meta property="og:description" content="${desc.replace(/"/g, '&quot;')}">
<meta property="og:image" content="${base}images/hod-hub-icon-512.png">
<meta property="og:site_name" content="HOD Hub">
<meta name="twitter:card" content="summary_large_image">`;
          out = out.replace(/<\/head>/i, `${seo}\n</head>`);
        }

        // Pre-paint theme script: read stored theme and apply data-theme to <html>
        // before the body renders so dark mode never flashes light.
        const prePaint = `<script>(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var theme=t||(d?'dark':'light');document.documentElement.setAttribute('data-theme',theme);}catch(e){}})();</script>`;
        out = out.replace(/<\/head>/i, `${prePaint}\n</head>`);

        return out;
      }
    }
  };
}

// O app local usa service worker para continuar abrindo mesmo quando a rede
// oscila. Acrescente a versão da release aos assets gerados para impedir que
// uma folha de estilos antiga sobreviva no cache após uma atualização visual.
function releaseAssetVersionPlugin() {
  return {
    name: 'hod-hub-release-asset-version',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /(\b(?:href|src)=["'][^"']+\.(?:css|js))(["'])/g,
          `$1?v=${HOD_RELEASE}$2`
        );
      }
    }
  };
}

// `base` is the public path the built site is served from. Defaults to root.
// Set BASE_PATH to test a subpath build (or to deploy under a subpath):
//   BASE_PATH=/admin/ npm run build
// `preview` also honors BASE_PATH so you can verify the built site at the
// real path it'll be served from. `dev` always runs at `/` since the dev
// server doesn't read built artifacts.
export default defineConfig(({ command }) => ({
  root: '.',
  base: command === 'serve' ? '/' : (process.env.BASE_PATH ?? '/'),
  publicDir: 'public',
  plugins: [hodMetadataPlugin(), releaseAssetVersionPlugin()],
  logLevel: 'info',
  clearScreen: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'es2022',
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          // Rolldown (Vite 8+) passes `names` (array); Rollup passes `name`.
          const name = assetInfo.name ?? assetInfo.names?.[0] ?? '';
          if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico)$/i.test(name)) {
            return `images/[name]-[hash][extname]`;
          }
          if (/\.(woff2?|eot|ttf|otf)$/i.test(name)) {
            return `fonts/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js'
      },
      // Auto-discovered from production/*.html. Add a new page by just
      // dropping the file in — no config edit needed.
      input: discoverEntries()
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        unsafe_comps: true,
        passes: 3,
        pure_getters: true,
        reduce_vars: true,
        collapse_vars: true,
        dead_code: true,
        unused: true
      },
      mangle: {
        safari10: true
      },
      format: {
        comments: false
      }
    }
  },
  esbuild: {
    target: 'es2022'
  },
  server: {
    // Entry HTMLs live in production/, not at the project root.
    // Default to an uncommon port so we don't collide with the dozen tools
    // that grab 3000/4000/5173/8000/8080. Override with PORT env if needed.
    // strictPort defaults to false → Vite auto-increments on collision.
    open: '/production/inicio.html',
    port: Number(process.env.PORT) || 9173,
    host: true,
    watch: {
      usePolling: false,
      interval: 100,
      ignored: ['**/node_modules/**', '**/dist/**']
    },
    hmr: {
      overlay: false
    }
  },
  preview: {
    open: '/production/inicio.html',
    port: Number(process.env.PREVIEW_PORT) || 9174,
    host: true
  },
  css: {
    // Enable CSS source maps only in development (saves ~8MB in production build)
    devSourcemap: process.env.NODE_ENV !== 'production',
    preprocessorOptions: {
      scss: {
        // Silence Sass deprecation warnings
        silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'color-functions'],
        // Additional settings for better performance
        includePaths: ['node_modules'],
        // Generate source maps only in development
        sourceMap: process.env.NODE_ENV !== 'production',
        sourceMapContents: process.env.NODE_ENV !== 'production'
      }
    }
  }
}));
