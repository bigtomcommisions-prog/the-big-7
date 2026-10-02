import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  ANIM, CHARACTER_PRESETS, CHAT, NET, SKIN_TONES, createRng,
  type AnimState, type Appearance, type ChatMessage, type PlayerInfo, type PlayerUpdate, type PublicUser, type VoiceFlags,
} from '@hearthvale/shared';
import { VoxelCharacter } from './assets/character.ts';
import { formatDiscord } from '../ui/format.ts';
import { h } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';

const BUBBLE_VISIBLE_DIST = 45;
const TAG_VISIBLE_DIST = 60;

/** Character + floating name tag + speech-bubble stack. Shared by the local player, remotes and NPCs. */
export class Avatar {
  readonly tagEl: HTMLElement;
  private nameEl: HTMLElement;
  private muteEl: HTMLElement;
  readonly tag: CSS2DObject;
  private bubbleStackEl: HTMLElement;
  private bubbleStack: CSS2DObject;
  private ring: THREE.Mesh;
  speaking = false;

  constructor(readonly character: VoxelCharacter, name: string, private kind: 'self' | 'remote' | 'npc', subtitle?: string) {
    this.nameEl = h('span', {}, name);
    this.muteEl = h('span', { class: 'muted', title: 'Microphone muted' });
    this.tagEl = h('div', { class: `nametag ${kind}` },
      h('span', { class: 'mic' }, icon('mic', '12px')),
      kind === 'npc' ? h('span', { class: 'away', title: 'Not in Hearthvale right now' }, icon('away', '11px')) : null,
      this.nameEl, this.muteEl, subtitle ? h('span', {}, subtitle) : null);
    this.tag = new CSS2DObject(this.tagEl);
    this.tag.center.set(0.5, 1); // anchor at the tag's bottom edge
    this.tag.position.set(0, character.headTop + 0.15, 0);
    character.root.add(this.tag);

    this.bubbleStackEl = h('div', { class: 'bubble-stack' });
    this.bubbleStack = new CSS2DObject(this.bubbleStackEl);
    this.bubbleStack.center.set(0.5, 1); // bubbles grow upwards from above the name tag
    this.bubbleStack.position.set(0, character.headTop + 0.3, 0);
    character.root.add(this.bubbleStack);

    // Soft glowing ring under the feet while speaking
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.75, 24),
      new THREE.MeshBasicMaterial({ color: '#7cf29a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    character.root.add(this.ring);
  }

  setName(name: string) {
    this.nameEl.textContent = name;
  }

  setVoice(v: VoiceFlags | null) {
    this.muteEl.replaceChildren();
    if (v?.connected && (v.deafened || v.muted)) {
      this.muteEl.append(icon(v.deafened ? 'headphonesOff' : 'micOff', '12px'));
      this.muteEl.title = v.deafened ? 'Deafened' : 'Microphone muted';
    }
  }

  setSpeaking(on: boolean) {
    this.speaking = on;
    this.tagEl.classList.toggle('speaking', on);
  }

  /** Re-anchor labels after the character's proportions change. */
  relayout() {
    this.tag.position.y = this.character.headTop + 0.15;
    this.bubbleStack.position.y = this.character.headTop + 0.3;
  }

  say(message: ChatMessage, channelName: string, seconds: number, npc = false) {
    const html = formatDiscord(message.content, message.mentions, { maxChars: CHAT.BUBBLE_MAX_CHARS });
    const bubble = h('div', { class: `bubble ${npc ? 'npc' : ''}` }, h('span', { class: 'channel' }, `#${channelName}`));
    const body = h('span');
    body.innerHTML = html; // formatDiscord escapes all user content
    if (!message.content && message.attachments) body.append(icon('attachment'), ` ${message.attachments} attachment(s)`);
    bubble.append(body);
    this.bubbleStackEl.prepend(bubble);
    while (this.bubbleStackEl.children.length > 2) this.bubbleStackEl.lastElementChild?.remove();
    // Longer messages stay a bit longer.
    const ms = (seconds + Math.min(6, message.content.length / 40)) * 1000;
    setTimeout(() => bubble.classList.add('fading'), ms);
    setTimeout(() => bubble.remove(), ms + 700);
  }

  updateVisibility(cameraPos: THREE.Vector3, time: number) {
    const d = this.character.root.position.distanceTo(cameraPos);
    // Your own name only shows when zoomed out (or while you talk).
    this.tag.visible = this.kind === 'self' ? d > 9 || this.speaking : d < TAG_VISIBLE_DIST;
    this.bubbleStack.visible = d < BUBBLE_VISIBLE_DIST;
    const mat = this.ring.material as THREE.MeshBasicMaterial;
    const target = this.speaking ? 0.55 + Math.sin(time * 10) * 0.2 : 0;
    mat.opacity += (target - mat.opacity) * 0.25;
    this.ring.visible = mat.opacity > 0.01;
    const s = 1 + (this.speaking ? Math.sin(time * 10) * 0.08 : 0);
    this.ring.scale.set(s, s, s);
  }

  dispose() {
    this.tagEl.remove();
    this.bubbleStackEl.remove();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.character.dispose();
  }
}

interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  ry: number;
  a: AnimState;
}

