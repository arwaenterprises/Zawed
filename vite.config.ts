import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' lets us show our own centred "update available" pop-up
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Family Manager',
        short_name: 'Family',
        description: 'One simple place for your family’s money, documents and places.',
        theme_color: '#7c3aed',
        background_color: '#fff7ed',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
