import type { GuildSummary } from '@hearthvale/shared';
import { API_ORIGIN, type GuildList } from '../api.ts';
import { guildIcon, h } from './dom.ts';
import { icon } from './icons.ts';

const AUTH_ERRORS: Record<string, string> = {
  access_denied: 'Discord sign-in was cancelled.',
  state_mismatch: 'That sign-in link expired. Please try again.',
  exchange_failed: "We couldn't complete sign-in with Discord. Please try again.",
  expired: 'Your session expired. Please log in again.',
};

const logo = () => h('h1', { class: 'logo' }, 'Hearth', h('span', {}, 'vale'));

export function loginScreen(error?: string | null): HTMLElement {
  return h('div', { class: 'screen' },
    h('div', { class: 'card panel' },
      logo(),
      h('p', { class: 'tagline' }, 'Your Discord server, as a cosy little world you can walk around in.'),
      error ? h('div', { class: 'error-note' }, AUTH_ERRORS[error] ?? `Sign-in failed (${error}).`) : null,
      h('a', { class: 'btn discord', href: `${API_ORIGIN}/auth/login` }, 'Log in with Discord'),
      h('p', { class: 'fineprint' },
        'We ask Discord for your username, avatar and server list. Messages you send from the world are posted to Discord as you. Voice chat is optional and only starts when you choose to join.')));
}

const DEV_SERVER_INVITE = 'https://discord.gg/GSwZqXPyf2';

export function guildScreen(list: GuildList, onPick: (g: GuildSummary) => void, onLogout: () => void): HTMLElement {
  const joinable = list.joinable.map((g) =>
    h('button', { class: 'guild-card', type: 'button', onclick: () => onPick(g) }, guildIcon(g.name, g.icon), g.name));
  const invitable = list.invitable.map((g) =>
    h('a', { class: 'guild-card invite', href: g.inviteUrl, target: '_blank', rel: 'noopener', title: 'Add the Hearthvale bot to build this world' },
      guildIcon(g.name, g.icon), g.name, h('span', { class: 'fineprint', style: 'margin:0' }, '+ Add bot')));
  return h('div', { class: 'screen' },
    h('div', { class: 'card panel', style: 'width:min(760px,100%)' },
      logo(),
      h('p', { class: 'tagline' }, 'Pick a server to visit.'),
      !list.botReady ? h('div', { class: 'error-note' }, 'The world server is still connecting to Discord — refresh in a few seconds.') : null,
      joinable.length ? h('div', { class: 'guild-grid' }, ...joinable)
        : h('p', { class: 'fineprint' }, "None of your servers have Hearthvale yet. If you manage a server, add the bot below — then it'll appear here."),
      invitable.length ? h('div', { class: 'section-title' }, 'Servers you manage without Hearthvale') : null,
      invitable.length ? h('div', { class: 'guild-grid' }, ...invitable) : null,
      h('a', { class: 'btn discord small', href: DEV_SERVER_INVITE, target: '_blank', rel: 'noopener noreferrer', style: 'margin-top:22px' },
        icon('link'), 'Join the dev server to test it out!'),
      h('div', { style: 'margin-top:14px;display:flex;gap:8px;justify-content:center' },
        h('button', { class: 'btn small', onclick: () => location.reload() }, icon('refresh'), 'Refresh'),
        h('button', { class: 'btn small', onclick: onLogout }, 'Log out'))));
}

export function loadingScreen(text: string): HTMLElement {
  return h('div', { class: 'screen' },
    h('div', { class: 'card panel' }, logo(), h('p', { class: 'tagline' }, text), h('div', { class: 'loading-bar' }, h('div'))));
}

export function errorScreen(text: string, actions: { label: string; onClick: () => void }[]): HTMLElement {
  return h('div', { class: 'screen' },
    h('div', { class: 'card panel' }, logo(),
      h('div', { class: 'error-note' }, text),
      h('div', { style: 'display:flex;gap:8px;justify-content:center' },
        ...actions.map((a, i) => h('button', { class: `btn ${i === 0 ? 'primary' : ''}`, onclick: a.onClick }, a.label)))));
}
