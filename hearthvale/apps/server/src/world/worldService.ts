import { EventEmitter } from 'node:events';
import { ChannelType, type Guild, type GuildBasedChannel, type GuildMember } from 'discord.js';
import type { FastifyBaseLogger } from 'fastify';
import {
  generateWorld, townCapacity,
  type BuildingKind, type DiscordVoiceMap, type TownInput, type WorldLayout, type WorldSpec,
} from '@hearthvale/shared';
import type { ChannelRow, Repos, TownRow } from '../db/repos.ts';
import type { DiscordBot } from '../discord/bot.ts';
import type { PermissionService } from '../discord/permissions.ts';

export const UNCATEGORIZED = 'uncategorized';
/** Deleted channels stay as boarded-up houses for this long before their plot is recycled. */
const INACTIVE_RETENTION_MS = 1000 * 60 * 60 * 24 * 3;
const SYNC_DEBOUNCE_MS = 1200;

function kindOf(ch: GuildBasedChannel): BuildingKind | null {
  switch (ch.type) {
    case ChannelType.GuildText:
      return 'text';
    case ChannelType.GuildAnnouncement:
      return 'announcement';
    case ChannelType.GuildVoice:
    case ChannelType.GuildStageVoice:
      return 'voice';
    default:
      return null; // forums, media, threads: not mapped to buildings in this version
  }
}

function lowestFreeSlot(used: Set<number>): number {
  let s = 0;
  while (used.has(s)) s++;
  return s;
}

interface GuildWorld {
  version: number;
  spec: WorldSpec;
  layout: WorldLayout;
}

export interface WorldEvents {
  changed: [guildId: string, version: number];
}

/**
 * Maintains the persistent mapping Discord structure → world, and produces per-user world specs
 * that only include what that user may see.
 */
