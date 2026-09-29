// Self-hosted font (no requests to Google Fonts).
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-900.css';
import './styles.css';
import { api, setDisplayCurrency } from './api.ts';
import { h, icon } from './dom.ts';
import { searchBox } from './search.ts';
import { inCurrency, Selection, type Ctx } from './state.ts';
import { compareView } from './views/compare.ts';
import { detailView } from './views/detail.ts';
import { overviewView } from './views/overview.ts';

const root = document.getElementById('app')!;

/** The Big Tom Dev banner shared with the rest of bigtomdev.fyi. */
function siteBanner(): HTMLElement {
  const tabs = [['Home', '/'], ['The Big 7', '/the-big-7/']] as const;
  const logo = new DOMParser().parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="brand-logo" aria-hidden="true"><defs><linearGradient id="btd-g" gradientUnits="userSpaceOnUse" x1="0" y1="7" x2="0" y2="57" gradientTransform="rotate(-45 32 32)"><stop offset="0" stop-color="#e0704a"/><stop offset="1" stop-color="#8183e3"/></linearGradient></defs><rect x="14" y="14" width="36" height="36" rx="9" transform="rotate(45 32 32)" fill="url(#btd-g)"/></svg>',
    'image/svg+xml').documentElement;
  return h('header', { class: 'banner' }, h('div', { class: 'banner-inner' },
    h('a', { class: 'brand', href: '/' }, document.importNode(logo, true), h('span', {}, 'Big Tom Dev')),
    h('nav', { class: 'tabs', 'aria-label': 'Big Tom Dev' }, ...tabs.map(([label, href]) =>
      h('a', { class: 'tab', href }, label)))));
}

const CUR_KEY = 'omniprice.currency';
const COMMON = ['GBP', 'USD', 'EUR', 'JPY', 'CAD', 'AUD', 'CHF', 'INR', 'CNY'];

function readCurrency(): string | null {
  try {
    return localStorage.getItem(CUR_KEY);
  } catch {
    return null;
  }
}

function currencyMenu(ctx: Ctx, onChange: () => void): HTMLElement {
  const all = Object.entries(ctx.catalog.currencies);
  const opt = (code: string, name: string) => h('option', { value: code, selected: ctx.cur === code }, `${code} · ${name}`);
  const select = h('select', { 'aria-label': 'Show prices in', title: 'Show prices in' },
    h('option', { value: '', selected: !ctx.cur }, 'Original currencies'),
    h('optgroup', { label: 'Common' }, ...COMMON.filter((c) => ctx.catalog.currencies[c]).map((c) => opt(c, ctx.catalog.currencies[c]!.name))),
    h('optgroup', { label: 'All currencies' }, ...all.filter(([c]) => !COMMON.includes(c)).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([c, i]) => opt(c, i.name))));
  select.addEventListener('change', () => {
    ctx.cur = select.value || null;
    setDisplayCurrency(ctx.cur);
    try {
      if (ctx.cur) localStorage.setItem(CUR_KEY, ctx.cur);
      else localStorage.removeItem(CUR_KEY);
    } catch {
      /* storage blocked: the choice still applies until the page is closed */
    }
    onChange();
  });
  return h('label', { class: 'cur-menu' }, h('span', {}, 'Prices in'), select);
}

function appHeader(ctx: Ctx, onCurrency: () => void): HTMLElement {
  const count = h('span', { class: 'count' });
  const cmp = h('a', { class: 'btn cmp-link', href: '#/compare' }, icon('compare'), 'Compare', count);
  const sync = () => {
    count.textContent = ctx.selection.size ? String(ctx.selection.size) : '';
    count.hidden = !ctx.selection.size;
    cmp.setAttribute('href', ctx.selection.size ? ctx.selection.link() : '#/compare');
  };
  ctx.selection.onChange(sync);
  sync();
  return h('div', { class: 'app-head' }, h('div', { class: 'app-head-inner' },
    h('a', { class: 'op-logo', href: '#/' }, h('img', { src: `${import.meta.env.BASE_URL}favicon.svg`, alt: '', width: 30, height: 30 }), h('span', {}, 'Omni', h('b', {}, 'Price'))),
    searchBox(ctx, { placeholder: 'Search prices, e.g. eggs, oil, GBP…', label: 'Search prices', onPick: (i) => (location.hash = `#/i/${i.id}`) }),
    currencyMenu(ctx, onCurrency),
    cmp));
}

function footer(ctx: Ctx | null): HTMLElement {
  const srcs = ctx ? Object.values(ctx.catalog.sources) : [];
  return h('footer', { class: 'footer' }, h('div', { class: 'footer-inner' },
    h('p', { class: 'disclaimer' }, h('b', {}, 'Not financial advice. '), 'OmniPrice shows published figures for information only. Data can be delayed, revised or wrong. Check the original source before relying on it.'),
    srcs.length ? h('p', { class: 'muted small' }, 'Data: ', ...srcs.flatMap((s, i) => [i ? ' · ' : '', h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.name)]),
      '. Contains public sector information licensed under the Open Government Licence v3.0. Crypto prices powered by CoinGecko.') : null,
    h('nav', { class: 'footer-links', 'aria-label': 'Legal' },
      h('a', { href: '/privacy/#omniprice' }, 'Privacy'), h('a', { href: '/terms/#omniprice' }, 'Terms'), h('a', { href: '/cookies/' }, 'Cookies'), h('a', { href: '/' }, '© Big Tom Dev'))));
}

async function boot() {
  const main = h('main', { id: 'main', class: 'app-main' }, h('div', { class: 'skel skel-chart' }));
  root.replaceChildren(h('a', { class: 'skip', href: '#main' }, 'Skip to content'), siteBanner(), main);
  let catalog;
  try {
    catalog = await api.catalog();
  } catch (err) {
    main.replaceChildren(h('div', { class: 'empty' }, h('h1', {}, 'OmniPrice is unavailable'), h('p', {}, (err as Error).message),
      h('button', { class: 'btn', onclick: () => location.reload() }, 'Try again')));
    root.append(footer(null));
    return;
  }
  const catNames = new Map(catalog.categories.map((c) => [c.id, c.name]));
  const saved = readCurrency();
  const ctx: Ctx = {
    catalog,
    byId: new Map(catalog.instruments.map((i) => [i.id, i])),
    catName: (id) => catNames.get(id) ?? id,
    selection: new Selection(),
    cur: saved && catalog.currencies[saved] ? saved : null,
    show: (inst) => inCurrency(catalog, inst, ctx.cur),
  };
  setDisplayCurrency(ctx.cur);
  root.replaceChildren(h('a', { class: 'skip', href: '#main' }, 'Skip to content'), siteBanner(), appHeader(ctx, () => route()), main, footer(ctx));

  function route() {
    const raw = location.hash.replace(/^#/, '') || '/';
    if (raw === 'main') return; // skip link
    const [path = '/', query = ''] = raw.split('?');
    const params = new URLSearchParams(query);
    document.title = 'OmniPrice · Big Tom Dev';
    window.scrollTo(0, 0);
    const detail = /^\/i\/([\w-]+)$/.exec(path);
    if (detail) void detailView(main, ctx, detail[1]!, params.get('range'));
    else if (path === '/compare') void compareView(main, ctx, params);
    else void overviewView(main, ctx, params.get('cat'));
  }
  window.addEventListener('hashchange', route);
  route();
}

void boot();
