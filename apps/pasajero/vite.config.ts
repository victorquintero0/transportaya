import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 5171,
    proxy: { '/v1': 'http://localhost:3000' },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TransporteYa',
        short_name: 'TransporteYa',
        description: 'Pide tu viaje con TransporteYa',
        lang: 'es-CO',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0b5fff',
        icons: [{ src: 'icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
});
