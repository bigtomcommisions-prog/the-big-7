/** Data model of a generated world. Pure data — rendering and collision are derived from it. */

export type BuildingKind = 'text' | 'announcement' | 'voice';

/** What the server knows about a guild's structure, with persisted stable slots. */
export interface WorldInput {
  guildId: string;
  guildName: string;
  towns: TownInput[];
}

export interface TownInput {
  /** Discord category ID, or "uncategorized". */
  key: string;
  name: string;
  /** Stable placement index for this town in the world. */
  slot: number;
  /** Reserved building slots; controls the town's footprint. Only ever grows. */
  capacity: number;
  buildings: BuildingInput[];
}

export interface BuildingInput {
  channelId: string;
  name: string;
  kind: BuildingKind;
  /** Stable placement index within the town. */
  slot: number;
  /** false = channel was deleted; shown boarded-up until its slot is recycled. */
  active: boolean;
  topic?: string | null;
}

export type HouseStyle = 'cottage' | 'tall' | 'longhouse' | 'shop' | 'tower';

export interface HouseColors {
  wall: string;
  roof: string;
  trim: string;
  door: string;
}

export interface HouseLayout {
  channelId: string;
  townKey: string;
  name: string;
  kind: 'text' | 'announcement';
  active: boolean;
  topic: string | null;
  x: number;
  z: number;
  /** Rotation about Y. Local +Z is the front (door side). */
  ry: number;
  w: number;
  d: number;
  /** Wall height. */
  h: number;
  style: HouseStyle;
  colors: HouseColors;
}

export interface PlazaLayout {
  channelId: string;
  townKey: string;
  name: string;
  active: boolean;
  x: number;
  z: number;
  ry: number;
  radius: number;
}

export interface TownLayout {
  key: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  plazaRadius: number;
  /** Angle (radians) from town centre toward the hub — where the main road enters. */
  gateAngle: number;
  palette: number;
  centerpiece: 'fountain' | 'well' | 'tree' | 'bonfire';
}

export interface PathSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  width: number;
  kind: 'road' | 'lane' | 'plaza';
  /** Lanes that only lead to one building carry its channel id so they can be hidden with it. */
  channelId?: string;
}

export interface CreekLayout {
  x: number;
  z: number;
  /** Rotation about Y: the creek runs along local X, the bridge crosses it along local Z. */
  ry: number;
  length: number;
  width: number;
  bridgeWidth: number;
}

export type PropType =
  | 'tree' | 'pine' | 'birch' | 'bush' | 'flower' | 'lamp' | 'bench' | 'fence' | 'rock'
  | 'mushroom' | 'crate' | 'barrel' | 'signpost' | 'mailbox' | 'haybale' | 'stump';

export interface Prop {
  t: PropType;
  x: number;
  z: number;
  ry: number;
  s: number;
  /** Variant / colour index. */
  v: number;
  channelId?: string;
  /** Signposts: text shown on the sign. */
  label?: string;
}

export interface WorldLayout {
  guildId: string;
  seed: number;
  radius: number;
  spawn: { x: number; z: number; ry: number };
  hub: { x: number; z: number; radius: number };
  towns: TownLayout[];
  houses: HouseLayout[];
  plazas: PlazaLayout[];
  paths: PathSegment[];
  creeks: CreekLayout[];
  props: Prop[];
}

export type Zone =
  | { type: 'house'; channelId: string; townKey: string }
  | { type: 'plaza'; channelId: string; townKey: string }
  | { type: 'town'; townKey: string }
  | { type: 'hub' }
  | { type: 'wild' };

export function zoneKey(z: Zone): string {
  switch (z.type) {
    case 'house':
    case 'plaza':
      return `${z.type}:${z.channelId}`;
    case 'town':
      return `town:${z.townKey}`;
    default:
      return z.type;
  }
}
