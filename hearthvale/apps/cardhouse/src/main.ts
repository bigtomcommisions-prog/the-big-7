import '@fontsource-variable/inter';
import './styles.css';
import type { Card, CardGroup, GameId, GameView, Options, PlayerView } from '@bigtomdev/cards';
import { h, icon } from './dom.ts';

interface TableState {
  t: 'state';
  code: string;
  game: GameId;
  you: string;
  hand: number;
  remainingMs: number;
  away: boolean;
  canTopUp: boolean;
  view: GameView;
}

const GAMES: Record<GameId, { name: string; players: string; blurb: string }> = {
  blackjack: { name: 'Blackjack', players: '1–5', blurb: 'Beat the dealer to 21. Blackjack pays 3:2.' },
  threecard: { name: 'Three Card Poker', players: '1–6', blurb: 'Ante, see three cards, then play or fold against the dealer.' },
  holdem: { name: 'Texas Hold’em', players: '2–9', blurb: 'No-limit. Two cards each, five on the board.' },
  draw: { name: 'Five Card Draw', players: '2–6', blurb: 'Bet, swap up to three cards, bet again.' },
  nine: { name: 'Nine-card poker', players: '2–5', blurb: 'Five cards, bet, four more, bet. Best five of nine wins.' },
};

const API = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '');
const WS_URL = (API || location.origin).replace(/^http/, 'ws') + '/cards';
const SEAT_KEY = 'cardhouse:seat';
const TURN_MS = 30_000;
const SUIT: Record<string, [string, string]> = { s: ['♠', 'spades'], h: ['♥', 'hearts'], d: ['♦', 'diamonds'], c: ['♣', 'clubs'] };
const RANK: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: '10' };
const fmt = (n: number) => n.toLocaleString('en-GB');

// ---------------------------------------------------------------- connection

let ws: WebSocket | null = null;
let queue: object[] = [];
let retry = 0;
let state: TableState | null = null;
let seat = readSeat();
let nick = '';

function readSeat(): { code: string; token: string } | null {
  try {
    return JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function saveSeat(v: typeof seat) {
  seat = v;
  try {
    if (v) sessionStorage.setItem(SEAT_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(SEAT_KEY);
  } catch {
    /* private mode: rejoining after a refresh won't work, everything else does */
  }
}

function send(m: { t: string; [k: string]: unknown }) {
  if (ws?.readyState === WebSocket.OPEN) return ws.send(JSON.stringify(m));
  queue.push(m);
  if (!ws) connect();
}

function connect() {
  const sock = (ws = new WebSocket(WS_URL));
  sock.onopen = () => {
    retry = 0;
    offline.hidden = true;
    const out = queue;
    queue = [];
    if (seat && !out.some((m) => 't' in m && (m.t === 'join' || m.t === 'create'))) sock.send(JSON.stringify({ t: 'join', code: seat.code, token: seat.token }));
    for (const m of out) sock.send(JSON.stringify(m));
  };
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'joined') {
      saveSeat({ code: m.code, token: m.token });
      history.replaceState(null, '', `?table=${m.code}`);
    } else if (m.t === 'state') {
      state = m;
      render();
    } else if (m.t === 'error') {
      toast(m.message);
      if (!state && /No table/.test(m.message)) saveSeat(null);
    }
  };
  sock.onclose = (e) => {
    if (ws !== sock) return;
    ws = null;
    if (e.code === 4000) {
      toast('This seat is open in another tab.');
      return leaveLocal();
    }
    if (!seat) return;
    offline.hidden = false;
    setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
  };
}

// ---------------------------------------------------------------- shared bits

const root = document.getElementById('app')!;
const announcer = h('div', { class: 'sr-only', 'aria-live': 'polite' });
const toastEl = h('div', { class: 'toast', role: 'status' });
const offline = h('div', { class: 'offline', hidden: true }, 'Reconnecting…');
document.body.append(announcer, toastEl, offline);

let toastTimer = 0;
function toast(text: string) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3000);
}

