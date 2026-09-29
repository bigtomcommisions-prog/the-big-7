import { h, icon } from '../dom.ts';

const URL_TEXT = 'https://bigtomdev.fyi/homebase/';

interface Section { title: string; steps: string[]; note?: string }
interface Guide { id: string; name: string; device: 'desktop' | 'mobile'; sections: Section[] }

const NEW_TAB_EXTENSION = (store: string): Section => ({
  title: 'Open it in every new tab',
  steps: [
    `This browser only lets extensions change the new tab page (so websites can't hijack it). Search ${store} for “custom new tab URL”.`,
    'Pick a well-reviewed extension that asks for as few permissions as possible, and install it.',
    'In the extension’s options, paste the Homebase address.',
  ],
  note: 'Extensions are made by other people, not Big Tom Dev. Check what permissions one asks for before installing.',
});

const GUIDES: Guide[] = [
  { id: 'chrome', name: 'Google Chrome', device: 'desktop', sections: [
    { title: 'Open it when Chrome starts', steps: ['Click the ⋮ menu (top right), then Settings.', 'Choose On start-up.', 'Select “Open a specific page or set of pages”, then Add a new page.', 'Paste the Homebase address and click Add.'] },
    { title: 'Make it your Home button', steps: ['In Settings, open Appearance.', 'Turn on “Show home button”.', 'Choose the custom web address option and paste the Homebase address.'] },
    NEW_TAB_EXTENSION('the Chrome Web Store'),
  ] },
  { id: 'edge', name: 'Microsoft Edge', device: 'desktop', sections: [
    { title: 'Open it when Edge starts', steps: ['Click the … menu, then Settings.', 'Choose “Start, home, and new tabs”.', 'Under “When Edge starts”, choose “Open these pages”, then Add a new page.', 'Paste the Homebase address and click Add.'] },
    { title: 'Make it your Home button', steps: ['On the same settings page, find “Home button”.', 'Turn on “Show home button on the toolbar”.', 'Choose “Enter URL”, paste the Homebase address and click Save.'] },
    NEW_TAB_EXTENSION('Edge Add-ons (or the Chrome Web Store)'),
  ] },
  { id: 'firefox', name: 'Mozilla Firefox', device: 'desktop', sections: [
    { title: 'Make it your homepage and new windows', steps: ['Click the ☰ menu, then Settings.', 'Choose Home in the sidebar.', 'Next to “Homepage and new windows”, choose Custom URLs…', 'Paste the Homebase address.'] },
    { title: 'Open it when Firefox starts', steps: ['In Settings → General, under Startup, untick “Open previous windows and tabs”. Firefox then opens your homepage.'] },
    NEW_TAB_EXTENSION('Firefox Add-ons (addons.mozilla.org)'),
  ] },
  { id: 'safari', name: 'Safari (Mac)', device: 'desktop', sections: [
    { title: 'Make it your homepage, new windows and new tabs', steps: ['In the menu bar, choose Safari → Settings… (Preferences… on older macOS).', 'Open the General tab.', 'Paste the Homebase address into Homepage (or open Homebase first and click “Set to Current Page”).', 'Set “New windows open with” to Homepage.', 'Set “New tabs open with” to Homepage.'] },
  ] },
  { id: 'brave', name: 'Brave', device: 'desktop', sections: [
    { title: 'Open it when Brave starts', steps: ['Click the ≡ menu, then Settings.', 'Choose Get started.', 'Under “On startup”, select “Open a specific page or set of pages”, then Add a new page.', 'Paste the Homebase address and click Add.'] },
    { title: 'Make it your Home button', steps: ['In Settings, open Appearance.', 'Turn on “Show home button” and enter the Homebase address.'] },
    NEW_TAB_EXTENSION('the Chrome Web Store (Brave supports Chrome extensions)'),
  ] },
  { id: 'opera', name: 'Opera', device: 'desktop', sections: [
    { title: 'Open it when Opera starts', steps: ['Open Settings (Alt+P on Windows/Linux, ⌘, on Mac).', 'In Basic, find “On startup”.', 'Choose “Open a specific page or set of pages”, then Add a new page.', 'Paste the Homebase address and click Add.'] },
    NEW_TAB_EXTENSION('Opera add-ons'),
  ] },
  { id: 'operagx', name: 'Opera GX', device: 'desktop', sections: [
    { title: 'Open it when Opera GX starts', steps: ['Open Settings (Alt+P), then scroll to “On startup” (it may be under “Go to full browser settings”).', 'Choose “Open a specific page or set of pages”, then Add a new page.', 'Paste the Homebase address.'] },
    NEW_TAB_EXTENSION('Opera add-ons'),
  ] },
  { id: 'vivaldi', name: 'Vivaldi', device: 'desktop', sections: [
    { title: 'Open it in every new tab (built in)', steps: ['Open Settings, then Tabs.', 'Under New Tab Page, choose “Specific Page”.', 'Paste the Homebase address. You can also get here by typing vivaldi://settings/tabs/ into the address bar.'] },
    { title: 'Open it when Vivaldi starts', steps: ['In Settings → General, under Startup, set Homepage to “Specific Page” and paste the address.', 'Set “Startup with” to Homepage.'] },
  ] },
  { id: 'arc', name: 'Arc', device: 'desktop', sections: [
    { title: 'Keep it one click away', steps: ['Arc doesn’t have a homepage setting, and new tabs open its command bar.', 'Open Homebase, then drag the tab up into your Favourites (or pin it) so it’s always there.'] },
  ] },
  { id: 'duckduckgo', name: 'DuckDuckGo browser', device: 'desktop', sections: [
    { title: 'Open it on startup', steps: ['Open Settings, then General.', 'Look for the Homepage / startup option and choose a specific page, then paste the Homebase address.', 'If your version doesn’t offer it, bookmark Homebase and add it to your Favorites bar.'], note: 'The DuckDuckGo browser changes quickly, so option names vary between versions.' },
  ] },
  { id: 'chrome-android', name: 'Chrome (Android)', device: 'mobile', sections: [
    { title: 'Make it your homepage', steps: ['Tap ⋮, then Settings.', 'Tap Homepage and turn it on.', 'Choose “Enter custom web address” and paste the Homebase address.', 'Tap the Home (house) button to open Homebase any time.'] },
  ] },
  { id: 'samsung', name: 'Samsung Internet', device: 'mobile', sections: [
    { title: 'Make it your homepage', steps: ['Tap the ☰ menu, then Settings.', 'Tap Homepage, then Custom page.', 'Paste the Homebase address and tap Done.'] },
  ] },
  { id: 'firefox-android', name: 'Firefox (Android)', device: 'mobile', sections: [
    { title: 'Pin it to your Firefox home', steps: ['Firefox for Android doesn’t let you set a custom homepage address.', 'Open Homebase, tap ⋮, then “Add to shortcuts” so it appears on the Firefox home screen.', 'Or tap ⋮ → “Add to Home screen” for an app-like icon.'] },
  ] },
  { id: 'edge-mobile', name: 'Edge (Android & iPhone)', device: 'mobile', sections: [
    { title: 'Make it your homepage', steps: ['Tap …, then Settings → General.', 'Tap Home page and choose “A specific page”.', 'Paste the Homebase address and tap Save. The Home button now opens it.'] },
  ] },
  { id: 'brave-mobile', name: 'Brave (Android)', device: 'mobile', sections: [
    { title: 'Make it your homepage', steps: ['Tap ⋮, then Settings.', 'Find Homepage (in some versions under Appearance) and turn it on.', 'Enter the Homebase address.'] },
  ] },
  { id: 'safari-ios', name: 'Safari (iPhone & iPad)', device: 'mobile', sections: [
    { title: 'Add it to your Start Page', steps: ['Safari on iPhone and iPad doesn’t allow a custom homepage.', 'Open Homebase, tap the Share button, then “Add to Favourites”. It now shows on Safari’s Start Page.'] },
    { title: 'Or put it on your Home Screen', steps: ['Tap Share → “Add to Home Screen” for a one-tap icon.'] },
  ] },
  { id: 'chrome-ios', name: 'Chrome (iPhone & iPad)', device: 'mobile', sections: [
    { title: 'Keep it handy', steps: ['Chrome on iPhone and iPad has no homepage setting.', 'Open Homebase, tap Share → “Add to Home Screen” (or bookmark it) for one-tap access.'] },
  ] },
  { id: 'other', name: 'Other browsers', device: 'desktop', sections: [
    { title: 'The general recipe', steps: ['Look in Settings for “On startup”, “Homepage” or “Home button”.', 'Choose a specific page and paste the Homebase address.', 'For new tabs, check whether the browser has a “New tab page” setting; if not, a new-tab extension does the job.'] },
  ] },
];

