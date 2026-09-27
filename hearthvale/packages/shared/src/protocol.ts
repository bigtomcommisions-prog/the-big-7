import { z } from 'zod';
import { AppearanceSchema, type Appearance } from './character.ts';
import { CHAT } from './constants.ts';
import type { WorldInput } from './world/layout.ts';

/**
 * WebSocket protocol. JSON messages tagged by `t`.
 * Client → server messages are validated with zod on the server; never trust them.
 */

export const ANIM = ['idle', 'walk', 'run', 'jump', 'fall', 'sit'] as const;
export type AnimState = (typeof ANIM)[number];

const finite = z.number().finite();

export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('move'),
    x: finite, y: finite, z: finite,
    ry: finite,
    a: z.enum(ANIM),
  }),
  z.object({ t: z.literal('appearance'), appearance: AppearanceSchema }),
  z.object({
    t: z.literal('chat'),
    channelId: z.string().regex(/^\d{5,25}$/),
    content: z.string().min(1).max(CHAT.MAX_LENGTH),
    nonce: z.string().max(64),
  }),
  z.object({ t: z.literal('voice'), muted: z.boolean(), deafened: z.boolean(), connected: z.boolean() }),
  z.object({ t: z.literal('ping'), n: finite }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface PublicUser {
  id: string;
  name: string;
  avatar: string | null;
}

export interface VoiceFlags {
  muted: boolean;
  deafened: boolean;
  connected: boolean;
}

export interface PlayerInfo extends PublicUser {
  appearance: Appearance;
  voice: VoiceFlags;
  x: number;
  y: number;
  z: number;
  ry: number;
  a: AnimState;
}

/** Compact movement update: [id, x, y, z, ry, animIndex]. */
export type PlayerUpdate = [string, number, number, number, number, number];

export interface ChatMessage {
  id: string;
  channelId: string;
  author: PublicUser;
  content: string;
  createdAt: number;
  /** Sent from inside Hearthvale (via webhook) rather than from a Discord client. */
  fromWorld: boolean;
  attachments: number;
  /** Resolved names for mentions appearing in `content`. */
  mentions: {
    users: Record<string, string>;
    channels: Record<string, string>;
    roles: Record<string, string>;
  };
}

export interface GuildSummary {
  id: string;
  name: string;
  icon: string | null;
}

/** Members currently sitting in a Discord voice channel (read-only mirror). */
export type DiscordVoiceMap = Record<string, PublicUser[]>;

/** Idle stand-ins for Discord members who have been active in a channel but aren't in the world. */
export type NpcMap = Record<string, PublicUser[]>;

export type WorldSpec = WorldInput;

/** State of the Discord voice ⇄ world bridge for a guild (one voice channel at a time). */
export interface BridgeInfo {
  channelId: string;
  status: 'starting' | 'active' | 'error';
  error?: string;
}

export type ServerMessage =
  | {
      t: 'welcome';
      self: PlayerInfo;
      guild: GuildSummary;
      world: WorldSpec;
      version: number;
      npcs: NpcMap;
      discordVoice: DiscordVoiceMap;
      canSend: string[];
      bridge: BridgeInfo | null;
    }
  | { t: 'world'; world: WorldSpec; version: number; canSend: string[] }
  | { t: 'snapshot'; add: PlayerInfo[]; remove: string[]; upd: PlayerUpdate[] }
  | { t: 'playerMeta'; id: string; appearance?: Appearance; voice?: VoiceFlags; name?: string }
  | { t: 'message'; message: ChatMessage }
  | { t: 'messageDelete'; channelId: string; id: string }
  | { t: 'chatAck'; nonce: string; ok: boolean; error?: string; messageId?: string }
  | { t: 'npcs'; npcs: NpcMap }
  | { t: 'discordVoice'; discordVoice: DiscordVoiceMap }
  | { t: 'bridge'; bridge: BridgeInfo | null }
  | { t: 'discordSpeaking'; channelId: string; userId: string; speaking: boolean }
  /** Whether you may talk where you're standing (decided by the server from Discord permissions). */
  | { t: 'voicePermission'; canSpeak: boolean; reason: string | null }
  | { t: 'correct'; x: number; y: number; z: number }
  | { t: 'pong'; n: number }
  | { t: 'error'; code: string; message: string };

export const ANIM_INDEX: Record<AnimState, number> = Object.fromEntries(ANIM.map((a, i) => [a, i])) as Record<AnimState, number>;
