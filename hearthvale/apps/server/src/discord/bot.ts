import { EventEmitter } from 'node:events';
import { Client, Events, GatewayIntentBits, type Guild, type Message, type PartialMessage } from 'discord.js';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Discord gateway connection.
 *
 * Intents:
 *   Guilds            — guild, category, channel and role structure + create/update/delete events
 *   GuildMessages     — MESSAGE_CREATE / DELETE in guild channels
 *   MessageContent    — PRIVILEGED: needed to read message text (enable in the Developer Portal)
 *   GuildVoiceStates  — who is sitting in Discord voice channels (mirrored as read-only "voice plazas")
 *
 * We intentionally do NOT request GuildMembers or GuildPresences (privileged, and unnecessary):
 * members are fetched individually via REST when someone joins the world.
 */

export interface BotEvents {
  ready: [];
  structureChanged: [guildId: string];
  guildRemoved: [guildId: string];
  message: [message: Message];
  messageDeleted: [message: Message | PartialMessage];
  voiceChanged: [guildId: string];
  permissionsChanged: [guildId: string];
}

export class DiscordBot extends EventEmitter<BotEvents> {
  readonly client: Client;
  private readyFlag = false;

  constructor(private token: string, private log: FastifyBaseLogger) {
    super();
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
      ],
      // Keep member/message caches small — we don't need Discord.js to mirror whole guilds.
      sweepers: {
        messages: { interval: 300, lifetime: 900 },
      },
    });

    const c = this.client;
    c.once(Events.ClientReady, (client) => {
      this.readyFlag = true;
      this.log.info(`Discord bot connected as ${client.user.tag} in ${client.guilds.cache.size} guild(s)`);
      this.emit('ready');
    });
    c.on(Events.GuildCreate, (g) => this.emit('structureChanged', g.id));
    c.on(Events.GuildUpdate, (_o, g) => this.emit('structureChanged', g.id));
    c.on(Events.GuildDelete, (g) => this.emit('guildRemoved', g.id));
    c.on(Events.ChannelCreate, (ch) => this.emit('structureChanged', ch.guildId));
    c.on(Events.ChannelUpdate, (_o, ch) => {
      if ('guildId' in ch && ch.guildId) {
        this.emit('structureChanged', ch.guildId);
        this.emit('permissionsChanged', ch.guildId);
      }
    });
    c.on(Events.ChannelDelete, (ch) => {
      if ('guildId' in ch && ch.guildId) this.emit('structureChanged', ch.guildId);
    });
    c.on(Events.GuildRoleUpdate, (_o, r) => this.emit('permissionsChanged', r.guild.id));
    c.on(Events.GuildRoleDelete, (r) => this.emit('permissionsChanged', r.guild.id));
    c.on(Events.MessageCreate, (m) => {
      if (m.inGuild()) this.emit('message', m);
    });
    c.on(Events.MessageDelete, (m) => {
      if (m.guildId) this.emit('messageDeleted', m);
    });
    c.on(Events.VoiceStateUpdate, (_o, n) => this.emit('voiceChanged', n.guild.id));
    c.on(Events.Error, (err) => this.log.error({ err }, 'Discord client error'));
    c.on(Events.ShardDisconnect, () => this.log.warn('Discord gateway disconnected — discord.js will reconnect'));
  }

  get ready() {
    return this.readyFlag;
  }

  async start() {
    await this.client.login(this.token);
  }

  guild(id: string): Guild | undefined {
    return this.client.guilds.cache.get(id);
  }

  get botUserId(): string | undefined {
    return this.client.user?.id;
  }

  async stop() {
    await this.client.destroy();
  }
}
