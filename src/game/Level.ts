import { Rng, subSeed } from './rng';
import { ITEM_SPECS, isMole, type Entity, type ItemKind } from './entities';

export const WORLD_W = 1600;
export const WORLD_H = 900;
/** The miner sits on a ledge; items only spawn below this line. */
export const GROUND_Y = 150;
export const LEVEL_SECONDS = 60;

/**
 * Money that must be *earned during* level n, on top of whatever the player already has.
 * Goals are relative: a level's goal is the bank at the end of the previous level plus this
 * amount, so carried-over money can never clear a level by itself.
 * Solo: $650, $900, $1250, $1700, $2250, $2900, $3650, ...
 */
export function levelEarnTarget(level: number, players = 1): number {
  const n = Math.max(0, level - 1);
  const base = 650 + 200 * n + 50 * n * n;
  // Two hooks collect much faster; co-op shares one goal, so raise it to keep it a challenge.
  return players >= 2 ? Math.round((base * COOP_GOAL_MULTIPLIER) / 50) * 50 : base;
}

export const COOP_GOAL_MULTIPLIER = 1.6;

/** Goal for a level given the money in the bank when it starts. */
export function goalFor(bank: number, level: number, players = 1): number {
  return Math.max(0, Math.floor(bank)) + levelEarnTarget(level, players);
}

/**
 * The earn target grows quadratically but a 60-second level only allows ~10-12 grabs, so
 * item values scale up with the target from level 5 on. Difficulty then comes from the
 * shrinking value margin (`valueMargin`), the rockier mix and the faster swing.
 */
export function valueScale(level: number): number {
  return Math.max(1, levelEarnTarget(level) / 2600);
}

/**
 * How much collectible value the field holds relative to the earn target: generous early
 * (2.4x) and tightening to 1.6x by level 11, so later levels need most of the gold.
 */
export function valueMargin(level: number): number {
  return Math.max(1.6, 2.4 - 0.08 * (level - 1));
}

/** Cash value of an item kind on a given level (before shop multipliers). */
export function itemValue(kind: ItemKind, level: number): number {
  return Math.round(ITEM_SPECS[kind].value * valueScale(level));
}

/** Items whose value a player can count on (bags gamble, moles run). */
export function isSolid(kind: ItemKind): boolean {
  return kind !== 'bag' && !isMole(kind);
}

interface Placement {
  kind: ItemKind;
  x: number;
  y: number;
  r: number;
}

/**
 * Builds the item roster for a level. Solid value is topped up to `valueMargin` times the
 * earn target; the mix shifts towards rocks and small gold to make it harder.
 */
function roster(level: number, rng: Rng): ItemKind[] {
  const target = levelEarnTarget(level);
  const kinds: ItemKind[] = [];
  const push = (k: ItemKind, n: number) => {
    for (let i = 0; i < n; i++) kinds.push(k);
  };

  // Fixed-ish base mix, then fill gold until solid value reaches the margin.
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

  const value = () => kinds.reduce((s, k) => s + (isSolid(k) ? itemValue(k, level) : 0), 0);
  const want = target * valueMargin(level);
  let guard = 0;
  while (value() < want && guard++ < 60) {
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
  /** Absolute money goal for this level (bank at level start + earn target). */
  goal: number;
  entities: Entity[];
}

export function generateLevel(seed: number, level: number, players = 1, goal = levelEarnTarget(level, players)): LevelData {
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
  return { level, goal, entities };
}

export function totalValue(entities: readonly Entity[], level: number): number {
  return entities.reduce((s, e) => s + itemValue(e.kind, level), 0);
}