/** Another real player. Rendered ~200 ms in the past and interpolated between server snapshots. */
export class RemotePlayer {
  readonly avatar: Avatar;
  private samples: Sample[] = [];
  private lastPos = new THREE.Vector3();
  info: PlayerInfo;

  constructor(info: PlayerInfo, scene: THREE.Object3D) {
    this.info = info;
    const character = new VoxelCharacter(info.appearance);
    this.avatar = new Avatar(character, info.name, 'remote');
    this.avatar.setVoice(info.voice);
    scene.add(character.root);
    this.push(performance.now(), info.x, info.y, info.z, info.ry, info.a);
    character.root.position.set(info.x, info.y, info.z);
    this.lastPos.set(info.x, info.y, info.z);
  }

  get position() {
    return this.avatar.character.root.position;
  }

  push(t: number, x: number, y: number, z: number, ry: number, a: AnimState) {
    this.samples.push({ t, x, y, z, ry, a });
    if (this.samples.length > 30) this.samples.shift();
  }

  applyUpdate(u: PlayerUpdate, now: number) {
    const [, x, y, z, ry, ai] = u;
    this.info.x = x;
    this.info.y = y;
    this.info.z = z;
    this.info.ry = ry;
    this.push(now, x, y, z, ry, ANIM[ai] ?? 'idle');
  }

  setAppearance(a: Appearance) {
    this.info.appearance = a;
    this.avatar.character.setAppearance(a);
    this.avatar.relayout();
  }

  update(now: number, dt: number) {
    const renderT = now - NET.INTERP_DELAY_MS;
    const s = this.samples;
    let a = s[0]!, b = s[0]!;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i]!.t <= renderT) {
        a = s[i]!;
        b = s[i + 1] ?? s[i]!;
        break;
      }
    }
    const span = b.t - a.t;
    const f = span > 0 ? THREE.MathUtils.clamp((renderT - a.t) / span, 0, 1) : 1;
    const root = this.avatar.character.root;
    root.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
    let dr = b.ry - a.ry;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    root.rotation.y = a.ry + dr * f;
    const speed = dt > 0 ? root.position.distanceTo(this.lastPos) / dt : 0;
    this.lastPos.copy(root.position);
    this.avatar.character.animate(f < 1 ? a.a : b.a, dt, speed);
  }

  dispose() {
    this.avatar.dispose();
  }
}

