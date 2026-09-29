import { defineConfig, type Plugin } from 'vite';

/** Serve /api/omniprice from the same handler the Vercel Function uses, so dev matches prod. */
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

// Served at https://bigtomdev.fyi/omniprice/, emitted next to Hearthvale in apps/client/dist.
export default defineConfig({
  base: '/omniprice/',
  plugins: [omnipriceApi()],
  server: { port: 5174, strictPort: true },
  build: {
    outDir: '../client/dist/omniprice',
    emptyOutDir: true,
    target: 'es2022',
  },
});
