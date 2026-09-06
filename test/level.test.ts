import { describe, it, expect } from 'vitest';
import { generateLevel, levelGoal, totalValue, itemValue, WORLD_W, WORLD_H, GROUND_Y } from '../src/game/Level';
import { ITEM_SPECS } from '../src/game/entities';

describe('Level generation', () => {
  it('goal curve matches the classic first levels', () => {
    expect(levelGoal(1)).toBe(650);
    expect(levelGoal(2)).toBe(1150);
    expect(levelGoal(3)).toBe(2150);
    expect(levelGoal(4)).toBe(3650);
    expect(levelGoal(5)).toBe(5650);
  });

  it('scales item values so a level is clearable in ~12 grabs', () => {
    for (let lvl = 1; lvl <= 30; lvl++) {
      const L = generateLevel(7, lvl);
      const solid = L.entities.filter((e) => e.kind !== 'bag' && e.kind !== 'mole' && e.kind !== 'moleDiamond');
      const top = solid.map((e) => itemValue(e.kind, lvl)).sort((a, b) => b - a).slice(0, 12);
      expect(top.reduce((a, b) => a + b, 0), `level ${lvl}`).toBeGreaterThanOrEqual(L.goal);
    }
  });

  it('is deterministic for seed+level', () => {
    const a = generateLevel(123, 4);
    const b = generateLevel(123, 4);
    expect(a).toEqual(b);
    expect(generateLevel(124, 4)).not.toEqual(a);
  });

  it('every level 1..25 across several seeds is winnable with margin and in bounds', () => {
    for (const seed of [1, 42, 999, 0xdeadbeef, 2 ** 31]) {
      for (let lvl = 1; lvl <= 25; lvl++) {
        const L = generateLevel(seed, lvl);
        // Value that is realistically collectible (moles and bags excluded) must beat the goal.
        const solid = L.entities.filter((e) => e.kind !== 'bag' && e.kind !== 'mole' && e.kind !== 'moleDiamond');
        expect(totalValue(solid, lvl), `seed ${seed} level ${lvl}`).toBeGreaterThanOrEqual(L.goal * 1.6);
        for (const e of L.entities) {
          const r = ITEM_SPECS[e.kind].radius;
          expect(e.x - r).toBeGreaterThanOrEqual(0);
          expect(e.x + r).toBeLessThanOrEqual(WORLD_W);
          expect(e.y - r).toBeGreaterThan(GROUND_Y);
          expect(e.y + r).toBeLessThanOrEqual(WORLD_H);
        }
        // No overlaps.
        for (let i = 0; i < L.entities.length; i++) {
          for (let j = i + 1; j < L.entities.length; j++) {
            const a = L.entities[i]!;
            const b = L.entities[j]!;
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            expect(d).toBeGreaterThan(ITEM_SPECS[a.kind].radius + ITEM_SPECS[b.kind].radius);
          }
        }
      }
    }
  });
});
