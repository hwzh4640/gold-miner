import { Rng, subSeed } from './rng';
import { ITEM_SPECS, type Entity, type ItemKind } from './entities';

export const WORLD_W = 1600;
export const WORLD_H = 900;
/** The miner sits on a ledge; items only spawn below this line. */
export const GROUND_Y = 150;
export const LEVEL_SECONDS = 60;

/** Money required to clear level n. Classic curve: $650, $1150, $2150, $3650, $5650, ... */
export function levelGoal(level: number): number {
  const n = level - 1;
  return 650 + 250 * n * (n + 1);
}

/**
 * The classic goal curve is quadratic but a 60-second level only allows ~10-12 grabs, so
 * item values scale up with the goal from level 4 on. This keeps the ratio of goal to
 * collectible value roughly constant while the item mix gets rockier for difficulty.
 */
export function valueScale(level: number): number {
  return Math.max(1, levelGoal(level) / 3200);
}

/** Cash value of an item kind on a given level (before shop multipliers). */
export function itemValue(kind: ItemKind, level: number): number {
  return Math.round(ITEM_SPECS[kind].value * valueScale(level));
}

interface Placement {
  kind: ItemKind;
  x: number;
  y: number;
  r: number;
}

/**
 * Builds the item roster for a level. Counts scale with level so the total value stays
 * comfortably above the goal; the mix shifts towards rocks and small gold to make it harder.
 */
function roster(level: number, rng: Rng): ItemKind[] {
  const goal = levelGoal(level);
  const kinds: ItemKind[] = [];
  const push = (k: ItemKind, n: number) => {
    for (let i = 0; i < n; i++) kinds.push(k);
  };

  // Fixed-ish base mix, then fill gold until value >= 2.2x goal.
  push('goldXL', level <= 2 ? 1 : rng.int(1, 2));
  push('goldL', rng.int(1, 2) + (level > 4 ? 1 : 0));
  push('goldM', rng.int(2, 4));
  push('goldS', rng.int(3, 6));
  push('rockS', rng.int(2, 3) + Math.min(3, Math.floor(level / 2)));
  push('rockL', rng.int(1, 2) + Math.min(2, Math.floor(level / 3)));
  push('bag', rng.int(0, 2));
  if (level >= 2) push('diamond', rng.int(1, 2));
  if (level >= 3) push('mole', rng.int(1, 2));
  if (level >= 5) push('moleDiamond', rng.chance(0.6) ? 1 : 0);

  const value = () => kinds.reduce((s, k) => s + itemValue(k, level), 0);
  let guard = 0;
  while (value() < goal * 2.2 && guard++ < 60) {
    const roll = rng.next();
    if (roll < 0.15) push('goldXL', 1);
    else if (roll < 0.4) push('goldL', 1);
    else if (roll < 0.65) push('goldM', 1);
    else if (roll < 0.85) push('diamond', 1);
    else push('goldS', 1);
  }
  return rng.shuffle(kinds);
}

function place(kinds: ItemKind[], rng: Rng): Placement[] {
  const out: Placement[] = [];
  const minY = GROUND_Y + 120;
  const maxY = WORLD_H - 40;
  const margin = 30;
  // Bigger items first so they always find room.
  const sorted = [...kinds].sort((a, b) => ITEM_SPECS[b].radius - ITEM_SPECS[a].radius);
  for (const kind of sorted) {
    const r = ITEM_SPECS[kind].radius;
    let ok = false;
    for (let attempt = 0; attempt < 200 && !ok; attempt++) {
      // Bias the valuable big stuff deeper down like the original.
      const deepBias = kind === 'goldXL' || kind === 'goldL' ? 0.35 : 0;
      const yMin = minY + (maxY - minY) * deepBias;
      const x = rng.range(margin + r, WORLD_W - margin - r);
      const y = rng.range(yMin + r, maxY - r);
      ok = out.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r + 14);
      if (ok) out.push({ kind, x, y, r });
    }
    // If no room was found the item is simply dropped; roster over-provisions value.
  }
  return out;
}

export interface LevelData {
  level: number;
  goal: number;
  entities: Entity[];
}

export function generateLevel(seed: number, level: number): LevelData {
  const rng = new Rng(subSeed(seed, level));
  const kinds = roster(level, rng);
  const placed = place(kinds, rng);
  const entities: Entity[] = placed.map((p, i) => ({
    id: i,
    kind: p.kind,
    x: p.x,
    y: p.y,
    rot: rng.range(-0.4, 0.4),
    variant: rng.int(0, 1_000_000),
    vx: p.kind === 'mole' || p.kind === 'moleDiamond' ? (rng.chance(0.5) ? 1 : -1) * rng.range(60, 110) : 0,
    taken: false,
  }));
  return { level, goal: levelGoal(level), entities };
}

export function totalValue(entities: readonly Entity[], level: number): number {
  return entities.reduce((s, e) => s + itemValue(e.kind, level), 0);
}
