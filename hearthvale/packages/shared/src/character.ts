import { z } from 'zod';

/** Base body shapes. Each is a small set of proportions the voxel builder uses. */
export const BODY_TYPES = ['sprout', 'sturdy', 'lanky', 'round'] as const;
export const HAIR_STYLES = ['none', 'short', 'long', 'spiky', 'bun', 'bob'] as const;
export const ACCESSORIES = ['none', 'beanie', 'crown', 'flower', 'headphones', 'glasses', 'strawhat', 'scarf'] as const;

export const SKIN_TONES = ['#f6d7b8', '#eec39a', '#d7a57a', '#b67b52', '#8d5a3b', '#5e3b26', '#b8e0c8', '#c9c2f0'] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const AppearanceSchema = z.object({
  body: z.enum(BODY_TYPES),
  skin: hex,
  hair: z.enum(HAIR_STYLES),
  hairColor: hex,
  shirt: hex,
  pants: hex,
  shoes: hex,
  accessory: z.enum(ACCESSORIES),
  accessoryColor: hex,
});

export type Appearance = z.infer<typeof AppearanceSchema>;

/** Starter characters shown in the picker. Users can tweak any field afterwards. */
export const CHARACTER_PRESETS: { name: string; appearance: Appearance }[] = [
  {
    name: 'Meadow',
    appearance: {
      body: 'sprout', skin: '#f6d7b8', hair: 'bob', hairColor: '#c2703d', shirt: '#7cc47f',
      pants: '#4d6a8f', shoes: '#5a3d2b', accessory: 'flower', accessoryColor: '#ff8fb1',
    },
  },
  {
    name: 'Tinker',
    appearance: {
      body: 'sturdy', skin: '#d7a57a', hair: 'short', hairColor: '#2f2a28', shirt: '#e3a53c',
      pants: '#5b4a3f', shoes: '#2f2a28', accessory: 'glasses', accessoryColor: '#3a3a44',
    },
  },
  {
    name: 'Willow',
    appearance: {
      body: 'lanky', skin: '#8d5a3b', hair: 'long', hairColor: '#1e1b1a', shirt: '#9b7fd6',
      pants: '#3c3f58', shoes: '#e8e2d5', accessory: 'headphones', accessoryColor: '#ef6f6c',
    },
  },
  {
    name: 'Bramble',
    appearance: {
      body: 'round', skin: '#eec39a', hair: 'spiky', hairColor: '#f2c14e', shirt: '#e25d5d',
      pants: '#35553d', shoes: '#6b4a32', accessory: 'beanie', accessoryColor: '#4f86c6',
    },
  },
  {
    name: 'Sage',
    appearance: {
      body: 'sprout', skin: '#b8e0c8', hair: 'bun', hairColor: '#f4f1ea', shirt: '#5fb3b3',
      pants: '#6d597a', shoes: '#3b3355', accessory: 'scarf', accessoryColor: '#f28f3b',
    },
  },
  {
    name: 'Hay',
    appearance: {
      body: 'sturdy', skin: '#b67b52', hair: 'none', hairColor: '#3b2a1e', shirt: '#6f9fd8',
      pants: '#c9a86a', shoes: '#4a3526', accessory: 'strawhat', accessoryColor: '#e8c872',
    },
  },
];

export const DEFAULT_APPEARANCE: Appearance = CHARACTER_PRESETS[0]!.appearance;

export const PreferencesSchema = z.object({
  voiceMode: z.enum(['voice-activity', 'push-to-talk']).default('voice-activity'),
  pushToTalkKey: z.string().max(32).default('KeyV'),
  inputDeviceId: z.string().max(256).default(''),
  outputDeviceId: z.string().max(256).default(''),
  voiceVolume: z.number().min(0).max(2).default(1),
  bubbleSeconds: z.number().min(2).max(60).default(8),
  mouseSensitivity: z.number().min(0.1).max(3).default(1),
  ambientVolume: z.number().min(0).max(1).default(0.4),
  /** World brightness multiplier (lighting, sky, fog). */
  brightness: z.number().min(0.15).max(1.5).default(1),
});

export type Preferences = z.infer<typeof PreferencesSchema>;
export const DEFAULT_PREFERENCES: Preferences = PreferencesSchema.parse({});
