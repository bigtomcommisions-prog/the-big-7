import { h, icon, uid } from '../dom.ts';
import { bool, str, timeString, type WidgetDef } from './types.ts';

const WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
function timeInWords(d: Date): string {
  const m = Math.round(d.getMinutes() / 5) * 5;
  let hr = d.getHours() % 12;
  const next = WORDS[(hr + 1) % 12]!;
  const cur = WORDS[hr]!;
  if (m === 0 || m === 60) return `It's ${m === 60 ? next : cur} o'clock`;
  if (m === 15) return `It's quarter past ${cur}`;
  if (m === 30) return `It's half past ${cur}`;
  if (m === 45) return `It's quarter to ${next}`;
  if (m < 30) return `It's ${m === 5 ? 'five' : m === 10 ? 'ten' : m === 20 ? 'twenty' : 'twenty-five'} past ${cur}`;
  const to = 60 - m;
  hr = (hr + 1) % 12;
  return `It's ${to === 5 ? 'five' : to === 10 ? 'ten' : to === 20 ? 'twenty' : 'twenty-five'} to ${WORDS[hr]}`;
}

function analogClock(): { el: SVGSVGElement; set(d: Date, seconds: boolean): void } {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.classList.add('analog');
  svg.setAttribute('role', 'img');
  const mk = (tag: string, attrs: Record<string, string>) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.append(e);
    return e;
  };
  mk('circle', { cx: '100', cy: '100', r: '94', class: 'face' });
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, big = i % 5 === 0;
    const r1 = big ? 78 : 84, r2 = 88;
    mk('line', { x1: String(100 + Math.sin(a) * r1), y1: String(100 - Math.cos(a) * r1), x2: String(100 + Math.sin(a) * r2), y2: String(100 - Math.cos(a) * r2), class: big ? 'tick big' : 'tick' });
  }
  const hand = (cls: string, len: number) => mk('line', { x1: '100', y1: '112', x2: '100', y2: String(100 - len), class: `hand ${cls}` });
  const hh = hand('h', 46), mm = hand('m', 68), ss = hand('s', 76);
  mk('circle', { cx: '100', cy: '100', r: '4', class: 'pin' });
  return {
    el: svg,
    set(d, seconds) {
      const s = d.getSeconds(), m = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + m / 60;
      hh.setAttribute('transform', `rotate(${hr * 30} 100 100)`);
      mm.setAttribute('transform', `rotate(${m * 6} 100 100)`);
      ss.setAttribute('transform', `rotate(${s * 6} 100 100)`);
      ss.style.display = seconds ? '' : 'none';
      svg.setAttribute('aria-label', d.toLocaleTimeString('en-GB'));
    },
  };
}

export const clock: WidgetDef = {
  type: 'clock', name: 'Clock', blurb: 'The time, in digital, analogue, minimal or words.', icon: 'clock', defaultSize: 'l', sizes: ['s', 'm', 'l'],
  defaults: () => ({ style: 'digital', showDate: true }),
  fields: [
    { key: 'style', label: 'Style', type: 'select', options: [{ value: 'digital', label: 'Digital' }, { value: 'analog', label: 'Analogue' }, { value: 'minimal', label: 'Minimal' }, { value: 'words', label: 'In words' }] },
    { key: 'showDate', label: 'Show the date', type: 'toggle' },
  ],
  render(el, ctx) {
    const style = str(ctx.config.style, 'digital');
    const time = h('div', { class: `clock-time clock-${style}` });
    const date = h('div', { class: 'clock-date' });
    const an = style === 'analog' ? analogClock() : null;
    el.append(an ? an.el : time, bool(ctx.config.showDate, true) ? date : '');
    ctx.every(1000, () => {
      const d = new Date();
      if (an) an.set(d, ctx.general.showSeconds);
      else if (style === 'words') time.textContent = timeInWords(d);
      else time.textContent = timeString(d, ctx.general, { seconds: ctx.general.showSeconds });
      date.textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: style === 'minimal' ? undefined : 'numeric' });
    });
  },
};

