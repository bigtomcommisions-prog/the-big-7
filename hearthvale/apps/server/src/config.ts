import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load .env from the repo root (or cwd) without an extra dependency. In production the env comes
// from the process (e.g. `node --env-file=.env.production`), so dev values never leak in.
if (process.env.NODE_ENV !== 'production') {
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      break;
    }
  }
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** Public URL of the frontend. May include a path, e.g. https://bigtomdev.fyi/hearthvale */
  APP_ORIGIN: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  DATABASE_URL: z.string().default('file:./data/hearthvale.db'),

  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/, 'DISCORD_CLIENT_ID should be the numeric application ID'),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_REDIRECT_URI: z.url(),

  LIVEKIT_URL: z.string().default(''),
  LIVEKIT_API_KEY: z.string().default(''),
  LIVEKIT_API_SECRET: z.string().default(''),
  /** URL the *server* uses to reach LiveKit (defaults to LIVEKIT_URL). */
  LIVEKIT_SERVER_URL: z.string().default(''),
  /** Bridge Discord voice channels into the world's voice gazebos (needs LiveKit). */
  DISCORD_VOICE_BRIDGE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),

  CHAT_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  CHAT_RATE_WINDOW: z.coerce.number().int().positive().default(10),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('\n✖ Invalid or missing environment configuration:\n');
  for (const issue of parsed.error.issues) console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
  console.error('\nCopy .env.example to .env and fill it in. See README.md → "Discord Developer Portal setup".\n');
  process.exit(1);
}

export const config = {
  ...parsed.data,
  LIVEKIT_SERVER_URL: parsed.data.LIVEKIT_SERVER_URL || parsed.data.LIVEKIT_URL,
  isProd: parsed.data.NODE_ENV === 'production',
  voiceEnabled: Boolean(parsed.data.LIVEKIT_URL && parsed.data.LIVEKIT_API_KEY && parsed.data.LIVEKIT_API_SECRET),
};

export type Config = typeof config;
