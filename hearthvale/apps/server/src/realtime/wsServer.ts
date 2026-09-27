import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import {
  ClientMessageSchema, DEFAULT_APPEARANCE,
  type ClientMessage, type ServerMessage,
} from '@hearthvale/shared';
import type { Config } from '../config.ts';
import type { Repos } from '../db/repos.ts';
import type { SessionService } from '../auth/sessions.ts';
import type { DiscordBot } from '../discord/bot.ts';
import { ChatError, type MessageService } from '../discord/messages.ts';
import { NotMemberError, type PermissionService } from '../discord/permissions.ts';
import type { WorldService } from '../world/worldService.ts';
import { bridgeRoomName, type VoiceBridgeManager } from '../voice/bridge.ts';
import { worldRoomName, type VoiceTokenIssuer } from '../voice/livekit.ts';
import { GuildRoom, type Connection } from './guildRoom.ts';
import { KeyedLimiter, TokenBucket } from './rateLimit.ts';

interface Deps {
  config: Config;
  log: FastifyBaseLogger;
  sessions: SessionService;
  repos: Repos;
  bot: DiscordBot;
  perms: PermissionService;
  messages: MessageService;
  world: WorldService;
  bridges: VoiceBridgeManager;
  voice: VoiceTokenIssuer;
}

/** Per-connection voice permission state. `chain` keeps LiveKit updates in order. */
interface SpeakState {
  can: boolean | null;
  reason: string | null;
  seq: number;
  chain: Promise<void>;
}

const GUILD_ID = /^\d{5,25}$/;

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/**
 * Real-time hub: authenticates WebSocket upgrades from the session cookie, puts players into
 * per-guild rooms, and routes Discord gateway events to the right rooms.
 */
export class RealtimeServer {
  private wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  private rooms = new Map<string, GuildRoom>();
  private chatLimiter: KeyedLimiter;
  private speakStates = new WeakMap<Connection, SpeakState>();
  private speakTimer: NodeJS.Timeout;

  constructor(private d: Deps) {
    this.chatLimiter = new KeyedLimiter(d.config.CHAT_RATE_LIMIT, d.config.CHAT_RATE_WINDOW * 1000);
    this.wireDiscord();
    // Timeouts and role changes don't reach us as events (no privileged member intent), so
    // re-check everyone's voice permission periodically (member data is cached for 60s).
    this.speakTimer = setInterval(() => {
      for (const room of this.rooms.values()) for (const c of room.players.values()) void this.updateSpeak(room, c);
    }, 30_000);
  }

  get stats() {
    return { rooms: this.rooms.size, players: [...this.rooms.values()].reduce((n, r) => n + r.size, 0) };
  }

