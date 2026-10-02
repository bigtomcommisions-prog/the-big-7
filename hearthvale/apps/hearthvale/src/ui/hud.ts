import type { GuildSummary } from '@hearthvale/shared';
import type { ConnState } from '../net/socket.ts';
import type { VoiceManager } from '../voice/voice.ts';
import { Toasts, guildIcon, h } from './dom.ts';
import { icon } from './icons.ts';

export interface HudHandlers {
  onCharacter(): void;
  onSettings(): void;
  onLeave(): void;
  onVoiceJoin(): void;
  onVoiceLeave(): void;
  onMute(): void;
  onDeafen(): void;
}

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace('Left', ' L').replace('Right', ' R');
}

/** Minimal, unobtrusive heads-up display. */
export class Hud {
  readonly el: HTMLElement;
  readonly toasts = new Toasts();
  private place: HTMLElement;
  private conn: HTMLElement;
  private connText: HTMLElement;
  private voiceBar: HTMLElement;
  private promptEl: HTMLElement;
  private meterFill: HTMLElement | null = null;

  constructor(guild: GuildSummary, private handlers: HudHandlers, voiceAvailable: boolean) {
    this.place = h('div', { class: 'place' }, 'Arriving…');
    this.connText = h('span', {}, 'Connecting');
    this.conn = h('div', { class: 'conn panel connecting', title: 'Connection to the world server' }, h('span', { class: 'dot' }), this.connText);
    this.voiceBar = h('div', { class: 'voice-bar panel' });
    this.promptEl = h('div', { class: 'prompt panel', style: 'opacity:0' });

    this.el = h('div', { class: 'hud' },
      h('div', { class: 'hud-location panel' }, guildIcon(guild.name, guild.icon),
        h('div', { class: 'where' }, h('div', { class: 'guild-name' }, guild.name), this.place)),
      h('div', { class: 'hud-actions' },
        this.conn,
        h('button', { class: 'btn icon-btn', title: 'Character', onclick: () => handlers.onCharacter() }, icon('character')),
        h('button', { class: 'btn icon-btn', title: 'Settings', onclick: () => handlers.onSettings() }, icon('settings')),
        h('button', { class: 'btn icon-btn', title: 'Back to server list', onclick: () => handlers.onLeave() }, icon('leave'))),
      voiceAvailable ? this.voiceBar : null,
      this.promptEl,
      h('div', { class: 'help panel' },
        h('kbd', {}, 'WASD'), ' move · ', h('kbd', {}, 'Shift'), ' run · ', h('kbd', {}, 'Space'), ' jump · drag to look · scroll to zoom · ',
        h('kbd', {}, 'Enter'), ' chat in a house'),
      this.toasts.el,
    );
  }

  setLocation(town: string | null, channel: { name: string; voice?: boolean } | null) {
    this.place.replaceChildren();
    if (channel) {
      this.place.append(town ? `${town} · ` : '', h('b', {}, channel.voice ? icon('voice') : '', channel.voice ? ` ${channel.name}` : `# ${channel.name}`));
    } else {
      this.place.append(town ?? 'The Commons');
    }
  }

  setConn(state: ConnState, detail?: string) {
    this.conn.className = `conn panel ${state}`;
    this.connText.textContent = state === 'online' ? 'Online' : state === 'connecting' ? (detail ?? 'Connecting') : 'Offline';
    this.conn.title = detail ?? 'Connection to the world server';
  }

  renderVoice(v: VoiceManager, pttKey: string) {
    const bar = this.voiceBar;
    bar.replaceChildren();
    this.meterFill = null;
    if (v.status === 'off' || v.status === 'error') {
      bar.append(
        h('button', {
          class: 'btn primary small', onclick: () => this.handlers.onVoiceJoin(),
          title: 'Talk to nearby players. Your browser will ask for microphone access — you can decline and just listen.',
        }, icon('mic'), 'Join voice'),
        h('span', { class: `status ${v.status === 'error' ? 'error' : ''}` }, v.status === 'error' ? v.statusText : 'Proximity voice'),
      );
      return;
    }
    const meter = h('div', { class: 'meter', title: 'Mic level' }, (this.meterFill = h('div')));
    const parts: (Node | null)[] = [
      h('button', {
        class: `btn icon-btn ${v.muted || !v.hasMic || !v.canSpeakHere ? 'off' : 'active'}`,
        title: !v.hasMic ? 'No microphone' : !v.canSpeakHere ? v.speakBlockReason ?? "You can't talk here" : v.muted ? 'Unmute' : 'Mute',
        disabled: !v.hasMic, onclick: () => this.handlers.onMute(),
      }, icon(v.muted || !v.hasMic || !v.canSpeakHere ? 'micOff' : 'mic')),
      h('button', {
        class: `btn icon-btn ${v.deafened ? 'off' : ''}`, title: v.deafened ? 'Undeafen' : 'Deafen (mute everyone)', onclick: () => this.handlers.onDeafen(),
      }, icon(v.deafened ? 'headphonesOff' : 'headphones')),
      v.hasMic ? meter : null,
      h('div', { class: 'status', title: v.canSpeakHere ? '' : v.speakBlockReason ?? '' }, v.bridgeChannelId ? h('span', {}, icon('link'), ' Discord call · ') : '', v.statusText,
        v.mode === 'push-to-talk' && v.hasMic && v.canSpeakHere ? h('div', { class: 'ptt-hint' }, v.pttDown ? h('span', {}, icon('live', '0.9em'), ' transmitting') : `hold ${keyLabel(pttKey)} to talk`) : null),
      h('button', { class: 'btn small', title: 'Leave voice', onclick: () => this.handlers.onVoiceLeave() }, 'Leave'),
    ];
    bar.append(...parts.filter((n): n is Node => n !== null));
  }

  meter(level: number) {
    if (this.meterFill) this.meterFill.style.height = `${Math.round(level * 100)}%`;
  }

  setPrompt(content: (Node | string)[] | null) {
    if (!content) {
      this.promptEl.style.opacity = '0';
      return;
    }
    this.promptEl.replaceChildren(...content);
    this.promptEl.style.opacity = '1';
  }
}
