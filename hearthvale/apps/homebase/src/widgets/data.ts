import { h, icon, type IconName } from '../dom.ts';
import { str, num, type WidgetDef } from './types.ts';

// ── Weather (Open-Meteo: free, no key, CC BY 4.0) ─────────────────────────────────────────────
const WMO: Record<number, [string, IconName]> = {
  0: ['Clear', 'sun'], 1: ['Mostly clear', 'sunCloud'], 2: ['Partly cloudy', 'sunCloud'], 3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'], 48: ['Freezing fog', 'fog'], 51: ['Light drizzle', 'drop'], 53: ['Drizzle', 'drop'], 55: ['Heavy drizzle', 'drop'],
  56: ['Freezing drizzle', 'drop'], 57: ['Freezing drizzle', 'drop'], 61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'], 71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'],
  80: ['Showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Heavy showers', 'rain'], 85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'bolt'], 96: ['Thunderstorm, hail', 'bolt'], 99: ['Thunderstorm, hail', 'bolt'],
};
const wmo = (code: number, day = true): [string, IconName] => {
  const w = WMO[code] ?? ['—', 'cloud'];
  return !day && w[1] === 'sun' ? [w[0], 'moon'] : w;
};

interface Forecast {
  current: { temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number; is_day: number };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
}

/** Cache forecasts for 20 minutes so every new tab doesn't refetch. */
async function forecast(lat: number, lon: number, unit: 'c' | 'f'): Promise<Forecast> {
  const key = `homebase.wx.${lat.toFixed(2)},${lon.toFixed(2)},${unit}`;
  try {
    const hit = JSON.parse(localStorage.getItem(key) ?? 'null') as { at: number; data: Forecast } | null;
    if (hit && Date.now() - hit.at < 20 * 60_000) return hit.data;
  } catch { /* ignore */ }
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '5',
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    temperature_unit: unit === 'f' ? 'fahrenheit' : 'celsius', wind_speed_unit: unit === 'f' ? 'mph' : 'kmh',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!res.ok) throw new Error('Weather unavailable');
  const data = (await res.json()) as Forecast;
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* ignore */ }
  return data;
}

