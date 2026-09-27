import * as THREE from 'three';
import {
  NET, generateWorld, zoneAt, zoneKey,
  type Appearance, type ChatMessage, type DiscordVoiceMap, type GuildSummary, type NpcMap,
  type BridgeInfo, type Preferences, type ServerMessage, type WorldLayout, type WorldSpec, type Zone,
} from '@hearthvale/shared';
import { api, ApiError, type Me } from '../api.ts';
import { GameSocket } from '../net/socket.ts';
import { Hud } from '../ui/hud.ts';
import { ChatPanel } from '../ui/chatPanel.ts';
import { openCharacterEditor } from '../ui/characterEditor.ts';
import { openSettings } from '../ui/settings.ts';
import { h, isTyping } from '../ui/dom.ts';
import { icon, type IconName } from '../ui/icons.ts';
import { VoiceManager, type SpeakerPos } from '../voice/voice.ts';
import { Ambience } from './ambience.ts';
import { Avatar, NpcManager, RemotePlayer } from './avatars.ts';
import { ThirdPersonCamera } from './camera.ts';
import { Engine } from './engine.ts';
import { Input } from './input.ts';
import { LocalPlayer } from './player.ts';
import { WorldView } from './world.ts';

export interface GameOptions {
  root: HTMLElement;
  me: Me;
  guild: GuildSummary;
  appearance: Appearance;
  prefs: Preferences;
  /** Return to the server list, optionally showing an error. */
  onExit(error?: string): void;
  onLogout(): void;
  onPrefs(p: Preferences): void;
}

/** One visit to one guild's world. */
export class Game {
  private container: HTMLElement;
  private engine: Engine;
  private input: Input;
  private cam: ThirdPersonCamera;
  private socket: GameSocket;
  private hud: Hud;
  private chat = new ChatPanel();
  private voice = new VoiceManager();
  private ambience = new Ambience();
  private npcs: NpcManager;
  private world: WorldView | null = null;
  private layout: WorldLayout | null = null;
  private player: LocalPlayer | null = null;
  private selfAvatar: Avatar | null = null;
  private remotes = new Map<string, RemotePlayer>();
  private canSend = new Set<string>();
  private npcMap: NpcMap = {};
  private discordVoice: DiscordVoiceMap = {};
  private bridge: BridgeInfo | null = null;
  private bridgeRetryAt = 0;
  private bridgeError: string | null = null;
  private zone: Zone = { type: 'hub' };
  private zoneKeyNow = '';
  private prefs: Preferences;
  private appearance: Appearance;
  private lastSendAt = 0;
  private lastSent = { x: 0, y: 0, z: 0, ry: 0, a: '' };
  private loadingEl: HTMLElement;
  private clock = new THREE.Timer();
  private disposed = false;