const say = (text: string) => (announcer.textContent = text);

function cardName(c: Card) {
  return c === '??' ? 'Face-down card' : `${RANK[c[0]!] ?? c[0]} of ${SUIT[c[1]!]![1]}`;
}

function cardEl(c: Card, size: 'big' | 'sm' = 'sm'): HTMLElement {
  if (c === '??') return h('div', { class: `card back ${size}`, role: 'img', 'aria-label': cardName(c) });
  const r = c[0] === 'T' ? '10' : c[0]!;
  const [sym] = SUIT[c[1]!]!;
  return h(
    'div',
    { class: `card ${size} suit-${c[1]}`, role: 'img', 'aria-label': cardName(c) },
    h('span', { class: 'corner', 'aria-hidden': 'true' }, r, h('br'), sym),
    h('span', { class: 'pip', 'aria-hidden': 'true' }, 'JQK'.includes(c[0]!) ? c[0] : sym),
    h('span', { class: 'corner end', 'aria-hidden': 'true' }, r, h('br'), sym),
  );
}

const cardRow = (cards: Card[]) => h('div', { class: 'row-cards' }, cards.map((c) => cardEl(c)));

function tableUrl(code: string) {
  return `${location.origin}${import.meta.env.BASE_URL}?table=${code}`;
}

async function share(code: string) {
  const url = tableUrl(code);
  try {
    if (navigator.share) return await navigator.share({ title: 'Cardhouse', text: `Join my table: ${code}`, url });
    await navigator.clipboard.writeText(url);
    toast('Link copied.');
  } catch {
    /* cancelled */
  }
}

function leaveLocal() {
  saveSeat(null);
  state = null;
  history.replaceState(null, '', import.meta.env.BASE_URL);
  render();
}

// Keep the screen awake while at a table.
let wake: { release(): Promise<void> } | null = null;
async function keepAwake(on: boolean) {
  try {
    if (on && !wake && document.visibilityState === 'visible') wake = await (navigator as any).wakeLock?.request('screen');
    if (!on && wake) {
      await wake.release();
      wake = null;
    }
  } catch {
    /* not supported or refused */
  }
}
document.addEventListener('visibilitychange', () => {
  wake = null;
  if (state) void keepAwake(true);
});

// ---------------------------------------------------------------- lobby

