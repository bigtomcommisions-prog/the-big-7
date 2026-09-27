import type { Appearance, ChatMessage, GuildSummary, Preferences } from '@hearthvale/shared';

/**
 * Where the API lives. Empty = same origin (dev, or server also serving the client).
 * Set VITE_API_ORIGIN (e.g. https://api.yourdomain.com) when the client is hosted separately.
 */
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(API_ORIGIN + url, {
    method,
    credentials: API_ORIGIN ? 'include' : 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      // Required by the server for mutating requests (CSRF defence).
      ...(method !== 'GET' ? { 'X-Hearthvale': '1' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export interface Me {
  user: { id: string; name: string; username: string; avatar: string | null };
  appearance: Appearance | null;
  preferences: Preferences;
  voiceEnabled: boolean;
}

export interface GuildList {
  joinable: GuildSummary[];
  invitable: (GuildSummary & { inviteUrl: string })[];
  botReady: boolean;
}

export const api = {
  me: () => request<Me>('GET', '/api/me'),
  guilds: () => request<GuildList>('GET', '/api/guilds'),
  saveCharacter: (a: Appearance) => request<{ ok: true }>('PUT', '/api/character', a),
  savePreferences: (p: Preferences) => request<{ ok: true }>('PUT', '/api/preferences', p),
  messages: (guildId: string, channelId: string) =>
    request<{ messages: ChatMessage[] }>('GET', `/api/guilds/${guildId}/channels/${channelId}/messages`),
  voiceToken: (guildId: string) => request<{ url: string; token: string }>('POST', `/api/guilds/${guildId}/voice-token`),
  bridgeToken: (guildId: string, channelId: string) =>
    request<{ url: string; token: string; canSpeak: boolean }>('POST', `/api/guilds/${guildId}/voice-bridge-token`, { channelId }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
};
