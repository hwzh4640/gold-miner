import { describe, it, expect } from 'vitest';
import { generateLevel, goalFor, isSolid, levelEarnTarget, totalValue, itemValue, valueMargin, WORLD_W, WORLD_H, GROUND_Y } from '../src/game/Level';
import { ITEM_SPECS } from '../src/game/entities';

describe('Level generation', () => {
  it('earn targets grow every level and co-op targets are 1.6x rounded to $50', () => {
    expect(levelEarnTarget(1)).toBe(650);
    expect(levelEarnTarget(2)).toBe(900);
    expect(levelEarnTarget(3)).toBe(1250);
    expect(levelEarnTarget(5)).toBe(2250);
    for (let lvl = 2; lvl <= 40; lvl++) expect(levelEarnTarget(lvl)).toBeGreaterThan(levelEarnTarget(lvl - 1));
    expect(levelEarnTarget(1, 2)).toBe(1050);
    expect(levelEarnTarget(3, 2) % 50).toBe(0);
  });

  it('goals are relative to the bank so carried-over money never clears a level by itself', () => {
    expect(goalFor(0, 1)).toBe(650);
    expect(goalFor(12_345, 4)).toBe(12_345 + levelEarnTarget(4));
    expect(goalFor(999.9, 2, 2)).toBe(999 + levelEarnTarget(2, 2));
    const L = generateLevel(7, 6, 1, goalFor(50_000, 6));
    expect(L.goal).toBe(50_000 + levelEarnTarget(6));
  });

  it('the value margin tightens from 2.4x to 1.6x', () => {
    expect(valueMargin(1)).toBeCloseTo(2.4);
    expect(valueMargin(6)).toBeCloseTo(2.0);
    expect(valueMargin(11)).toBeCloseTo(1.6);
    expect(valueMargin(30)).toBeCloseTo(1.6);
  });

  it('scales item values so a level is clearable in ~12 grabs', () => {
    for (let lvl = 1; lvl <= 30; lvl++) {
      const L = generateLevel(7, lvl);
      const solid = L.entities.filter((e) => isSolid(e.kind));
      const top = solid.map((e) => itemValue(e.kind, lvl)).sort((a, b) => b - a).slice(0, 12);
      expect(top.reduce((a, b) => a + b, 0), `level ${lvl}`).toBeGreaterThanOrEqual(levelEarnTarget(lvl));
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
        // Value that is realistically collectible (moles and bags excluded) must beat the
        // earn target by the level's margin (a little slack for items that found no room).
        const solid = L.entities.filter((e) => isSolid(e.kind));
        expect(totalValue(solid, lvl), `seed ${seed} level ${lvl}`).toBeGreaterThanOrEqual(levelEarnTarget(lvl) * (valueMargin(lvl) - 0.1));
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
