import {
  DisconnectReason, LocalAudioTrack as LkLocalAudioTrack, Room, RoomEvent, Track, createLocalAudioTrack,
  type LocalAudioTrack, type Participant, type RemoteParticipant, type RemoteTrack,
} from 'livekit-client';
import { VOICE } from '@hearthvale/shared';
import { api, ApiError } from '../api.ts';

export type VoiceStatus = 'off' | 'requesting' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type VoiceMode = 'voice-activity' | 'push-to-talk';

export interface Listener {
  x: number;
  z: number;
  /** Camera yaw, used as "which way my ears face". */
  yaw: number;
  zone: string;
}

export interface SpeakerPos {
  x: number;
  z: number;
  zone: string;
}

interface Chain {
  el: HTMLAudioElement;
  analyser: AnalyserNode;
  lastLoud: number;
  source: MediaStreamAudioSourceNode;
  lowpass: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
}

const enclosed = (zone: string) => zone.startsWith('house:') || zone.startsWith('plaza:');

/**
 * Proximity voice over LiveKit (WebRTC SFU).
 *
 * - The mic is only requested when the user clicks "Join voice"; if it's denied or missing we
 *   still join listen-only.
 * - We subscribe only to speakers within VOICE.SUBSCRIBE_DISTANCE, so bandwidth scales with
 *   the local crowd, not the server.
 * - Each remote track runs through our own Web Audio chain:
 *     source → low-pass (wall occlusion) → gain (distance) → stereo pan (direction) → master
 */
export class VoiceManager {
  status: VoiceStatus = 'off';
  statusText = 'Voice off';
  muted = false;
  deafened = false;
  pttDown = false;
  mode: VoiceMode = 'voice-activity';
  hasMic = false;
  /**
   * Whether Discord permissions let us talk where we're standing. Set by the server, which also
   * enforces it in LiveKit; locally it just keeps the UI honest and the mic muted.
   */
  canSpeakHere = true;
  speakBlockReason: string | null = null;

  onChange: () => void = () => {};
  onSpeaking: (ids: Set<string>) => void = () => {};

  private room: Room | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuf = new Uint8Array(256);
  private local: LocalAudioTrack | null = null;
  private chains = new Map<string, Chain>();
  /** Speakers reported by the SFU, merged with our own level detection. */
  private sfuSpeaking = new Set<string>();
  private localLoudAt = 0;
  private lastSpeakingKey = '';
  selfId = '';

  // ── Discord voice bridge (a second, non-spatial "call" room) ──
  private bridgeRoom: Room | null = null;
  private bridgeTrack: LocalAudioTrack | null = null;
  private bridgeChains = new Map<string, { el: HTMLAudioElement; source: MediaStreamAudioSourceNode; gain: GainNode }>();
  bridgeChannelId: string | null = null;
  bridgeCanSpeak = false;
  private bridgeJoining = false;
  onBridgeChange: () => void = () => {};
  private volume = 1;
  private inputDeviceId = '';
  private outputDeviceId = '';
  private retries = 0;
  private guildId = '';
  private fetchToken: (() => Promise<{ url: string; token: string }>) | undefined;
  private leaving = false;

  get active() {
    return this.status === 'connected' || this.status === 'reconnecting';
  }

  private set(status: VoiceStatus, text: string) {
    this.status = status;
    this.statusText = text;
    this.onChange();
  }