function lobby(): HTMLElement {
  const params = new URLSearchParams(location.search);
  const invited = (params.get('table') ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
  let game: GameId = 'blackjack';
  const name = h('input', { id: 'nick', maxlength: 16, required: true, autocomplete: 'nickname', pattern: "[\\p{L}\\p{N} _.'\\-]+", placeholder: 'e.g. Ace', value: nick, oninput: () => (nick = name.value) });
  const nameOk = () => (name.reportValidity() ? name.value.trim() : null);
  const tiles = (Object.keys(GAMES) as GameId[]).map((id) =>
    h(
      'button',
      { type: 'button', class: 'game', role: 'radio', 'aria-checked': String(id === game), onclick: () => pickGame(id) },
      h('strong', {}, GAMES[id].name),
      h('span', { class: 'players' }, `${GAMES[id].players} players`),
      h('span', { class: 'blurb' }, GAMES[id].blurb),
    ),
  );
  const pickGame = (id: GameId) => {
    game = id;
    tiles.forEach((t, i) => t.setAttribute('aria-checked', String(Object.keys(GAMES)[i] === id)));
  };
  const code = h('input', { id: 'code', maxlength: 5, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', placeholder: 'ABCDE', value: invited, oninput: () => (code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '')) });

  const create = h('form', { class: 'panel', onsubmit: (e: Event) => { e.preventDefault(); const n = nameOk(); if (n) send({ t: 'create', game, name: n }); } },
    h('h2', {}, 'Start a table'),
    h('div', { class: 'games', role: 'radiogroup', 'aria-label': 'Game' }, tiles),
    h('button', { class: 'primary', type: 'submit' }, 'Create table'),
  );
  const join = h('form', { class: 'panel', onsubmit: (e: Event) => { e.preventDefault(); const n = nameOk(); if (!n) return; if (code.value.length !== 5) return toast('Table codes are 5 letters.'); send({ t: 'join', code: code.value, name: n }); } },
    h('h2', {}, invited ? `You’re invited to table ${invited}` : 'Join a friend'),
    h('label', { for: 'code' }, 'Table code'),
    h('div', { class: 'join-row' }, code, h('button', { class: invited ? 'primary' : '', type: 'submit' }, 'Join')),
  );

  return h('div', { class: 'lobby' },
    h('header', { class: 'brand' },
      h('a', { class: 'home', href: '/the-big-7/' }, 'Big Tom Dev · The Big 7'),
      h('h1', {}, 'Cardhouse'),
      h('p', {}, 'Card games made for your phone. Swipe through your hand, swipe up for the table.'),
    ),
    h('main', {},
      h('div', { class: 'panel' }, h('label', { for: 'nick' }, 'Your nickname'), name, h('p', { class: 'hint' }, 'Shown to the others at your table. No account needed.')),
      invited ? [join, create] : [create, join],
    ),
    h('footer', { class: 'legal' },
      h('p', {}, h('strong', {}, 'Play money only.'), ' Chips are free and have no value. They can’t be bought, sold or cashed out. For ages 13 and over.'),
      h('p', {}, h('a', { href: '/terms/' }, 'Terms'), ' · ', h('a', { href: '/privacy/' }, 'Privacy'), ' · ', h('a', { href: '/cookies/' }, 'Cookies'), ' · ', h('a', { href: '/' }, 'bigtomdev.fyi')),
    ),
  );
}

// ---------------------------------------------------------------- table

type TableUI = ReturnType<typeof buildTable>;
let ui: TableUI | null = null;
let deadline = 0;
let wasMyTurn = false;
let lastBet = 20;
let fourColour = false;
const selected = new Set<number>();

function buildTable() {
  const title = h('span', { class: 'title' });
  const pot = h('span', { class: 'pot' });
  const code = h('button', { class: 'code', type: 'button', onclick: () => state && share(state.code) });
  const peek = h('div', { class: 'peek' });
  const timer = h('div', { class: 'timer', 'aria-hidden': 'true' }, h('i'));
  const label = h('div', { class: 'hand-label' });
  const track = h('div', { class: 'track', role: 'list', tabindex: 0, 'aria-label': 'Your cards. Swipe, or use the arrow keys.' });
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' });
  const note = h('div', { class: 'hand-note' });
  const msg = h('div', { class: 'msg' });
  const actions = h('div', { class: 'actions' });
  const handle = h('button', { class: 'handle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'sheet-body' }, h('span', { class: 'grip' }), icon('up'), h('span', {}, 'Chips & table'));
  const body = h('div', { class: 'sheet-body', id: 'sheet-body' });
  const sheet = h('section', { class: 'sheet', 'aria-label': 'Chips and table' }, handle, body);
  const scrim = h('div', { class: 'scrim', onclick: () => setOpen(false) });
  const hand = h('main', { class: 'hand' }, label, track, dots, note);
  const el = h('div', { class: 'table' }, h('header', { class: 'bar' }, h('div', { class: 'row' }, title, pot, code), peek, timer), hand, msg, actions, scrim, sheet);

  const setOpen = (open: boolean) => {
    sheet.classList.toggle('open', open);
    el.classList.toggle('sheet-open', open);
    handle.setAttribute('aria-expanded', String(open));
    body.inert = !open;
  };
  body.inert = true;

  // Swipe the handle (or anywhere above the sheet) up to open; down to close. Tapping the handle toggles.
  let y0 = 0;
  let x0 = 0;
  let dragging = false;
  const peekPx = () => handle.offsetHeight;
  handle.addEventListener('pointerdown', (e) => {
    y0 = e.clientY;
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    sheet.style.transition = 'none';
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const closed = sheet.offsetHeight - peekPx();
    const base = sheet.classList.contains('open') ? 0 : closed;
    sheet.style.transform = `translateY(${Math.max(0, Math.min(closed, base + e.clientY - y0))}px)`;
  });
  handle.addEventListener('pointerup', (e) => {
    dragging = false;
    sheet.style.transition = sheet.style.transform = '';
    const dy = e.clientY - y0;
    setOpen(Math.abs(dy) < 8 ? !sheet.classList.contains('open') : dy < 0);
  });
  handle.addEventListener('pointercancel', () => {
    dragging = false;
    sheet.style.transition = sheet.style.transform = '';
  });
  handle.addEventListener('click', (e) => e.detail === 0 && setOpen(!sheet.classList.contains('open'))); // keyboard
  for (const zone of [hand, actions, msg]) {
    zone.addEventListener('pointerdown', (e) => ((y0 = e.clientY), (x0 = e.clientX)));
    zone.addEventListener('pointerup', (e) => {
      const dy = e.clientY - y0;
      if (dy < -60 && Math.abs(dy) > 2 * Math.abs(e.clientX - x0)) setOpen(true);
    });
  }

  let raf = 0;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(updateFocus);
  });
  track.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    step(e.key === 'ArrowRight' ? 1 : -1);
  });

  return { el, title, pot, code, peek, timer, label, track, dots, note, msg, actions, body, setOpen, keys: { hand: '', actions: '' }, focus: 0, flat: [] as { g: CardGroup; i: number }[] };
}

document.addEventListener('keydown', (e) => {
  if (!ui || (e.target as HTMLElement).closest('input, textarea')) return;
  if (e.key === 'Escape') ui.setOpen(false);
  else if (e.key === 'ArrowUp' && e.target === document.body) ui.setOpen(true);
  else if (e.key === 'ArrowDown' && e.target === document.body) ui.setOpen(false);
  else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target === document.body) step(e.key === 'ArrowRight' ? 1 : -1);
});

