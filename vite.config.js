import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Draft Survey',
        short_name: 'DraftSurvey',
        description: 'Offline-first marine draft survey calculator and report generator',
        theme_color: '#0b3559',
        background_color: '#f4f7fa',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache the app shell aggressively so it opens instantly with zero
        // connectivity. All data reads/writes go through IndexedDB (see
        // src/lib/localStore.js), which persists independently of the
        // service worker cache.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-cache',
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Keep the service worker OFF during local development. With it on,
        // your browser can end up running an old cached JS bundle while the
        // source files on disk are already correct - exactly the kind of
        // "code looks right but behaves wrong" confusion you just hit.
        // It still builds and works correctly for `npm run build` / the
        // deployed site, which is all that actually needs offline support.
        enabled: false,
      },
    }),
  ],
})