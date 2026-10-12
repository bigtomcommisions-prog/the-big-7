import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url)); // hearthvale/

/** Serve /api/tickets from the same file the Vercel Function uses, so dev matches prod (same pattern as OmniPrice). */
function ticketsApi(mode: string): Plugin {
  return {
    name: "tickets-api",
    configureServer(server) {
      // PLANE_* come from hearthvale/.env (or .env.local) in dev; on Vercel they are project env vars.
      Object.assign(process.env, loadEnv(mode, root, ""));
      server.middlewares.use("/api/tickets", async (req, res) => {
        const mod = await server.ssrLoadModule(fileURLToPath(new URL("../../api/tickets.ts", import.meta.url)));
        const method = req.method ?? "GET";
        const handler = mod[method];
        if (typeof handler !== "function") {
          res.statusCode = 405;
          return res.end();
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
        const request = new Request(new URL(req.originalUrl ?? "/", "http://localhost"), {
          method,
          headers,
          body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
        });
        const r: Response = await handler(request);
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await r.arrayBuffer()));
      });
    },
  };
}

// Served at https://bigtomdev.fyi/tickets/, emitted next to the other apps in dist/.
export default defineConfig(({ mode }) => ({
  base: "/tickets/",
  plugins: [ticketsApi(mode)],
  server: { port: 5177, strictPort: true },
  build: {
    outDir: "../../dist/tickets",
    emptyOutDir: true,
    target: "es2022",
  },
}));
