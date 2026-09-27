import {
  ChannelType, PermissionFlagsBits,
  type GuildMember, type Message, type NewsChannel, type TextChannel, type Webhook,
} from 'discord.js';
import type { FastifyBaseLogger } from 'fastify';
import { CHAT, type ChatMessage, type PublicUser } from '@hearthvale/shared';
import type { Repos } from '../db/repos.ts';
import type { DiscordBot } from './bot.ts';
import type { PermissionService } from './permissions.ts';

type SendableChannel = TextChannel | NewsChannel;

export class ChatError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const RECENT_CACHE_MS = 30_000;
const NPC_WINDOW_MS = 1000 * 60 * 60 * 24;
const NPC_PER_CHANNEL = 3;

export function avatarUrl(userId: string, avatar: string | null): string | null {
  return avatar ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64` : null;
}

/** Webhook display names may not contain these (Discord rejects them). */
function sanitizeWebhookName(name: string): string {
  const cleaned = name
    .replace(/discord|clyde/gi, (m) => m[0] + '​' + m.slice(1))
    .replace(/[@#:]|```/g, '')
    .trim();
  return (cleaned || 'Villager').slice(0, 64) + ' · Hearthvale';
}

/**
 * Bridges Discord text channels and the world:
 *  - converts Discord messages to the compact ChatMessage the client renders
 *  - fetches recent history on demand (not persisted)
 *  - sends messages from the world via a per-channel webhook so they show the player's name/avatar
 *  - tracks recently active members per channel to populate idle NPCs
 */
export class MessageService {
  private webhooks = new Map<string, Webhook>();
  private recent = new Map<string, { at: number; messages: ChatMessage[] }>();
  private activity = new Map<string, Map<string, { user: PublicUser; at: number }>>();

  constructor(
    private bot: DiscordBot,
    private perms: PermissionService,
    private repos: Repos,
    private log: FastifyBaseLogger,
  ) {}

  /** Is this message one we posted from the world? */
  isOwnWebhook(message: Message): boolean {
    if (!message.webhookId) return false;
    return this.webhooks.get(message.channelId)?.id === message.webhookId;
  }

  toChatMessage(m: Message, worldAuthor?: PublicUser): ChatMessage {
    const worldUserId = m.webhookId ? this.repos.worldMessages.authorOf(m.id) : undefined;
    let author: PublicUser;
    if (worldAuthor) author = worldAuthor;
    else if (worldUserId) {
      const u = this.repos.users.get(worldUserId);
      author = { id: worldUserId, name: u?.global_name ?? u?.username ?? m.author.username, avatar: avatarUrl(worldUserId, u?.avatar ?? null) };
    } else {
      author = {
        id: m.author.id,
        name: m.member?.displayName ?? m.author.globalName ?? m.author.username,
        avatar: m.author.displayAvatarURL({ size: 64, extension: 'png' }),
      };
    }

    const users: Record<string, string> = {};
    for (const [id, u] of m.mentions.users) users[id] = m.mentions.members?.get(id)?.displayName ?? u.globalName ?? u.username;
    const channels: Record<string, string> = {};
    for (const [id, c] of m.mentions.channels) channels[id] = 'name' in c && c.name ? c.name : 'channel';
    const roles: Record<string, string> = {};
    for (const [id, r] of m.mentions.roles) roles[id] = r.name;

    let content = m.content;
    if (!content && m.embeds.length) content = m.embeds[0]?.description ?? m.embeds[0]?.title ?? '';
    if (!content && m.stickers.size) content = `[sticker: ${m.stickers.first()?.name}]`;

    return {
      id: m.id,
      channelId: m.channelId,
      author,
      content: content.slice(0, CHAT.MAX_LENGTH),
      createdAt: m.createdTimestamp,
      fromWorld: Boolean(worldAuthor || worldUserId),
      attachments: m.attachments.size,
      mentions: { users, channels, roles },
    };
  }

  /** Called for every live Discord message; keeps caches and NPC activity fresh. */
  ingest(chat: ChatMessage, isBotAuthor: boolean) {
    const cached = this.recent.get(chat.channelId);
    if (cached) {
      cached.messages.push(chat);
      if (cached.messages.length > CHAT.RECENT_MESSAGES) cached.messages.shift();
    }
    if (!isBotAuthor) this.noteActivity(chat.channelId, chat.author, chat.createdAt);
  }

  removeFromCache(channelId: string, messageId: string) {
    const cached = this.recent.get(channelId);
    if (cached) cached.messages = cached.messages.filter((m) => m.id !== messageId);
  }

  private noteActivity(channelId: string, user: PublicUser, at: number) {
    let map = this.activity.get(channelId);
    if (!map) this.activity.set(channelId, (map = new Map()));
    map.set(user.id, { user, at });
    if (map.size > 20) {
      const oldest = [...map.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) map.delete(oldest[0]);
    }
  }

