import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

// Auf GitHub Pages liegt die App unter /<repo-name>/ – der Workflow setzt BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

// Im Entwicklungsserver liefert /daten/ die lokale Kopie des daten-Branches (_daten/)
// oder, falls nicht vorhanden, die Demo-Daten (demo/daten/).
function datenImDevServer(): Plugin {
  const quelle = existsSync('_daten') ? '_daten' : 'demo/daten';
  return {
    name: 'daten-im-dev-server',
    configureServer(server) {
      server.middlewares.use(`${base}daten/`, (req, res, next) => {
        const pfad = normalize(join(quelle, decodeURIComponent((req.url ?? '').split('?')[0])));
        if (!pfad.startsWith(normalize(quelle)) || !existsSync(pfad) || statSync(pfad).isDirectory()) return next();
        res.setHeader('Content-Type', pfad.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8');
        res.end(readFileSync(pfad));
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    preact(),
    datenImDevServer(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['daten/**'],
      },
      manifest: {
        id: base,
        name: 'Schattendepot',
        short_name: 'Schattendepot',
        description: 'Lernende Börsen-Simulation mit fiktivem Geld – keine Anlageberatung.',
        lang: 'de',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4f5f2',
        theme_color: '#f4f5f2',
        categories: ['finance', 'education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['core/**/*.test.ts', 'jobs/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
} as any);
