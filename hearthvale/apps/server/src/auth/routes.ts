import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Repos } from '../db/repos.ts';
import { randomToken, safeEqual } from './crypto.ts';
import type { DiscordOAuth } from './discordOAuth.ts';
import type { SessionService } from './sessions.ts';

const STATE_COOKIE = 'hv_oauth_state';

const CallbackQuery = z.object({
  code: z.string().max(512).optional(),
  state: z.string().max(128).optional(),
  error: z.string().max(200).optional(),
});

export function registerAuthRoutes(app: FastifyInstance, deps: { oauth: DiscordOAuth; sessions: SessionService; repos: Repos; appUrl: string }) {
  const { oauth, sessions, repos, appUrl } = deps;

  app.get('/auth/login', async (_req, reply) => {
    const state = randomToken(24);
    reply.setCookie(STATE_COOKIE, state, { ...sessions.cookieOptions, maxAge: 600 });
    return reply.redirect(oauth.authorizeUrl(state));
  });

  app.get('/auth/callback', async (req, reply) => {
    const q = CallbackQuery.safeParse(req.query);
    const expected = req.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, sessions.cookieOptions);

    if (!q.success || q.data.error || !q.data.code || !q.data.state) {
      return reply.redirect(`${appUrl}/?auth_error=${encodeURIComponent(q.success ? (q.data.error ?? 'missing_code') : 'bad_request')}`);
    }
    // CSRF protection: the state we set must come back unchanged.
    if (!expected || !safeEqual(expected, q.data.state)) {
      return reply.redirect(`${appUrl}/?auth_error=state_mismatch`);
    }

    try {
      const tokens = await oauth.exchangeCode(q.data.code);
      const me = await oauth.me(tokens.access_token);
      repos.users.upsert({ id: me.id, username: me.username, global_name: me.global_name, avatar: me.avatar });
      sessions.create(reply, me.id, tokens.access_token, tokens.refresh_token, tokens.expires_in);
      return reply.redirect(`${appUrl}/`);
    } catch (err) {
      req.log.warn({ err }, 'OAuth callback failed');
      return reply.redirect(`${appUrl}/?auth_error=exchange_failed`);
    }
  });

  app.post('/auth/logout', async (req, reply) => {
    await sessions.destroy(req, reply);
    return { ok: true };
  });
}
