import { CHAT, type ChatMessage } from '@hearthvale/shared';
import { formatDiscord, timeLabel, wireSpoilers } from './format.ts';
import { h } from './dom.ts';
import { icon } from './icons.ts';

export interface PanelChannel {
  id: string;
  name: string;
  topic: string | null;
  canSend: boolean;
}

/**
 * The small side panel that appears when you step inside a channel's house: recent Discord
 * messages plus an input that posts to the real channel.
 */
export class ChatPanel {
  readonly el: HTMLElement;
  private title: HTMLElement;
  private topic: HTMLElement;
  private list: HTMLElement;
  private input: HTMLTextAreaElement;
  private hint: HTMLElement;
  private sendBtn: HTMLButtonElement;
  private channel: PanelChannel | null = null;
  private pending = new Map<string, HTMLElement>();
  private seen = new Set<string>();

  onSend: (channelId: string, content: string, nonce: string) => boolean = () => false;

  constructor() {
    this.title = h('div', { class: 'title' });
    this.topic = h('div', { class: 'topic' });
    this.list = h('div', { class: 'chat-messages' });
    wireSpoilers(this.list);
    this.input = h('textarea', { rows: 1, maxlength: CHAT.MAX_LENGTH, placeholder: 'Message', 'aria-label': 'Message' });
    this.hint = h('div', { class: 'hint' });
    this.sendBtn = h('button', { class: 'btn primary small', type: 'submit' }, 'Send');
    const form = h('form', {}, this.input, this.sendBtn);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submit();
      } else if (e.key === 'Escape') {
        this.input.blur();
      }
    });
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = `${Math.min(120, this.input.scrollHeight)}px`;
    });
    const collapse = h('button', { class: 'btn icon-btn small', title: 'Collapse', onclick: () => this.el.classList.toggle('collapsed') }, icon('collapse'));

    this.el = h('div', { class: 'chat-panel panel hidden' },
      h('div', { class: 'chat-head' }, this.title, collapse),
      this.topic,
      this.list,
      h('div', { class: 'chat-input' }, form, this.hint),
    );
  }

  get openChannelId() {
    return this.channel?.id ?? null;
  }

  open(ch: PanelChannel) {
    if (this.channel?.id === ch.id) return;
    this.channel = ch;
    this.pending.clear();
    this.seen.clear();
    this.title.replaceChildren(h('span', { class: 'hash' }, '# '), ch.name);
    this.topic.textContent = ch.topic ?? '';
    this.topic.style.display = ch.topic ? '' : 'none';
    this.list.replaceChildren(h('div', { class: 'chat-empty' }, 'Reading the notice board…'));
    this.input.value = '';
    this.input.disabled = !ch.canSend;
    this.sendBtn.disabled = !ch.canSend;
    this.input.placeholder = ch.canSend ? `Message #${ch.name}` : "You can't send messages here";
    this.setHint(ch.canSend ? `Posts to #${ch.name} on Discord as you.` : 'Read-only for you in Discord.');
    this.el.classList.remove('hidden', 'collapsed');
  }

  close() {
    this.channel = null;
    this.input.blur();
    this.el.classList.add('hidden');
  }

  focus() {
    if (this.channel?.canSend) {
      this.el.classList.remove('collapsed');
      this.input.focus();
    }
  }

  setCanSend(canSend: boolean) {
    if (!this.channel) return;
    this.channel.canSend = canSend;
    this.input.disabled = !canSend;
    this.sendBtn.disabled = !canSend;
  }

  setHistory(messages: ChatMessage[]) {
    this.list.replaceChildren();
    if (!messages.length) this.list.append(h('div', { class: 'chat-empty' }, 'No messages yet. Say hi! ', icon('wave')));
    for (const m of messages) this.add(m, false);
    this.scrollToEnd();
  }

  showError(text: string) {
    this.list.replaceChildren(h('div', { class: 'chat-empty' }, text));
  }

  add(m: ChatMessage, scroll = true) {
    if (!this.channel || m.channelId !== this.channel.id || this.seen.has(m.id)) return;
    this.seen.add(m.id);
    this.list.querySelector('.chat-empty')?.remove();
    const nearBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 80;
    this.list.append(this.render(m));
    if (scroll && nearBottom) this.scrollToEnd();
  }

  remove(messageId: string) {
    this.list.querySelector(`[data-id="${CSS.escape(messageId)}"]`)?.remove();
  }

  private render(m: ChatMessage, pending = false): HTMLElement {
    const text = h('div', { class: 'text' });
    text.innerHTML = formatDiscord(m.content, m.mentions); // escaped by formatDiscord
    if (m.attachments) text.append(h('div', { class: 'md-code' }, icon('attachment'), ` ${m.attachments} attachment(s) — open in Discord`));
    return h('div', { class: `msg ${pending ? 'pending' : ''}`, 'data-id': m.id },
      m.author.avatar ? h('img', { class: 'avatar', src: m.author.avatar, alt: '', loading: 'lazy' }) : h('div', { class: 'avatar' }),
      h('div', { class: 'body' },
        h('div', { class: 'meta' }, m.author.name, m.fromWorld ? h('span', { class: 'tag' }, 'in world') : null, h('span', { class: 'time' }, timeLabel(m.createdAt))),
        text));
  }

  private submit() {
    const ch = this.channel;
    const content = this.input.value.trim();
    if (!ch || !content || !ch.canSend) return;
    if (content.length > CHAT.MAX_LENGTH) return this.setHint(`Too long (${content.length}/${CHAT.MAX_LENGTH}).`, true);
    const nonce = crypto.randomUUID();
    if (!this.onSend(ch.id, content, nonce)) return this.setHint('Not connected — try again in a moment.', true);
    const el = this.render({
      id: `pending-${nonce}`, channelId: ch.id, author: { id: '', name: 'You', avatar: null }, content,
      createdAt: Date.now(), fromWorld: true, attachments: 0, mentions: { users: {}, channels: {}, roles: {} },
    }, true);
    this.list.querySelector('.chat-empty')?.remove();
    this.list.append(el);
    this.pending.set(nonce, el);
    this.scrollToEnd();
    this.input.value = '';
    this.input.style.height = 'auto';
  }

  /** Server acknowledged (or rejected) a message we sent. */
  ack(nonce: string, ok: boolean, error?: string) {
    const el = this.pending.get(nonce);
    this.pending.delete(nonce);
    if (!el) return;
    if (ok) el.remove(); // the real message arrives via the normal message event
    else {
      el.classList.remove('pending');
      el.classList.add('failed');
      el.querySelector('.text')?.append(h('div', {}, icon('warning'), ` ${error ?? 'Not sent'}`));
      this.setHint(error ?? 'Message not sent.', true);
    }
  }

  private setHint(text: string, error = false) {
    this.hint.textContent = text;
    this.hint.classList.toggle('error', error);
  }

  private scrollToEnd() {
    this.list.scrollTop = this.list.scrollHeight;
  }
}