export const greeting: WidgetDef = {
  type: 'greeting', name: 'Greeting', blurb: 'Good morning, good evening, with your name.', icon: 'hand', defaultSize: 'l', sizes: ['s', 'm', 'l'],
  defaults: () => ({ message: '' }),
  fields: [{ key: 'message', label: 'Second line (optional)', type: 'text', placeholder: 'e.g. Make today count.' }],
  render(el, ctx) {
    const line = h('div', { class: 'greet' });
    el.append(line, str(ctx.config.message) ? h('div', { class: 'greet-sub' }, str(ctx.config.message)) : '');
    ctx.every(60_000, () => {
      const hr = new Date().getHours();
      const part = hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
      line.textContent = ctx.general.name ? `${part}, ${ctx.general.name}` : part;
    });
  },
};

export const ENGINES: Record<string, { label: string; url: string }> = {
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  google: { label: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  brave: { label: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
  startpage: { label: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' },
  ecosia: { label: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
  kagi: { label: 'Kagi', url: 'https://kagi.com/search?q=%s' },
  qwant: { label: 'Qwant', url: 'https://www.qwant.com/?q=%s' },
  perplexity: { label: 'Perplexity', url: 'https://www.perplexity.ai/search?q=%s' },
  youtube: { label: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
  wikipedia: { label: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search=%s' },
  github: { label: 'GitHub', url: 'https://github.com/search?q=%s' },
};

export const search: WidgetDef = {
  type: 'search', name: 'Search', blurb: 'Search with your favourite engine. Press / to jump to it.', icon: 'search', defaultSize: 'l', sizes: ['m', 'l'],
  defaults: () => ({ engine: 'google', autofocus: true, newTab: false, custom: '' }),
  fields: [
    { key: 'engine', label: 'Search engine', type: 'select', options: [...Object.entries(ENGINES).map(([value, e]) => ({ value, label: e.label })), { value: 'custom', label: 'Custom…' }] },
    { key: 'custom', label: 'Custom search URL', type: 'text', placeholder: 'https://example.com/search?q=%s', help: 'Used when the engine is "Custom". %s is replaced by what you type.' },
    { key: 'autofocus', label: 'Put the cursor here when the page opens', type: 'toggle' },
    { key: 'newTab', label: 'Open results in a new tab', type: 'toggle' },
  ],
  render(el, ctx) {
    const key = str(ctx.config.engine, 'duckduckgo');
    const custom = str(ctx.config.custom);
    const tpl = key === 'custom' && /^https?:\/\/.+%s/.test(custom) ? custom : (ENGINES[key] ?? ENGINES.duckduckgo!).url;
    const label = key === 'custom' ? 'custom search' : (ENGINES[key] ?? ENGINES.duckduckgo!).label;
    const input = h('input', { type: 'search', class: 'search-input', placeholder: `Search ${label} or type a web address`, 'aria-label': `Search ${label}`, autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
    const form = h('form', { class: 'search', role: 'search' }, icon('search'), input, h('button', { type: 'submit', class: 'search-go', 'aria-label': 'Search' }, icon('right')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      const looksLikeUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(q) && !/\s/.test(q);
      const url = looksLikeUrl ? (/^https?:\/\//i.test(q) ? q : `https://${q}`) : tpl.replace('%s', encodeURIComponent(q));
      if (bool(ctx.config.newTab)) open(url, '_blank', 'noopener');
      else location.href = url;
    });
    el.append(form);
    if (bool(ctx.config.autofocus, true) && ctx.initial && !ctx.editing) requestAnimationFrame(() => input.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)))) { e.preventDefault(); input.focus(); }
    };
    addEventListener('keydown', onKey);
    ctx.onCleanup(() => removeEventListener('keydown', onKey));
  },
};

/** "Label | URL" lines → links (only http/https URLs are kept). */
export function parseLinks(text: string): { label: string; url: string }[] {
  return text.split('\n').map((line) => {
    const [a, b] = line.includes('|') ? line.split('|', 2) : ['', line];
    let url = (b ?? '').trim();
    if (!url) return null;
    if (!/^[a-z]+:\/\//i.test(url)) url = `https://${url}`;
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return { label: (a ?? '').trim() || u.hostname.replace(/^www\./, ''), url: u.href };
    } catch {
      return null;
    }
  }).filter((x): x is { label: string; url: string } => x !== null);
}

const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

export const links: WidgetDef = {
  type: 'links', name: 'Quick links', blurb: 'Your favourite sites, one click away.', icon: 'link', defaultSize: 'l', sizes: ['s', 'm', 'l'],
  defaults: () => ({ items: 'BBC News | https://www.bbc.co.uk/news\nYouTube | https://www.youtube.com', style: 'tiles' }),
  fields: [
    { key: 'items', label: 'Links (one per line: Name | address)', type: 'textarea', placeholder: 'GitHub | https://github.com' },
    { key: 'style', label: 'Style', type: 'select', options: [{ value: 'tiles', label: 'Tiles' }, { value: 'chips', label: 'Chips' }, { value: 'list', label: 'List' }] },
  ],
  render(el, ctx) {
    const items = parseLinks(str(ctx.config.items));
    const style = str(ctx.config.style, 'tiles');
    if (!items.length) {
      el.append(h('p', { class: 'muted' }, 'No links yet. Open this widget’s settings to add some.'));
      return;
    }
    el.append(h('nav', { class: `links links-${style}`, 'aria-label': 'Quick links' }, ...items.map((it) => {
      const host = new URL(it.url).hostname;
      const letter = h('span', { class: 'link-icon letter', style: `--h:${hue(host)}` }, it.label.slice(0, 1).toUpperCase());
      let iconEl: HTMLElement = letter;
      if (ctx.general.favicons) {
        const img = h('img', { class: 'link-icon', src: `https://icons.duckduckgo.com/ip3/${host}.ico`, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
        img.addEventListener('error', () => img.replaceWith(letter));
        iconEl = img;
      }
      return h('a', { class: 'link', href: it.url, target: ctx.general.linksNewTab ? '_blank' : undefined, rel: 'noopener noreferrer', title: it.url }, iconEl, h('span', { class: 'link-label' }, it.label));
    })));
  },
};

export const notes: WidgetDef = {
  type: 'notes', name: 'Notes', blurb: 'A scratch pad that saves as you type.', icon: 'note', defaultSize: 's', sizes: ['s', 'm', 'l'],
  defaults: () => ({ text: '', title: 'Notes' }),
  fields: [{ key: 'title', label: 'Title', type: 'text' }],
  render(el, ctx) {
    const ta = h('textarea', { class: 'notes', placeholder: 'Write something…', 'aria-label': str(ctx.config.title, 'Notes'), spellcheck: 'true' });
    ta.value = str(ctx.config.text);
    let t = 0;
    ta.addEventListener('input', () => { clearTimeout(t); t = window.setTimeout(() => ctx.save({ text: ta.value }), 300); });
    el.append(h('h3', { class: 'w-title' }, str(ctx.config.title, 'Notes')), ta);
  },
};

interface Todo { id: string; text: string; done: boolean }
export const todo: WidgetDef = {
  type: 'todo', name: 'To-do list', blurb: 'Tick things off. Saved on this device.', icon: 'list', defaultSize: 's', sizes: ['s', 'm', 'l'],
  defaults: () => ({ items: [], title: 'To do' }),
  fields: [{ key: 'title', label: 'Title', type: 'text' }],
  render(el, ctx) {
    let items: Todo[] = Array.isArray(ctx.config.items) ? (ctx.config.items as Todo[]).filter((i) => i && typeof i.text === 'string') : [];
    const list = h('ul', { class: 'todo-list' });
    const input = h('input', { type: 'text', placeholder: 'Add a task…', 'aria-label': 'New task', maxlength: 200 });
    const count = h('span', { class: 'muted small' });
    const commit = () => { ctx.save({ items }); draw(); };
    const draw = () => {
      list.replaceChildren(...items.map((it) => {
        const cb = h('input', { type: 'checkbox', checked: it.done, 'aria-label': it.text });
        cb.addEventListener('change', () => { it.done = cb.checked; commit(); });
        return h('li', { class: it.done ? 'done' : '' }, h('label', {}, cb, h('span', {}, it.text)),
          h('button', { class: 'icon-btn tiny', type: 'button', 'aria-label': `Delete ${it.text}`, onclick: () => { items = items.filter((x) => x !== it); commit(); } }, icon('close')));
      }));
      const left = items.filter((i) => !i.done).length;
      count.textContent = items.length ? `${left} left` : '';
      clear.hidden = !items.some((i) => i.done);
    };
    const clear = h('button', { class: 'link-btn small', type: 'button', onclick: () => { items = items.filter((i) => !i.done); commit(); } }, 'Clear done');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        items.push({ id: uid(), text: input.value.trim(), done: false });
        input.value = '';
        commit();
      }
    });
    el.append(h('div', { class: 'w-head' }, h('h3', { class: 'w-title' }, str(ctx.config.title, 'To do')), count), input, list, clear);
    draw();
  },
};

/** Quotations by authors whose works are in the public domain. */
const QUOTES: [string, string][] = [
  ['Simplicity, simplicity, simplicity!', 'Henry David Thoreau'],
  ['I went to the woods because I wished to live deliberately.', 'Henry David Thoreau'],
  ['Nothing can bring you peace but yourself.', 'Ralph Waldo Emerson'],
  ['Adopt the pace of nature: her secret is patience.', 'Ralph Waldo Emerson'],
  ['It is not length of life, but depth of life.', 'Ralph Waldo Emerson'],
  ['Well done is better than well said.', 'Benjamin Franklin'],
  ['Lost time is never found again.', 'Benjamin Franklin'],
  ['Dost thou love life? Then do not squander time, for that’s the stuff life is made of.', 'Benjamin Franklin'],
  ['We are all in the gutter, but some of us are looking at the stars.', 'Oscar Wilde'],
  ['Experience is the name every one gives to their mistakes.', 'Oscar Wilde'],
  ['There is nothing either good or bad, but thinking makes it so.', 'William Shakespeare'],
  ['What’s past is prologue.', 'William Shakespeare'],
  ['Brevity is the soul of wit.', 'William Shakespeare'],
  ['Though she be but little, she is fierce.', 'William Shakespeare'],
  ['Be not afraid of greatness.', 'William Shakespeare'],
  ['“Hope” is the thing with feathers that perches in the soul.', 'Emily Dickinson'],
  ['I dwell in Possibility.', 'Emily Dickinson'],
  ['Forever is composed of Nows.', 'Emily Dickinson'],
  ['I exist as I am, that is enough.', 'Walt Whitman'],
  ['I am large, I contain multitudes.', 'Walt Whitman'],
  ['Imagination is more important than knowledge.', 'Albert Einstein'],
  ['Life is like riding a bicycle. To keep your balance you must keep moving.', 'Albert Einstein'],
  ['Knowing is not enough; we must apply.', 'Johann Wolfgang von Goethe'],
  ['Nothing in life is to be feared, it is only to be understood.', 'Marie Curie'],
  ['Well begun is half done.', 'Aristotle'],
  ['A journey of a thousand miles begins with a single step.', 'Lao Tzu'],
  ['Genius is one per cent inspiration and ninety-nine per cent perspiration.', 'Thomas Edison'],
  ['I am not afraid of storms, for I am learning how to sail my ship.', 'Louisa May Alcott'],
  ['Art is long, and Time is fleeting.', 'Henry Wadsworth Longfellow'],
  ['To see a World in a Grain of Sand, and a Heaven in a Wild Flower.', 'William Blake'],
  ['Hope springs eternal in the human breast.', 'Alexander Pope'],
  ['To err is human; to forgive, divine.', 'Alexander Pope'],
  ['Fortune favours the bold.', 'Latin proverb'],
  ['Little by little, one travels far.', 'Proverb'],
];

export const quote: WidgetDef = {
  type: 'quote', name: 'Quote', blurb: 'A classic quotation, new each day or each visit.', icon: 'quote', defaultSize: 'm', sizes: ['s', 'm', 'l'],
  defaults: () => ({ mode: 'daily' }),
  fields: [{ key: 'mode', label: 'Change', type: 'select', options: [{ value: 'daily', label: 'Once a day' }, { value: 'visit', label: 'Every visit' }] }],
  render(el, ctx) {
    const day = Math.floor(Date.now() / 86_400_000);
    const i = str(ctx.config.mode, 'daily') === 'daily' ? day % QUOTES.length : Math.floor(Math.random() * QUOTES.length);
    const [text, who] = QUOTES[i]!;
    el.append(h('figure', { class: 'quote' }, h('blockquote', {}, text), h('figcaption', {}, `— ${who}`)));
  },
};
