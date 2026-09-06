import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves project sites under /<repo>/. Override with VITE_BASE=/ for
// root hosting (e.g. Cloudflare Pages or a custom domain).
const base = process.env.VITE_BASE ?? '/gold-miner/';

export default defineConfig({
  base,
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.png', 'cover.png'],
      manifest: {
        id: base,
        name: 'Gold Miner',
        short_name: 'Gold Miner',
        description: 'Swing the hook, grab the gold and beat the clock. A browser remake of the classic Gold Miner game.',
        lang: 'en',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#f0b62a',
        theme_color: '#f0b62a',
        categories: ['games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [{ src: 'cover.png', sizes: '1200x630', type: 'image/png', form_factor: 'wide', label: 'Gold Miner gameplay' }],
      },
      workbox: {
        // Precache the app shell and icons so the game runs fully offline once installed.
        // Splash screens are only needed at install time on iOS, so they stay network-only.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['splash/**'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
