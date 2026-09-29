// Vercel Function: https://bigtomdev.fyi/api/omniprice — see api/_omniprice/handler.js.
import { handle } from './_omniprice/handler.js';

export function GET(request) {
  return handle(new URL(request.url), process.env);
}
