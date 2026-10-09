import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API = process.env['API_URL'] ?? 'http://localhost:3000';

// Para probar en un teléfono por la red local (`pnpm movil`): se escucha en toda la red y, si hay certificado, con HTTPS.
// Sin HTTPS el navegador del teléfono bloquea la ubicación, el service worker y la instalación.
const RED = process.env['EXPONER_RED'] === '1';
const certificado = process.env['HTTPS_CERT'];
const llave = process.env['HTTPS_KEY'];
const https =
  certificado && llave ? { cert: readFileSync(certificado), key: readFileSync(llave) } : undefined;
const enRed = RED ? { host: true, allowedHosts: true as const, ...(https ? { https } : {}) } : {};

export default defineConfig({
  server: {
    port: 5172,
    ...enRed,
    proxy: {
      '/v1': API,
      '/socket.io': { target: API, ws: true },
    },
  },
  preview: {
    port: 4172,
    ...enRed,
    proxy: {
      '/v1': API,
      '/socket.io': { target: API, ws: true },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['marca/favicon-32.png', 'marca/apple-touch-icon.png'],
      manifest: {
        name: 'TransporteYa Conductor',
        short_name: 'TY Conductor',
        description:
          'Maneja con TransporteYa: recibe viajes, mide con el taxímetro y mira tus ganancias.',
        lang: 'es-CO',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#101010',
        theme_color: '#101010',
        icons: [
          { src: 'marca/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'marca/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'marca/icono-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // La app es una SPA: cualquier ruta que no sea de la API devuelve el shell.
        navigateFallbackDenylist: [/^\/v1\//, /^\/socket\.io\//],
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // La librería del mapa pesa ~1 MB: no se descarga con la instalación; se guarda la primera vez que se usa.
        globIgnores: ['**/maplibre-gl-*.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/maplibre-gl-.*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'mapa-libreria', expiration: { maxEntries: 2 } },
          },
        ],
      },
    }),
  ],
});