  constructor(private o: GameOptions) {
    this.prefs = o.prefs;
    this.appearance = o.appearance;
    this.container = h('div', { id: 'game-root' });
    o.root.append(this.container);
    this.engine = new Engine(this.container);
    this.input = new Input(this.engine.renderer.domElement);
    this.cam = new ThirdPersonCamera(this.engine.camera);
    this.npcs = new NpcManager(this.engine.scene);

    this.hud = new Hud(o.guild, {
      onCharacter: () => void this.editCharacter(),
      onSettings: () => void openSettings(this.container, this.prefs, (p) => this.applyPrefs(p), o.onLogout),
      onLeave: () => o.onExit(),
      onVoiceJoin: () => void this.voice.join(o.guild.id),
      onVoiceLeave: () => this.voice.leave(),
      onMute: () => this.voice.setMuted(!this.voice.muted),
      onDeafen: () => this.voice.setDeafened(!this.voice.deafened),
    }, o.me.voiceEnabled);
    this.container.append(this.hud.el, this.chat.el);
    this.loadingEl = h('div', { class: 'screen', style: 'background:rgba(207,232,242,0.92)' },
      h('div', { class: 'card panel' }, h('p', { class: 'tagline' }, `Travelling to ${o.guild.name}…`), h('div', { class: 'loading-bar' }, h('div'))));
    this.container.append(this.loadingEl);

    this.chat.onSend = (channelId, content, nonce) => this.socket.send({ t: 'chat', channelId, content, nonce });

    this.voice.onChange = () => {
      this.hud.renderVoice(this.voice, this.prefs.pushToTalkKey);
      this.socket.send({ t: 'voice', muted: this.voice.muted || !this.voice.hasMic, deafened: this.voice.deafened, connected: this.voice.active });
    };
    this.voice.onSpeaking = (ids) => {
      this.selfAvatar?.setSpeaking(ids.has(o.me.user.id));
      for (const [id, r] of this.remotes) r.avatar.setSpeaking(ids.has(id));
    };
    this.voice.selfId = o.me.user.id;
    this.voice.onBridgeChange = () => this.hud.renderVoice(this.voice, this.prefs.pushToTalkKey);
    this.applyPrefs(this.prefs, false);
    this.hud.renderVoice(this.voice, this.prefs.pushToTalkKey);

    // Ambient audio needs a user gesture.
    const startAudio = () => {
      this.ambience.start();
      this.ambience.setVolume(this.prefs.ambientVolume);
      window.removeEventListener('pointerdown', startAudio);
      window.removeEventListener('keydown', startAudio);
    };
    window.addEventListener('pointerdown', startAudio);
    window.addEventListener('keydown', startAudio);
    window.addEventListener('keydown', this.onKeyDown);

    this.socket = new GameSocket(o.guild.id);
    this.socket.onState = (s, d) => this.hud.setConn(s, d);
    this.socket.onMessage = (m) => this.onServer(m);
    this.socket.onFatal = (_code, reason) => {
      if (reason === 'replaced') return this.o.onExit('You opened this world in another tab.');
      this.o.onExit(this.fatalMessage ?? 'You were disconnected from the world.');
    };
    this.socket.connect();

    this.engine.renderer.setAnimationLoop(() => this.frame());
  }

  private fatalMessage: string | null = null;

  private applyPrefs(p: Preferences, persist = true) {
    this.prefs = p;
    this.cam.sensitivity = p.mouseSensitivity;
    this.engine.setBrightness(p.brightness);
    this.ambience.setVolume(p.ambientVolume);
    this.voice.configure({ mode: p.voiceMode, volume: p.voiceVolume, inputDeviceId: p.inputDeviceId, outputDeviceId: p.outputDeviceId });
    this.hud.renderVoice(this.voice, p.pushToTalkKey);
    if (persist) this.o.onPrefs(p);
  }

  private async editCharacter() {
    const result = await openCharacterEditor(this.container, this.appearance);
    if (!result) return;
    this.appearance = result;
    this.player?.character.setAppearance(result);
    this.selfAvatar?.relayout();
    this.socket.send({ t: 'appearance', appearance: result });
    try {
      await api.saveCharacter(result);
      this.hud.toasts.show('Looking good! Character saved.');
    } catch (err) {
      this.hud.toasts.show(err instanceof ApiError ? err.message : 'Could not save character', 'error');
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !isTyping() && this.chat.openChannelId) {
      e.preventDefault();
      this.chat.focus();
    }
  };

