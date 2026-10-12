import { defineConfig } from 'vite';

// Served at https://bigtomdev.fyi/pixelforge/, emitted next to the other apps in dist/.
export default defineConfig({
  base: '/pixelforge/',
  server: { port: 5178, strictPort: true },
  build: {
    outDir: '../../dist/pixelforge',
    emptyOutDir: true,
    target: 'es2022',
  },
});
