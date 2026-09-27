import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppearanceSchema, PreferencesSchema, type GuildSummary } from '@hearthvale/shared';
import type { Repos } from '../db/repos.ts';
import { AuthError, type SessionService } from '../auth/sessions.ts';
import { DiscordApiError, type DiscordOAuth } from '../auth/discordOAuth.ts';
import type { DiscordBot } from '../discord/bot.ts';
import { ChatError, avatarUrl, type MessageService } from '../discord/messages.ts';
import { NotMemberError, type PermissionService } from '../discord/permissions.ts';
import type { VoiceTokenIssuer } from '../voice/livekit.ts';
import type { VoiceBridgeManager } from '../voice/bridge.ts';
import { PermissionFlagsBits } from 'discord.js';
import type { RealtimeServer } from '../realtime/wsServer.ts';

interface Deps {
  repos: Repos;
  sessions: SessionService;
  oauth: DiscordOAuth;
  bot: DiscordBot;
  perms: PermissionService;
  messages: MessageService;
  voice: VoiceTokenIssuer;
  bridges: VoiceBridgeManager;
  realtime: () => RealtimeServer;
}

const Snowflake = z.string().regex(/^\d{5,25}$/);
const GuildParams = z.object({ guildId: Snowflake });
const ChannelParams = z.object({ guildId: Snowflake, channelId: Snowflake });

const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;

export function registerApiRoutes(app: FastifyInstance, d: Deps) {
  // Mutating requests must carry this header. Browsers can't add custom headers cross-site without
  // a CORS preflight (which we never grant), so this blocks CSRF alongside SameSite cookies.
  app.addHook('preHandler', async (req, reply) => {
    if (req.method !== 'GET' && req.url.startsWith('/api/') && req.headers['x-hearthvale'] !== '1') {
      return reply.code(403).send({ error: 'Missing X-Hearthvale header' });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AuthError) return reply.code(401).send({ error: err.message });
    if (err instanceof NotMemberError) return reply.code(403).send({ error: err.message });
    if (err instanceof ChatError) return reply.code(err.code === 'not_found' ? 404 : 403).send({ error: err.message });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid request', issues: err.issues });
    if (err instanceof DiscordApiError && err.status === 429) return reply.code(503).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    req.log.error({ err }, 'Unhandled API error');
    return reply.code(500).send({ error: 'Something went wrong on our side.' });
  });

  const auth = (req: FastifyRequest) => d.sessions.require(req);

  app.get('/api/me', async (req) => {
    const { user } = auth(req);
    return {
      user: { id: user.id, name: user.global_name ?? user.username, username: user.username, avatar: avatarUrl(user.id, user.avatar) },
      appearance: d.repos.characters.get(user.id),
      preferences: d.repos.preferences.get(user.id),
      voiceEnabled: d.voice.enabled,
    };
  });

  /** Servers the user is in, split into ones with the bot (joinable) and ones they could add it to. */
  app.get('/api/guilds', async (req) => {
    const ctx = auth(req);
    const userGuilds = await d.sessions.userGuilds(ctx);
    const joinable: GuildSummary[] = [];
    const invitable: (GuildSummary & { inviteUrl: string })[] = [];
    for (const g of userGuilds) {
      const icon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null;
      if (d.bot.guild(g.id)) joinable.push({ id: g.id, name: g.name, icon });
      else {
        const p = BigInt(g.permissions);
        if (g.owner || (p & MANAGE_GUILD) || (p & ADMINISTRATOR)) {
          invitable.push({ id: g.id, name: g.name, icon, inviteUrl: d.oauth.botInviteUrl(g.id) });
        }
      }
    }
    return { joinable, invitable, botReady: d.bot.ready };
  });

  app.put('/api/character', async (req) => {
    const { user } = auth(req);
    const appearance = AppearanceSchema.parse(req.body);
    d.repos.characters.set(user.id, appearance);
    return { ok: true };
  });

  app.put('/api/preferences', async (req) => {
    const { user } = auth(req);
    const prefs = PreferencesSchema.parse(req.body);
    d.repos.preferences.set(user.id, prefs);
    return { ok: true };
  });

  app.get('/api/guilds/:guildId/channels/:channelId/messages', {
    config: { rateLimit: { max: 30, timeWindow: '10 seconds' } },
  }, async (req) => {
    const { user } = auth(req);
    const { guildId, channelId } = ChannelParams.parse(req.params);
    const { member } = await d.perms.member(guildId, user.id);
    return { messages: await d.messages.recentMessages(guildId, channelId, member) };
  });

  app.post('/api/guilds/:guildId/voice-token', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply: FastifyReply) => {
    const { user } = auth(req);
    const { guildId } = GuildParams.parse(req.params);
    if (!d.voice.enabled) return reply.code(503).send({ error: 'Voice is not configured on this server.' });
    const { member } = await d.perms.member(guildId, user.id, true);
    return { url: d.voice.url, token: await d.voice.token(guildId, user.id, member.displayName) };
  });

  /**
   * Join the Discord voice bridge for the gazebo you're standing in. Verified server-side:
   * the bridge is live for that channel, you're physically in its gazebo, and Discord lets you
   * Connect (and Speak, to be heard).
   */
  app.post('/api/guilds/:guildId/voice-bridge-token', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply: FastifyReply) => {
    const { user } = auth(req);
    const { guildId } = GuildParams.parse(req.params);
    const { channelId } = z.object({ channelId: Snowflake }).parse(req.body);
    const info = d.bridges.info(guildId);
    if (!info || info.channelId !== channelId || info.status !== 'active') {
      return reply.code(409).send({ error: 'The Discord voice bridge is not active for this channel.' });
    }
    if (d.realtime().playerPlaza(guildId, user.id) !== channelId) {
      return reply.code(403).send({ error: 'Walk into the voice gazebo to join the call.' });
    }
    const { guild, member } = await d.perms.member(guildId, user.id, true);
    const channel = guild.channels.cache.get(channelId);
    const p = channel ? channel.permissionsFor(member) : null;
    if (!p?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
      return reply.code(403).send({ error: "You don't have permission to join this voice channel in Discord." });
    }
    const canSpeak = p.has(PermissionFlagsBits.Speak) && !member.isCommunicationDisabled();
    const token = await d.bridges.playerToken(guildId, channelId, user.id, member.displayName, canSpeak);
    return { url: d.voice.url, token, canSpeak };
  });

  app.get('/api/health', async () => ({ ok: true, discord: d.bot.ready, ...d.realtime().stats }));
}