  // ── Server messages ────────────────────────────────────────────────────
  private onServer(m: ServerMessage) {
    switch (m.t) {
      case 'welcome': {
        this.canSend = new Set(m.canSend);
        this.buildWorld(m.world, m.guild.name);
        if (!this.player) {
          this.player = new LocalPlayer(this.appearance);
          this.selfAvatar = new Avatar(this.player.character, this.o.me.user.name, 'self');
          this.engine.scene.add(this.player.character.root);
        }
        this.player.teleport(m.self.x, m.self.y, m.self.z);
        this.player.ry = m.self.ry;
        this.cam.yaw = m.self.ry + Math.PI;
        // Server has our saved appearance; if the local one differs (just edited), push it.
        if (JSON.stringify(m.self.appearance) !== JSON.stringify(this.appearance)) this.socket.send({ t: 'appearance', appearance: this.appearance });
        for (const r of this.remotes.values()) r.dispose();
        this.remotes.clear();
        this.npcMap = m.npcs;
        this.discordVoice = m.discordVoice;
        this.bridge = m.bridge;
        this.syncNpcs();
        this.voice.onChange();
        this.loadingEl.remove();
        this.zoneKeyNow = '';
        break;
      }
      case 'world': {
        this.canSend = new Set(m.canSend);
        this.buildWorld(m.world, this.o.guild.name);
        this.syncNpcs();
        this.zoneKeyNow = ''; // force HUD/panel refresh
        this.hud.toasts.show('The world changed to match Discord', 'info', 3500, 'sparkles');
        break;
      }
      case 'snapshot': {
        const now = performance.now();
        for (const info of m.add) {
          if (info.id === this.o.me.user.id || this.remotes.has(info.id)) continue;
          this.npcs.removeUser(info.id);
          this.remotes.set(info.id, new RemotePlayer(info, this.engine.scene));
        }
        for (const id of m.remove) {
          this.remotes.get(id)?.dispose();
          this.remotes.delete(id);
        }
        for (const u of m.upd) this.remotes.get(u[0])?.applyUpdate(u, now);
        break;
      }
      case 'playerMeta': {
        if (m.id === this.o.me.user.id) {
          if (m.voice) this.selfAvatar?.setVoice(m.voice);
          break;
        }
        const r = this.remotes.get(m.id);
        if (!r) break;
        if (m.appearance) r.setAppearance(m.appearance);
        if (m.voice) {
          r.info.voice = m.voice;
          r.avatar.setVoice(m.voice);
        }
        break;
      }
      case 'message':
        this.onChatMessage(m.message);
        break;
      case 'messageDelete':
        this.chat.remove(m.id);
        break;
      case 'chatAck':
        this.chat.ack(m.nonce, m.ok, m.error);
        if (!m.ok) this.hud.toasts.show(m.error ?? 'Message not sent', 'error');
        break;
      case 'npcs':
        this.npcMap = m.npcs;
        this.syncNpcs();
        break;
      case 'discordVoice':
        this.discordVoice = m.discordVoice;
        this.syncNpcs();
        break;
      case 'bridge':
        this.bridge = m.bridge;
        this.bridgeError = null;
        this.bridgeRetryAt = 0;
        break;
      case 'discordSpeaking':
        this.npcs.setSpeaking(`voice:${m.channelId}`, m.userId, m.speaking);
        break;
      case 'correct':
        if (this.player) {
          this.player.position.x = m.x;
          this.player.position.z = m.z;
        }
        break;
      case 'error':
        this.fatalMessage = m.message;
        this.hud.toasts.show(m.message, 'error', 6000);
        break;
      case 'pong':
        break;
    }
  }

  private buildWorld(spec: WorldSpec, guildName: string) {
    const layout = generateWorld(spec);
    this.world?.dispose();
    this.layout = layout;
    this.world = new WorldView(layout, guildName);
    this.engine.scene.add(this.world.group);
  }

  private onChatMessage(m: ChatMessage) {
    this.world?.ping(m.channelId);
    this.chat.add(m);
    const house = this.world?.houses.get(m.channelId);
    const channelName = house?.layout.name ?? 'channel';
    const secs = this.prefs.bubbleSeconds;
    if (m.author.id === this.o.me.user.id) {
      this.selfAvatar?.say(m, channelName, secs);
      return;
    }
    const remote = this.remotes.get(m.author.id);
    if (remote) {
      remote.avatar.say(m, channelName, secs);
      return;
    }
    if (!house) return;
    // Author isn't playing: an idle stand-in by the channel's house speaks for them.
    const avatar = this.npcs.speaker(`house:${m.channelId}`, m.author, () => this.housePlace(m.channelId, 3 + Math.floor(Math.random() * 3)));
    avatar.say(m, channelName, secs, true);
  }

  private housePlace(channelId: string, i: number): { pos: THREE.Vector3; ry: number } {
    const e = this.world!.houses.get(channelId)!;
    const hl = e.layout;
    const fx = Math.sin(hl.ry), fz = Math.cos(hl.ry);
    const rx = Math.cos(hl.ry), rz = -Math.sin(hl.ry);
    const side = (i % 2 === 0 ? 1 : -1) * (1.6 + Math.floor(i / 2) * 1.3);
    const out = hl.d / 2 + 1.4 + (i % 3) * 0.5;
    return { pos: new THREE.Vector3(hl.x + fx * out + rx * side, 0, hl.z + fz * out + rz * side), ry: hl.ry + (i % 2 ? 0.4 : -0.4) };
  }

