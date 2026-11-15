import { defineConfig } from 'vite';

// Separate builds keep page-specific assets independent and deployable by Flask.
export default defineConfig(({ mode }) => {
  const page = ['gathering', 'worksheet', 'history', 'games'].includes(mode) ? mode : 'browse';
  return {
    build: {
      outDir: `../static/dist/${page}`,
      emptyOutDir: true,
      rollupOptions: {
        input: `src/${page}.jsx`,
        output: { entryFileNames: `${page}.js`, assetFileNames: '[name][extname]' },
      },
    },
  };
});
