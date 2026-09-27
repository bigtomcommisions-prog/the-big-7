import { z } from 'zod';

/** Base body shapes. Each is a small set of proportions the voxel builder uses. */
export const BODY_TYPES = ['sprout', 'sturdy', 'lanky', 'round'] as const;
export const HAIR_STYLES = ['none', 'short', 'long', 'spiky', 'bun', 'bob'] as const;
export const ACCESSORIES = [
  'beanie', 'crown', 'strawhat', 'cap', 'wizardhat', 'catears', 'bow', 'flower', 'headphones',
  'glasses', 'sunglasses', 'eyepatch', 'mustache', 'beard', 'earrings', 'scarf', 'necklace', 'bowtie', 'backpack', 'cape',
] as const;
export type Accessory = (typeof ACCESSORIES)[number];
/** Only one hat fits at a time; picking another hat replaces it. Same for eyewear, neckwear and the back slot. */
export const ACCESSORY_GROUPS: Partial<Record<Accessory, string>> = {
  beanie: 'hat', crown: 'hat', strawhat: 'hat', cap: 'hat', wizardhat: 'hat', catears: 'hat',
  glasses: 'eyes', sunglasses: 'eyes', eyepatch: 'eyes',
  scarf: 'neck', necklace: 'neck', bowtie: 'neck',
  backpack: 'back', cape: 'back',
};
export const MAX_ACCESSORIES = 6;
export const EYE_STYLES = ['round', 'happy', 'sleepy', 'none'] as const;
export const MOUTH_STYLES = ['line', 'smile', 'open', 'none'] as const;

export const SKIN_TONES = ['#f6d7b8', '#eec39a', '#d7a57a', '#b67b52', '#8d5a3b', '#5e3b26', '#b8e0c8', '#c9c2f0'] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const FaceSchema = z.object({
  eyes: z.enum(EYE_STYLES).default('round'),
  mouth: z.enum(MOUTH_STYLES).default('line'),
  cheeks: z.boolean().default(true),
});

export const WornAccessorySchema = z.object({ kind: z.enum(ACCESSORIES), color: hex });

const AppearanceShape = z.object({
  body: z.enum(BODY_TYPES),
  skin: hex,
  hair: z.enum(HAIR_STYLES),
  hairColor: hex,
  shirt: hex,
  pants: hex,
  shoes: hex,
  face: FaceSchema.default({ eyes: 'round', mouth: 'line', cheeks: true }),
  accessories: z.array(WornAccessorySchema).max(MAX_ACCESSORIES)
    .refine((xs) => new Set(xs.map((x) => x.kind)).size === xs.length, 'Duplicate accessory')
    .refine((xs) => {
      const groups = xs.map((x) => ACCESSORY_GROUPS[x.kind]).filter(Boolean);
      return new Set(groups).size === groups.length;
    }, 'Only one accessory per group (hat, eyewear, neck, back)')
    .default([]),
});

/** Characters saved before multiple accessories had `accessory` + `accessoryColor`; upgrade them. */
function migrateAppearance(v: unknown): unknown {
  if (!v || typeof v !== 'object' || 'accessories' in v) return v;
  const { accessory, accessoryColor, ...rest } = v as Record<string, unknown>;
  const accessories = typeof accessory === 'string' && accessory !== 'none' ? [{ kind: accessory, color: accessoryColor }] : [];
  return { ...rest, accessories };
}

export const AppearanceSchema = z.preprocess(migrateAppearance, AppearanceShape);

export type Appearance = z.infer<typeof AppearanceShape>;
export type Face = z.infer<typeof FaceSchema>;

const FACE: Face = { eyes: 'round', mouth: 'line', cheeks: true };

/** Starter characters shown in the picker. Users can tweak any field afterwards. */
export const CHARACTER_PRESETS: { name: string; appearance: Appearance }[] = [
  {
    name: 'Meadow',
    appearance: {
      body: 'sprout', skin: '#f6d7b8', hair: 'bob', hairColor: '#c2703d', shirt: '#7cc47f',
      pants: '#4d6a8f', shoes: '#5a3d2b', face: FACE, accessories: [{ kind: 'flower', color: '#ff8fb1' }],
    },
  },
  {
    name: 'Tinker',
    appearance: {
      body: 'sturdy', skin: '#d7a57a', hair: 'short', hairColor: '#2f2a28', shirt: '#e3a53c',
      pants: '#5b4a3f', shoes: '#2f2a28', face: FACE, accessories: [{ kind: 'glasses', color: '#3a3a44' }, { kind: 'backpack', color: '#e3a53c' }],
    },
  },
  {
    name: 'Willow',
    appearance: {
      body: 'lanky', skin: '#8d5a3b', hair: 'long', hairColor: '#1e1b1a', shirt: '#9b7fd6',
      pants: '#3c3f58', shoes: '#e8e2d5', face: FACE, accessories: [{ kind: 'headphones', color: '#ef6f6c' }, { kind: 'earrings', color: '#f2c14e' }],
    },
  },
  {
    name: 'Bramble',
    appearance: {
      body: 'round', skin: '#eec39a', hair: 'spiky', hairColor: '#f2c14e', shirt: '#e25d5d',
      pants: '#35553d', shoes: '#6b4a32', face: FACE, accessories: [{ kind: 'beanie', color: '#4f86c6' }],
    },
  },
  {
    name: 'Sage',
    appearance: {
      body: 'sprout', skin: '#b8e0c8', hair: 'bun', hairColor: '#f4f1ea', shirt: '#5fb3b3',
      pants: '#6d597a', shoes: '#3b3355', face: FACE, accessories: [{ kind: 'scarf', color: '#f28f3b' }],
    },
  },
  {
    name: 'Hay',
    appearance: {
      body: 'sturdy', skin: '#b67b52', hair: 'none', hairColor: '#3b2a1e', shirt: '#6f9fd8',
      pants: '#c9a86a', shoes: '#4a3526', face: FACE, accessories: [{ kind: 'strawhat', color: '#e8c872' }, { kind: 'mustache', color: '#3b2a1e' }],
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