  /** Attach to the HTTP server's `upgrade` event. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') return socket.destroy();

    // Cross-site WebSocket hijacking protection: only our own origin may connect with cookies.
    const origin = req.headers.origin;
    if (origin !== new URL(this.d.config.APP_ORIGIN).origin) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      return socket.destroy();
    }
    const auth = this.d.sessions.fromCookieHeader(req.headers.cookie);
    const guildId = url.searchParams.get('guild') ?? '';
    if (!auth || !GUILD_ID.test(guildId)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.onConnection(ws, auth.user.id, guildId).catch((err) => {
        this.d.log.error({ err }, 'WebSocket session failed');
        ws.close(1011, 'internal error');
      });
    });
  }

  private room(guildId: string): GuildRoom {
    let room = this.rooms.get(guildId);
    if (!room) {
      room = new GuildRoom(guildId, (r) => this.rooms.delete(r.guildId));
      room.onPlazaChange = (c, prev, next) => this.onPlazaChange(room!, c, prev, next);
      room.onZoneChange = (c) => void this.updateSpeak(room!, c);
      this.rooms.set(guildId, room);
    }
    return room;
  }

  private async onConnection(ws: WebSocket, userId: string, guildId: string) {
    const { perms, world, repos, messages, log } = this.d;

    // Buffer messages that arrive while we verify membership.
    const early: string[] = [];
    const earlyHandler = (data: Buffer) => early.length < 20 && early.push(data.toString());
    ws.on('message', earlyHandler);

    let guild, member;
    try {
      ({ guild, member } = await perms.member(guildId, userId, true));
    } catch (err) {
      const message = err instanceof NotMemberError ? err.message : 'Could not verify your Discord membership.';
      send(ws, { t: 'error', code: 'forbidden', message });
      ws.close(4003, 'forbidden');
      return;
    }
    const view = world.forMember(guild, member);
    const full = world.full(guildId);
    if (!view || !full) {
      send(ws, { t: 'error', code: 'unavailable', message: 'This world is still being built. Try again in a moment.' });
      ws.close(4004, 'unavailable');
      return;
    }

    const user = repos.users.get(userId);
    const spawn = full.layout.spawn;
    const conn: Connection = {
      ws,
      info: {
        id: userId,
        name: member.displayName,
        avatar: member.displayAvatarURL({ size: 64, extension: 'png' }),
        appearance: repos.characters.get(userId) ?? DEFAULT_APPEARANCE,
        voice: { muted: true, deafened: false, connected: false },
        x: spawn.x + (Math.random() - 0.5) * 6,
        y: 0,
        z: spawn.z + (Math.random() - 0.5) * 6,
        ry: spawn.ry,
        a: 'idle',
      },
      viewable: new Set(this.viewableChannels(view.spec)),
      known: new Set(),
      lastMoveAt: Date.now(),
      moved: true,
      plaza: null,
      house: null,
    };
    const room = this.room(guildId);
    room.worldRadius = full.layout.radius;
    room.plazas = full.layout.plazas;
    room.houses = full.layout.houses;
    room.add(conn);
    repos.activePlayers.join(userId, guildId);
    log.info({ user: user?.username, guild: guild.name, players: room.size }, 'Player joined world');

    send(ws, {
      t: 'welcome',
      self: conn.info,
      guild: { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128, extension: 'png' }) },
      world: view.spec,
      version: view.version,
      npcs: room.npcsFor(conn, messages.recentActivity(conn.viewable)),
      discordVoice: world.discordVoice(guild, member),
      canSend: view.canSend,
      bridge: this.d.bridges.info(guildId),
    });
    void this.updateSpeak(room, conn);
    // Tell everyone's NPC lists this person is now "really" here.
    this.refreshNpcs(guildId);

    // Warm webhooks for sendable channels so we can recognise our own echoes.
    for (const id of view.canSend.slice(0, 50)) void messages.prepareChannel(guildId, id);

    const msgBucket = new TokenBucket(60, 1000); // generous per-socket flood guard
    const handle = (raw: string) => {
      if (!msgBucket.take()) {
        ws.close(4008, 'rate limited');
        return;
      }
      let parsed: ClientMessage;
      try {
        const r = ClientMessageSchema.safeParse(JSON.parse(raw));
        if (!r.success) return;
        parsed = r.data;
      } catch {
        return;
      }
      this.onMessage(room, conn, parsed).catch((err) => log.error({ err }, 'Error handling client message'));
    };

    ws.off('message', earlyHandler);
    ws.on('message', (data) => handle(data.toString()));
    for (const raw of early) handle(raw);

    ws.on('close', () => {
      if (room.players.get(userId)?.ws === ws && conn.plaza) {
        const prev = conn.plaza;
        conn.plaza = null;
        this.onPlazaChange(room, conn, prev, null);
      }
      room.remove(userId, ws);
      if (!room.players.has(userId)) {
        repos.activePlayers.leave(userId, guildId);
        this.refreshNpcs(guildId);
      }
      log.info({ user: user?.username, guild: guild.name }, 'Player left world');
    });

    // Keep-alive so proxies don't drop idle sockets and dead peers are detected.
    let alive = true;
    ws.on('pong', () => (alive = true));
    const ka = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 25_000);
    ws.on('close', () => clearInterval(ka));
  }

  /** Which gazebo (Discord voice channel) a player is standing in — used to authorise bridge tokens. */
  playerPlaza(guildId: string, userId: string): string | null {
    return this.rooms.get(guildId)?.players.get(userId)?.plaza ?? null;
  }

