import { EventEmitter } from 'node:events';
import {
  AudioPlayerStatus, EndBehaviorType, NoSubscriberBehavior, StreamType, VoiceConnectionStatus,
  createAudioPlayer, createAudioResource, entersState, joinVoiceChannel,
  type AudioPlayer, type VoiceConnection,
} from '@discordjs/voice';
import {
  AudioFrame, AudioSource, AudioStream, LocalAudioTrack, Room, RoomEvent, TrackKind, TrackPublishOptions, TrackSource,
  type RemoteTrack,
} from '@livekit/rtc-node';
import { AccessToken, RoomServiceClient, TrackSource as GrantSource } from 'livekit-server-sdk';
import OpusScript from 'opusscript';
import { Readable } from 'node:stream';
import { ChannelType, PermissionFlagsBits, type Guild, type VoiceBasedChannel } from 'discord.js';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.ts';
import type { DiscordBot } from '../discord/bot.ts';

/**
 * Discord voice ⇄ world bridge.
 *
 * The Hearthvale bot joins a Discord voice channel and relays audio both ways with a dedicated
 * LiveKit room (`guild-<g>-vc-<channel>`):
 *
 *   Discord user speaks → bot receives Opus (DAVE-decrypted by @discordjs/voice) → decode →
 *   one LiveKit track per Discord user, named `discord:<userId>` → players standing in that
 *   channel's gazebo hear them (and see their NPC's speaking ring).
 *
 *   Players in the gazebo speak → bridge subscribes in LiveKit → mix → Opus → bot plays it into
 *   the Discord voice channel.
 *
 * A bot can only be in one voice channel per guild, so each guild bridges one channel at a time
 * (the first occupied gazebo wins; others report "busy"). The bridge starts when someone enters
 * a gazebo and stops ~20 s after the gazebo empties.
 *
 * Receiving audio is not officially documented by Discord, so failures are reported as a
 * bridge "error" state rather than breaking anything else.
 */

export const BRIDGE_IDENTITY = 'hearthvale-bridge';
const SAMPLE_RATE = 48000;
const FRAME = 960; // 20 ms @ 48 kHz
const IDLE_STOP_MS = 20_000;
const MAX_QUEUE_SAMPLES = FRAME * 6; // drop anything older than ~120 ms to keep latency low

import type { BridgeInfo } from '@hearthvale/shared';

export type BridgeStatus = BridgeInfo['status'];

export interface BridgeEvents {
  state: [guildId: string, info: BridgeInfo | null];
  speaking: [guildId: string, channelId: string, userId: string, speaking: boolean];
}

export function bridgeRoomName(guildId: string, channelId: string) {
  return `guild-${guildId}-vc-${channelId}`;
}

/** Per-participant PCM queue (mono Int16 @ 48 kHz). */
class PcmQueue {
  private chunks: Int16Array[] = [];
  private offset = 0;
  private size = 0;

  push(data: Int16Array) {
    this.chunks.push(data);
    this.size += data.length;
    while (this.size - this.offset > MAX_QUEUE_SAMPLES && this.chunks.length > 1) {
      const dropped = this.chunks.shift()!;
      this.size -= dropped.length;
      this.offset = Math.max(0, this.offset - dropped.length);
    }
  }

  get available() {
    return this.size - this.offset;
  }

  /** Add up to FRAME samples into `mix`; returns true if any audio was read. */
  mixInto(mix: Int32Array): boolean {
    if (this.available <= 0) return false;
    let i = 0;
    while (i < FRAME && this.chunks.length) {
      const c = this.chunks[0]!;
      const n = Math.min(FRAME - i, c.length - this.offset);
      for (let k = 0; k < n; k++) mix[i + k]! += c[this.offset + k]!;
      i += n;
      this.offset += n;
      if (this.offset >= c.length) {
        this.chunks.shift();
        this.size -= c.length;
        this.offset = 0;
      }
    }
    return true;
  }
}

