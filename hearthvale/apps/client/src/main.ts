import './styles.css';
import { DEFAULT_APPEARANCE, type GuildSummary, type Preferences } from '@hearthvale/shared';
import { api, ApiError, type Me } from './api.ts';
import { Game } from './game/game.ts';
import { openCharacterEditor } from './ui/characterEditor.ts';
import { errorScreen, guildScreen, loadingScreen, loginScreen } from './ui/screens.ts';

const root = document.getElementById('app')!;
/** Where the app is mounted, e.g. '/' in dev or '/hearthvale/' in production. */
const BASE = import.meta.env.BASE_URL;
let game: Game | null = null;
let me: Me | null = null;

function show(el: HTMLElement) {
  root.replaceChildren(el);
}

let prefsTimer: number | undefined;
function persistPrefs(p: Preferences) {
  if (me) me.preferences = p;
  clearTimeout(prefsTimer);
  prefsTimer = window.setTimeout(() => void api.savePreferences(p).catch((e) => console.warn('Could not save preferences', e)), 600);
}

async function logout() {
  game?.dispose();
  game = null;
  await api.logout().catch(() => undefined);
  location.href = BASE;
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const authError = params.get('auth_error');
  if (authError) history.replaceState(null, '', BASE);

  show(loadingScreen('Lighting the lanterns…'));
  try {
    me = await api.me();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return show(loginScreen(authError));
    return show(errorScreen("Couldn't reach Hearthvale. Is the server running?", [{ label: 'Retry', onClick: () => void boot() }]));
  }
  await pickGuild();
}

async function pickGuild(error?: string) {
  game?.dispose();
  game = null;
  history.replaceState(null, '', BASE);
  show(loadingScreen('Fetching your servers…'));
  try {
    const list = await api.guilds();
    const screen = guildScreen(list, (g) => void enter(g), () => void logout());
    if (error) screen.querySelector('.tagline')?.insertAdjacentHTML('afterend', '<div class="error-note"></div>');
    const note = screen.querySelector('.error-note');
    if (error && note) note.textContent = error;
    show(screen);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return show(loginScreen('expired'));
    show(errorScreen(err instanceof ApiError ? err.message : 'Could not load your servers.', [
      { label: 'Retry', onClick: () => void pickGuild() },
      { label: 'Log out', onClick: () => void logout() },
    ]));
  }
}

async function enter(guild: GuildSummary) {
  if (!me) return;
  let appearance = me.appearance;
  if (!appearance) {
    show(loadingScreen('Welcome, traveller!'));
    appearance = (await openCharacterEditor(root, DEFAULT_APPEARANCE, { firstTime: true }))!;
    me.appearance = appearance;
    api.saveCharacter(appearance).catch((e) => console.warn('Could not save character', e));
  }
  root.replaceChildren();
  history.replaceState(null, '', `${BASE}?guild=${guild.id}`);
  game = new Game({
    root,
    me,
    guild,
    appearance,
    prefs: me.preferences,
    onExit: (err) => void pickGuild(err),
    onLogout: () => void logout(),
    onPrefs: persistPrefs,
  });
}

window.addEventListener('beforeunload', () => game?.dispose());

if (import.meta.env.DEV && new URLSearchParams(location.search).has('voicetest')) {
  void import('./dev/voiceTest.ts').then((m) => m.startVoiceTest(root));
} else if (import.meta.env.DEV && new URLSearchParams(location.search).has('sandbox')) {
  // Dev-only offline world preview; tree-shaken out of production builds.
  void import('./dev/sandbox.ts').then((m) => m.startSandbox(root));
} else {
  void boot();
}
