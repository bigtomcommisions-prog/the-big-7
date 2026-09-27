import type { Preferences } from '@hearthvale/shared';
import { VoiceManager } from '../voice/voice.ts';
import { h } from './dom.ts';
import { icon } from './icons.ts';
import { keyLabel } from './hud.ts';

/** Settings modal. Calls `onChange` with the full updated preferences on every edit. */
export async function openSettings(root: HTMLElement, prefs: Preferences, onChange: (p: Preferences) => void, onLogout: () => void) {
  let p = { ...prefs };
  const set = (patch: Partial<Preferences>) => {
    p = { ...p, ...patch };
    onChange(p);
  };

  const { inputs, outputs } = await VoiceManager.devices();
  const deviceSelect = (list: MediaDeviceInfo[], current: string, onPick: (id: string) => void, kind: string) => {
    const sel = h('select', {},
      h('option', { value: '' }, 'System default'),
      ...list.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) =>
        h('option', { value: d.deviceId, selected: d.deviceId === current }, d.label || `${kind} ${i + 1}`)));
    sel.addEventListener('change', () => onPick(sel.value));
    return sel;
  };
  const slider = (min: number, max: number, step: number, value: number, onInput: (v: number) => void) => {
    const s = h('input', { type: 'range', min, max, step, value });
    s.addEventListener('input', () => onInput(Number(s.value)));
    return s;
  };
  const field = (label: string, control: Node, note?: string) =>
    h('div', { class: 'field' }, h('label', {}, label), control, note ? h('div', { class: 'fineprint', style: 'margin-top:4px' }, note) : null);

  const modeSel = h('select', {},
    h('option', { value: 'voice-activity', selected: p.voiceMode === 'voice-activity' }, 'Voice activity (open mic)'),
    h('option', { value: 'push-to-talk', selected: p.voiceMode === 'push-to-talk' }, 'Push to talk'));
  modeSel.addEventListener('change', () => set({ voiceMode: modeSel.value as Preferences['voiceMode'] }));

  const pttBtn = h('button', { class: 'btn small', type: 'button' }, `Key: ${keyLabel(p.pushToTalkKey)}`);
  pttBtn.addEventListener('click', () => {
    pttBtn.textContent = 'Press a key…';
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('keydown', onKey, true);
      if (e.code !== 'Escape' && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Enter'].includes(e.code)) set({ pushToTalkKey: e.code });
      pttBtn.textContent = `Key: ${keyLabel(p.pushToTalkKey)}`;
    };
    window.addEventListener('keydown', onKey, true);
  });

  const noLabels = inputs.length > 0 && inputs.every((d) => !d.label);
  const close = () => backdrop.remove();
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e: Event) => { if (e.target === backdrop) close(); } },
    h('div', { class: 'modal panel', role: 'dialog', 'aria-label': 'Settings' },
      h('button', { class: 'btn icon-btn small close', title: 'Close', onclick: close }, icon('close')),
      h('h2', {}, 'Settings'),
      h('div', { class: 'settings-grid' },
        h('div', { class: 'settings-section' }, icon('mic'), 'Voice'),
        field('Mode', modeSel),
        field('Push-to-talk key', pttBtn),
        field('Microphone', deviceSelect(inputs, p.inputDeviceId, (inputDeviceId) => set({ inputDeviceId }), 'Microphone'),
          noLabels ? 'Device names appear after you allow microphone access (Join voice).' : undefined),
        VoiceManager.canPickOutput
          ? field('Speakers / headphones', deviceSelect(outputs, p.outputDeviceId, (outputDeviceId) => set({ outputDeviceId }), 'Output'))
          : field('Speakers / headphones', h('div', { class: 'fineprint' }, 'Your browser uses the system output device.')),
        field(`Voice volume`, slider(0, 2, 0.05, p.voiceVolume, (voiceVolume) => set({ voiceVolume }))),
        h('div', { class: 'settings-section' }, icon('world'), 'World'),
        field('Brightness', slider(0.15, 1.5, 0.05, p.brightness, (brightness) => set({ brightness }))),
        field('Ambient sound', slider(0, 1, 0.05, p.ambientVolume, (ambientVolume) => set({ ambientVolume }))),
        field('Mouse sensitivity', slider(0.1, 3, 0.05, p.mouseSensitivity, (mouseSensitivity) => set({ mouseSensitivity }))),
        field('Speech bubble duration (s)', slider(2, 30, 1, p.bubbleSeconds, (bubbleSeconds) => set({ bubbleSeconds }))),
        h('div', { class: 'settings-section' }, icon('account'), 'Account'),
        h('div', {}, h('button', { class: 'btn danger small', onclick: () => { close(); onLogout(); } }, 'Log out')),
      )));
  root.append(backdrop);
}