class Bridge {
  status: BridgeStatus = 'starting';
  error?: string;
  private connection: VoiceConnection | null = null;
  private player: AudioPlayer | null = null;
  private room: Room | null = null;
  private encoder = new OpusScript(SAMPLE_RATE, 2, OpusScript.Application.VOIP);
  private inbound = new Map<string, PcmQueue>();
  private outbound = new Map<string, { source: AudioSource; decoder: OpusScript; stream: Readable }>();
  private lastWorldAudio = 0;
  private activityTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    readonly guild: Guild,
    readonly channel: VoiceBasedChannel,
    private config: Config,
    private log: FastifyBaseLogger,
    private emitSpeaking: (userId: string, on: boolean) => void,
  ) {}

  async start() {
    // 1. LiveKit side
    const at = new AccessToken(this.config.LIVEKIT_API_KEY, this.config.LIVEKIT_API_SECRET, {
      identity: BRIDGE_IDENTITY, name: `Discord · ${this.channel.name}`, ttl: '12h',
    });
    at.addGrant({ room: bridgeRoomName(this.guild.id, this.channel.id), roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
    this.room = new Room();
    this.room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => this.onWorldTrack(track, participant.identity));
    this.room.on(RoomEvent.ParticipantDisconnected, (p) => this.inbound.delete(p.identity));
    await this.room.connect(this.config.LIVEKIT_SERVER_URL, await at.toJwt(), { autoSubscribe: true, dynacast: false });

    // 2. Discord side
    this.connection = joinVoiceChannel({
      channelId: this.channel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });
    await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Moved between channels or brief network blip: wait for it to recover.
        await Promise.race([
          entersState(this.connection!, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection!, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.fail('Disconnected from Discord voice');
      }
    });

    this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play, maxMissedFrames: Number.POSITIVE_INFINITY } });
    this.player.on('error', (err) => this.log.warn({ err }, 'Bridge audio player error'));
    this.player.play(createAudioResource(this.mixStream(), { inputType: StreamType.Opus }));
    this.player.pause(true);
    this.connection.subscribe(this.player);

    const receiver = this.connection.receiver;
    receiver.speaking.on('start', (userId) => {
      if (userId === this.guild.client.user?.id) return;
      this.emitSpeaking(userId, true);
      void this.receiveFrom(userId);
    });
    receiver.speaking.on('end', (userId) => this.emitSpeaking(userId, false));

    // Wake the Discord-side player when world audio arrives; pause it when idle so the bot
    // doesn't show a permanent "speaking" ring in Discord.
    this.activityTimer = setInterval(() => {
      if (!this.player) return;
      const talking = Date.now() - this.lastWorldAudio < 400;
      const paused = this.player.state.status === AudioPlayerStatus.Paused;
      if (talking && paused) this.player.unpause();
      else if (!talking && !paused) this.player.pause(true);
    }, 40);

    this.status = 'active';
  }

  /** Player audio from the world (LiveKit) → PCM queue for the Discord mix. */
  private onWorldTrack(track: RemoteTrack, identity: string) {
    if (track.kind !== TrackKind.KIND_AUDIO || identity === BRIDGE_IDENTITY) return;
    const queue = new PcmQueue();
    this.inbound.set(identity, queue);
    const stream = new AudioStream(track, { sampleRate: SAMPLE_RATE, numChannels: 1 });
    void (async () => {
      try {
        for await (const frame of stream) {
          if (this.stopped || this.inbound.get(identity) !== queue) break;
          // Cheap VAD so silence doesn't keep the Discord player awake.
          let peak = 0;
          for (let i = 0; i < frame.data.length; i += 8) peak = Math.max(peak, Math.abs(frame.data[i]!));
          if (peak > 600) this.lastWorldAudio = Date.now();
          queue.push(new Int16Array(frame.data));
        }
      } catch (err) {
        if (!this.stopped) this.log.debug({ err }, 'World audio stream ended');
      }
    })();
  }

  /** Objectmode stream of Opus packets: the player pulls one every 20 ms and we mix on demand. */
  private mixStream(): Readable {
    const mix = new Int32Array(FRAME);
    const pcm = Buffer.alloc(FRAME * 4); // stereo s16le
    const stream: Readable = new Readable({
      objectMode: true,
      highWaterMark: 1,
      read: () => {
        mix.fill(0);
        for (const q of this.inbound.values()) q.mixInto(mix);
        for (let i = 0; i < FRAME; i++) {
          const v = Math.max(-32768, Math.min(32767, mix[i]!));
          pcm.writeInt16LE(v, i * 4);
          pcm.writeInt16LE(v, i * 4 + 2);
        }
        try {
          stream.push(this.encoder.encode(pcm, FRAME));
        } catch (err) {
          this.log.warn({ err }, 'Opus encode failed');
        }
      },
    });
    return stream;
  }

  /** A Discord user started talking: stream their decoded audio into their own LiveKit track. */
  private async receiveFrom(userId: string) {
    if (!this.connection || !this.room || this.outbound.has(userId)) return;
    const source = new AudioSource(SAMPLE_RATE, 1, 1000);
    const track = LocalAudioTrack.createAudioTrack(`discord:${userId}`, source);
    const decoder = new OpusScript(SAMPLE_RATE, 2, OpusScript.Application.VOIP);
    const stream = this.connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.Manual } });
    this.outbound.set(userId, { source, decoder, stream });
    try {
      await this.room.localParticipant!.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE, dtx: true }));
    } catch (err) {
      this.log.warn({ err, userId }, 'Could not publish Discord user audio to LiveKit');
    }
    stream.on('data', (packet: Buffer) => {
      try {
        const out = decoder.decode(packet);
        const stereo = new Int16Array(out.buffer, out.byteOffset, out.byteLength / 2);
        const mono = new Int16Array(stereo.length / 2);
        for (let i = 0; i < mono.length; i++) mono[i] = (stereo[i * 2]! + stereo[i * 2 + 1]!) >> 1;
        void source.captureFrame(new AudioFrame(mono, SAMPLE_RATE, 1, mono.length)).catch(() => undefined);
      } catch {
        /* corrupt / undecryptable packet: skip */
      }
    });
    stream.on('error', (err) => this.log.debug({ err, userId }, 'Discord receive stream error'));
  }

  private fail(message: string) {
    this.status = 'error';
    this.error = message;
    this.log.warn({ guild: this.guild.name, channel: this.channel.name }, `Voice bridge failed: ${message}`);
    void this.stop();
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.activityTimer) clearInterval(this.activityTimer);
    for (const o of this.outbound.values()) {
      o.stream.destroy();
      o.decoder.delete();
      void o.source.close();
    }
    this.outbound.clear();
    this.inbound.clear();
    this.player?.stop(true);
    try {
      this.connection?.destroy();
    } catch {
      /* already destroyed */
    }
    this.encoder.delete();
    await this.room?.disconnect().catch(() => undefined);
  }
}