  /** Up to N members recently active in each channel — used for idle NPCs. */
  recentActivity(channelIds: Iterable<string>): Record<string, PublicUser[]> {
    const out: Record<string, PublicUser[]> = {};
    const cutoff = Date.now() - NPC_WINDOW_MS;
    for (const id of channelIds) {
      const map = this.activity.get(id);
      if (!map) continue;
      const list = [...map.values()].filter((e) => e.at > cutoff).sort((a, b) => b.at - a.at).slice(0, NPC_PER_CHANNEL);
      if (list.length) out[id] = list.map((e) => e.user);
    }
    return out;
  }

  private sendableChannel(guildId: string, channelId: string): SendableChannel {
    const guild = this.bot.guild(guildId);
    const channel = guild?.channels.cache.get(channelId);
    if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
      throw new ChatError('not_found', 'That channel does not exist in this server.');
    }
    return channel as SendableChannel;
  }

  /** Recent messages for a channel, after verifying the member may read its history. */
  async recentMessages(guildId: string, channelId: string, member: GuildMember): Promise<ChatMessage[]> {
    const channel = this.sendableChannel(guildId, channelId);
    if (!this.perms.canReadHistory(member, channel)) throw new ChatError('forbidden', "You can't read this channel.");
    if (!this.perms.botCan(channel, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) {
      throw new ChatError('bot_forbidden', "The Hearthvale bot can't read this channel's history.");
    }
    const cached = this.recent.get(channelId);
    if (cached && Date.now() - cached.at < RECENT_CACHE_MS) return cached.messages;

    const fetched = await channel.messages.fetch({ limit: CHAT.RECENT_MESSAGES });
    const messages = [...fetched.values()]
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .map((m) => this.toChatMessage(m));
    for (const m of messages) if (!m.fromWorld) this.noteActivity(channelId, m.author, m.createdAt);
    this.recent.set(channelId, { at: Date.now(), messages });
    return messages;
  }

  private async webhookFor(channel: SendableChannel): Promise<Webhook | null> {
    const cached = this.webhooks.get(channel.id);
    if (cached) return cached;
    if (!this.perms.botCan(channel, [PermissionFlagsBits.ManageWebhooks])) return null;
    try {
      const hooks = await channel.fetchWebhooks();
      let hook = hooks.find((h) => h.owner?.id === this.bot.botUserId && h.token) ?? null;
      hook ??= await channel.createWebhook({ name: 'Hearthvale', reason: 'Relay messages sent from the Hearthvale world' });
      this.webhooks.set(channel.id, hook);
      return hook;
    } catch (err) {
      this.log.warn({ err, channelId: channel.id }, 'Could not obtain webhook; falling back to bot messages');
      return null;
    }
  }

  /** Warm the webhook cache so echoes of our own messages are recognised after a restart. */
  async prepareChannel(guildId: string, channelId: string) {
    try {
      await this.webhookFor(this.sendableChannel(guildId, channelId));
    } catch {
      /* not sendable — ignore */
    }
  }

  /**
   * Send a message into Discord on behalf of a player. Permission checks happen here, against
   * fresh Discord data, regardless of what the client believes.
   */
  async send(guildId: string, channelId: string, member: GuildMember, rawContent: string): Promise<ChatMessage> {
    const channel = this.sendableChannel(guildId, channelId);
    if (!this.perms.canSend(member, channel)) throw new ChatError('forbidden', "You don't have permission to send messages in this channel.");
    const content = rawContent.replace(/\r\n/g, '\n').trim();
    if (!content) throw new ChatError('empty', 'Message is empty.');
    if (content.length > CHAT.MAX_LENGTH) throw new ChatError('too_long', `Messages are limited to ${CHAT.MAX_LENGTH} characters.`);

    const author: PublicUser = {
      id: member.id,
      name: member.displayName,
      avatar: member.displayAvatarURL({ size: 64, extension: 'png' }),
    };

    // Never let world messages ping @everyone/@here/roles/users — mentions render but don't notify.
    const allowedMentions = { parse: [] as never[] };
    const hook = await this.webhookFor(channel);
    let sent: Message;
    if (hook) {
      sent = await hook.send({
        content,
        username: sanitizeWebhookName(member.displayName),
        avatarURL: member.displayAvatarURL({ size: 128, extension: 'png' }),
        allowedMentions,
      });
    } else {
      if (!this.perms.botCan(channel, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        throw new ChatError('bot_forbidden', "The Hearthvale bot isn't allowed to post in this channel.");
      }
      const prefix = `**${member.displayName.replace(/[*_`~|]/g, '')}** (in Hearthvale): `;
      sent = await channel.send({ content: (prefix + content).slice(0, CHAT.MAX_LENGTH), allowedMentions });
      this.repos.worldMessages.record(sent.id, guildId, channelId, member.id);
      const chat = this.toChatMessage(sent, author);
      chat.content = content;
      return chat;
    }
    this.repos.worldMessages.record(sent.id, guildId, channelId, member.id);
    return this.toChatMessage(sent, author);
  }
}