export class WorldService extends EventEmitter<WorldEvents> {
  private cache = new Map<string, GuildWorld>();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private bot: DiscordBot,
    private repos: Repos,
    private perms: PermissionService,
    private log: FastifyBaseLogger,
  ) {
    super();
    bot.on('ready', () => {
      for (const g of bot.client.guilds.cache.values()) this.syncNow(g);
    });
    bot.on('structureChanged', (id) => this.scheduleSync(id));
  }

  scheduleSync(guildId: string) {
    clearTimeout(this.timers.get(guildId));
    this.timers.set(guildId, setTimeout(() => {
      this.timers.delete(guildId);
      const g = this.bot.guild(guildId);
      if (g) this.syncNow(g);
    }, SYNC_DEBOUNCE_MS));
  }

  /** Reconcile DB mappings with the guild's current channels. Emits `changed` if anything moved. */
  syncNow(guild: Guild) {
    const before = this.signature(guild.id);
    this.repos.guilds.upsert(guild.id, guild.name, guild.icon);

    this.repos.world.transaction(() => {
      const towns = new Map(this.repos.world.towns(guild.id).map((t) => [t.town_key, t]));
      const rows = new Map(this.repos.world.channels(guild.id).map((c) => [c.id, c]));
      const now = Date.now();

      // Which channels should exist, grouped by town.
      const wanted = new Map<string, { name: string; channels: GuildBasedChannel[] }>();
      const categories = [...guild.channels.cache.values()]
        .filter((c) => c.type === ChannelType.GuildCategory)
        .sort((a, b) => ('position' in a && 'position' in b ? a.position - b.position : 0));
      for (const cat of categories) wanted.set(cat.id, { name: cat.name, channels: [] });

      const buildable = [...guild.channels.cache.values()]
        .filter((c) => kindOf(c) !== null)
        .sort((a, b) => ('position' in a && 'position' in b ? a.position - b.position : 0));
      for (const ch of buildable) {
        const key = ch.parentId ?? UNCATEGORIZED;
        let entry = wanted.get(key);
        if (!entry) wanted.set(key, (entry = { name: 'Outskirts', channels: [] }));
        entry.channels.push(ch);
      }

      // Towns: keep existing slots, give new towns the lowest free slot.
      const usedTownSlots = new Set([...towns.values()].map((t) => t.slot));
      for (const [key, w] of wanted) {
        const hasChannels = w.channels.length > 0 || [...rows.values()].some((r) => r.town_key === key && r.active);
        const existing = towns.get(key);
        if (!hasChannels && !existing) continue;
        if (!existing) {
          const slot = lowestFreeSlot(usedTownSlots);
          usedTownSlots.add(slot);
          const t: TownRow = { guild_id: guild.id, town_key: key, name: w.name, slot, capacity: 6, active: 1 };
          towns.set(key, t);
        } else {
          existing.name = w.name;
          existing.active = 1;
        }
      }

      // Channels: stable slots within their town.
      const slotsByTown = new Map<string, Set<number>>();
      for (const r of rows.values()) {
        let s = slotsByTown.get(r.town_key);
        if (!s) slotsByTown.set(r.town_key, (s = new Set()));
        s.add(r.slot);
      }
      const seen = new Set<string>();
      for (const [key, w] of wanted) {
        for (const ch of w.channels) {
          seen.add(ch.id);
          const kind = kindOf(ch)!;
          const topic = 'topic' in ch ? (ch.topic ?? null) : null;
          const prev = rows.get(ch.id);
          let slot = prev?.slot;
          if (!prev || prev.town_key !== key) {
            // New channel, or moved to another category → new plot in the new town.
            if (prev) slotsByTown.get(prev.town_key)?.delete(prev.slot);
            let used = slotsByTown.get(key);
            if (!used) slotsByTown.set(key, (used = new Set()));
            slot = lowestFreeSlot(used);
            used.add(slot);
          }
          const row: ChannelRow = {
            id: ch.id, guild_id: guild.id, town_key: key, name: ch.name, kind, topic: topic?.slice(0, 300) ?? null,
            slot: slot!, active: 1, deleted_at: null,
          };
          rows.set(ch.id, row);
          this.repos.world.upsertChannel(row);
        }
      }

      // Channels that disappeared: board them up, then recycle the plot after a while.
      for (const r of rows.values()) {
        if (seen.has(r.id)) continue;
        if (r.active) {
          r.active = 0;
          r.deleted_at = now;
          this.repos.world.upsertChannel(r);
        } else if (r.deleted_at && now - r.deleted_at > INACTIVE_RETENTION_MS) {
          rows.delete(r.id);
          this.repos.world.deleteChannel(r.id);
        }
      }

      // Town capacities only grow, so a town's footprint never shrinks under someone's feet.
      for (const t of towns.values()) {
        const mine = [...rows.values()].filter((r) => r.town_key === t.town_key);
        const maxSlot = mine.reduce((m, r) => Math.max(m, r.slot), -1);
        t.capacity = Math.max(t.capacity, townCapacity(maxSlot, mine.length));
        t.active = mine.length > 0 ? 1 : 0;
        this.repos.world.upsertTown(t);
      }
    });

    const after = this.signature(guild.id);
    if (before !== after) {
      const version = before === '' ? this.repos.guilds.version(guild.id) : this.repos.guilds.bumpVersion(guild.id);
      this.cache.delete(guild.id);
      this.log.info({ guild: guild.name, version }, 'World structure updated');
      this.emit('changed', guild.id, version);
    }
  }

  private signature(guildId: string): string {
    const towns = this.repos.world.towns(guildId);
    if (!towns.length) return '';
    const chans = this.repos.world.channels(guildId);
    return JSON.stringify([towns, chans.map((c) => [c.id, c.name, c.slot, c.town_key, c.active, c.kind, c.topic])]);
  }

  /** The full (unfiltered) world for a guild — used server-side for bounds and spawn. */
  full(guildId: string): GuildWorld | null {
    const cached = this.cache.get(guildId);
    if (cached) return cached;
    const guild = this.bot.guild(guildId);
    if (!guild) return null;
    const towns = this.repos.world.towns(guildId);
    const channels = this.repos.world.channels(guildId);
    const spec: WorldSpec = {
      guildId,
      guildName: guild.name,
      towns: towns.filter((t) => t.active).map((t) => this.townSpec(t, channels.filter((c) => c.town_key === t.town_key))),
    };
    const gw = { version: this.repos.guilds.version(guildId), spec, layout: generateWorld(spec) };
    this.cache.set(guildId, gw);
    return gw;
  }

  private townSpec(t: TownRow, channels: ChannelRow[]): TownInput {
    return {
      key: t.town_key,
      name: t.name,
      slot: t.slot,
      capacity: t.capacity,
      buildings: channels.map((c) => ({
        channelId: c.id, name: c.name, kind: c.kind, slot: c.slot, active: Boolean(c.active), topic: c.topic,
      })),
    };
  }

  /**
   * The world as one member may see it: channels they can't view are removed (their plots become
   * gardens), and towns where they can see nothing lose their name. Geometry stays identical for
   * everyone because positions depend only on slots and capacities.
   */
  forMember(guild: Guild, member: GuildMember): { spec: WorldSpec; version: number; canSend: string[] } | null {
    const full = this.full(guild.id);
    if (!full) return null;
    const canSend: string[] = [];
    const towns = full.spec.towns.map((t) => {
      const buildings = t.buildings.filter((b) => {
        if (!b.active) return true;
        const ch = guild.channels.cache.get(b.channelId);
        if (!ch || !this.perms.canView(member, ch)) return false;
        if (b.kind !== 'voice' && this.perms.canSend(member, ch)) canSend.push(b.channelId);
        return true;
      }).map((b) => (b.active ? b : { ...b, name: 'closed', topic: null }));
      const visible = buildings.some((b) => b.active);
      return { ...t, name: visible ? t.name : '', buildings };
    });
    return { spec: { ...full.spec, towns }, version: full.version, canSend };
  }

  /** Discord voice channel occupancy (read-only mirror), filtered to channels the member can view. */
  discordVoice(guild: Guild, member: GuildMember): DiscordVoiceMap {
    const out: DiscordVoiceMap = {};
    for (const vs of guild.voiceStates.cache.values()) {
      if (!vs.channelId || !vs.channel || !vs.member) continue;
      if (vs.id === guild.client.user?.id) continue; // our own bridge bot
      if (!this.perms.canView(member, vs.channel)) continue;
      (out[vs.channelId] ??= []).push({
        id: vs.member.id,
        name: vs.member.displayName,
        avatar: vs.member.displayAvatarURL({ size: 64, extension: 'png' }),
      });
    }
    return out;
  }
}