/** Owns at most one bridge per guild and starts/stops them based on gazebo occupancy. */
export class VoiceBridgeManager extends EventEmitter<BridgeEvents> {
  private bridges = new Map<string, Bridge>();
  private occupancy = new Map<string, Map<string, number>>(); // guild → channel → players
  private stopTimers = new Map<string, NodeJS.Timeout>();
  private roomService: RoomServiceClient | null;

  constructor(private config: Config, private bot: DiscordBot, private log: FastifyBaseLogger) {
    super();
    this.roomService = this.enabled
      ? new RoomServiceClient(config.LIVEKIT_SERVER_URL.replace(/^ws/, 'http'), config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET)
      : null;
    bot.on('guildRemoved', (id) => void this.stopGuild(id));
  }

  get enabled() {
    return this.config.voiceEnabled && this.config.DISCORD_VOICE_BRIDGE;
  }

  info(guildId: string): BridgeInfo | null {
    const b = this.bridges.get(guildId);
    return b ? { channelId: b.channel.id, status: b.status, error: b.error } : null;
  }

  /** Called by the realtime layer whenever the number of players in a gazebo changes. */
  setOccupancy(guildId: string, channelId: string, count: number) {
    if (!this.enabled) return;
    let g = this.occupancy.get(guildId);
    if (!g) this.occupancy.set(guildId, (g = new Map()));
    if (count > 0) g.set(channelId, count);
    else g.delete(channelId);

    const current = this.bridges.get(guildId);
    if (current) {
      if (g.has(current.channel.id)) {
        clearTimeout(this.stopTimers.get(guildId));
        this.stopTimers.delete(guildId);
      } else if (!this.stopTimers.has(guildId)) {
        this.stopTimers.set(guildId, setTimeout(() => {
          this.stopTimers.delete(guildId);
          void this.stopGuild(guildId).then(() => this.maybeStart(guildId));
        }, IDLE_STOP_MS));
      }
      return;
    }
    this.maybeStart(guildId);
  }

