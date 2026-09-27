import { AccessToken, TrackSource } from 'livekit-server-sdk';
import type { Config } from '../config.ts';

/**
 * Voice runs on a LiveKit SFU (WebRTC). The app server only mints short-lived join tokens; audio
 * flows browser ⇄ LiveKit directly and never touches this process.
 *
 * One LiveKit room per Discord guild. Clients subscribe selectively to nearby speakers
 * (autoSubscribe off) and spatialise them locally with Web Audio.
 */
export function createVoiceTokenIssuer(config: Config) {
  return {
    enabled: config.voiceEnabled,
    url: config.LIVEKIT_URL,
    async token(guildId: string, userId: string, displayName: string): Promise<string> {
      const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
        identity: userId,
        name: displayName,
        ttl: '2h',
      });
      at.addGrant({
        room: `guild-${guildId}`,
        roomJoin: true,
        canPublish: true,
        canPublishSources: [TrackSource.MICROPHONE],
        canSubscribe: true,
        canPublishData: false,
      });
      return at.toJwt();
    },
  };
}

export type VoiceTokenIssuer = ReturnType<typeof createVoiceTokenIssuer>;
