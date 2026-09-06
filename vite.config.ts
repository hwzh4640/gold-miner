import { defineConfig } from 'vitest/config';

// GitHub Pages serves project sites under /<repo>/. Override with VITE_BASE=/ for
// root hosting (e.g. Cloudflare Pages or a custom domain).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/gold-miner/',
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node' },
});
