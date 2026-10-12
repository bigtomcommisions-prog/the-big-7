import { defineConfig } from 'vite';

// Served at bigtomdev.fyi/tickets/. Mirror the other apps' config if it differs.
export default defineConfig({
  base: '/TomsTickets/',
  server: {
    port: 5177,
    // `vercel dev` serves /api on :3000 while Vite serves the page
    proxy: { '/api': 'http://localhost:3000' },
  },
});