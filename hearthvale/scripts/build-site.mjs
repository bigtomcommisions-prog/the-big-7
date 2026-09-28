// Builds the Big Tom Dev site (home, The Big 7, legal pages) into apps/client/dist/, next to the
// Hearthvale app at /hearthvale/. Pages in site/pages/ are HTML fragments; this wraps each one in
// the shared layout (banner with logo + tabs, footer with legal links) and expands {{icon:Name}}.
//
//   node scripts/build-site.mjs
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as lucide from 'lucide';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'site');
const out = join(root, 'apps/client/dist');

/** Public contact address shown on every page and in the legal documents. */
const CONTACT_EMAIL = 'hello@bigtomdev.fyi';
const SITE_URL = 'https://bigtomdev.fyi';
const LAST_UPDATED = '28 September 2026';

const TABS = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'big7', label: 'The Big 7', href: '/the-big-7/' },
  { id: 'hearthvale', label: 'Hearthvale', href: '/hearthvale/' },
];

const PAGES = [
  { out: 'index.html', src: 'home.html', tab: 'home', title: 'Big Tom Dev', description: "Big Tom Dev's projects and collections, including The Big 7." },
  { out: 'the-big-7/index.html', src: 'big7.html', tab: 'big7', title: 'The Big 7 · Big Tom Dev', description: 'Seven projects, built one at a time. Starting with Hearthvale: your Discord server as a cosy voxel world.' },
  { out: 'privacy/index.html', src: 'privacy.html', tab: null, title: 'Privacy Policy · Big Tom Dev', description: 'How Big Tom Dev and Hearthvale handle your personal data.' },
  { out: 'terms/index.html', src: 'terms.html', tab: null, title: 'Terms of Service · Big Tom Dev', description: 'The terms for using Big Tom Dev sites and Hearthvale.' },
  { out: 'cookies/index.html', src: 'cookies.html', tab: null, title: 'Cookie Policy · Big Tom Dev', description: 'The cookies and similar technologies Big Tom Dev sites use.' },
  { out: '404.html', src: '404.html', tab: null, title: 'Page not found · Big Tom Dev', description: 'This page does not exist.' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function icon(name, cls = 'i') {
  const node = lucide[name];
  if (!node) throw new Error(`Unknown icon: ${name}`);
  const kids = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${kids}</svg>`;
}

const logo = readFileSync(join(src, 'assets/logo.svg'), 'utf8').replace('<svg ', '<svg class="brand-logo" aria-hidden="true" ');

function layout(page, body) {
  const tabs = TABS.map((t) => `<a class="tab${t.id === page.tab ? ' active' : ''}" href="${t.href}"${t.id === page.tab ? ' aria-current="page"' : ''}>${t.label}</a>`).join('');
  const url = `${SITE_URL}/${page.out.replace(/index\.html$/, '')}`;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}" />
<meta name="theme-color" content="#16191f" />
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/assets/site.css" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Big Tom Dev" />
<meta property="og:title" content="${esc(page.title)}" />
<meta property="og:description" content="${esc(page.description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SITE_URL}/assets/og-bigtomdev.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="banner">
  <div class="banner-inner">
    <a class="brand" href="/">${logo}<span>Big Tom Dev</span></a>
    <nav class="tabs" aria-label="Main">${tabs}</nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="footer">
  <div class="footer-inner">
    <div class="footer-brand">${logo}<span>© ${new Date().getFullYear()} Big Tom Dev</span></div>
    <nav class="footer-links" aria-label="Legal">
      <a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/cookies/">Cookies</a><a href="mailto:${CONTACT_EMAIL}">Contact</a>
    </nav>
    <p class="footer-note">No tracking, no ads, no analytics. Hearthvale is an independent project and is not affiliated with or endorsed by Discord Inc.</p>
  </div>
</footer>
</body>
</html>
`;
}

function render(text) {
  return text
    .replace(/\{\{icon:(\w+)\}\}/g, (_, n) => icon(n))
    .replaceAll('{{contact}}', CONTACT_EMAIL)
    .replaceAll('{{updated}}', LAST_UPDATED);
}

mkdirSync(out, { recursive: true });
cpSync(join(src, 'assets'), join(out, 'assets'), { recursive: true });
// Self-hosted font files (no Google Fonts requests).
const fonts = join(root, 'node_modules/@fontsource/nunito/files');
mkdirSync(join(out, 'assets/fonts'), { recursive: true });
for (const w of [400, 600, 700, 800, 900]) cpSync(join(fonts, `nunito-latin-${w}-normal.woff2`), join(out, `assets/fonts/nunito-${w}.woff2`));

for (const page of PAGES) {
  const body = render(readFileSync(join(src, 'pages', page.src), 'utf8'));
  const file = join(out, page.out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, layout(page, body));
}
console.log(`Built ${PAGES.length} site pages into ${out}`);
