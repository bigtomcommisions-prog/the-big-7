import { contrast, h, icon, rgba } from '../dom.ts';
import { exportJson, normalise, type Appearance, type State, type ThemeSettings } from '../store.ts';
import { paramsFor, THEMES } from '../themes/index.ts';
import { FONTS, type FontId, type Palette, type ParamSpec, type ThemeDef } from '../themes/types.ts';
import { WIDGETS } from '../widgets/index.ts';
import { fieldControl, paramControl } from './forms.ts';

export interface AppApi {
  state: State;
  theme(): ThemeDef;
  themeSettings(): ThemeSettings;
  palette(): Palette;
  setTheme(id: string): void;
  /** Live update after a theme param/palette/font change. */
  themeChanged(): void;
  appearanceChanged(): void;
  generalChanged(): void;
  addWidget(type: string): void;
  replaceState(s: State): void;
  resetAll(): void;
  uploadBackground(file: File): Promise<void>;
}

type Tab = 'themes' | 'customise' | 'look' | 'widgets' | 'general' | 'data';
const TABS: [Tab, string][] = [['themes', 'Themes'], ['customise', 'Customise'], ['look', 'Look'], ['widgets', 'Widgets'], ['general', 'General'], ['data', 'Data']];

function preview(t: ThemeDef): string {
  const p = paramsFor(t);
  if (t.css) return t.css(p, t.palette);
  const cols = t.params.filter((s) => s.type === 'color').map((s) => String(p[s.key]));
  return `linear-gradient(160deg, ${cols.slice(0, 3).join(', ')})`;
}