  private onPlazaChange(room: GuildRoom, c: Connection, prev: string | null, next: string | null) {
    const count = (id: string) => [...room.players.values()].filter((p) => p.plaza === id).length;
    if (prev) {
      this.d.bridges.setOccupancy(room.guildId, prev, count(prev));
      // Walking out of the gazebo removes you from the Discord call immediately.
      void this.d.bridges.kick(room.guildId, prev, c.info.id);
    }
    if (next) this.d.bridges.setOccupancy(room.guildId, next, count(next));
  }

  /** Why this user can't talk in a house/gazebo (`channelId`) or out in the open (null); null if they can. */
  private async speakBlock(guildId: string, userId: string, channelId: string | null): Promise<string | null> {
    const { guild, member } = await this.d.perms.member(guildId, userId);
    const channel = channelId ? guild.channels.cache.get(channelId) ?? null : null;
    return this.d.perms.speakBlock(member, channel);
  }

  /** For minting voice tokens: may this player talk right now, where they're standing? */
  async canSpeakNow(guildId: string, userId: string): Promise<boolean> {
    const c = this.rooms.get(guildId)?.players.get(userId);
    if (!c) return false;
    return (await this.speakBlock(guildId, userId, c.house ?? c.plaza)) === null;
  }

  /**
   * Re-evaluate whether a player may talk where they are. On a change, tell their client and
   * enforce it in LiveKit (revoking publish unpublishes their mic), so a modified client can't
   * talk anyway. `force` re-applies the LiveKit permission even if nothing changed.
   */
  private async updateSpeak(room: GuildRoom, c: Connection, force = false) {
    let st = this.speakStates.get(c);
    if (!st) this.speakStates.set(c, (st = { can: null, reason: null, seq: 0, chain: Promise.resolve() }));
    const seq = ++st.seq;
    let reason: string | null;
    try {
      reason = await this.speakBlock(room.guildId, c.info.id, c.house ?? c.plaza);
    } catch {
      reason = 'Could not verify your Discord permissions.';
    }
    if (seq !== st.seq || room.players.get(c.info.id) !== c) return; // superseded
    const can = reason === null;
    const changed = can !== st.can || reason !== st.reason;
    st.can = can;
    st.reason = reason;
    if (changed) send(c.ws, { t: 'voicePermission', canSpeak: can, reason });
    if (!changed && !force) return;
    const plaza = c.plaza;
    st.chain = st.chain.then(async () => {
      await this.d.voice.setCanPublish(worldRoomName(room.guildId), c.info.id, can);
      if (plaza) await this.d.voice.setCanPublish(bridgeRoomName(room.guildId, plaza), c.info.id, can);
    });
  }

  private viewableChannels(spec: { towns: { buildings: { channelId: string; active: boolean }[] }[] }): string[] {
    return spec.towns.flatMap((t) => t.buildings.filter((b) => b.active).map((b) => b.channelId));
  }

  private async onMessage(room: GuildRoom, conn: Connection, msg: ClientMessage) {
    const { repos, perms, messages } = this.d;
    switch (msg.t) {
      case 'move':
        room.move(conn.info.id, msg.x, msg.y, msg.z, msg.ry, msg.a);
        break;
      case 'appearance':
        repos.characters.set(conn.info.id, msg.appearance);
        room.setAppearance(conn.info.id, msg.appearance);
        break;
      case 'voice': {
        const joined = msg.connected && !conn.info.voice.connected;
        room.setVoice(conn.info.id, { muted: msg.muted, deafened: msg.deafened, connected: msg.connected });
        // Their token may predate a permission change; make LiveKit match the current state.
        if (joined) void this.updateSpeak(room, conn, true);
        break;
      }
      case 'ping':
        send(conn.ws, { t: 'pong', n: msg.n });
        break;
      case 'chat': {
        const ack = (ok: boolean, error?: string, messageId?: string) =>
          send(conn.ws, { t: 'chatAck', nonce: msg.nonce, ok, error, messageId });
        if (!this.chatLimiter.take(conn.info.id)) return ack(false, "You're sending messages too quickly — take a breath.");
        try {
          // Always re-check membership/permissions against fresh Discord data before posting.
          const { member } = await perms.member(room.guildId, conn.info.id, true);
          const chat = await messages.send(room.guildId, msg.channelId, member, msg.content);
          ack(true, undefined, chat.id);
          messages.ingest(chat, false);
          room.deliverMessage(chat);
        } catch (err) {
          if (err instanceof ChatError || err instanceof NotMemberError) return ack(false, err.message);
          this.d.log.error({ err }, 'Failed to send message to Discord');
          ack(false, 'Discord did not accept the message. Please try again.');
        }
        break;
      }
    }
  }