  private maybeStart(guildId: string) {
    if (this.bridges.has(guildId)) return;
    const occupied = this.occupancy.get(guildId);
    const channelId = occupied?.keys().next().value;
    if (!channelId) return;
    const guild = this.bot.guild(guildId);
    const channel = guild?.channels.cache.get(channelId);
    if (!guild || !channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) return;

    const me = guild.members.me;
    const perms = me ? channel.permissionsFor(me) : null;
    const bridge = new Bridge(guild, channel, this.config, this.log, (userId, on) => this.emit('speaking', guildId, channelId, userId, on));
    this.bridges.set(guildId, bridge);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      bridge.status = 'error';
      bridge.error = 'The Hearthvale bot needs Connect and Speak permissions in this voice channel.';
      this.emit('state', guildId, this.info(guildId));
      return;
    }
    this.emit('state', guildId, this.info(guildId));
    this.log.info({ guild: guild.name, channel: channel.name }, 'Starting Discord voice bridge');
    bridge.start().then(
      () => this.emit('state', guildId, this.info(guildId)),
      (err: Error) => {
        this.log.warn({ err }, 'Voice bridge failed to start');
        bridge.status = 'error';
        bridge.error = 'Could not connect to Discord voice.';
        void bridge.stop();
        this.emit('state', guildId, this.info(guildId));
      },
    );
  }

  async stopGuild(guildId: string) {
    const b = this.bridges.get(guildId);
    if (!b) return;
    this.bridges.delete(guildId);
    await b.stop();
    this.emit('state', guildId, null);
    this.log.info({ guild: b.guild.name }, 'Stopped Discord voice bridge');
  }

  /** Mint a token for a player to join a bridge room (caller has already checked permissions & position). */
  async playerToken(guildId: string, channelId: string, userId: string, name: string, canSpeak: boolean): Promise<string> {
    const at = new AccessToken(this.config.LIVEKIT_API_KEY, this.config.LIVEKIT_API_SECRET, { identity: userId, name, ttl: '1h' });
    at.addGrant({
      room: bridgeRoomName(guildId, channelId),
      roomJoin: true,
      canSubscribe: true,
      canPublish: canSpeak,
      canPublishSources: [GrantSource.MICROPHONE],
      canPublishData: false,
    });
    return at.toJwt();
  }

  /** Remove a player from a bridge room (they walked out of the gazebo). */
  async kick(guildId: string, channelId: string, userId: string) {
    if (!this.roomService) return;
    try {
      await this.roomService.removeParticipant(bridgeRoomName(guildId, channelId), userId);
    } catch {
      /* not in the room */
    }
  }

  async shutdown() {
    await Promise.all([...this.bridges.keys()].map((g) => this.stopGuild(g)));
  }
}
