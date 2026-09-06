export type ItemKind =
  | 'goldS'
  | 'goldM'
  | 'goldL'
  | 'goldXL'
  | 'rockS'
  | 'rockL'
  | 'diamond'
  | 'bag'
  | 'mole'
  | 'moleDiamond';

export interface ItemSpec {
  value: number;
  weight: number;
  radius: number;
}

export const ITEM_SPECS: Record<ItemKind, ItemSpec> = {
  goldS: { value: 50, weight: 1, radius: 18 },
  goldM: { value: 100, weight: 2, radius: 30 },
  goldL: { value: 250, weight: 4, radius: 48 },
  goldXL: { value: 500, weight: 6, radius: 70 },
  rockS: { value: 11, weight: 3, radius: 30 },
  rockL: { value: 20, weight: 5, radius: 44 },
  diamond: { value: 600, weight: 0.5, radius: 16 },
  bag: { value: 0, weight: 1, radius: 28 },
  mole: { value: 2, weight: 0.5, radius: 22 },
  moleDiamond: { value: 602, weight: 0.5, radius: 22 },
};

export interface Entity {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  /** Cosmetic: rotation and shape variation for procedural sprites. */
  rot: number;
  variant: number;
  /** Moles only: horizontal velocity in world units per second. */
  vx: number;
  /** Set once grabbed or destroyed. */
  taken: boolean;
}

export function isGold(k: ItemKind): boolean {
  return k === 'goldS' || k === 'goldM' || k === 'goldL' || k === 'goldXL';
}
export function isRock(k: ItemKind): boolean {
  return k === 'rockS' || k === 'rockL';
}
export function isMole(k: ItemKind): boolean {
  return k === 'mole' || k === 'moleDiamond';
}
