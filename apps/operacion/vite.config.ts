import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 5173,
    proxy: { '/v1': 'http://localhost:3000' },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TransporteYa Operación',
        short_name: 'TY Operación',
        description: 'Torre de control y administración de TransporteYa',
        lang: 'es-CO',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#1f2937',
        icons: [{ src: 'icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
});
