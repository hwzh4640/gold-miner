import { describe, it, expect } from 'vitest';
import { Rng, subSeed } from '../src/game/rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('differs for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });
  it('stays in range', () => {
    const r = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
  it('subSeed produces distinct streams per level', () => {
    const seen = new Set<number>();
    for (let lvl = 1; lvl <= 50; lvl++) seen.add(subSeed(42, lvl));
    expect(seen.size).toBe(50);
  });
});
