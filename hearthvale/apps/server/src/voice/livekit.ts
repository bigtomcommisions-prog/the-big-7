import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import type { Config } from '../config.ts';

export const worldRoomName = (guildId: string) => `guild-${guildId}`;

/**
 * Voice runs on a LiveKit SFU (WebRTC). The app server only mints short-lived join tokens; audio
 * flows browser ⇄ LiveKit directly and never touches this process.
 *
 * One LiveKit room per Discord guild. Clients subscribe selectively to nearby speakers
 * (autoSubscribe off) and spatialise them locally with Web Audio.
 *
 * Whether a player may *publish* is decided here, not by the client: tokens carry the current
 * permission, and `setCanPublish` revokes or restores it live (LiveKit unpublishes their mic).
 */
export function createVoiceTokenIssuer(config: Config) {
  const rooms = config.voiceEnabled
    ? new RoomServiceClient(config.LIVEKIT_SERVER_URL.replace(/^ws/, 'http'), config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET)
    : null;
  return {
    enabled: config.voiceEnabled,
    url: config.LIVEKIT_URL,
    async token(guildId: string, userId: string, displayName: string, canPublish: boolean): Promise<string> {
      const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
        identity: userId,
        name: displayName,
        ttl: '2h',
      });
      at.addGrant({
        room: worldRoomName(guildId),
        roomJoin: true,
        canPublish,
        canPublishSources: [TrackSource.MICROPHONE],
        canSubscribe: true,
        canPublishData: false,
      });
      return at.toJwt();
    },
    /** Change a connected participant's publish permission. No-op if they aren't in the room. */
    async setCanPublish(room: string, userId: string, canPublish: boolean): Promise<void> {
      if (!rooms) return;
      try {
        await rooms.updateParticipant(room, userId, {
          permission: { canPublish, canSubscribe: true, canPublishData: false, canPublishSources: [TrackSource.MICROPHONE] },
        });
      } catch {
        /* not connected to that room */
      }
    },
  };
}

export type VoiceTokenIssuer = ReturnType<typeof createVoiceTokenIssuer>;