  private syncNpcs() {
    if (!this.world) return;
    for (const channelId of this.world.houses.keys()) {
      const users = (this.npcMap[channelId] ?? []).filter((u) => !this.remotes.has(u.id) && u.id !== this.o.me.user.id);
      this.npcs.sync(`house:${channelId}`, users, (i) => this.housePlace(channelId, i), 'away');
    }
    for (const [channelId, p] of this.world.plazas) {
      const users = this.discordVoice[channelId] ?? [];
      p.labelEl.replaceChildren(icon('voice', '13px'), `${p.layout.name}${users.length ? ` · ${users.length} in Discord voice` : ''}`);
      this.npcs.sync(`voice:${channelId}`, users, (i) => {
        const seat = p.seats[i % p.seats.length] ?? new THREE.Vector3(p.layout.x, 0, p.layout.z);
        return { pos: seat.clone().setY(i < p.seats.length ? 0.1 : 0), ry: Math.atan2(p.layout.x - seat.x, p.layout.z - seat.z), sit: i < p.seats.length };
      }, 'in Discord voice');
    }
  }

  // ── Zones, HUD & chat panel ─────────────────────────────────────────────
  private updateZone() {
    if (!this.layout || !this.player || !this.world) return;
    const z = zoneAt(this.layout, this.player.position.x, this.player.position.z);
    const key = zoneKey(z);
    if (key === this.zoneKeyNow) return;
    this.zoneKeyNow = key;
    this.zone = z;
    const town = 'townKey' in z ? this.layout.towns.find((t) => t.key === z.townKey) : undefined;
    const townName = town ? (town.name || 'Quiet Meadow') : z.type === 'hub' ? 'The Commons' : z.type === 'wild' ? 'The Wilds' : null;
    this.ambience.setIndoors(z.type === 'house');

    if (z.type === 'house') {
      const house = this.world.houses.get(z.channelId);
      if (!house) return;
      this.hud.setLocation(townName, { name: house.layout.name });
      if (house.layout.active) void this.openChannel(z.channelId);
      else this.chat.close();
    } else if (z.type === 'plaza') {
      const p = this.world.plazas.get(z.channelId);
      this.hud.setLocation(townName, { name: p?.layout.name ?? 'voice', voice: true });
      this.chat.close();
    } else {
      this.hud.setLocation(townName, null);
      this.chat.close();
    }
  }

  private async openChannel(channelId: string) {
    const house = this.world?.houses.get(channelId);
    if (!house) return;
    this.chat.open({ id: channelId, name: house.layout.name, topic: house.layout.topic, canSend: this.canSend.has(channelId) });
    try {
      const { messages } = await api.messages(this.o.guild.id, channelId);
      if (this.chat.openChannelId === channelId) this.chat.setHistory(messages);
    } catch (err) {
      if (this.chat.openChannelId === channelId) this.chat.showError(err instanceof ApiError ? err.message : 'Could not load messages.');
    }
  }

  private updatePrompt() {
    if (!this.world || !this.player) return;
    if (this.zone.type === 'house') {
      const id = this.zone.channelId;
      const house = this.world.houses.get(id);
      if (house && !house.layout.active) return this.hud.setPrompt([icon('warning'), 'This channel was deleted in Discord']);
      if (isTyping()) return this.hud.setPrompt(null);
      if (this.canSend.has(id)) return this.hud.setPrompt([h('kbd', {}, 'Enter'), ` to chat in #${house?.layout.name ?? ''}`]);
      return this.hud.setPrompt([`Reading #${house?.layout.name ?? ''}`]);
    }
    if (this.zone.type === 'plaza') {
      const [ic, text] = this.bridgePrompt(this.zone.channelId);
      return this.hud.setPrompt([icon(ic), text]);
    }
    // Near a door?
    const p = this.player.position;
    for (const e of this.world.houses.values()) {
      if (e.built.door.distanceToSquared(p) < 9 && e.layout.active) {
        return this.hud.setPrompt([`Walk in to visit #${e.layout.name}`]);
      }
    }
    this.hud.setPrompt(null);
  }

  private bridgePrompt(channelId: string): [IconName, string] {
    const name = this.world?.plazas.get(channelId)?.layout.name ?? 'voice';
    const b = this.bridge;
    if (!this.o.me.voiceEnabled) return ['voice', 'Voice gazebo'];
    if (this.voice.bridgeChannelId === channelId) {
      return this.voice.bridgeCanSpeak
        ? ['mic', `Live with Discord · ${name} — people in Discord can hear you`]
        : ['headphones', `Listening to Discord · ${name} (you can't speak there)`];
    }
    if (this.bridgeError) return ['warning', this.bridgeError];
    if (!b) return ['voice', `${name} — connecting to Discord voice…`];
    if (b.channelId !== channelId) {
      const other = this.world?.plazas.get(b.channelId)?.layout.name ?? 'another channel';
      return ['voice', `The Discord bridge is busy in ${other} — everyone here can still hear each other`];
    }
    if (b.status === 'error') return ['warning', b.error ?? 'Discord voice bridge unavailable'];
    if (b.status === 'starting') return ['voice', `Connecting to Discord · ${name}…`];
    if (!this.voice.active) return ['voice', `Join voice (bottom-left) to talk with people in Discord · ${name}`];
    return ['voice', `Joining Discord · ${name}…`];
  }

