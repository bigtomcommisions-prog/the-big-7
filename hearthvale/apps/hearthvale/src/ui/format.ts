import type { ChatMessage } from '@hearthvale/shared';

/**
 * Discord-flavoured markdown → safe HTML.
 *
 * Safety: the input is HTML-escaped FIRST, then a fixed set of patterns wraps escaped text in
 * known tags. No user-controlled string is ever interpreted as markup, and links only allow
 * http(s) URLs.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function formatDiscord(content: string, mentions: ChatMessage['mentions'], opts: { maxChars?: number } = {}): string {
  let text = content;
  let truncated = false;
  if (opts.maxChars && text.length > opts.maxChars) {
    text = text.slice(0, opts.maxChars).trimEnd();
    truncated = true;
  }

  // Pull out code so nothing inside it gets formatted.
  const stash: string[] = [];
  const keep = (html: string) => `\u0000${stash.push(html) - 1}\u0000`;
  text = text.replace(/```(?:[a-z0-9+-]*\n)?([\s\S]*?)```/gi, (_, code: string) => keep(`<span class="md-pre">${escapeHtml(code)}</span>`));
  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => keep(`<code class="md-code">${escapeHtml(code)}</code>`));

  // Mentions & custom emoji (resolved server-side; names are escaped).
  text = text.replace(/<@!?(\d+)>/g, (_, id: string) => keep(`<span class="md-mention">@${escapeHtml(mentions.users[id] ?? 'someone')}</span>`));
  text = text.replace(/<#(\d+)>/g, (_, id: string) => keep(`<span class="md-mention">#${escapeHtml(mentions.channels[id] ?? 'channel')}</span>`));
  text = text.replace(/<@&(\d+)>/g, (_, id: string) => keep(`<span class="md-mention">@${escapeHtml(mentions.roles[id] ?? 'role')}</span>`));
  text = text.replace(/<a?:(\w{2,32}):\d+>/g, (_, name: string) => keep(`<span class="md-code">:${escapeHtml(name)}:</span>`));
  text = text.replace(/<t:(\d{1,13})(?::[tTdDfFR])?>/g, (_, ts: string) => keep(escapeHtml(new Date(Number(ts) * 1000).toLocaleString())));
  text = text.replace(/@(everyone|here)\b/g, (_, w: string) => keep(`<span class="md-mention">@${w}</span>`));

  // Links (before escaping so we can validate them, then stash).
  text = text.replace(/\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g, (url) => {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return url;
      return keep(`<a class="md-link" href="${escapeHtml(u.href)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(url)}</a>`);
    } catch {
      return url;
    }
  });

  let html = escapeHtml(text);
  html = html
    .replace(/^&gt; (.*)$/gm, '<span class="md-quote">$1</span>')
    .replace(/\|\|(.+?)\|\|/g, '<span class="md-spoiler" data-spoiler>$1</span>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/^#{1,3} (.*)$/gm, '<b>$1</b>');

  // eslint-disable-next-line no-control-regex
  html = html.replace(/\u0000(\d+)\u0000/g, (_, i: string) => stash[Number(i)] ?? '');
  if (truncated) html += '…';
  return html;
}

/** Make spoilers clickable inside a container. */
export function wireSpoilers(root: HTMLElement) {
  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-spoiler]');
    if (t) t.classList.add('revealed');
  });
}

export function timeLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === today.toDateString() ? time : `${d.toLocaleDateString()} ${time}`;
}
