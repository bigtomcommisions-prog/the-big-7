import { h } from './dom.ts';

/** Legal pages live on the Big Tom Dev site at the domain root (Hearthvale is served under /hearthvale/). */
export const LEGAL = {
  home: '/',
  privacy: '/privacy/',
  terms: '/terms/',
  cookies: '/cookies/',
};

const link = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

/** Small footer with the legal links, for the login and server-picker screens. */
export function legalFooter(): HTMLElement {
  return h('nav', { class: 'legal-links', 'aria-label': 'Legal' },
    link(LEGAL.privacy, 'Privacy'), link(LEGAL.terms, 'Terms'), link(LEGAL.cookies, 'Cookies'), link(LEGAL.home, 'Big Tom Dev'),
    h('span', {}, 'Not affiliated with Discord.'));
}

/** "By logging in you agree…" line with inline links. */
export function consentLine(): HTMLElement {
  return h('p', { class: 'fineprint consent' },
    'By logging in you agree to the ', link(LEGAL.terms, 'Terms of Service'), ' and confirm you have read the ', link(LEGAL.privacy, 'Privacy Policy'), '.');
}
