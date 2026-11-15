import { defineConfig } from 'vite';

const pages = ['browse', 'gathering', 'worksheet', 'history', 'games', 'worship', 'song-editor', 'deck-review'];
export default defineConfig({
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(pages.map(page => [page, `src/${page}.jsx`])),
      output: {
        entryFileNames: '[name]/[name].js',
        chunkFileNames: 'shared/[name]-[hash].js',
        assetFileNames: asset => {
          const name = asset.names?.[0] || asset.name;
          return `${name.replace(/\.css$/, '')}/${name}`;
        },
        manualChunks: id => id.includes('/node_modules/') ? 'react-runtime' : undefined,
      },
    },
  },
});
