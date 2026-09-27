import { PermissionFlagsBits, type Guild, type GuildBasedChannel, type GuildMember } from 'discord.js';
import type { DiscordBot } from './bot.ts';

const MEMBER_TTL_MS = 60_000;

export class NotMemberError extends Error {
  constructor() {
    super('You are not a member of this server, or the Hearthvale bot has not been added to it.');
  }
}

/**
 * Authoritative permission checks, computed from Discord's own role/overwrite data via the bot.
 * The client never tells us what it's allowed to do.
 */
export class PermissionService {
  private members = new Map<string, { at: number; member: GuildMember }>();

  constructor(private bot: DiscordBot) {
    bot.on('permissionsChanged', (guildId) => this.invalidateGuild(guildId));
  }

  private key(guildId: string, userId: string) {
    return `${guildId}:${userId}`;
  }

  invalidateGuild(guildId: string) {
    for (const k of this.members.keys()) if (k.startsWith(`${guildId}:`)) this.members.delete(k);
  }

  /** Fetch (and briefly cache) a guild member. Throws NotMemberError if they aren't in the guild. */
  async member(guildId: string, userId: string, fresh = false): Promise<{ guild: Guild; member: GuildMember }> {
    const guild = this.bot.guild(guildId);
    if (!guild) throw new NotMemberError();
    const k = this.key(guildId, userId);
    const cached = this.members.get(k);
    if (!fresh && cached && Date.now() - cached.at < MEMBER_TTL_MS) return { guild, member: cached.member };
    try {
      const member = await guild.members.fetch({ user: userId, force: true });
      this.members.set(k, { at: Date.now(), member });
      return { guild, member };
    } catch {
      this.members.delete(k);
      throw new NotMemberError();
    }
  }

  canView(member: GuildMember, channel: GuildBasedChannel): boolean {
    const p = channel.permissionsFor(member);
    return Boolean(p?.has(PermissionFlagsBits.ViewChannel));
  }

  canReadHistory(member: GuildMember, channel: GuildBasedChannel): boolean {
    const p = channel.permissionsFor(member);
    return Boolean(p?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]));
  }

  canSend(member: GuildMember, channel: GuildBasedChannel): boolean {
    if (member.isCommunicationDisabled()) return false;
    const p = channel.permissionsFor(member);
    return Boolean(p?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]));
  }

  /**
   * May this member talk (voice) where they're standing? `channel` is the house (text channel) or
   * voice gazebo they're in, or null out in the open world. Returns null if allowed, otherwise
   * the reason shown to the player.
   *
   * - Anywhere: not timed out, and not server-muted in Discord.
   * - In a text channel's house: needs View Channel + Send Messages there.
   * - In a voice channel's gazebo: needs View Channel + Connect + Speak there.
   */
  speakBlock(member: GuildMember, channel: GuildBasedChannel | null): string | null {
    if (member.isCommunicationDisabled()) return "You're timed out in this server, so you can't talk.";
    if (member.voice.serverMute) return "You're server-muted in Discord, so you can't talk.";
    if (!channel) return null;
    const p = channel.permissionsFor(member);
    if (channel.isVoiceBased()) {
      if (!p?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
        return `You don't have permission to speak in ${channel.name}.`;
      }
    } else if (!p?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      return `You can't talk in #${channel.name}: you don't have permission to send messages there.`;
    }
    return null;
  }

  /** What the bot itself can do in a channel (so we can explain failures instead of erroring). */
  botCan(channel: GuildBasedChannel, perms: bigint[]): boolean {
    const me = channel.guild.members.me;
    return Boolean(me && channel.permissionsFor(me)?.has(perms));
  }
}
