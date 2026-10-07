import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env['API_URL'] ?? 'http://localhost:3000';

// La App Operación es una aplicación web de escritorio: no se instala ni funciona sin conexión (docs/06).
export default defineConfig({
  server: {
    port: 5173,
    proxy: { '/v1': API, '/socket.io': { target: API, ws: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/v1': API, '/socket.io': { target: API, ws: true } },
  },
  plugins: [react(), tailwindcss()],
});
