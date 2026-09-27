import type { Config } from '../config.ts';

/**
 * Minimal Discord OAuth2 (authorization-code grant) client.
 * Docs: https://discord.com/developers/docs/topics/oauth2
 *
 * Scopes:
 *   identify — who the user is
 *   guilds   — which servers they're in (to build the server picker)
 * Membership and per-channel permissions are then verified through the bot, never the client.
 */

const API = 'https://discord.com/api/v10';
export const OAUTH_SCOPES = ['identify', 'guilds'];

export interface DiscordTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export interface DiscordPartialGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export class DiscordApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function createDiscordOAuth(config: Config) {
  const basic = Buffer.from(`${config.DISCORD_CLIENT_ID}:${config.DISCORD_CLIENT_SECRET}`).toString('base64');

  async function tokenRequest(body: Record<string, string>): Promise<DiscordTokens> {
    const res = await fetch(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
      body: new URLSearchParams(body),
    });
    if (!res.ok) throw new DiscordApiError(res.status, `Token request failed (${res.status})`);
    return (await res.json()) as DiscordTokens;
  }

  async function get<T>(path: string, accessToken: string): Promise<T> {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '1');
      throw new DiscordApiError(429, `Rate limited by Discord; retry in ${retry}s`);
    }
    if (!res.ok) throw new DiscordApiError(res.status, `Discord API ${path} failed (${res.status})`);
    return (await res.json()) as T;
  }

  return {
    authorizeUrl(state: string): string {
      const p = new URLSearchParams({
        client_id: config.DISCORD_CLIENT_ID,
        response_type: 'code',
        redirect_uri: config.DISCORD_REDIRECT_URI,
        scope: OAUTH_SCOPES.join(' '),
        state,
        prompt: 'none',
      });
      return `https://discord.com/oauth2/authorize?${p}`;
    },
    exchangeCode(code: string) {
      return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: config.DISCORD_REDIRECT_URI });
    },
    refresh(refreshToken: string) {
      return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    },
    async revoke(token: string) {
      await fetch(`${API}/oauth2/token/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
        body: new URLSearchParams({ token, token_type_hint: 'access_token' }),
      }).catch(() => undefined);
    },
    me: (accessToken: string) => get<DiscordUser>('/users/@me', accessToken),
    guilds: (accessToken: string) => get<DiscordPartialGuild[]>('/users/@me/guilds', accessToken),
    botInviteUrl(guildId?: string): string {
      // View Channels, Send Messages, Read Message History, Manage Webhooks, Embed Links,
      // Connect + Speak (Discord voice bridge)
      const permissions = (1n << 10n) | (1n << 11n) | (1n << 16n) | (1n << 29n) | (1n << 14n) | (1n << 20n) | (1n << 21n);
      const p = new URLSearchParams({
        client_id: config.DISCORD_CLIENT_ID,
        scope: 'bot',
        permissions: permissions.toString(),
      });
      if (guildId) {
        p.set('guild_id', guildId);
        p.set('disable_guild_select', 'true');
      }
      return `https://discord.com/oauth2/authorize?${p}`;
    },
  };
}

export type DiscordOAuth = ReturnType<typeof createDiscordOAuth>;
