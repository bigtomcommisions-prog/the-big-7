/** Gameplay and networking constants shared by server and client. Units are metres. */

export const WORLD = {
  /** Walk / run speeds (m/s). Server uses RUN_SPEED to sanity-check movement. */
  WALK_SPEED: 4.2,
  RUN_SPEED: 7.5,
  JUMP_VELOCITY: 6.2,
  GRAVITY: 18,
  PLAYER_RADIUS: 0.38,
  PLAYER_HEIGHT: 1.8,
} as const;

export const NET = {
  /** Client → server position send rate (Hz). */
  CLIENT_SEND_HZ: 15,
  /** Server snapshot broadcast rate (Hz). */
  SERVER_TICK_HZ: 10,
  /** Players farther than this are not streamed to a client at all. */
  VIEW_RADIUS: 90,
  /** Spatial hash cell size used for interest management. */
  CELL_SIZE: 30,
  /** Client interpolation delay (ms) — roughly 2 server ticks. */
  INTERP_DELAY_MS: 200,
} as const;

export const VOICE = {
  /** Full volume inside this distance. */
  REF_DISTANCE: 3,
  /** Silent beyond this distance. Must be < NET.VIEW_RADIUS. */
  MAX_DISTANCE: 28,
  /** Subscribe to a speaker's audio a little before they become audible. */
  SUBSCRIBE_DISTANCE: 32,
  /** Gain multiplier when a wall separates speaker and listener. */
  OCCLUSION_GAIN: 0.35,
  /** Low-pass cutoff (Hz) applied through walls. */
  OCCLUSION_LOWPASS_HZ: 900,
} as const;

export const CHAT = {
  MAX_LENGTH: 2000,
  BUBBLE_MAX_CHARS: 180,
  DEFAULT_BUBBLE_SECONDS: 8,
  RECENT_MESSAGES: 30,
} as const;