  private refreshNpcs(guildId: string) {
    const room = this.rooms.get(guildId);
    if (!room) return;
    const all = this.d.messages.recentActivity(new Set([...room.players.values()].flatMap((c) => [...c.viewable])));
    room.broadcast((c) => ({ t: 'npcs', npcs: room.npcsFor(c, all) }));
  }

  private wireDiscord() {
    const { bot, messages, world, perms, bridges } = this.d;

    bridges.on('state', (guildId, bridge) => {
      this.rooms.get(guildId)?.broadcast(() => ({ t: 'bridge', bridge }));
    });
    bridges.on('speaking', (guildId, channelId, userId, speaking) => {
      this.rooms.get(guildId)?.broadcast((c) => (c.viewable.has(channelId) ? { t: 'discordSpeaking', channelId, userId, speaking } : null));
    });

    bot.on('message', (m) => {
      const room = this.rooms.get(m.guildId!);
      // Skip our own echoes: world messages are delivered directly when they're sent.
      if (messages.isOwnWebhook(m) || m.author.id === bot.botUserId) return;
      const chat = messages.toChatMessage(m);
      messages.ingest(chat, m.author.bot);
      if (!room) return;
      room.deliverMessage(chat);
      // A new speaker in a channel may add an NPC.
      if (!m.author.bot && !room.players.has(m.author.id)) this.refreshNpcs(room.guildId);
    });

    bot.on('messageDeleted', (m) => {
      messages.removeFromCache(m.channelId, m.id);
      this.rooms.get(m.guildId!)?.deliverDelete(m.channelId, m.id);
    });

    bot.on('voiceChanged', (guildId) => {
      const room = this.rooms.get(guildId);
      const guild = bot.guild(guildId);
      if (!room || !guild) return;
      void Promise.all([...room.players.values()].map(async (c) => {
        try {
          const { member } = await perms.member(guildId, c.info.id);
          room.sendTo(c.info.id, { t: 'discordVoice', discordVoice: world.discordVoice(guild, member) });
          void this.updateSpeak(room, c); // server mute may have changed
        } catch {
          /* member left the guild; they'll be dropped on next permission check */
        }
      }));
    });

    const pushWorld = (guildId: string) => {
      const room = this.rooms.get(guildId);
      const guild = bot.guild(guildId);
      if (!room || !guild) return;
      perms.invalidateGuild(guildId);
      const layout = world.full(guildId)?.layout;
      room.worldRadius = layout?.radius ?? room.worldRadius;
      room.plazas = layout?.plazas ?? room.plazas;
      room.houses = layout?.houses ?? room.houses;
      void Promise.all([...room.players.values()].map(async (c) => {
        try {
          const { member } = await perms.member(guildId, c.info.id);
          const view = world.forMember(guild, member);
          if (!view) return;
          c.viewable = new Set(this.viewableChannels(view.spec));
          room.sendTo(c.info.id, { t: 'world', world: view.spec, version: view.version, canSend: view.canSend });
          void this.updateSpeak(room, c);
        } catch {
          room.sendTo(c.info.id, { t: 'error', code: 'forbidden', message: 'You no longer have access to this server.' });
          c.ws.close(4003, 'forbidden');
        }
      }));
    };
    world.on('changed', pushWorld);
    bot.on('permissionsChanged', pushWorld);

    bot.on('guildRemoved', (guildId) => {
      const room = this.rooms.get(guildId);
      if (!room) return;
      room.broadcast(() => ({ t: 'error', code: 'guild_removed', message: 'The Hearthvale bot was removed from this server.' }));
      for (const c of room.players.values()) c.ws.close(4003, 'guild removed');
    });
  }

  close() {
    clearInterval(this.speakTimer);
    for (const r of this.rooms.values()) r.dispose();
    this.wss.close();
  }
}
