import * as THREE from 'three';
import { DEFAULT_APPEARANCE, generateWorld, townCapacity, zoneAt, zoneKey, type WorldSpec } from '@hearthvale/shared';
import { Engine } from '../game/engine.ts';
import { Input } from '../game/input.ts';
import { ThirdPersonCamera } from '../game/camera.ts';
import { LocalPlayer } from '../game/player.ts';
import { WorldView } from '../game/world.ts';
import { Avatar, NpcManager } from '../game/avatars.ts';
import { h } from '../ui/dom.ts';
import { openCharacterEditor } from '../ui/characterEditor.ts';
import { Hud } from '../ui/hud.ts';
import { VoiceManager } from '../voice/voice.ts';

/**
 * DEV-ONLY offline sandbox (http://localhost:5173/?sandbox) for iterating on the 3D world
 * without Discord credentials. Excluded from production builds (see main.ts). The sample
 * structure below is synthetic test input for the generator — the real app never uses it.
 */
function sampleSpec(): WorldSpec {
  const town = (key: string, slot: number, name: string, channels: [string, 'text' | 'announcement' | 'voice'][]) => ({
    key, slot, name,
    capacity: townCapacity(channels.length - 1, channels.length),
    buildings: channels.map(([n, kind], i) => ({ channelId: `${key}${String(i).padStart(4, '0')}`, name: n, kind, slot: i, active: n !== 'old-stuff' })),
  });
  return {
    guildId: '100000000000000001',
    guildName: 'Sandbox',
    towns: [
      town('200000000000000001', 0, 'General', [['welcome', 'announcement'], ['general', 'text'], ['introductions', 'text'], ['memes', 'text'], ['Lounge', 'voice']]),
      town('200000000000000002', 1, 'Development', [['frontend', 'text'], ['backend', 'text'], ['devops', 'text'], ['code-review', 'text'], ['releases', 'announcement'], ['bugs', 'text'], ['ideas', 'text'], ['old-stuff', 'text'], ['Pairing', 'voice']]),
      town('200000000000000003', 2, 'Community', [['events', 'text'], ['art', 'text'], ['music', 'text'], ['Campfire', 'voice']]),
      town('200000000000000004', 3, 'Gaming', [['minecraft', 'text'], ['lfg', 'text']]),
    ],
  };
}

export function startSandbox(root: HTMLElement) {
  const container = h('div', { id: 'game-root' });
  root.replaceChildren(container);
  const engine = new Engine(container);
  const input = new Input(engine.renderer.domElement);
  const cam = new ThirdPersonCamera(engine.camera);
  const layout = generateWorld(sampleSpec());
  const world = new WorldView(layout, 'Sandbox');
  engine.scene.add(world.group);
  const player = new LocalPlayer(DEFAULT_APPEARANCE);
  const avatar = new Avatar(player.character, 'You', 'self');
  engine.scene.add(player.character.root);

  // ?at=<channel name> spawns in front of that house (handy for screenshots)
  const params = new URLSearchParams(location.search);
  const at = params.get('at');
  const plaza = at ? layout.plazas.find((x) => x.name === at) : undefined;
  const target = at ? layout.houses.find((x) => x.name === at) : undefined;
  if (plaza) {
    const fx = Math.sin(plaza.ry), fz = Math.cos(plaza.ry);
    player.teleport(plaza.x + fx * (plaza.radius + 5), 0, plaza.z + fz * (plaza.radius + 5));
    player.ry = plaza.ry + Math.PI;
    cam.yaw = plaza.ry;
  } else if (target) {
    const fx = Math.sin(target.ry), fz = Math.cos(target.ry);
    const out = params.has('inside') ? 0.8 : target.d / 2 + 6;
    player.teleport(target.x + fx * out, 0, target.z + fz * out);
    player.ry = target.ry + Math.PI;
    cam.yaw = target.ry;
  } else {
    player.teleport(layout.spawn.x, 0, layout.spawn.z);
    player.ry = layout.spawn.ry;
    cam.yaw = layout.spawn.ry + Math.PI;
  }
  if (params.has('pitch')) cam.pitch = Number(params.get('pitch'));
  if (params.has('dist')) cam.targetDistance = Number(params.get('dist'));
  if (params.has('bright')) engine.setBrightness(Number(params.get('bright')));

  const info = h('div', { class: 'hud' }, h('div', { class: 'hud-location panel' }, h('div', { class: 'where' }, h('div', { class: 'guild-name' }, 'DEV SANDBOX'), h('div', { class: 'place', id: 'zone' }, '…'))));
  container.append(info);
  const zoneEl = info.querySelector('#zone')!;
  (window as unknown as { __sandbox: unknown }).__sandbox = { layout, player, cam };

  const npcs = new NpcManager(engine.scene);
  if (params.has('bubbles')) {
    const msg = (content: string, author = 'You') => ({
      id: String(Math.random()), channelId: 'x', author: { id: author, name: author, avatar: null }, content, createdAt: Date.now(),
      fromWorld: false, attachments: 0, mentions: { users: { '42': 'Willow' }, channels: {}, roles: {} },
    });
    setTimeout(() => avatar.say(msg('Hello **everyone**! Has anyone tried the new `build` yet? <@42> ||spoiler||'), 'general', 30), 200);
    const npc = npcs.speaker('house:x', { id: 'npc1', name: 'Bramble', avatar: null }, () => ({
      pos: new THREE.Vector3(player.position.x + 2.5, 0, player.position.z - 1.5), ry: player.ry + Math.PI,
    }));
    setTimeout(() => npc.say(msg('I am *not* in the world, but I posted in Discord 👋 — this bubble is capped so a very long message does not cover the whole screen, which keeps the world readable even when people write essays.', 'npc1'), 'general', 30, true), 400);
  }
  if (params.has('hud')) {
    const noop = () => undefined;
    const hud = new Hud({ id: '1', name: 'Sandbox', icon: null }, { onCharacter: noop, onSettings: noop, onLeave: noop, onVoiceJoin: noop, onVoiceLeave: noop, onMute: noop, onDeafen: noop }, true);
    hud.setConn('online');
    hud.setLocation('General', { name: 'Lounge', voice: true });
    hud.renderVoice(new VoiceManager(), 'KeyV');
    hud.toasts.show('The world changed to match Discord', 'info', 60000, 'sparkles');
    container.append(hud.el);
  }
  if (params.has('editor')) void openCharacterEditor(container, DEFAULT_APPEARANCE);
  const clock = new THREE.Timer();
  engine.renderer.setAnimationLoop(() => {
    clock.update();
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.getElapsed();
    player.update(dt, input, cam.yaw, world.collision, false);
    const z = zoneAt(layout, player.position.x, player.position.z);
    zoneEl.textContent = zoneKey(z);
    cam.update(dt, player.position, input, world.collision, z.type === 'house');
    engine.follow(player.position, t);
    world.update(t, engine.camera, player.position, z.type === 'house' ? z.channelId : null);
    avatar.updateVisibility(engine.camera.position, t);
    npcs.update(dt, engine.camera.position, t);
    input.endFrame();
    engine.render();
  });
}
