import { VoiceManager, type SpeakerPos } from '../voice/voice.ts';
import { h } from '../ui/dom.ts';

/**
 * DEV-ONLY harness (?voicetest&url=…&token=…) that drives the real VoiceManager with an
 * externally minted LiveKit token, so the spatial-audio pipeline can be tested end-to-end in
 * headless browsers. Excluded from production builds.
 */
export function startVoiceTest(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  const vm = new VoiceManager();
  vm.selfId = q.get('id') ?? '';
  const speakers = new Map<string, SpeakerPos>();
  const listener = { x: 0, z: 0, yaw: 0, zone: 'wild' };
  const speaking = new Set<string>();
  vm.onSpeaking = (ids) => {
    speaking.clear();
    for (const id of ids) speaking.add(id);
  };
  const status = h('pre', { id: 'status' });
  vm.onChange = () => (status.textContent = `${vm.status} | ${vm.statusText} | mic=${vm.hasMic}`);
  const btn = h('button', {
    id: 'join', class: 'btn primary', onclick: async () => {
      await vm.join('test', async () => ({ url: q.get('url')!, token: q.get('token')! }));
      const bt = q.get('btoken');
      if (bt) await vm.joinBridge('vc', async () => ({ url: q.get('url')!, token: bt, canSpeak: true }));
    },
  }, 'Join');
  root.replaceChildren(h('div', { style: 'padding:20px' }, btn, status));
  setInterval(() => vm.update(listener, speakers), 50);
  (window as unknown as Record<string, unknown>).__vt = { vm, speakers, listener, speaking: () => [...speaking] };
}
