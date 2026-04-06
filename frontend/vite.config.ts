import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
  server: {
    host: true,
    // To enable HTTPS for local phone testing, run:
    //   npm install -D @vitejs/plugin-basic-ssl
    // then uncomment:
    //   import basicSsl from '@vitejs/plugin-basic-ssl'
    //   and add basicSsl() to plugins array below
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'HouseOps',
        short_name: 'HouseOps',
        description: 'Household operations — make invisible family work visible',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
