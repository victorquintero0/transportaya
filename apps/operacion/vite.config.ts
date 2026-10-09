import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env['API_URL'] ?? 'http://localhost:3000';

// Para probar en un teléfono por la red local (`pnpm movil`): se escucha en toda la red y, si hay certificado, con HTTPS.
// Sin HTTPS el navegador del teléfono bloquea la ubicación, el service worker y la instalación.
const RED = process.env['EXPONER_RED'] === '1';
const certificado = process.env['HTTPS_CERT'];
const llave = process.env['HTTPS_KEY'];
const https =
  certificado && llave ? { cert: readFileSync(certificado), key: readFileSync(llave) } : undefined;
const enRed = RED ? { host: true, allowedHosts: true as const, ...(https ? { https } : {}) } : {};

// La App Operación es una aplicación web de escritorio: no se instala ni funciona sin conexión (docs/06).
export default defineConfig({
  server: {
    port: 5173,
    ...enRed,
    proxy: { '/v1': API, '/socket.io': { target: API, ws: true } },
  },
  preview: {
    port: 4173,
    ...enRed,
    proxy: { '/v1': API, '/socket.io': { target: API, ws: true } },
  },
  plugins: [react(), tailwindcss()],
});
