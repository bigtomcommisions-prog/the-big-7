import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite via Node's built-in driver (no native build step). All access goes through repos.ts,
 * so moving to Postgres later only touches that layer.
 *
 * We deliberately store only what we need: IDs, names for display, world mappings and user
 * preferences. Message *content* is never persisted — it lives in Discord.
 */

const MIGRATIONS: string[] = [
  /* 1 */ `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,          -- Discord user ID
    username      TEXT NOT NULL,
    global_name   TEXT,
    avatar        TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    id_hash            TEXT PRIMARY KEY,     -- sha256 of the opaque cookie value
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token_enc   TEXT NOT NULL,        -- AES-256-GCM encrypted Discord tokens
    refresh_token_enc  TEXT NOT NULL,
    token_expires_at   INTEGER NOT NULL,
    created_at         INTEGER NOT NULL,
    expires_at         INTEGER NOT NULL,
    last_seen_at       INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE guilds (
    id             TEXT PRIMARY KEY,         -- Discord guild ID
    name           TEXT NOT NULL,
    icon           TEXT,
    world_version  INTEGER NOT NULL DEFAULT 1,
    updated_at     INTEGER NOT NULL
  );

  -- A town per Discord category (plus the "uncategorized" outskirts).
  CREATE TABLE towns (
    guild_id    TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    town_key    TEXT NOT NULL,               -- category ID or 'uncategorized'
    name        TEXT NOT NULL,
    slot        INTEGER NOT NULL,            -- stable placement in the world
    capacity    INTEGER NOT NULL,            -- reserved building slots (controls town size)
    active      INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (guild_id, town_key)
  );

  -- A building per channel. Slots are stable so houses don't move when channels change.
  CREATE TABLE channels (
    id          TEXT PRIMARY KEY,            -- Discord channel ID
    guild_id    TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    town_key    TEXT NOT NULL,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL,               -- text | announcement | voice
    topic       TEXT,
    slot        INTEGER NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1,
    deleted_at  INTEGER,
    updated_at  INTEGER NOT NULL
  );
  CREATE INDEX channels_guild ON channels(guild_id, town_key);

  CREATE TABLE characters (
    user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    appearance  TEXT NOT NULL,               -- JSON, validated by AppearanceSchema
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE preferences (
    user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    prefs       TEXT NOT NULL,               -- JSON, validated by PreferencesSchema
    updated_at  INTEGER NOT NULL
  );

  -- Metadata (no content) for messages sent from inside the world: audit + author attribution.
  CREATE TABLE world_messages (
    message_id  TEXT PRIMARY KEY,
    guild_id    TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX world_messages_user ON world_messages(user_id, created_at);

  -- Who is currently in which world. Authoritative state is in memory; this is for ops/analytics
  -- and is cleared on boot.
  CREATE TABLE active_players (
    user_id       TEXT NOT NULL,
    guild_id      TEXT NOT NULL,
    connected_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, guild_id)
  );
  `,
];

export type Db = DatabaseSync;

export function openDatabase(url: string): Db {
  const path = url.startsWith('file:') ? url.slice(5) : url;
  const full = path === ':memory:' ? path : resolve(process.cwd(), path);
  if (full !== ':memory:') mkdirSync(dirname(full), { recursive: true });

  const db = new DatabaseSync(full);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();

  while (version < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]!);
      version++;
      db.prepare('UPDATE schema_version SET version = ?').run(version);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  db.exec('DELETE FROM active_players');
  return db;
}
