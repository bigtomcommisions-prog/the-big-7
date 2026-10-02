import { defineConfig } from 'vite';

// Served at https://bigtomdev.fyi/cardhouse/, emitted next to the other apps in dist/.
// The game server is the main backend's /cards WebSocket (proxied in dev; npm run dev must be running).
export default defineConfig({
  base: '/cardhouse/',
  server: {
    port: 5176,
    strictPort: true,
    proxy: { '/cards': { target: 'ws://127.0.0.1:3000', ws: true } },
  },
  build: {
    outDir: '../../dist/cardhouse',
    emptyOutDir: true,
    target: 'es2022',
  },
});
