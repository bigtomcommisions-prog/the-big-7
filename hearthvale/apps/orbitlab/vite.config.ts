import { defineConfig } from 'vite';

// Served at https://bigtomdev.fyi/orbitlab/, emitted next to the other apps in dist/.
export default defineConfig({
  base: '/orbitlab/',
  server: { port: 5179, strictPort: true },
  build: {
    outDir: '../../dist/orbitlab',
    emptyOutDir: true,
    target: 'es2022',
  },
});
