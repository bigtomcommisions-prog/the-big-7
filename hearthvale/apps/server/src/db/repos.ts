import {
  AppearanceSchema, DEFAULT_PREFERENCES, PreferencesSchema,
  type Appearance, type BuildingKind, type Preferences,
} from '@hearthvale/shared';
import type { Db } from './index.ts';

export interface UserRow {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export interface SessionRow {
  id_hash: string;
  user_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expires_at: number;
  expires_at: number;
  last_seen_at: number;
}

export interface TownRow {
  guild_id: string;
  town_key: string;
  name: string;
  slot: number;
  capacity: number;
  active: number;
}

export interface ChannelRow {
  id: string;
  guild_id: string;
  town_key: string;
  name: string;
  kind: BuildingKind;
  topic: string | null;
  slot: number;
  active: number;
  deleted_at: number | null;
}

export function createRepos(db: Db) {
  const now = () => Date.now();

  const users = {
    upsert(u: UserRow) {
      db.prepare(
        `INSERT INTO users (id, username, global_name, avatar, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET username = excluded.username, global_name = excluded.global_name,
           avatar = excluded.avatar, updated_at = excluded.updated_at`,
      ).run(u.id, u.username, u.global_name, u.avatar, now(), now());
    },
    get(id: string): UserRow | undefined {
      return db.prepare('SELECT id, username, global_name, avatar FROM users WHERE id = ?').get(id) as UserRow | undefined;
    },
  };

  const sessions = {
    create(s: Omit<SessionRow, 'last_seen_at'>) {
      db.prepare(
        `INSERT INTO sessions (id_hash, user_id, access_token_enc, refresh_token_enc, token_expires_at, created_at, expires_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(s.id_hash, s.user_id, s.access_token_enc, s.refresh_token_enc, s.token_expires_at, now(), s.expires_at, now());
    },
    get(idHash: string): SessionRow | undefined {
      return db.prepare('SELECT * FROM sessions WHERE id_hash = ?').get(idHash) as SessionRow | undefined;
    },
    touch(idHash: string) {
      db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?').run(now(), idHash);
    },
    updateTokens(idHash: string, accessEnc: string, refreshEnc: string, expiresAt: number) {
      db.prepare('UPDATE sessions SET access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ? WHERE id_hash = ?')
        .run(accessEnc, refreshEnc, expiresAt, idHash);
    },
    delete(idHash: string) {
      db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
    },
    purgeExpired() {
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
    },
  };

  const guilds = {
    upsert(id: string, name: string, icon: string | null) {
      db.prepare(
        `INSERT INTO guilds (id, name, icon, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, updated_at = excluded.updated_at`,
      ).run(id, name, icon, now());
    },
    bumpVersion(id: string): number {
      db.prepare('UPDATE guilds SET world_version = world_version + 1 WHERE id = ?').run(id);
      return guilds.version(id);
    },
    version(id: string): number {
      const r = db.prepare('SELECT world_version FROM guilds WHERE id = ?').get(id) as { world_version: number } | undefined;
      return r?.world_version ?? 1;
    },
  };

  const world = {
    towns(guildId: string): TownRow[] {
      return db.prepare('SELECT * FROM towns WHERE guild_id = ? ORDER BY slot').all(guildId) as unknown as TownRow[];
    },
    channels(guildId: string): ChannelRow[] {
      return db.prepare('SELECT * FROM channels WHERE guild_id = ? ORDER BY town_key, slot').all(guildId) as unknown as ChannelRow[];
    },
    upsertTown(t: TownRow) {
      db.prepare(
        `INSERT INTO towns (guild_id, town_key, name, slot, capacity, active) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, town_key) DO UPDATE SET name = excluded.name, capacity = excluded.capacity, active = excluded.active`,
      ).run(t.guild_id, t.town_key, t.name, t.slot, t.capacity, t.active);
    },
    upsertChannel(c: ChannelRow) {
      db.prepare(
        `INSERT INTO channels (id, guild_id, town_key, name, kind, topic, slot, active, deleted_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET town_key = excluded.town_key, name = excluded.name, kind = excluded.kind,
           topic = excluded.topic, slot = excluded.slot, active = excluded.active, deleted_at = excluded.deleted_at,
           updated_at = excluded.updated_at`,
      ).run(c.id, c.guild_id, c.town_key, c.name, c.kind, c.topic, c.slot, c.active, c.deleted_at, now());
    },
    deleteChannel(id: string) {
      db.prepare('DELETE FROM channels WHERE id = ?').run(id);
    },
    transaction<T>(fn: () => T): T {
      db.exec('BEGIN');
      try {
        const r = fn();
        db.exec('COMMIT');
        return r;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };

  const characters = {
    get(userId: string): Appearance | null {
      const r = db.prepare('SELECT appearance FROM characters WHERE user_id = ?').get(userId) as { appearance: string } | undefined;
      if (!r) return null;
      const parsed = AppearanceSchema.safeParse(JSON.parse(r.appearance));
      return parsed.success ? parsed.data : null;
    },
    set(userId: string, a: Appearance) {
      db.prepare(
        `INSERT INTO characters (user_id, appearance, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET appearance = excluded.appearance, updated_at = excluded.updated_at`,
      ).run(userId, JSON.stringify(a), now());
    },
  };

  const preferences = {
    get(userId: string): Preferences {
      const r = db.prepare('SELECT prefs FROM preferences WHERE user_id = ?').get(userId) as { prefs: string } | undefined;
      if (!r) return DEFAULT_PREFERENCES;
      const parsed = PreferencesSchema.safeParse(JSON.parse(r.prefs));
      return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
    },
    set(userId: string, p: Preferences) {
      db.prepare(
        `INSERT INTO preferences (user_id, prefs, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET prefs = excluded.prefs, updated_at = excluded.updated_at`,
      ).run(userId, JSON.stringify(p), now());
    },
  };

  const worldMessages = {
    record(messageId: string, guildId: string, channelId: string, userId: string) {
      db.prepare('INSERT OR IGNORE INTO world_messages (message_id, guild_id, channel_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(messageId, guildId, channelId, userId, now());
    },
    authorOf(messageId: string): string | undefined {
      const r = db.prepare('SELECT user_id FROM world_messages WHERE message_id = ?').get(messageId) as { user_id: string } | undefined;
      return r?.user_id;
    },
    /** Keep the audit table bounded. */
    purgeOlderThan(ms: number) {
      db.prepare('DELETE FROM world_messages WHERE created_at < ?').run(now() - ms);
    },
  };

  const activePlayers = {
    join(userId: string, guildId: string) {
      db.prepare('INSERT OR REPLACE INTO active_players (user_id, guild_id, connected_at) VALUES (?, ?, ?)').run(userId, guildId, now());
    },
    leave(userId: string, guildId: string) {
      db.prepare('DELETE FROM active_players WHERE user_id = ? AND guild_id = ?').run(userId, guildId);
    },
  };

  return { users, sessions, guilds, world, characters, preferences, worldMessages, activePlayers };
}

export type Repos = ReturnType<typeof createRepos>;
