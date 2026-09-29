import { defineConfig, type Plugin } from 'vite';

/** In dev, serve /api/omniprice (used by the currency and market widgets) from the shared handler. */
function omnipriceApi(): Plugin {
  return {
    name: 'omniprice-api',
    configureServer(server) {
      server.middlewares.use('/api/omniprice', async (req, res) => {
        const { handle } = await import('../../api/_omniprice/handler.js');
        const r: Response = await handle(new URL(req.originalUrl ?? '/', 'http://localhost'), process.env);
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await r.arrayBuffer()));
      });
    },
  };
}

// Served at https://bigtomdev.fyi/homebase/, emitted next to the other apps in apps/client/dist.
export default defineConfig({
  base: '/homebase/',
  plugins: [omnipriceApi()],
  server: { port: 5175, strictPort: true },
  build: {
    outDir: '../client/dist/homebase',
    emptyOutDir: true,
    target: 'es2022',
  },
});