  /** Keep our Discord-bridge connection matching where we're standing. */
  private reconcileBridge(now: number) {
    const inPlaza = this.zone.type === 'plaza' ? this.zone.channelId : null;
    if (!inPlaza) this.bridgeError = null;
    const b = this.bridge;
    const want = inPlaza && b && b.channelId === inPlaza && b.status === 'active' && this.voice.active ? inPlaza : null;
    if (want && this.voice.bridgeChannelId !== want && now >= this.bridgeRetryAt) {
      this.bridgeRetryAt = now + 5000;
      this.voice.joinBridge(want, () => api.bridgeToken(this.o.guild.id, want)).then(
        () => (this.bridgeError = null),
        (err) => (this.bridgeError = err instanceof ApiError ? err.message : 'Could not join the Discord call'),
      );
    } else if (!want && this.voice.bridgeChannelId) {
      void this.voice.leaveBridge();
    }
  }

  // ── Frame loop ────────────────────────────────────────────────────────
  private frame() {
    if (this.disposed) return;
    this.clock.update();
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.getElapsed();
    const now = performance.now();

    if (this.player && this.world) {
      this.player.update(dt, this.input, this.cam.yaw, this.world.collision, false);
      this.updateZone();
      this.cam.update(dt, this.player.position, this.input, this.world.collision, this.zone.type === 'house');
      this.engine.follow(this.player.position, time);
      this.world.update(time, this.engine.camera, this.player.position, this.zone.type === 'house' ? this.zone.channelId : null);
      this.selfAvatar?.updateVisibility(this.engine.camera.position, time);
      this.sendMovement(now);
      this.reconcileBridge(now);
      this.updatePrompt();
    }
    for (const r of this.remotes.values()) {
      r.update(now, dt);
      r.avatar.updateVisibility(this.engine.camera.position, time);
    }
    this.npcs.update(dt, this.engine.camera.position, time);

    // Voice: push-to-talk + spatialisation
    if (this.voice.active && this.player && this.layout) {
      if (this.voice.mode === 'push-to-talk') this.voice.setPtt(this.input.down(this.prefs.pushToTalkKey));
      const speakers = new Map<string, SpeakerPos>();
      for (const [id, r] of this.remotes) {
        const p = r.position;
        speakers.set(id, { x: p.x, z: p.z, zone: zoneKey(zoneAt(this.layout, p.x, p.z)) });
      }
      this.voice.update({ x: this.player.position.x, z: this.player.position.z, yaw: this.cam.yaw, zone: this.zoneKeyNow }, speakers);
      this.hud.meter(this.voice.level());
    }

    this.input.endFrame();
    this.engine.render();
  }

  private sendMovement(now: number) {
    const p = this.player!;
    if (now - this.lastSendAt < 1000 / NET.CLIENT_SEND_HZ) return;
    const s = this.lastSent;
    const changed = Math.abs(p.position.x - s.x) > 0.01 || Math.abs(p.position.y - s.y) > 0.01 || Math.abs(p.position.z - s.z) > 0.01
      || Math.abs(p.ry - s.ry) > 0.02 || p.anim !== s.a;
    if (!changed && now - this.lastSendAt < 1000) return;
    if (this.socket.send({ t: 'move', x: p.position.x, y: p.position.y, z: p.position.z, ry: p.ry, a: p.anim })) {
      this.lastSendAt = now;
      Object.assign(s, { x: p.position.x, y: p.position.y, z: p.position.z, ry: p.ry, a: p.anim });
    }
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    this.socket.close();
    this.voice.leave();
    this.ambience.dispose();
    this.input.dispose();
    for (const r of this.remotes.values()) r.dispose();
    this.npcs.clear();
    this.world?.dispose();
    this.engine.dispose();
    this.container.remove();
  }
}
