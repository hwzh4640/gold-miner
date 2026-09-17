import { describe, it, expect } from 'vitest';
import { Game } from '../src/game/Game';
import { LEVEL_SECONDS, levelEarnTarget } from '../src/game/Level';

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
    g.continueGame({ v: 3, seed: 77, level: 1, money: 0, inventory: [], players: 1, goal: 650 });
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
    // The save already points at level 2 while shopping; its goal is the pre-shop bank + target.
    expect(g.save.level).toBe(2);
    expect(g.save.goal).toBe(g.level.goal + 1000 + levelEarnTarget(2));
    g.nextLevel();
    expect(g.save.level).toBe(2);
    expect(g.level.level).toBe(2);
    expect(g.level.goal).toBe(g.save.goal);
    expect(g.state).toBe('levelIntro');
    // Inventory bought for level 2 is reflected in buffs.
    if (affordable && offer.id === 'drink') expect(g.buffs.reelMultiplier).toBe(1.5);
  });

  it('applies the level swing period when a level loads', () => {
    const g = new Game();
    g.continueGame({ v: 3, seed: 5, level: 1, money: 0, inventory: [], players: 1, goal: 650 });
    expect(g.hook.swingPeriod).toBe(3);
    g.continueGame({ v: 3, seed: 5, level: 10, money: 0, inventory: [], players: 1, goal: 9999 });
    expect(g.hook.swingPeriod).toBeCloseTo(1.7);
  });

  it('failing the goal is game over and keeps the save at the same level', () => {
    const g = new Game();
    g.continueGame({ v: 3, seed: 5, level: 3, money: 500, inventory: [], players: 1, goal: 500 + levelEarnTarget(3) });
    g.primary();
    g.timeLeft = 0.001;
    g.frame(0.1);
    expect(g.state).toBe('gameOver');
    expect(g.save.level).toBe(3);
    expect(g.save.money).toBe(500);
  });

  it('a rich bank never clears a level by itself: the goal is rebuilt above the money', () => {
    const g = new Game();
    // Old-style save whose money already exceeds the stored goal.
    g.continueGame({ v: 3, seed: 5, level: 6, money: 20_000, inventory: [], players: 1, goal: 8150 });
    expect(g.level.goal).toBe(20_000 + levelEarnTarget(6));
    g.primary();
    g.timeLeft = 0.001;
    g.frame(0.1);
    expect(g.state).toBe('gameOver');
  });

  it('each cleared level raises the goal by the next earn target from the new bank', () => {
    const g = new Game();
    g.newGame();
    expect(g.level.goal).toBe(650);
    for (let lvl = 1; lvl <= 5; lvl++) {
      g.primary();
      g.levelMoney = g.level.goal - g.save.money + 3000; // overshoot generously
      g.timeLeft = 0.001;
      g.frame(0.1);
      expect(g.state).toBe('levelResult');
      const bank = g.save.money;
      expect(g.save.goal).toBe(bank + levelEarnTarget(lvl + 1));
      g.openShop();
      g.nextLevel();
      expect(g.level.level).toBe(lvl + 1);
      // Money on hand is always short of the goal at the start of a level.
      expect(g.money).toBeLessThan(g.level.goal);
    }
  });

  it('dynamite only works while something is hooked, and is consumed', () => {
    const g = new Game();
    g.continueGame({ v: 3, seed: 5, level: 1, money: 0, inventory: ['dynamite', 'dynamite'], players: 1, goal: 650 });
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

describe('Two players (co-op)', () => {
  it('places two hooks side by side and shares one goal that is 1.6x the solo goal', () => {
    const g = new Game();
    g.newGame(2);
    expect(g.players.length).toBe(2);
    expect(g.players[0]!.hook.pivotX).toBeLessThan(g.players[1]!.hook.pivotX);
    expect(g.level.goal).toBe(1050);
    expect(g.save.players).toBe(2);
  });

  it('both players cash into the shared total and the level clears on the sum', () => {
    const g = new Game();
    g.continueGame({ v: 3, seed: 11, level: 1, money: 0, inventory: [], players: 2, goal: 1050 });
    g.primary();
    // Drive both hooks: fire whenever swinging, for a while.
    let t = 0;
    while (t < 30 && g.state === 'playing') {
      for (const p of g.players) if (p.hook.phase === 'swing') g.primary(p.index);
      g.frame(0.05);
      t += 0.05;
    }
    const p1 = g.players[0]!.levelMoney;
    const p2 = g.players[1]!.levelMoney;
    expect(p1 + p2).toBe(g.levelMoney);
    expect(g.money).toBe(p1 + p2);
    expect(p2).toBeGreaterThan(0);
    // Now force a clear on the combined total.
    g.players[0]!.levelMoney = g.level.goal / 2;
    g.players[1]!.levelMoney = g.level.goal / 2 + 1;
    g.timeLeft = 0.001;
    g.frame(0.05);
    expect(g.state).toBe('levelResult');
    expect(g.save.money).toBe(g.level.goal + 1);
    expect(g.save.goal).toBe(g.level.goal + 1 + levelEarnTarget(2, 2));
  });

  it('fireAt fires at the requested angle and only while swinging', () => {
    const g = new Game();
    g.continueGame({ v: 3, seed: 11, level: 1, money: 0, inventory: [], players: 2, goal: 1050 });
    g.primary();
    g.fireAt(1, 0.7);
    expect(g.players[1]!.hook.phase).toBe('extend');
    expect(g.players[1]!.hook.angle).toBeCloseTo(0.7);
    g.fireAt(1, -0.5); // ignored while extending
    expect(g.players[1]!.hook.angle).toBeCloseTo(0.7);
  });

  it('a shared dynamite pool can be used by either player', () => {
    const g = new Game();
    g.continueGame({ v: 3, seed: 3, level: 1, money: 0, inventory: ['dynamite'], players: 2, goal: 1050 });
    g.primary();
    g.primary(1);
    let t = 0;
    while (!g.players[1]!.hook.grabbed && t < 10 && g.state === 'playing') {
      g.frame(1 / 60);
      t += 1 / 60;
      if (g.players[1]!.hook.phase === 'swing') g.primary(1);
    }
    expect(g.players[1]!.hook.grabbed).not.toBeNull();
    expect(g.useDynamite(0)).toBe(false); // player 1 has nothing hooked
    expect(g.useDynamite(1)).toBe(true);
    expect(g.buffs.dynamite).toBe(0);
  });
});