function step(dir: number) {
  if (!ui) return;
  const next = ui.track.children[Math.max(0, Math.min(ui.track.children.length - 1, ui.focus + dir))] as HTMLElement | undefined;
  next?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
}

/** Which card is centred: drives the dots, the hand label and the note. */
function updateFocus() {
  if (!ui) return;
  const kids = [...ui.track.children] as HTMLElement[];
  const mid = ui.track.scrollLeft + ui.track.clientWidth / 2;
  let best = 0;
  kids.forEach((k, i) => {
    if (Math.abs(k.offsetLeft + k.offsetWidth / 2 - mid) < Math.abs(kids[best]!.offsetLeft + kids[best]!.offsetWidth / 2 - mid)) best = i;
  });
  ui.focus = best;
  [...ui.dots.children].forEach((d, i) => d.classList.toggle('on', i === best));
  const f = ui.flat[best];
  if (!f) return;
  const count = f.g.cards.length;
  ui.label.textContent = `${f.g.label} · card ${f.i + 1} of ${count}`;
  ui.note.textContent = f.g.note ?? '';
  ui.note.classList.toggle('active', !!f.g.active);
}

function renderHand(s: TableState) {
  const u = ui!;
  const v = s.view;
  const drawing = !!v.options.draw;
  const key = JSON.stringify(v.mine) + drawing;
  if (key === u.keys.hand) return;
  const before = u.flat.length;
  const sameCards = u.keys.hand.startsWith(JSON.stringify(v.mine));
  u.keys.hand = key;
  if (!sameCards) selected.clear();
  u.flat = v.mine.flatMap((g) => g.cards.map((_, i) => ({ g, i })));

  if (!u.flat.length) {
    u.track.replaceChildren(h('div', { class: 'empty', role: 'listitem' }, s.hand ? 'Not in this hand.' : 'Waiting for players…', h('small', {}, `Table ${s.code}: share the code to invite friends.`)));
    u.dots.replaceChildren();
    u.label.textContent = GAMES[s.game].name;
    u.note.textContent = '';
    return;
  }
  u.track.replaceChildren(
    ...u.flat.map(({ g, i }) => {
      const c = g.cards[i]!;
      const el = cardEl(c, 'big');
      if (v.mine.length > 1) el.append(h('span', { class: 'tag' }, g.label.split(' · ')[0]));
      if (!drawing) return h('div', { class: `slot${g.active ? ' active' : ''}`, role: 'listitem' }, el);
      const b = h('button', { class: `slot pick${selected.has(i) ? ' sel' : ''}`, type: 'button', role: 'listitem', 'aria-pressed': String(selected.has(i)), 'aria-label': `${cardName(c)}. ${selected.has(i) ? 'Will be discarded' : 'Tap to discard'}` }, el, h('span', { class: 'discard' }, 'Discard'));
      b.addEventListener('click', () => {
        if (selected.has(i)) selected.delete(i);
        else selected.add(i);
        b.classList.toggle('sel', selected.has(i));
        b.setAttribute('aria-pressed', String(selected.has(i)));
        b.setAttribute('aria-label', `${cardName(c)}. ${selected.has(i) ? 'Will be discarded' : 'Tap to discard'}`);
        renderActions(state!, true);
      });
      return b;
    }),
  );
  u.dots.replaceChildren(...u.flat.map(() => h('i')));
  // A new card (hit, draw, next street) scrolls into view; otherwise keep the player's place.
  const target = u.flat.length > before && before > 0 ? u.flat.length - 1 : Math.min(u.focus, u.flat.length - 1);
  requestAnimationFrame(() => {
    const el = u.track.children[target] as HTMLElement | undefined;
    if (el) u.track.scrollLeft = el.offsetLeft + el.offsetWidth / 2 - u.track.clientWidth / 2;
    updateFocus();
  });
}

