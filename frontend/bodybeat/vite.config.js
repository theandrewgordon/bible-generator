import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Keep BodyBeat isolated from all other Faith Sparks pages.
// No service worker: it could otherwise cache unrelated site routes.
export default defineConfig({
  base: '/static/labs/bodybeat/',
  plugins: [react()],
  build: {
    outDir: '../../static/labs/bodybeat',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
