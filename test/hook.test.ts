import { describe, it, expect } from 'vitest';
import { Hook, retractSpeed, PIVOT_X, PIVOT_Y, MIN_LENGTH, SWING_AMPLITUDE } from '../src/game/Hook';
import type { Entity } from '../src/game/entities';

function ent(kind: Entity['kind'], x: number, y: number): Entity {
  return { id: 1, kind, x, y, rot: 0, variant: 0, vx: 0, taken: false };
}

describe('Hook', () => {
  it('heavier items reel slower and the drink speeds things up', () => {
    expect(retractSpeed(6, 1)).toBeLessThan(retractSpeed(1, 1));
    expect(retractSpeed(0.5, 1)).toBeLessThan(retractSpeed(0.5, 1.5));
    expect(retractSpeed(4, 1.5)).toBeCloseTo(retractSpeed(4, 1) * 1.5);
  });

  it('swings within amplitude and only fires while swinging', () => {
    const h = new Hook();
    let maxA = 0;
    for (let i = 0; i < 300; i++) {
      h.update(1 / 60, []);
      maxA = Math.max(maxA, Math.abs(h.angle));
    }
    expect(maxA).toBeLessThanOrEqual(SWING_AMPLITUDE + 1e-9);
    expect(maxA).toBeGreaterThan(SWING_AMPLITUDE * 0.9);
    expect(h.fire()).toBe(true);
    expect(h.fire()).toBe(false);
  });

  it('extends straight down, grabs an item and cashes it on return', () => {
    const h = new Hook();
    // Angle is 0 at t=0; fire immediately.
    h.fire();
    const gold = ent('goldS', PIVOT_X, PIVOT_Y + 400);
    const items = [gold];
    let cashed: Entity | null = null;
    let steps = 0;
    while (!cashed && steps++ < 2000) cashed = h.update(1 / 60, items);
    expect(cashed).toBe(gold);
    expect(gold.taken).toBe(true);
    expect(h.phase).toBe('swing');
    expect(h.length).toBe(MIN_LENGTH);
  });

  it('retracts empty after leaving the world', () => {
    const h = new Hook();
    h.fire();
    let steps = 0;
    while (h.phase === 'extend' && steps++ < 2000) h.update(1 / 60, []);
    expect(h.phase).toBe('retract');
    while (h.phase === 'retract' && steps++ < 4000) h.update(1 / 60, []);
    expect(h.phase).toBe('swing');
  });

  it('dynamite destroys the grabbed item and reels back empty', () => {
    const h = new Hook();
    h.fire();
    const rock = ent('rockL', PIVOT_X, PIVOT_Y + 300);
    let steps = 0;
    while (h.phase !== 'retract' && steps++ < 2000) h.update(1 / 60, [rock]);
    expect(h.grabbed).toBe(rock);
    expect(h.dynamite()).toBe(rock);
    expect(h.grabbed).toBeNull();
    let cashed: Entity | null = null;
    while (h.phase === 'retract' && steps++ < 4000) cashed = h.update(1 / 60, [rock]);
    expect(cashed).toBeNull();
  });
});