/** Best guess at the current browser, for picking the right tutorial. */
export function detectBrowser(): string {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  if (getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title')) return 'arc';
  if ((navigator as Navigator & { brave?: unknown }).brave) return mobile ? 'brave-mobile' : 'brave';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Ddg\//i.test(ua)) return 'duckduckgo';
  if (/OPRGX|OPX\//i.test(ua)) return 'operagx';
  if (/OPR\//i.test(ua)) return 'opera';
  if (/Vivaldi/i.test(ua)) return 'vivaldi';
  if (/EdgiOS|EdgA|Edg\//i.test(ua)) return mobile ? 'edge-mobile' : 'edge';
  if (/FxiOS/i.test(ua)) return 'other';
  if (/Firefox/i.test(ua)) return mobile ? 'firefox-android' : 'firefox';
  if (/CriOS/i.test(ua)) return 'chrome-ios';
  if (/Chrome/i.test(ua)) return mobile ? 'chrome-android' : 'chrome';
  if (/Safari/i.test(ua)) return ios ? 'safari-ios' : 'safari';
  return 'other';
}

export function guideView(onClose: () => void): HTMLElement {
  const detected = detectBrowser();
  let current = detected;
  const detail = h('div', { class: 'guide-detail', 'aria-live': 'polite' });
  const copyBtn = h('button', { class: 'btn small', type: 'button' }, icon('copy'), 'Copy');
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(URL_TEXT); copyBtn.replaceChildren(icon('check'), 'Copied'); } catch { copyBtn.textContent = 'Select and copy it'; }
    setTimeout(() => copyBtn.replaceChildren(icon('copy'), 'Copy'), 1600);
  });
  const buttons = new Map<string, HTMLButtonElement>();
  const pick = (id: string) => {
    current = id;
    const g = GUIDES.find((x) => x.id === id) ?? GUIDES[GUIDES.length - 1]!;
    for (const [bid, b] of buttons) { b.classList.toggle('active', bid === id); b.setAttribute('aria-pressed', String(bid === id)); }
    detail.replaceChildren(
      h('h2', {}, g.name, id === detected ? h('span', { class: 'pill' }, 'Your browser') : ''),
      ...g.sections.map((s) => h('section', { class: 'guide-sec' }, h('h3', {}, s.title),
        h('ol', {}, ...s.steps.map((st) => h('li', {}, st))), s.note ? h('p', { class: 'muted small' }, s.note) : '')),
    );
  };
  const group = (device: 'desktop' | 'mobile', title: string) => h('div', { class: 'guide-group' }, h('h3', {}, icon(device === 'desktop' ? 'monitor' : 'phone'), title),
    h('div', { class: 'guide-list' }, ...GUIDES.filter((g) => g.device === device).map((g) => {
      const b = h('button', { type: 'button', class: 'guide-btn', onclick: () => pick(g.id) }, g.name);
      buttons.set(g.id, b);
      return b;
    })));
  const view = h('div', { class: 'guide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Set Homebase as your home page' },
    h('div', { class: 'guide-inner' },
      h('div', { class: 'guide-head' },
        h('div', {}, h('h1', {}, 'Make Homebase your start page'), h('p', { class: 'muted' }, 'Pick your browser for step-by-step instructions. Menu names can shift slightly between versions.')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: onClose }, icon('close'))),
      h('div', { class: 'url-box' }, h('code', {}, URL_TEXT), copyBtn),
      h('div', { class: 'guide-body' }, h('nav', { class: 'guide-nav', 'aria-label': 'Browsers' }, group('desktop', 'Computer'), group('mobile', 'Phone & tablet')), detail),
      h('p', { class: 'muted small' }, 'Why do some browsers need an extension for new tabs? Browsers only let extensions replace the new tab page, to stop websites taking it over. Homebase itself works the same in any browser.')));
  view.addEventListener('keydown', (e) => { if (e.key === 'Escape') onClose(); });
  pick(current);
  return view;
}
