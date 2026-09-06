import { describe, it, expect } from 'vitest';
import { Game } from '../src/game/Game';
import { LEVEL_SECONDS } from '../src/game/Level';

/** Drive a level by firing whenever the hook is swinging until time runs out. */
function playOut(g: Game, fireEvery = 0.05): void {
  let t = 0;
  while (g.state === 'playing' && t < LEVEL_SECONDS + 5) {
    if (g.hook.phase === 'swing') g.primary();
    g.frame(fireEvery);
    t += fireEvery;
  }
}

describe('Game flow', () => {
  it('runs menu → intro → playing → result/gameOver', () => {
    const states: string[] = [];
    const g = new Game({ onStateChange: (s) => states.push(s) });
    g.newGame();
    expect(g.state).toBe('levelIntro');
    g.primary();
    expect(g.state).toBe('playing');
    playOut(g);
    expect(['levelResult', 'gameOver']).toContain(g.state);
    expect(g.timeLeft).toBe(0);
    expect(states[0]).toBe('levelIntro');
  });

  it('a cleared level opens the shop, purchases deduct money and persist inventory', () => {
    const g = new Game();
    g.continueGame({ v: 1, seed: 77, level: 1, money: 0, inventory: [] });
    g.primary();
    // Cheat: pretend the goal is already met so the flow can be exercised deterministically.
    g.levelMoney = g.level.goal + 1000;
    g.timeLeft = 0.001;
    g.frame(0.1);
    expect(g.state).toBe('levelResult');
    expect(g.lastResultCleared).toBe(true);
    g.openShop();
    expect(g.state).toBe('shop');
    expect(g.offers.length).toBeGreaterThanOrEqual(3);
    const before = g.save.money;
    const offer = g.offers[0]!;
    const affordable = before >= offer.price;
    expect(g.buy(offer)).toBe(affordable);
    if (affordable) {
      expect(g.save.money).toBe(before - offer.price);
      expect(g.save.inventory).toContain(offer.id);
    }
    g.nextLevel();
    expect(g.save.level).toBe(2);
    expect(g.state).toBe('levelIntro');
    // Inventory bought for level 2 is reflected in buffs.
    if (affordable && offer.id === 'drink') expect(g.buffs.reelMultiplier).toBe(1.5);
  });

  it('applies the level swing period when a level loads', () => {
    const g = new Game();
    g.continueGame({ v: 1, seed: 5, level: 1, money: 0, inventory: [] });
    expect(g.hook.swingPeriod).toBe(3);
    g.continueGame({ v: 1, seed: 5, level: 10, money: 0, inventory: [] });
    expect(g.hook.swingPeriod).toBeCloseTo(1.7);
  });

  it('failing the goal is game over and keeps the save at the same level', () => {
    const g = new Game();
    g.continueGame({ v: 1, seed: 5, level: 3, money: 500, inventory: [] });
    g.primary();
    g.timeLeft = 0.001;
    g.frame(0.1);
    expect(g.state).toBe('gameOver');
    expect(g.save.level).toBe(3);
    expect(g.save.money).toBe(500);
  });

  it('dynamite only works while something is hooked, and is consumed', () => {
    const g = new Game();
    g.continueGame({ v: 1, seed: 5, level: 1, money: 0, inventory: ['dynamite', 'dynamite'] });
    g.primary();
    expect(g.buffs.dynamite).toBe(2);
    expect(g.useDynamite()).toBe(false);
    g.primary(); // fire
    let t = 0;
    while (!g.hook.grabbed && g.state === 'playing' && t < 10) {
      g.frame(1 / 60);
      t += 1 / 60;
      if (g.hook.phase === 'swing') g.primary();
    }
    expect(g.hook.grabbed).not.toBeNull();
    expect(g.useDynamite()).toBe(true);
    expect(g.buffs.dynamite).toBe(1);
    expect(g.hook.grabbed).toBeNull();
  });
});
