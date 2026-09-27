import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { config } from './config.ts';
import { openDatabase } from './db/index.ts';
import { createRepos } from './db/repos.ts';
import { createTokenCipher } from './auth/crypto.ts';
import { createDiscordOAuth } from './auth/discordOAuth.ts';
import { createSessionService } from './auth/sessions.ts';
import { registerAuthRoutes } from './auth/routes.ts';
import { DiscordBot } from './discord/bot.ts';
import { PermissionService } from './discord/permissions.ts';
import { MessageService } from './discord/messages.ts';
import { WorldService } from './world/worldService.ts';
import { RealtimeServer } from './realtime/wsServer.ts';
import { createVoiceTokenIssuer } from './voice/livekit.ts';
import { VoiceBridgeManager } from './voice/bridge.ts';
import { registerApiRoutes } from './api/routes.ts';

const app = Fastify({
  logger: {
    level: config.isProd ? 'info' : 'debug',
    transport: undefined,
    redact: ['req.headers.cookie', 'req.headers.authorization'],
  },
  trustProxy: config.isProd,
  bodyLimit: 64 * 1024,
});

const db = openDatabase(config.DATABASE_URL);
const repos = createRepos(db);
const cipher = createTokenCipher(config.SESSION_SECRET);
const oauth = createDiscordOAuth(config);
const sessions = createSessionService(config, repos, cipher, oauth);
const bot = new DiscordBot(config.DISCORD_BOT_TOKEN, app.log);
const perms = new PermissionService(bot);
const messages = new MessageService(bot, perms, repos, app.log);
const world = new WorldService(bot, repos, perms, app.log);
const voice = createVoiceTokenIssuer(config);
const bridges = new VoiceBridgeManager(config, bot, app.log);
const realtime = new RealtimeServer({ config, log: app.log, sessions, repos, bot, perms, messages, world, bridges });

await app.register(cookie);
// Only our own frontend origin may call the API with credentials (matters when the client is
// hosted separately, e.g. Vercel → api.yourdomain.com). Same-origin setups are unaffected.
await app.register(cors, {
  origin: new URL(config.APP_ORIGIN).origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'X-Hearthvale'],
  maxAge: 600,
});
await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
registerAuthRoutes(app, { oauth, sessions, repos, appUrl: config.APP_ORIGIN.replace(/\/+$/, '') });
registerApiRoutes(app, { repos, sessions, oauth, bot, perms, messages, voice, bridges, realtime: () => realtime });

// In production the server also serves the built client (single origin → simple cookies).
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/auth/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });
}

app.server.on('upgrade', (req, socket, head) => realtime.handleUpgrade(req, socket, head));

// Housekeeping
setInterval(() => {
  repos.sessions.purgeExpired();
  repos.worldMessages.purgeOlderThan(1000 * 60 * 60 * 24 * 30);
}, 1000 * 60 * 30).unref();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  realtime.close();
  await bridges.shutdown().catch(() => undefined);
  await bot.stop().catch(() => undefined);
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: config.isProd ? '0.0.0.0' : '127.0.0.1' });
if (!config.voiceEnabled) app.log.warn('LIVEKIT_* not configured — proximity voice is disabled.');
else if (bridges.enabled) app.log.info('Discord voice bridge enabled — voice gazebos connect to their Discord voice channels.');

// Keep retrying the Discord login so fixing the token/intents in the portal doesn't need a restart.
const startBot = (attempt = 0): void => {
  bot.start().catch((err: Error & { code?: string }) => {
    const hint = /disallowed intents/i.test(err.message)
      ? 'Enable "Message Content Intent" under Developer Portal → Bot → Privileged Gateway Intents, then save.'
      : /invalid token/i.test(err.message) || err.code === 'TokenInvalid'
        ? 'DISCORD_BOT_TOKEN is invalid — reset it under Developer Portal → Bot and update .env.'
        : 'Check DISCORD_BOT_TOKEN and your network connection.';
    const delay = Math.min(60_000, 5_000 * 2 ** Math.min(attempt, 4));
    app.log.error(`Could not log in to Discord: ${err.message}. ${hint} Retrying in ${delay / 1000}s…`);
    setTimeout(() => startBot(attempt + 1), delay).unref();
  });
};
startBot();
