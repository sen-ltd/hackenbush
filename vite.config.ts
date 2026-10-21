import { defineConfig } from 'vite';

export default defineConfig({
  base: '/portfolio/hackenbush/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
