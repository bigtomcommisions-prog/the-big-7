import { defineConfig } from 'vite';

const API = process.env.HEARTHVALE_API ?? 'http://127.0.0.1:3000';
/** Path the app is served under, e.g. '/hearthvale/'. Must start and end with '/'. */
const BASE = process.env.VITE_BASE ?? '/';
/** Absolute public URL of the app, used by the link-preview (Open Graph) tags in index.html. */
process.env.VITE_SITE_URL = (process.env.VITE_SITE_URL ?? `http://localhost:5173${BASE}`).replace(/\/?$/, '/');

// In dev, Vite serves the client and proxies API/auth/WebSocket traffic to the Node server so the
// browser sees a single origin (cookies just work, OAuth redirect is http://localhost:5173/auth/callback).
export default defineConfig({
  base: BASE,
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/auth': { target: API, changeOrigin: false },
      '/ws': { target: API, ws: true, changeOrigin: false },
    },
  },
  build: {
    // Emit into dist/<base>/ so a static host serves the files at that path as-is.
    outDir: `dist${BASE}`,
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