const act = (action: object) => send({ t: 'act', action });
const btn = (text: string, onclick: () => void, cls = '') => h('button', { type: 'button', class: cls, onclick }, text);

/** Slider plus quick picks for an amount, with one confirm button. */
function amount(min: number, max: number, start: number, picks: [string, number][], go: (n: number) => void, verb: (n: number) => string) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  const range = h('input', { type: 'range', min, max, step: 1, value: clamp(start), 'aria-label': 'Amount' });
  const out = h('output', {}, fmt(clamp(start)));
  const confirm = h('button', { type: 'button', class: 'primary', onclick: () => go(Number(range.value)) }, verb(clamp(start)));
  const set = (n: number) => {
    range.value = String(clamp(n));
    out.textContent = fmt(Number(range.value));
    confirm.textContent = verb(Number(range.value));
  };
  range.addEventListener('input', () => set(Number(range.value)));
  return h('div', { class: 'amount' },
    h('div', { class: 'amount-row' }, range, out),
    h('div', { class: 'picks' }, picks.map(([l, n]) => btn(l, () => set(n)))),
    confirm,
  );
}

function renderActions(s: TableState, force = false) {
  const u = ui!;
  const o: Options = s.view.options;
  const me = s.view.players.find((p) => p.id === s.you);
  const key = JSON.stringify([o, s.away, s.canTopUp, selected.size, me?.chips]);
  if (key === u.keys.actions && !force) return;
  u.keys.actions = key;
  const out: Node[] = [];
  const low = (me?.chips ?? 0) < 20;

  if (s.away) out.push(btn('Deal me in', () => send({ t: 'back' }), 'primary wide'));
  else if (o.bet) {
    const picks: [string, number][] = [10, 25, 50, 100, o.bet.max].map((n, i, a) => [i === a.length - 1 ? 'Max' : String(n), n]);
    out.push(amount(o.bet.min, o.bet.max, lastBet, picks, (n) => { lastBet = n; act({ type: 'bet', amount: n }); }, (n) => `Bet ${fmt(n)}`));
  } else if (o.fold && (o.check || o.call !== undefined)) {
    const row = h('div', { class: 'btns' }, btn('Fold', () => act({ type: 'fold' }), 'danger'), o.check ? btn('Check', () => act({ type: 'check' })) : btn(`Call ${fmt(o.call!)}`, () => act({ type: 'call' })));
    out.push(row);
    if (o.raise) {
      const r = o.raise;
      const verb = o.check && !(me?.bet ?? 0) ? 'Bet' : 'Raise to';
      if (r.min === r.max) row.append(btn(`All in ${fmt(r.max)}`, () => act({ type: 'raise', to: r.max }), 'primary'));
      else {
        const cur = (me?.bet ?? 0) + (o.call ?? 0);
        const pot = s.view.pot + (o.call ?? 0);
        const box = amount(r.min, r.max, r.min, [['Min', r.min], ['½ pot', cur + pot / 2], ['Pot', cur + pot], ['All in', r.max]], (n) => act({ type: 'raise', to: n }), (n) => (n === r.max ? `All in ${fmt(n)}` : `${verb} ${fmt(n)}`));
        box.hidden = true;
        row.append(btn(verb === 'Bet' ? 'Bet…' : 'Raise…', () => (box.hidden = !box.hidden), 'primary'));
        out.push(box);
      }
    }
  } else if (o.hit) {
    out.push(h('div', { class: 'btns' }, btn('Hit', () => act({ type: 'hit' }), 'primary'), btn('Stand', () => act({ type: 'stand' })), o.double && btn('Double', () => act({ type: 'double' })), o.split && btn('Split', () => act({ type: 'split' }))));
  } else if (o.play !== undefined) {
    out.push(h('div', { class: 'btns' }, btn('Fold', () => act({ type: 'fold' }), 'danger'), btn(`Play ${fmt(o.play)}`, () => act({ type: 'play' }), 'primary')));
  } else if (o.draw) {
    const n = selected.size;
    out.push(h('p', { class: 'hint' }, 'Tap cards to discard: up to 3, or 4 if you keep an Ace.'));
    out.push(btn(n ? `Discard ${n} and draw` : 'Stand pat', () => act({ type: 'draw', discard: [...selected] }), 'primary wide'));
  }
  if (s.canTopUp && low && !o.bet) out.push(btn('Top up to 1,000 chips', () => send({ t: 'topup' }), 'wide'));
  u.actions.replaceChildren(...out);
}

