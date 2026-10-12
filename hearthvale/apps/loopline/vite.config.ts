import { defineConfig } from 'vite';

// Served at https://bigtomdev.fyi/loopline/, emitted next to the other apps in dist/.
export default defineConfig({
  base: '/loopline/',
  server: { port: 5177, strictPort: true },
  build: {
    outDir: '../../dist/loopline',
    emptyOutDir: true,
    target: 'es2022',
  },
});