/** Deterministic look for Discord members who aren't in the world. */
export function npcAppearance(userId: string): Appearance {
  const rng = createRng(userId);
  const base = rng.pick(CHARACTER_PRESETS).appearance;
  const hue = () => `#${new THREE.Color().setHSL(rng(), 0.45 + rng() * 0.2, 0.5 + rng() * 0.15).getHexString()}`;
  return { ...base, skin: rng.pick(SKIN_TONES), shirt: hue(), pants: hue(), hairColor: hue() };
}

/**
 * Idle stand-ins: translucent characters loitering by a house (recently active in that channel)
 * or sitting in a gazebo (currently in the matching Discord voice channel). Clearly labelled as
 * not being in the world.
 */
export class NpcManager {
  private npcs = new Map<string, { avatar: Avatar; expires: number; key: string; sit: boolean }>();

  constructor(private scene: THREE.Object3D) {}

  /** Replace the set of NPCs for a given group key (e.g. `house:<id>` or `voice:<id>`). */
  sync(groupKey: string, users: PublicUser[], place: (i: number) => { pos: THREE.Vector3; ry: number; sit?: boolean }, subtitle: string) {
    const wanted = new Set(users.map((u) => `${groupKey}|${u.id}`));
    for (const [k, n] of this.npcs) {
      if (n.key === groupKey && !wanted.has(k) && n.expires === Infinity) this.remove(k);
    }
    users.forEach((u, i) => {
      const k = `${groupKey}|${u.id}`;
      const existing = this.npcs.get(k);
      if (existing) {
        existing.expires = Infinity;
        return;
      }
      this.spawn(k, groupKey, u, place(i), subtitle, Infinity);
    });
  }

  /** Get (or briefly spawn) an NPC to carry a speech bubble for someone not in the world. */
  speaker(groupKey: string, user: PublicUser, place: () => { pos: THREE.Vector3; ry: number }): Avatar {
    for (const [k, n] of this.npcs) {
      if (k.endsWith(`|${user.id}`) && n.key === groupKey) {
        if (n.expires !== Infinity) n.expires = performance.now() + 45_000;
        return n.avatar;
      }
    }
    return this.spawn(`${groupKey}|${user.id}`, groupKey, user, place(), 'away', performance.now() + 45_000);
  }

  private spawn(k: string, groupKey: string, u: PublicUser, p: { pos: THREE.Vector3; ry: number; sit?: boolean }, subtitle: string, expires: number) {
    const character = new VoxelCharacter(npcAppearance(u.id), { ghost: true });
    character.root.position.copy(p.pos);
    character.root.rotation.y = p.ry;
    const avatar = new Avatar(character, u.name, 'npc', `· ${subtitle}`);
    avatar.tagEl.title = `${u.name} isn't in Hearthvale right now`;
    this.scene.add(character.root);
    this.npcs.set(k, { avatar, expires, key: groupKey, sit: Boolean(p.sit) });
    return avatar;
  }

  private remove(k: string) {
    this.npcs.get(k)?.avatar.dispose();
    this.npcs.delete(k);
  }

  /** Light up an NPC's speaking indicator (e.g. a Discord user talking in a bridged voice channel). */
  setSpeaking(groupKey: string, userId: string, on: boolean) {
    this.npcs.get(`${groupKey}|${userId}`)?.avatar.setSpeaking(on);
  }

  /** Remove NPCs for a user who has just joined the world for real. */
  removeUser(userId: string) {
    for (const k of [...this.npcs.keys()]) if (k.endsWith(`|${userId}`)) this.remove(k);
  }

  update(dt: number, cameraPos: THREE.Vector3, time: number) {
    const now = performance.now();
    for (const [k, n] of this.npcs) {
      if (n.expires < now) {
        this.remove(k);
        continue;
      }
      n.avatar.character.animate(n.sit ? 'sit' : 'idle', dt);
      n.avatar.updateVisibility(cameraPos, time);
    }
  }

  clear() {
    for (const k of [...this.npcs.keys()]) this.remove(k);
  }
}