function playerRow(p: PlayerView, you: string) {
  return h('li', { class: `player${p.turn ? ' turn' : ''}` },
    h('div', { class: 'who' },
      h('strong', {}, p.name, p.id === you ? ' (you)' : ''),
      p.button && h('span', { class: 'dealer-btn', title: 'Dealer button' }, 'D'),
      p.turn && h('span', { class: 'sr-only' }, ', to act'),
    ),
    h('div', { class: 'nums' }, h('span', {}, `${fmt(p.chips)} chips`), p.bet ? h('span', { class: 'bet' }, `bet ${fmt(p.bet)}`) : null, p.status && h('span', { class: 'status' }, p.status)),
    p.cards.length ? cardRow(p.cards) : null,
  );
}

function renderSheet(s: TableState) {
  const v = s.view;
  const me = v.players.find((p) => p.id === s.you);
  const parts: (Node | null | false)[] = [
    h('div', { class: 'chips' },
      h('div', {}, h('small', {}, 'Your chips'), h('strong', {}, fmt(me?.chips ?? 0))),
      s.canTopUp && btn('Top up to 1,000', () => send({ t: 'topup' })),
    ),
    v.dealer && h('section', {}, h('h3', {}, 'Dealer', v.dealer.note ? h('span', {}, ` · ${v.dealer.note}`) : null), cardRow(v.dealer.cards)),
    s.game === 'holdem' && h('section', {}, h('h3', {}, `Board · pot ${fmt(v.pot)}`), v.board.length ? cardRow(v.board) : h('p', { class: 'hint' }, 'No cards yet.')),
    h('section', {}, h('h3', {}, `Players (${v.players.length})`), h('ul', { class: 'players' }, v.players.map((p) => playerRow(p, s.you)))),
    v.results.length ? h('section', {}, h('h3', {}, 'Last hand'), h('ul', { class: 'results' }, v.results.map((r) => h('li', {}, r)))) : null,
    h('section', { class: 'table-tools' },
      h('button', { type: 'button', onclick: () => share(s.code) }, icon('share'), ` Invite: ${s.code}`),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: fourColour, onchange: (e: Event) => { fourColour = (e.target as HTMLInputElement).checked; document.body.classList.toggle('four', fourColour); } }), ' Four-colour suits'),
      h('button', { type: 'button', class: 'danger', onclick: () => { send({ t: 'leave' }); leaveLocal(); } }, icon('leave'), ' Leave table'),
    ),
    h('p', { class: 'hint' }, 'Play money only. Chips have no value and can’t be bought or cashed out.'),
  ];
  ui!.body.replaceChildren(...parts.filter((x): x is Node => !!x));
}