async function geocode(place: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: place, count: '1', language: 'en' })}`);
  if (!res.ok) return null;
  const r = ((await res.json()) as { results?: { latitude: number; longitude: number; name: string; country_code?: string; admin1?: string }[] }).results?.[0];
  return r ? { lat: r.latitude, lon: r.longitude, name: [r.name, r.country_code].filter(Boolean).join(', ') } : null;
}

export const weather: WidgetDef = {
  type: 'weather', name: 'Weather', blurb: 'Current conditions and a short forecast.', icon: 'cloud', defaultSize: 's', sizes: ['s', 'm', 'l'],
  defaults: () => ({ place: 'London' }),
  fields: [{ key: 'place', label: 'Town or city', type: 'text', placeholder: 'e.g. Manchester', help: 'Looked up with Open-Meteo. Temperature units are in General settings.' }],
  render(el, ctx) {
    const body = h('div', { class: 'wx' }, h('div', { class: 'muted' }, 'Loading weather…'));
    el.append(body, h('a', { class: 'attrib', href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener noreferrer' }, 'Weather by Open-Meteo'));
    const place = str(ctx.config.place, 'London').trim();
    const unit = ctx.general.tempUnit;
    void (async () => {
      try {
        let loc = ctx.config.loc as { lat: number; lon: number; name: string; q: string } | undefined;
        if (!loc || loc.q !== place) {
          const g = await geocode(place);
          if (!g) { body.replaceChildren(h('div', { class: 'muted' }, `Couldn’t find “${place}”. Check the spelling in settings.`)); return; }
          loc = { ...g, q: place };
          ctx.save({ loc });
        }
        const f = await forecast(loc.lat, loc.lon, unit);
        const [label, ic] = wmo(f.current.weather_code, f.current.is_day === 1);
        const deg = (v: number) => `${Math.round(v)}°`;
        const days = f.daily.time.slice(1, ctx.size === 's' ? 1 : ctx.size === 'm' ? 4 : 5).map((d, i) => {
          const [dl, di] = wmo(f.daily.weather_code[i + 1]!);
          return h('div', { class: 'wx-day', title: dl }, h('span', {}, new Date(`${d}T12:00`).toLocaleDateString('en-GB', { weekday: 'short' })), icon(di, '1.3em'),
            h('span', {}, deg(f.daily.temperature_2m_max[i + 1]!), h('small', {}, ` ${deg(f.daily.temperature_2m_min[i + 1]!)}`)));
        });
        body.replaceChildren(
          h('div', { class: 'wx-now' }, icon(ic, '2.6em'), h('div', {}, h('div', { class: 'wx-temp' }, `${deg(f.current.temperature_2m)}${unit.toUpperCase()}`), h('div', {}, label))),
          h('div', { class: 'muted small' }, `${loc.name} · feels ${deg(f.current.apparent_temperature)} · H ${deg(f.daily.temperature_2m_max[0]!)} L ${deg(f.daily.temperature_2m_min[0]!)} · wind ${Math.round(f.current.wind_speed_10m)} ${unit === 'f' ? 'mph' : 'km/h'}`),
          days.length ? h('div', { class: 'wx-days' }, ...days) : '',
        );
      } catch {
        body.replaceChildren(h('div', { class: 'muted' }, 'Weather is unavailable right now.'));
      }
    })();
  },
};

// ── OmniPrice-powered widgets (same-origin API) ───────────────────────────────────────────────
export const CURRENCIES = ['GBP', 'USD', 'EUR', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'HKD', 'SGD', 'INR', 'KRW', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'ISK', 'TRY', 'ZAR', 'MXN', 'BRL', 'ILS', 'THB', 'MYR', 'PHP', 'IDR'];

interface Summary { id: string; last?: [string, number]; prev?: [string, number] | null; error?: string }
async function overview(ids: string[]): Promise<Summary[]> {
  const res = await fetch(`/api/omniprice?${new URLSearchParams({ op: 'overview', ids: ids.join(',') })}`);
  if (!res.ok) throw new Error('Price data unavailable');
  return ((await res.json()) as { items: Summary[] }).items;
}

export const currency: WidgetDef = {
  type: 'currency', name: 'Currency converter', blurb: 'Convert between 30 currencies at today’s ECB rate.', icon: 'currency', defaultSize: 's', sizes: ['s', 'm'],
  defaults: () => ({ from: 'GBP', to: 'USD', amount: 1 }),
  render(el, ctx) {
    let from = str(ctx.config.from, 'GBP'), to = str(ctx.config.to, 'USD');
    const amount = h('input', { type: 'number', min: 0, step: 'any', value: num(ctx.config.amount, 1), 'aria-label': 'Amount', class: 'cur-amount' });
    const sel = (v: string, label: string) => {
      const s = h('select', { 'aria-label': label }, ...CURRENCIES.map((c) => h('option', { value: c, selected: c === v }, c)));
      return s;
    };
    const fromSel = sel(from, 'From currency'), toSel = sel(to, 'To currency');
    const out = h('div', { class: 'cur-out' }, '…');
    const note = h('div', { class: 'muted small' });
    let rates: Map<string, number> | null = null, date = '';
    const calc = () => {
      if (!rates) return;
      const r = (rates.get(to) ?? 0) / (rates.get(from) ?? 1);
      const a = Number(amount.value) || 0;
      out.textContent = `${(a * r).toLocaleString('en-GB', { maximumFractionDigits: r * a >= 100 ? 2 : 4 })} ${to}`;
      note.textContent = `1 ${from} = ${r.toLocaleString('en-GB', { maximumSignificantDigits: 5 })} ${to} · ECB rate, ${date}`;
      ctx.save({ from, to, amount: a });
    };
    const load = async () => {
      try {
        const ids = CURRENCIES.filter((c) => c !== 'GBP' && (c === from || c === to)).map((c) => `gbp-${c.toLowerCase()}`);
        const items = ids.length ? await overview(ids) : [];
        rates = new Map([['GBP', 1]]);
        for (const it of items) if (it.last) { rates.set(it.id.slice(4).toUpperCase(), it.last[1]); date = new Date(it.last[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
        calc();
      } catch {
        out.textContent = 'Rates unavailable';
      }
    };
    fromSel.addEventListener('change', () => { from = fromSel.value; void load(); });
    toSel.addEventListener('change', () => { to = toSel.value; void load(); });
    amount.addEventListener('input', calc);
    const swap = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Swap currencies', onclick: () => { [from, to] = [to, from]; fromSel.value = from; toSel.value = to; void load(); } }, icon('currency'));
    el.append(h('h3', { class: 'w-title' }, 'Currency'), h('div', { class: 'cur-row' }, amount, fromSel, swap, toSel), out, note);
    void load();
  },
};

const MARKETS: { id: string; label: string; fmt: (v: number) => string; rate?: boolean }[] = [
  { id: 'brent', label: 'Brent crude', fmt: (v) => `$${v.toFixed(2)}` },
  { id: 'wti', label: 'WTI crude', fmt: (v) => `$${v.toFixed(2)}` },
  { id: 'natgas', label: 'Natural gas', fmt: (v) => `$${v.toFixed(2)}` },
  { id: 'btc', label: 'Bitcoin', fmt: (v) => `$${Math.round(v).toLocaleString('en-GB')}` },
  { id: 'eth', label: 'Ethereum', fmt: (v) => `$${Math.round(v).toLocaleString('en-GB')}` },
  { id: 'gbp-usd', label: 'GBP/USD', fmt: (v) => v.toFixed(4) },
  { id: 'gbp-eur', label: 'GBP/EUR', fmt: (v) => v.toFixed(4) },
  { id: 'eur-usd', label: 'EUR/USD', fmt: (v) => v.toFixed(4) },
  { id: 'usd-jpy', label: 'USD/JPY', fmt: (v) => v.toFixed(2) },
  { id: 'wheat', label: 'Wheat', fmt: (v) => `$${Math.round(v)}/t` },
  { id: 'coffee', label: 'Coffee', fmt: (v) => `${v.toFixed(1)}¢/lb` },
  { id: 'cocoa', label: 'Cocoa', fmt: (v) => `$${Math.round(v).toLocaleString('en-GB')}/t` },
  { id: 'copper', label: 'Copper', fmt: (v) => `$${Math.round(v).toLocaleString('en-GB')}/t` },
  { id: 'us-eggs', label: 'US eggs', fmt: (v) => `$${v.toFixed(2)}` },
  { id: 'us-petrol', label: 'US petrol', fmt: (v) => `$${v.toFixed(2)}/gal` },
  { id: 'uk-inflation', label: 'UK inflation', fmt: (v) => `${v.toFixed(1)}%`, rate: true },
  { id: 'uk-weekly-pay', label: 'UK weekly pay', fmt: (v) => `£${Math.round(v)}` },
  { id: 'us-10y', label: 'US 10-year yield', fmt: (v) => `${v.toFixed(2)}%`, rate: true },
];

export const markets: WidgetDef = {
  type: 'markets', name: 'Market watch', blurb: 'Oil, crypto, currencies, food and more, from OmniPrice.', icon: 'chart', defaultSize: 's', sizes: ['s', 'm', 'l'],
  defaults: () => ({ ids: ['brent', 'btc', 'gbp-usd', 'wheat', 'uk-inflation'] }),
  fields: [{ key: 'ids', label: 'Show', type: 'multi', options: MARKETS.map((m) => ({ value: m.id, label: m.label })) }],
  render(el, ctx) {
    const ids = (Array.isArray(ctx.config.ids) ? (ctx.config.ids as string[]) : []).filter((id) => MARKETS.some((m) => m.id === id)).slice(0, 12);
    const list = h('ul', { class: 'mk-list' }, h('li', { class: 'muted' }, 'Loading…'));
    el.append(h('div', { class: 'w-head' }, h('h3', { class: 'w-title' }, 'Market watch'), h('a', { class: 'attrib', href: '/omniprice/' }, 'OmniPrice')), list);
    if (!ids.length) { list.replaceChildren(h('li', { class: 'muted' }, 'Pick what to show in settings.')); return; }
    overview(ids).then((items) => {
      list.replaceChildren(...items.map((it) => {
        const m = MARKETS.find((x) => x.id === it.id)!;
        if (!it.last) return h('li', {}, h('span', {}, m.label), h('span', { class: 'muted' }, '—'));
        // Rates change in percentage points; prices in percent.
        const chg = !it.prev ? 0 : m.rate ? it.last[1] - it.prev[1] : ((it.last[1] - it.prev[1]) / Math.abs(it.prev[1])) * 100;
        const dir = chg > 0.005 ? 'up' : chg < -0.005 ? 'down' : 'flat';
        return h('li', {}, h('a', { href: `/omniprice/#/i/${it.id}` }, m.label), h('b', {}, m.fmt(it.last[1])),
          h('span', { class: `mk-chg ${dir}` }, dir === 'flat' ? '' : icon(dir === 'up' ? 'up' : 'down'), `${chg > 0 ? '+' : ''}${chg.toFixed(2)}${m.rate ? ' pts' : '%'}`));
      }));
    }).catch(() => list.replaceChildren(h('li', { class: 'muted' }, 'Prices unavailable right now.')));
  },
};
