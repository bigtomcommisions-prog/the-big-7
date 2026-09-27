import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';
import type { Repos, UserRow } from '../db/repos.ts';
import { randomToken, sha256, type TokenCipher } from './crypto.ts';
import { DiscordApiError, type DiscordOAuth, type DiscordPartialGuild } from './discordOAuth.ts';

export const SESSION_COOKIE = 'hv_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const GUILD_CACHE_MS = 60_000;

export interface AuthContext {
  sessionHash: string;
  user: UserRow;
}

export class AuthError extends Error {
  constructor(message = 'Not signed in') {
    super(message);
  }
}

/**
 * Opaque, server-side sessions. The cookie holds a random token; the DB holds only its hash,
 * so a database leak can't be replayed as a login. Discord tokens are encrypted at rest.
 */
export function createSessionService(config: Config, repos: Repos, cipher: TokenCipher, oauth: DiscordOAuth) {
  const guildCache = new Map<string, { at: number; guilds: DiscordPartialGuild[] }>();

  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.APP_ORIGIN.startsWith('https://'),
  };

  function readSessionHash(cookies: Record<string, string | undefined>): string | null {
    const raw = cookies[SESSION_COOKIE];
    if (!raw || raw.length > 128) return null;
    return sha256(raw);
  }

  function authenticateHash(hash: string | null): AuthContext | null {
    if (!hash) return null;
    const s = repos.sessions.get(hash);
    if (!s) return null;
    if (s.expires_at < Date.now()) {
      repos.sessions.delete(hash);
      return null;
    }
    const user = repos.users.get(s.user_id);
    if (!user) return null;
    if (Date.now() - s.last_seen_at > 60_000) repos.sessions.touch(hash);
    return { sessionHash: hash, user };
  }

  /** A valid Discord access token for this session, refreshing it if it has expired. */
  async function accessToken(hash: string): Promise<string> {
    const s = repos.sessions.get(hash);
    if (!s) throw new AuthError();
    if (s.token_expires_at - 60_000 > Date.now()) return cipher.decrypt(s.access_token_enc);
    try {
      const t = await oauth.refresh(cipher.decrypt(s.refresh_token_enc));
      repos.sessions.updateTokens(hash, cipher.encrypt(t.access_token), cipher.encrypt(t.refresh_token), Date.now() + t.expires_in * 1000);
      return t.access_token;
    } catch (err) {
      if (err instanceof DiscordApiError && (err.status === 400 || err.status === 401)) {
        // Refresh token revoked or expired: the session is no longer usable.
        repos.sessions.delete(hash);
        throw new AuthError('Your Discord authorization expired. Please sign in again.');
      }
      throw err;
    }
  }

  return {
    cookieOptions,

    create(reply: FastifyReply, userId: string, accessTok: string, refreshTok: string, expiresIn: number) {
      const token = randomToken();
      repos.sessions.create({
        id_hash: sha256(token),
        user_id: userId,
        access_token_enc: cipher.encrypt(accessTok),
        refresh_token_enc: cipher.encrypt(refreshTok),
        token_expires_at: Date.now() + expiresIn * 1000,
        expires_at: Date.now() + SESSION_TTL_MS,
      });
      reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS / 1000 });
    },

    async destroy(req: FastifyRequest, reply: FastifyReply) {
      const hash = readSessionHash(req.cookies);
      if (hash) {
        const s = repos.sessions.get(hash);
        if (s) {
          try {
            await oauth.revoke(cipher.decrypt(s.access_token_enc));
          } catch {
            /* best effort */
          }
          repos.sessions.delete(hash);
        }
        guildCache.delete(hash);
      }
      reply.clearCookie(SESSION_COOKIE, cookieOptions);
    },

    /** Resolve the signed-in user from request cookies, or null. */
    fromRequest(req: FastifyRequest): AuthContext | null {
      return authenticateHash(readSessionHash(req.cookies));
    },

    /** Same, from a raw Cookie header (used for WebSocket upgrades). */
    fromCookieHeader(header: string | undefined): AuthContext | null {
      if (!header) return null;
      const cookies: Record<string, string> = {};
      for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i > 0) cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      }
      return authenticateHash(readSessionHash(cookies));
    },

    require(req: FastifyRequest): AuthContext {
      const ctx = this.fromRequest(req);
      if (!ctx) throw new AuthError();
      return ctx;
    },

    /** The user's guilds from Discord (OAuth `guilds` scope), cached briefly per session. */
    async userGuilds(ctx: AuthContext): Promise<DiscordPartialGuild[]> {
      const cached = guildCache.get(ctx.sessionHash);
      if (cached && Date.now() - cached.at < GUILD_CACHE_MS) return cached.guilds;
      const guilds = await oauth.guilds(await accessToken(ctx.sessionHash));
      guildCache.set(ctx.sessionHash, { at: Date.now(), guilds });
      return guilds;
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