function renderTable(s: TableState) {
  const u = ui!;
  const v = s.view;
  const me = v.players.find((p) => p.id === s.you);
  const myTurn = !!me?.turn && !s.away;
  u.title.textContent = GAMES[s.game].name;
  u.pot.textContent = v.pot ? `Pot ${fmt(v.pot)}` : `${fmt(me?.chips ?? 0)} chips`;
  u.code.textContent = s.code;
  u.code.setAttribute('aria-label', `Table ${s.code}. Share invite link`);
  u.peek.replaceChildren(
    ...(v.board.length ? [h('span', {}, 'Board'), cardRow(v.board)] : []),
    ...(v.dealer ? [h('span', {}, 'Dealer'), cardRow(v.dealer.cards), v.dealer.note ? h('span', { class: 'dim' }, v.dealer.note) : ''] : []),
  );
  deadline = s.remainingMs ? performance.now() + s.remainingMs : 0;
  u.el.classList.toggle('my-turn', myTurn);

  const waitingOn = v.players.filter((p) => p.turn && p.id !== s.you).map((p) => p.name);
  const line = s.away
    ? 'You’re sitting out.'
    : myTurn
      ? 'Your turn'
      : waitingOn.length
        ? `Waiting for ${waitingOn.join(', ')}`
        : v.results.length
          ? v.results.join(' · ')
          : v.phase;
  u.msg.replaceChildren(v.phase && line !== v.phase ? h('span', { class: 'phase' }, v.phase) : '', h('span', { class: 'line' }, line), h('span', { class: 'secs' }));

  if (myTurn && !wasMyTurn) {
    navigator.vibrate?.(40);
    say(`Your turn. ${v.phase}.`);
  } else if (!myTurn && v.results.length && wasMyTurn !== myTurn) say(v.results.join('. '));
  wasMyTurn = myTurn;

  renderHand(s);
  renderActions(s);
  renderSheet(s);
}

setInterval(() => {
  if (!ui) return;
  const left = deadline ? Math.max(0, deadline - performance.now()) : 0;
  (ui.timer.firstChild as HTMLElement).style.width = `${(left / TURN_MS) * 100}%`;
  ui.timer.classList.toggle('low', left > 0 && left < 8000);
  const secs = ui.msg.querySelector('.secs');
  if (secs) secs.textContent = ui.el.classList.contains('my-turn') && left ? ` · ${Math.ceil(left / 1000)}s` : '';
}, 250);

function render() {
  if (!state) {
    ui = null;
    root.replaceChildren(lobby());
    void keepAwake(false);
    return;
  }
  if (!ui) {
    ui = buildTable();
    root.replaceChildren(ui.el);
    void keepAwake(true);
  }
  renderTable(state);
}

render();
if (seat) connect(); // rejoin after a refresh