  configure(opts: { mode?: VoiceMode; volume?: number; inputDeviceId?: string; outputDeviceId?: string }) {
    if (opts.mode) this.mode = opts.mode;
    if (opts.volume !== undefined) {
      this.volume = opts.volume;
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.deafened ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
    if (opts.inputDeviceId !== undefined && opts.inputDeviceId !== this.inputDeviceId) {
      this.inputDeviceId = opts.inputDeviceId;
      if (this.local) void this.local.setDeviceId(opts.inputDeviceId || 'default');
    }
    if (opts.outputDeviceId !== undefined && opts.outputDeviceId !== this.outputDeviceId) {
      this.outputDeviceId = opts.outputDeviceId;
      void this.applySink();
    }
    this.applyMic();
  }

  private async applySink() {
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (ctx?.setSinkId) {
      try {
        await ctx.setSinkId(this.outputDeviceId || '');
      } catch (err) {
        console.warn('Could not switch output device', err);
      }
    }
  }

  /** Must be called from a user gesture (click), which also unlocks audio playback. */
  async join(guildId: string, fetchToken: () => Promise<{ url: string; token: string }> = () => api.voiceToken(guildId)) {
    if (this.room) return;
    this.guildId = guildId;
    this.fetchToken = fetchToken;
    this.leaving = false;
    this.ctx ??= new AudioContext();
    await this.ctx.resume();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.deafened ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    void this.applySink();

    // 1. Microphone (explicit permission prompt). Fall back to listen-only on failure.
    this.set('requesting', 'Asking for microphone…');
    this.hasMic = false;
    try {
      this.local = await createLocalAudioTrack({
        deviceId: this.inputDeviceId || undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      this.hasMic = true;
      const src = this.ctx.createMediaStreamSource(new MediaStream([this.local.mediaStreamTrack]));
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      src.connect(this.analyser);
    } catch (err) {
      const name = (err as { name?: string }).name;
      const why = name === 'NotAllowedError' ? 'Microphone blocked — listening only'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'No microphone found — listening only'
        : name === 'NotReadableError' ? 'Microphone busy in another app — listening only'
        : 'Microphone unavailable — listening only';
      this.statusText = why;
      console.warn('Microphone unavailable', err);
    }

    // 2. Connect to the SFU
    this.set('connecting', this.hasMic ? 'Connecting voice…' : this.statusText);
    let url: string, token: string;
    try {
      ({ url, token } = await fetchToken());
    } catch (err) {
      this.cleanup();
      this.set('error', err instanceof ApiError ? err.message : 'Could not get a voice token');
      return;
    }

    const room = new Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true, stopLocalTrackOnUnpublish: false });
    this.room = room;
    room
      .on(RoomEvent.TrackSubscribed, (track, _pub, p) => this.attach(track, p))
      .on(RoomEvent.TrackUnsubscribed, (_track, _pub, p) => this.detach(p.identity))
      .on(RoomEvent.ParticipantDisconnected, (p) => this.detach(p.identity))
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        this.sfuSpeaking = new Set(speakers.map((s) => s.identity));
      })
      .on(RoomEvent.Reconnecting, () => this.set('reconnecting', 'Voice reconnecting…'))
      .on(RoomEvent.Reconnected, () => this.set('connected', this.connectedText()))
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => this.onDisconnected(reason));

    try {
      await room.connect(url, token, { autoSubscribe: false });
      if (this.local && room.localParticipant.permissions?.canPublish !== false) {
        await room.localParticipant.publishTrack(this.local, { source: Track.Source.Microphone, dtx: true, red: true });
      }
      this.retries = 0;
      this.set('connected', this.connectedText());
      this.applyMic();
    } catch (err) {
      console.error('Voice connect failed', err);
      this.cleanup();
      this.set('error', 'Could not reach the voice server');
    }
  }

  private connectedText() {
    if (!this.hasMic) return this.statusText.includes('listening') ? this.statusText : 'Listening only';
    if (!this.canSpeakHere) return "Can't talk here · listening";
    return this.mode === 'push-to-talk' ? 'Voice on · push to talk' : 'Voice on';
  }

  private onDisconnected(reason?: DisconnectReason) {
    const wasLeaving = this.leaving || reason === DisconnectReason.CLIENT_INITIATED;
    this.cleanup();
    if (wasLeaving) {
      this.set('off', 'Voice off');
      return;
    }
    if (this.retries < 5) {
      const delay = 1000 * 2 ** this.retries++;
      this.set('reconnecting', `Voice dropped — retrying in ${Math.round(delay / 1000)}s`);
      setTimeout(() => {
        if (this.status === 'reconnecting' && !this.leaving) void this.join(this.guildId, this.fetchToken);
      }, delay);
    } else {
      this.set('error', 'Voice disconnected');
    }
  }

  leave() {
    void this.leaveBridge();
    this.leaving = true;
    void this.room?.disconnect();
    this.cleanup();
    this.set('off', 'Voice off');
  }

  private cleanup() {
    void this.leaveBridge();
    for (const id of [...this.chains.keys()]) this.detach(id);
    this.local?.stop();
    this.local = null;
    this.analyser = null;
    this.master?.disconnect();
    this.master = null;
    this.room?.removeAllListeners();
    this.room = null;
    this.hasMic = false;
    this.sfuSpeaking.clear();
    this.lastSpeakingKey = '';
    this.onSpeaking(new Set());
  }

  private attach(track: RemoteTrack, p: RemoteParticipant) {
    if (track.kind !== Track.Kind.Audio || !this.ctx || !this.master) return;
    this.detach(p.identity);
    const stream = new MediaStream([track.mediaStreamTrack]);
    // Chrome only feeds remote WebRTC audio into Web Audio if it's also attached to a media element.
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    void el.play().catch(() => undefined);
    const source = this.ctx.createMediaStreamSource(stream);
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 20000;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const pan = this.ctx.createStereoPanner();
    source.connect(lowpass).connect(gain).connect(pan).connect(this.master);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    this.chains.set(p.identity, { el, source, lowpass, gain, pan, analyser, lastLoud: 0 });
  }

  private detach(identity: string) {
    const c = this.chains.get(identity);
    if (!c) return;
    c.source.disconnect();
    c.analyser.disconnect();
    c.lowpass.disconnect();
    c.gain.disconnect();
    c.pan.disconnect();
    c.el.srcObject = null;
    this.chains.delete(identity);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (!m && this.deafened) this.setDeafened(false);
    this.applyMic();
    this.onChange();
  }

  setDeafened(d: boolean) {
    this.deafened = d;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(d ? 0 : this.volume, this.ctx.currentTime, 0.03);
    this.applyMic();
    this.onChange();
  }

  setPtt(down: boolean) {
    if (this.pttDown === down) return;
    this.pttDown = down;
    this.applyMic();
    this.onChange();
  }

  /** Is our mic actually transmitting right now? */
  get transmitting() {
    return this.hasMic && this.canSpeakHere && !this.muted && !this.deafened && (this.mode === 'voice-activity' || this.pttDown);
  }

  /** The server decided whether we may talk where we're standing. */
  setSpeakPermission(can: boolean, reason: string | null) {
    const regained = can && !this.canSpeakHere;
    this.canSpeakHere = can;
    this.speakBlockReason = reason;
    this.applyMic();
    if (this.status === 'connected') this.statusText = this.connectedText();
    if (regained) {
      if (this.room && this.local) void this.republish(this.room, this.local);
      if (this.bridgeRoom && this.local) void this.republishBridge(this.bridgeRoom);
    }
    this.onChange();
  }

  /** Wait (briefly) for LiveKit to grant publishing again, then put the mic back if it was removed. */
  private async waitForPublish(room: Room): Promise<boolean> {
    for (let i = 0; i < 30 && !room.localParticipant.permissions?.canPublish; i++) await new Promise((r) => setTimeout(r, 200));
    return Boolean(room.localParticipant.permissions?.canPublish) && this.canSpeakHere;
  }

  private async republish(room: Room, track: LocalAudioTrack) {
    if (!(await this.waitForPublish(room)) || this.room !== room || this.local !== track) return;
    const published = [...room.localParticipant.audioTrackPublications.values()].some((p) => p.track === track);
    try {
      if (!published) await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone, dtx: true, red: true });
    } catch (err) {
      console.warn('Could not republish microphone', err);
    }
    this.applyMic();
  }

  private async republishBridge(room: Room) {
    if (!(await this.waitForPublish(room)) || this.bridgeRoom !== room || !this.local) return;
    this.bridgeCanSpeak = true;
    if (!this.bridgeTrack) this.bridgeTrack = new LkLocalAudioTrack(this.local.mediaStreamTrack.clone(), undefined, true);
    const track = this.bridgeTrack;
    const published = [...room.localParticipant.audioTrackPublications.values()].some((p) => p.track === track);
    try {
      if (!published) await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone, dtx: true, red: true });
    } catch (err) {
      console.warn('Could not republish to the Discord call', err);
    }
    this.applyMic();
    this.onBridgeChange();
  }

  private applyMic() {
    if (this.local) {
      if (this.transmitting) void this.local.unmute();
      else void this.local.mute();
    }
    if (this.bridgeTrack) {
      if (this.transmitting && this.bridgeCanSpeak) void this.bridgeTrack.unmute();
      else void this.bridgeTrack.mute();
    }
  }

  /**
   * Join the Discord call for a voice gazebo. Discord users arrive as tracks named
   * `discord:<userId>` from the bridge participant; they play un-spatialised, like a call.
   * Our mic is published as a clone of the proximity-voice track so mute/PTT apply to both.
   */
  async joinBridge(channelId: string, fetchToken: () => Promise<{ url: string; token: string; canSpeak: boolean }>) {
    if (!this.ctx || !this.master || this.bridgeJoining || this.bridgeChannelId === channelId) return;
    await this.leaveBridge();
    this.bridgeJoining = true;
    try {
      const { url, token, canSpeak } = await fetchToken();
      const room = new Room({ adaptiveStream: false, dynacast: false, stopLocalTrackOnUnpublish: false });
      this.bridgeRoom = room;
      const subscribeIfDiscord = (pub: { setSubscribed(b: boolean): void; kind: Track.Kind }, identity: string) => {
        if (identity === 'hearthvale-bridge' && pub.kind === Track.Kind.Audio) pub.setSubscribed(true);
      };
      room
        .on(RoomEvent.TrackPublished, (pub, p) => subscribeIfDiscord(pub, p.identity))
        .on(RoomEvent.TrackSubscribed, (track, pub) => this.attachBridge(track, pub.trackName))
        .on(RoomEvent.TrackUnsubscribed, (_t, pub) => this.detachBridge(pub.trackName))
        .on(RoomEvent.Disconnected, () => {
          if (this.bridgeRoom === room) void this.leaveBridge();
        });
      await room.connect(url, token, { autoSubscribe: false });
      for (const p of room.remoteParticipants.values()) for (const pub of p.trackPublications.values()) subscribeIfDiscord(pub, p.identity);
      this.bridgeChannelId = channelId;
      this.bridgeCanSpeak = canSpeak;
      if (this.local && canSpeak) {
        this.bridgeTrack = new LkLocalAudioTrack(this.local.mediaStreamTrack.clone(), undefined, true);
        await room.localParticipant.publishTrack(this.bridgeTrack, { source: Track.Source.Microphone, dtx: true, red: true });
      }
      this.applyMic();
    } catch (err) {
      console.warn('Could not join Discord voice bridge', err);
      await this.leaveBridge();
      throw err;
    } finally {
      this.bridgeJoining = false;
      this.onBridgeChange();
    }
  }

  async leaveBridge() {
    const room = this.bridgeRoom;
    this.bridgeRoom = null;
    for (const id of [...this.bridgeChains.keys()]) this.detachBridge(id);
    this.bridgeTrack?.stop();
    this.bridgeTrack = null;
    const had = this.bridgeChannelId !== null;
    this.bridgeChannelId = null;
    this.bridgeCanSpeak = false;
    if (room) await room.disconnect().catch(() => undefined);
    if (had) this.onBridgeChange();
  }

  private attachBridge(track: RemoteTrack, name: string) {
    if (track.kind !== Track.Kind.Audio || !this.ctx || !this.master) return;
    this.detachBridge(name);
    const stream = new MediaStream([track.mediaStreamTrack]);
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    void el.play().catch(() => undefined);
    const source = this.ctx.createMediaStreamSource(stream);
    const gain = this.ctx.createGain();
    gain.gain.value = 1;
    source.connect(gain).connect(this.master);
    this.bridgeChains.set(name, { el, source, gain });
  }

  private detachBridge(name: string) {
    const c = this.bridgeChains.get(name);
    if (!c) return;
    c.source.disconnect();
    c.gain.disconnect();
    c.el.srcObject = null;
    this.bridgeChains.delete(name);
  }

  private rms(an: AnalyserNode): number {
    an.getByteTimeDomainData(this.analyserBuf);
    let sum = 0;
    for (const v of this.analyserBuf) sum += ((v - 128) / 128) ** 2;
    return Math.sqrt(sum / this.analyserBuf.length);
  }

  /** Current mic input level 0..1 (for the little meter). */
  level(): number {
    if (!this.analyser || !this.transmitting) return 0;
    return Math.min(1, this.rms(this.analyser) * 4);
  }

  /** Local voice-activity detection (with a short hold) merged with the SFU's view. */
  private detectSpeaking() {
    const now = performance.now();
    const ids = new Set(this.sfuSpeaking);
    for (const [id, c] of this.chains) {
      if (this.rms(c.analyser) > 0.015) c.lastLoud = now;
      if (now - c.lastLoud < 350) ids.add(id);
    }
    if (this.analyser && this.transmitting && this.rms(this.analyser) > 0.012) this.localLoudAt = now;
    if (!this.transmitting) ids.delete(this.selfId);
    else if (now - this.localLoudAt < 350) ids.add(this.selfId);
    const key = [...ids].sort().join(',');
    if (key !== this.lastSpeakingKey) {
      this.lastSpeakingKey = key;
      this.onSpeaking(ids);
    }
  }

  /**
   * Per-frame spatialisation. `speakers` holds the latest known positions of other players.
   */
  update(listener: Listener, speakers: Map<string, SpeakerPos>) {
    const room = this.room;
    const ctx = this.ctx;
    if (!room || !ctx) return;
    this.detectSpeaking();
    const now = ctx.currentTime;
    const rx = Math.cos(listener.yaw), rz = -Math.sin(listener.yaw);

    for (const p of room.remoteParticipants.values()) {
      const pub = p.getTrackPublication(Track.Source.Microphone);
      const pos = speakers.get(p.identity);
      const dist = pos ? Math.hypot(pos.x - listener.x, pos.z - listener.z) : Infinity;
      const sameRoom = !!pos && pos.zone === listener.zone && enclosed(pos.zone);
      const want = !this.deafened && (dist < VOICE.SUBSCRIBE_DISTANCE || sameRoom);
      if (pub && pub.isDesired !== want) pub.setSubscribed(want);

      const chain = this.chains.get(p.identity);
      if (!chain || !pos) continue;

      let g: number;
      if (sameRoom) g = 1 - Math.min(0.3, dist / 40);
      else if (dist <= VOICE.REF_DISTANCE) g = 1;
      else if (dist >= VOICE.MAX_DISTANCE) g = 0;
      else g = ((VOICE.MAX_DISTANCE - dist) / (VOICE.MAX_DISTANCE - VOICE.REF_DISTANCE)) ** 1.6;

      const occluded = pos.zone !== listener.zone && (pos.zone.startsWith('house:') || listener.zone.startsWith('house:'));
      if (occluded) g *= VOICE.OCCLUSION_GAIN;
      chain.gain.gain.setTargetAtTime(g, now, 0.08);
      chain.lowpass.frequency.setTargetAtTime(occluded ? VOICE.OCCLUSION_LOWPASS_HZ : 20000, now, 0.1);

      // Stereo direction relative to where the camera faces.
      let pan = 0;
      if (dist > 0.5) pan = ((pos.x - listener.x) * rx + (pos.z - listener.z) * rz) / dist;
      chain.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)) * (sameRoom ? 0.4 : 0.85), now, 0.08);
    }
  }

  /** Names of Discord-bridge tracks currently playing (for diagnostics/tests). */
  debugBridge(): string[] {
    return [...this.bridgeChains.keys()];
  }

  /** Current per-speaker audio parameters (for diagnostics/tests). */
  debugChains(): Record<string, { gain: number; pan: number; lowpass: number }> {
    const out: Record<string, { gain: number; pan: number; lowpass: number }> = {};
    for (const [id, c] of this.chains) out[id] = { gain: c.gain.gain.value, pan: c.pan.pan.value, lowpass: c.lowpass.frequency.value };
    return out;
  }

  static async devices(): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return { inputs: all.filter((d) => d.kind === 'audioinput'), outputs: all.filter((d) => d.kind === 'audiooutput') };
    } catch {
      return { inputs: [], outputs: [] };
    }
  }

  static get canPickOutput() {
    return typeof (AudioContext.prototype as { setSinkId?: unknown }).setSinkId === 'function';
  }
}
