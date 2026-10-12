// Vercel Function: proxies the self-hosted Plane API so the API key never reaches the browser.
// Env vars (Vercel project settings): PLANE_API_KEY, PLANE_WORKSPACE_SLUG, PLANE_PROJECT_ID
// Optional: PLANE_BASE_URL (defaults to https://tickets.bigtomdev.fyi)

const BASE = (process.env.PLANE_BASE_URL ?? 'https://tickets.bigtomdev.fyi').replace(/\/$/, '');
const KEY = process.env.PLANE_API_KEY ?? '';
const SLUG = process.env.PLANE_WORKSPACE_SLUG ?? '';
const PROJECT = process.env.PLANE_PROJECT_ID ?? '';
const ROOT = `${BASE}/api/v1/workspaces/${SLUG}/projects/${PROJECT}`;
// Newer Plane uses /work-items/; older self-hosted versions only have /issues/. Try the new one, fall back once.
let ITEMS = `${ROOT}/work-items/`;
let triedFallback = false;

const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];
const hits = new Map<string, number[]>(); // best-effort rate limit (per warm instance)

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

async function plane(query: string, init: RequestInit = {}): Promise<Response> {
  const go = () =>
    fetch(ITEMS + query, {
      ...init,
      headers: { 'X-API-Key': KEY, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  let res = await go();
  if (res.status === 404 && !triedFallback) {
    triedFallback = true;
    ITEMS = `${ROOT}/issues/`;
    res = await go();
  }
  // Shows up in Vercel > Logs, so a failure is diagnosable without exposing anything to visitors.
  if (!res.ok) console.error('Plane error', res.status, ITEMS, (await res.clone().text()).slice(0, 300));
  return res;
}

export async function GET(request: Request) {
  if (!KEY || !SLUG || !PROJECT) return json({ error: 'Server is not configured.' }, 500);
  const page = new URL(request.url).searchParams.get('cursor');
  const qs = new URLSearchParams({ per_page: '50', expand: 'state', order_by: '-created_at' });
  if (page) qs.set('cursor', page);

  const res = await plane(`?${qs}`);
  if (!res.ok) return json({ error: 'Could not load tickets.' }, 502);
  const body = await res.json();
  const rows: any[] = Array.isArray(body) ? body : body.results ?? [];

  return json({
    next: body.next_page_results ? body.next_cursor : null,
    tickets: rows.map((t) => ({
      id: t.id,
      number: t.sequence_id,
      title: t.name,
      // plain text only: never render Plane's HTML in the browser
      description: String(t.description_stripped ?? '').slice(0, 1000),
      priority: t.priority ?? 'none',
      status: t.state?.name ?? 'Open',
      statusGroup: t.state?.group ?? 'unstarted',
      createdAt: t.created_at,
    })),
  });
}

export async function POST(request: Request) {
  if (!KEY || !SLUG || !PROJECT) return json({ error: 'Server is not configured.' }, 500);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (limited(ip)) return json({ error: 'Too many tickets. Try again in a few minutes.' }, 429);

  let input: any;
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  if (input.website) return json({ ok: true }); // honeypot: bots fill this in, people never see it

  const title = String(input.title ?? '').trim();
  const details = String(input.details ?? '').trim();
  const name = String(input.name ?? '').trim().slice(0, 80);
  const contact = String(input.contact ?? '').trim().slice(0, 120);
  const priority = PRIORITIES.includes(input.priority) ? input.priority : 'none';

  if (title.length < 3 || title.length > 150) return json({ error: 'Title must be 3 to 150 characters.' }, 400);
  if (details.length > 5000) return json({ error: 'Details must be under 5,000 characters.' }, 400);

  const paragraphs = details
    ? details.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')
    : '<p>(no details)</p>';
  const footer = `<hr><p><em>Submitted via the portal${name ? ` by ${escapeHtml(name)}` : ''}${
    contact ? ` (${escapeHtml(contact)})` : ''
  }</em></p>`;

  const res = await plane('', {
    method: 'POST',
    body: JSON.stringify({
      name: title,
      description_html: paragraphs + footer,
      priority,
      external_source: 'big-tom-dev-portal',
    }),
  });
  if (!res.ok) return json({ error: 'Plane rejected the ticket.' }, 502);
  const created = await res.json();
  return json({ ok: true, number: created.sequence_id }, 201);
}