export class Panel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private tab: Tab = 'themes';
  private tabBtns = new Map<Tab, HTMLButtonElement>();

  constructor(private app: AppApi) {
    this.body = h('div', { class: 'panel-body' });
    const tabs = h('div', { class: 'panel-tabs', role: 'tablist' }, ...TABS.map(([id, label]) => {
      const b = h('button', { type: 'button', role: 'tab', class: 'panel-tab', onclick: () => this.show(id) }, label);
      this.tabBtns.set(id, b);
      return b;
    }));
    this.el = h('aside', { class: 'panel', 'aria-label': 'Customise Homebase', hidden: true },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Customise'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => this.close() }, icon('close'))),
      tabs, this.body);
    this.el.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
  }

  get open() { return !this.el.hidden; }

  toggle(tab?: Tab) {
    if (this.open && (!tab || tab === this.tab)) this.close();
    else this.show(tab ?? this.tab);
  }

  show(tab: Tab) {
    this.tab = tab;
    this.el.hidden = false;
    document.body.classList.add('panel-open');
    for (const [id, b] of this.tabBtns) {
      b.setAttribute('aria-selected', String(id === tab));
      b.classList.toggle('active', id === tab);
    }
    this.render();
  }

  close() {
    this.el.hidden = true;
    document.body.classList.remove('panel-open');
  }

  render() {
    const view = { themes: () => this.themes(), customise: () => this.customise(), look: () => this.look(), widgets: () => this.widgets(), general: () => this.general(), data: () => this.data() }[this.tab]();
    this.body.replaceChildren(...view);
    this.body.scrollTop = 0;
  }

  private themes(): HTMLElement[] {
    const current = this.app.state.themeId;
    return [
      h('p', { class: 'muted' }, 'Pick a theme, then fine-tune it in Customise. Each theme remembers its own settings.'),
      h('div', { class: 'theme-grid' }, ...THEMES.map((t) => h('button', {
        type: 'button', class: `theme-card${t.id === current ? ' active' : ''}`, 'aria-pressed': String(t.id === current),
        onclick: () => { this.app.setTheme(t.id); this.render(); },
      }, h('span', { class: 'theme-swatch', style: `background:${preview(t)}` }, h('span', { class: 'theme-kind' }, t.kind === 'gl' ? 'Shader' : t.kind === '2d' ? 'Animated' : 'Static')),
      h('span', { class: 'theme-name' }, t.name), h('span', { class: 'theme-blurb' }, t.blurb)))),
    ];
  }

  private customise(): HTMLElement[] {
    const t = this.app.theme();
    const ts = this.app.themeSettings();
    const params = paramsFor(t, ts.params);
    const pal = this.app.palette();
    const warn = h('p', { class: 'warn', hidden: true });
    const checkContrast = () => {
      const c = contrast(pal.text, pal.card);
      warn.hidden = c >= 4.5;
      warn.textContent = `Text and card colours only have ${c.toFixed(1)}:1 contrast. Aim for 4.5:1 or more so everything stays readable.`;
    };
    const paletteSpec: [keyof Palette, string][] = [['text', 'Text'], ['accent', 'Accent'], ['accent2', 'Second accent'], ['card', 'Cards'], ['bg', 'Fallback background']];
    const out: HTMLElement[] = [
      h('div', { class: 'section-title' }, t.name, h('span', { class: 'muted small' }, ` · ${t.mode === 'light' ? 'light' : 'dark'} theme`)),
    ];
    if (t.usesImage) {
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
      file.addEventListener('change', () => { const f = file.files?.[0]; if (f) void this.app.uploadBackground(f); });
      out.push(h('div', { class: 'ctl' }, h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, icon('upload'), 'Choose background photo'), file,
        h('small', { class: 'help' }, 'Your photo is stored only in this browser (never uploaded).')));
    }
    if (t.params.length) {
      out.push(h('h3', { class: 'sub' }, 'Scene'), ...t.params.map((spec) => paramControl(spec, params[spec.key]!, (v) => {
        ts.params[spec.key] = v;
        this.app.themeChanged();
      })));
    }
    out.push(h('h3', { class: 'sub' }, 'Colours'), ...paletteSpec.map(([key, label]) => paramControl({ key, label, type: 'color', default: t.palette[key] }, pal[key], (v) => {
      ts.palette[key] = String(v);
      pal[key] = String(v);
      checkContrast();
      this.app.themeChanged();
    })), warn);
    const fontSpec: ParamSpec = { key: 'font', label: 'Font', type: 'select', default: t.font, options: Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label })) };
    out.push(h('h3', { class: 'sub' }, 'Type'), paramControl(fontSpec, ts.font ?? t.font, (v) => { ts.font = v as FontId; this.app.themeChanged(); }));
    out.push(h('button', { class: 'btn ghost', type: 'button', onclick: () => {
      this.app.state.themes[t.id] = { params: {}, palette: {} };
      this.app.themeChanged();
      this.render();
    } }, icon('reset'), `Reset ${t.name} to default`));
    checkContrast();
    return out;
  }

  private look(): HTMLElement[] {
    const a = this.app.state.appearance;
    const set = <K extends keyof Appearance>(k: K) => (v: unknown) => { (a[k] as unknown) = v; this.app.appearanceChanged(); };
    const sel = (key: keyof Appearance, label: string, options: [string, string][]) => paramControl({ key, label, type: 'select', default: '', options: options.map(([value, l]) => ({ value, label: l })) }, String(a[key]), set(key));
    const rng = (key: keyof Appearance, label: string, min: number, max: number, step: number, unit?: string) => paramControl({ key, label, type: 'range', min, max, step, default: 0, unit }, Number(a[key]), set(key));
    return [
      h('h3', { class: 'sub' }, 'Cards'),
      sel('cardStyle', 'Card style', [['glass', 'Frosted glass'], ['solid', 'Solid'], ['outline', 'Outline'], ['bare', 'No card']]),
      rng('cardOpacity', 'Card opacity', 0, 1, 0.05),
      rng('blur', 'Glass blur', 0, 40, 1, 'px'),
      rng('radius', 'Corner roundness', 0, 32, 1, 'px'),
      h('h3', { class: 'sub' }, 'Page'),
      sel('width', 'Layout width', [['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide']]),
      rng('scale', 'Text size', 0.8, 1.4, 0.05, '×'),
      rng('dim', 'Dim the background', 0, 0.8, 0.05),
      paramControl({ key: 'showSiteBar', label: 'Show the Big Tom Dev bar', type: 'toggle', default: false }, a.showSiteBar, set('showSiteBar')),
      h('h3', { class: 'sub' }, 'Motion & performance'),
      sel('motion', 'Animation', [['auto', 'Automatic (follows your device)'], ['full', 'Full'], ['reduced', 'Gentle (slower)'], ['off', 'Off (still image)']]),
      sel('quality', 'Graphics quality', [['auto', 'Automatic (adapts to your device)'], ['high', 'High (sharpest)'], ['balanced', 'Balanced'], ['low', 'Battery saver']]),
      h('small', { class: 'help' }, 'Animations stop whenever the tab is hidden, and “Automatic” quality lowers the resolution if your device struggles.'),
    ];
  }

  private widgets(): HTMLElement[] {
    return [
      h('p', { class: 'muted' }, 'Add as many as you like, even several of the same kind. Rearrange and resize them with the pencil button.'),
      h('div', { class: 'widget-list' }, ...WIDGETS.map((w) => h('div', { class: 'widget-item' },
        h('span', { class: 'wi-icon' }, icon(w.icon, '1.3em')),
        h('span', { class: 'wi-text' }, h('b', {}, w.name), h('span', {}, w.blurb)),
        h('button', { class: 'btn small', type: 'button', 'aria-label': `Add ${w.name}`, onclick: (e: Event) => {
          this.app.addWidget(w.type);
          const b = e.currentTarget as HTMLButtonElement;
          b.replaceChildren(icon('check'), 'Added');
          setTimeout(() => b.replaceChildren(icon('plus'), 'Add'), 1200);
        } }, icon('plus'), 'Add')))),
    ];
  }

  private general(): HTMLElement[] {
    const g = this.app.state.general;
    const upd = (k: keyof typeof g) => (v: unknown) => { (g[k] as unknown) = v; this.app.generalChanged(); };
    return [
      fieldControl({ key: 'name', label: 'Your name (for greetings)', type: 'text', placeholder: 'Optional' }, g.name, upd('name')),
      fieldControl({ key: 'use24h', label: '24-hour clock', type: 'toggle' }, g.use24h, upd('use24h')),
      fieldControl({ key: 'showSeconds', label: 'Show seconds', type: 'toggle' }, g.showSeconds, upd('showSeconds')),
      fieldControl({ key: 'tempUnit', label: 'Temperature', type: 'select', options: [{ value: 'c', label: 'Celsius' }, { value: 'f', label: 'Fahrenheit' }] }, g.tempUnit, upd('tempUnit')),
      fieldControl({ key: 'weekStart', label: 'Week starts on', type: 'select', options: [{ value: 'mon', label: 'Monday' }, { value: 'sun', label: 'Sunday' }] }, g.weekStart, upd('weekStart')),
      fieldControl({ key: 'linksNewTab', label: 'Open quick links in a new tab', type: 'toggle' }, g.linksNewTab, upd('linksNewTab')),
      fieldControl({ key: 'favicons', label: 'Show website icons on quick links', type: 'toggle', help: 'Icons are fetched from DuckDuckGo’s icon service, which then sees the web addresses of your links. Turn this off to show letter tiles instead.' }, g.favicons, upd('favicons')),
    ];
  }

  private data(): HTMLElement[] {
    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    const msg = h('p', { class: 'muted small', 'aria-live': 'polite' });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        this.app.replaceState(normalise(data));
        msg.textContent = 'Settings imported.';
      } catch {
        msg.textContent = 'That file isn’t a Homebase backup.';
      }
    });
    return [
      h('p', { class: 'muted' }, 'Everything is saved in this browser only. There are no accounts, and nothing is sent to us. Use a backup to move your setup to another browser or device.'),
      h('div', { class: 'stack' },
        h('button', { class: 'btn', type: 'button', onclick: () => {
          const url = URL.createObjectURL(new Blob([exportJson(this.app.state)], { type: 'application/json' }));
          const a = h('a', { href: url, download: `homebase-backup-${new Date().toISOString().slice(0, 10)}.json` });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } }, icon('download'), 'Download a backup'),
        h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, icon('upload'), 'Restore from a backup'), file,
        h('button', { class: 'btn danger', type: 'button', onclick: () => {
          if (confirm('Reset Homebase? This removes your widgets, notes, to-dos, photos and theme settings from this browser.')) this.app.resetAll();
        } }, icon('trash'), 'Reset everything')),
      msg,
      h('p', { class: 'muted small' }, 'Backups don’t include uploaded photos. ',
        h('a', { href: '/privacy/#homebase' }, 'Privacy'), ' · ', h('a', { href: '/terms/#homebase' }, 'Terms'), ' · ', h('a', { href: '#/setup' }, 'Set as your home page')),
    ];
  }
}

/** Quick CSS for a theme preview swatch shadow tint. */
export const swatchShadow = (hex: string) => `0 10px 30px ${rgba(hex, 0.35)}`;
