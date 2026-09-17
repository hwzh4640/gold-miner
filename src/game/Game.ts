import { Hook, PIVOT_X, swingPeriodForLevel } from './Hook';
import { generateLevel, goalFor, itemValue, LEVEL_SECONDS, WORLD_W, type LevelData } from './Level';
import { ITEM_SPECS, isMole, isRock, type Entity, type ItemKind } from './entities';
import { Rng, subSeed, randomSeed } from './rng';
import { buffsFromInventory, canBuy, shopOffers, type ItemId, type LevelBuffs, type ShopOffer } from './Shop';
import { newSave, persistSave, type SaveState } from './save';

export type GameState = 'menu' | 'levelIntro' | 'playing' | 'paused' | 'levelResult' | 'shop' | 'gameOver';

/** Short-lived floating text shown in the world (cash amounts, bag results). */
export interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  life: number;
}

export type BagOutcome = { type: 'cash'; amount: number } | { type: 'item'; item: ItemId } | { type: 'nothing' };

/** Where and what a stick of dynamite just destroyed (for the debris effect). */
export interface Blast {
  x: number;
  y: number;
  kind: ItemKind;
}

export interface GameEvents {
  onStateChange(state: GameState): void;
  onCash(entity: Entity, amount: number, player: number): void;
  onBag(outcome: BagOutcome, player: number): void;
  onFire(player: number): void;
  onGrab(entity: Entity, player: number): void;
  onDynamite(player: number, blast: Blast): void;
  onTick(secondsLeft: number): void;
}

const noop: GameEvents = {
  onStateChange() {},
  onCash() {},
  onBag() {},
  onFire() {},
  onGrab() {},
  onDynamite() {},
  onTick() {},
};

/** Where the winches sit for 1 or 2 players. */
export const PIVOTS: Record<1 | 2, number[]> = { 1: [PIVOT_X], 2: [WORLD_W * 0.3, WORLD_W * 0.7] };

export interface Player {
  index: number;
  hook: Hook;
  /** Money this player earned in the current attempt. */
  levelMoney: number;
}

/** Popup colours per player so it is obvious who cashed what. */
export const PLAYER_COLORS = ['#ffe86b', '#9be7ff'];

/**
 * Everything the renderer and overlays need to draw a game. Implemented by `Game`
 * (local/host) and by the guest's `RemoteGame`, which mirrors the host over the network.
 */
export interface GameView {
  state: GameState;
  save: SaveState;
  level: LevelData;
  players: Player[];
  buffs: LevelBuffs;
  timeLeft: number;
  popups: Popup[];
  offers: ShopOffer[];
  lastResultCleared: boolean;
  readonly money: number;
  /** Which local player index this device controls by default (guest = 1). */
  readonly localPlayer: number;
  readonly isOnline: boolean;
  readonly isHost: boolean;
  owns(id: ItemId): boolean;
  canBuy(offer: ShopOffer): boolean;
  // Controller actions (guest implementations forward these to the host).
  primary(player?: number): void;
  useDynamite(player?: number): boolean;
  pause(): void;
  resume(): void;
  restartLevel(): void;
  quitToMenu(): void;
  openShop(): void;
  buy(offer: ShopOffer): boolean;
  nextLevel(): void;
  frame(dt: number): void;
}

export class Game implements GameView {
  state: GameState = 'menu';
  save: SaveState = newSave(0);
  level: LevelData = { level: 1, goal: 0, entities: [] };
  players: Player[] = [{ index: 0, hook: new Hook(), levelMoney: 0 }];
  buffs: LevelBuffs = buffsFromInventory([]);
  timeLeft = LEVEL_SECONDS;
  popups: Popup[] = [];
  offers: ShopOffer[] = [];
  lastResultCleared = false;
  readonly localPlayer = 0;
  readonly isHost = true;
  isOnline = false;
  private levelRng = new Rng(0);
  private lastWholeSecond = LEVEL_SECONDS;
  private acc = 0;
  private events: GameEvents;

  constructor(events: Partial<GameEvents> = {}) {
    this.events = { ...noop, ...events };
  }

  /** Convenience for single-player code paths and tests. */
  get hook(): Hook {
    return this.players[0]!.hook;
  }

  /** Money earned in the current attempt by all players. */
  get levelMoney(): number {
    return this.players.reduce((s, p) => s + p.levelMoney, 0);
  }
  set levelMoney(v: number) {
    this.players[0]!.levelMoney = v;
    for (let i = 1; i < this.players.length; i++) this.players[i]!.levelMoney = 0;
  }

  get money(): number {
    return this.save.money + this.levelMoney;
  }

  private setState(s: GameState): void {
    this.state = s;
    this.events.onStateChange(s);
  }

  private setPlayerCount(n: 1 | 2): void {
    const pivots = PIVOTS[n];
    this.players = pivots.map((px, i) => {
      const hook = this.players[i]?.hook ?? new Hook();
      hook.pivotX = px;
      return { index: i, hook, levelMoney: 0 };
    });
  }

  /* ---------- Flow ---------- */

  newGame(players: 1 | 2 = 1): void {
    this.save = newSave(randomSeed(), players);
    persistSave(this.save);
    this.loadLevel();
  }

  continueGame(save: SaveState, players?: 1 | 2): void {
    const n = players ?? save.players ?? 1;
    this.save = { ...save, inventory: [...save.inventory], players: n };
    // Switching between solo and co-op changes the earn target; a goal the bank already
    // meets (old saves, tampering) is rebuilt so the level still has to be earned.
    if (n !== save.players || !(this.save.goal > this.save.money)) this.save.goal = goalFor(this.save.money, this.save.level, n);
    persistSave(this.save);
    this.loadLevel();
  }

  quitToMenu(): void {
    this.setState('menu');
  }

  /** Prepare the current save.level and show the intro card. */
  loadLevel(): void {
    this.setPlayerCount(this.save.players);
    this.level = generateLevel(this.save.seed, this.save.level, this.save.players, this.save.goal);
    this.levelRng = new Rng(subSeed(this.save.seed, 500_000 + this.save.level));
    this.buffs = buffsFromInventory(this.save.inventory);
    for (const p of this.players) {
      p.hook.reset();
      p.hook.swingPeriod = swingPeriodForLevel(this.save.level);
      p.hook.reelMultiplier = this.buffs.reelMultiplier;
      p.levelMoney = 0;
    }
    this.timeLeft = LEVEL_SECONDS;
    this.lastWholeSecond = LEVEL_SECONDS;
    this.popups = [];
    this.acc = 0;
    this.setState('levelIntro');
  }

  startLevel(): void {
    if (this.state !== 'levelIntro') return;
    this.setState('playing');
  }

  pause(): void {
    if (this.state === 'playing') this.setState('paused');
  }

  resume(): void {
    if (this.state === 'paused') this.setState('playing');
  }

  restartLevel(): void {
    this.loadLevel();
  }

  private endLevel(): void {
    const cleared = this.money >= this.level.goal;
    this.lastResultCleared = cleared;
    if (cleared) {
      this.save.money = this.money;
      for (const p of this.players) p.levelMoney = 0;
      this.save.inventory = []; // consumables are spent
      this.offers = shopOffers(this.save.seed, this.save.level);
      // Advance the save right away: the next goal is today's bank plus the next earn
      // target, so shop spending eats into the margin and a save made in the shop
      // resumes at the next level instead of replaying a cleared one.
      this.save.level += 1;
      this.save.goal = goalFor(this.save.money, this.save.level, this.save.players);
      persistSave(this.save);
      this.setState('levelResult');
    } else {
      this.setState('gameOver');
    }
  }

  /** From the cleared-level card into the shop. */
  openShop(): void {
    if (this.state !== 'levelResult' || !this.lastResultCleared) return;
    this.setState('shop');
  }

  buy(offer: ShopOffer): boolean {
    if (this.state !== 'shop') return false;
    if (!canBuy(this.save.inventory, offer.id, this.save.money, offer.price)) return false;
    this.save.money -= offer.price;
    this.save.inventory.push(offer.id);
    persistSave(this.save);
    return true;
  }

  canBuy(offer: ShopOffer): boolean {
    return canBuy(this.save.inventory, offer.id, this.save.money, offer.price);
  }

  owns(id: ItemId): boolean {
    return this.save.inventory.includes(id);
  }

  nextLevel(): void {
    if (this.state !== 'shop') return;
    this.loadLevel();
  }

  /* ---------- Input ---------- */

  /** Primary action for a player: start the level, or fire that player's hook. */
  primary(player = 0): void {
    if (this.state === 'levelIntro') {
      this.startLevel();
      return;
    }
    const p = this.players[player];
    if (this.state === 'playing' && p && p.hook.fire()) this.events.onFire(player);
  }

  /** Fire a player's hook at an explicit angle (remote players report the angle they saw). */
  fireAt(player: number, angle: number): void {
    const p = this.players[player];
    if (this.state === 'playing' && p && p.hook.fireAt(angle)) this.events.onFire(player);
  }

  useDynamite(player = 0): boolean {
    const p = this.players[player];
    if (this.state !== 'playing' || this.buffs.dynamite <= 0 || !p) return false;
    const e = p.hook.dynamite();
    if (!e) return false;
    this.buffs.dynamite -= 1;
    this.events.onDynamite(player, { x: e.x, y: e.y, kind: e.kind });
    this.popups.push({ x: e.x, y: e.y, text: 'BOOM!', color: '#ff5a2a', age: 0, life: 0.8 });
    return true;
  }

  /* ---------- Simulation ---------- */

  /** Fixed-timestep wrapper; call once per animation frame with real elapsed seconds. */
  frame(dtReal: number): void {
    const step = 1 / 120;
    this.acc += Math.min(dtReal, 0.25);
    while (this.acc >= step) {
      this.tick(step);
      this.acc -= step;
    }
  }

  private tick(dt: number): void {
    // Popups animate in every state so the result screen still looks alive.
    for (const p of this.popups) p.age += dt;
    this.popups = this.popups.filter((p) => p.age < p.life);

    if (this.state === 'levelIntro') {
      for (const p of this.players) p.hook.update(dt, []);
      return;
    }
    if (this.state !== 'playing') return;

    this.timeLeft -= dt;
    const whole = Math.ceil(this.timeLeft);
    if (whole !== this.lastWholeSecond) {
      this.lastWholeSecond = whole;
      this.events.onTick(Math.max(0, whole));
    }

    this.moveMoles(dt);

    for (const p of this.players) {
      const cashed = p.hook.update(dt, this.level.entities);
      if (p.hook.justGrabbed) {
        this.events.onGrab(p.hook.justGrabbed, p.index);
        p.hook.justGrabbed = null;
      }
      if (cashed) this.cash(cashed, p);
    }

    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endLevel();
    }
  }

  private moveMoles(dt: number): void {
    for (const e of this.level.entities) {
      if (e.taken || !isMole(e.kind)) continue;
      e.x += e.vx * dt;
      const r = ITEM_SPECS[e.kind].radius;
      if (e.x < r + 10) {
        e.x = r + 10;
        e.vx = Math.abs(e.vx);
      } else if (e.x > WORLD_W - r - 10) {
        e.x = WORLD_W - r - 10;
        e.vx = -Math.abs(e.vx);
      }
    }
  }

  private cash(e: Entity, p: Player): void {
    if (e.kind === 'bag') {
      this.openBag(e, p);
      return;
    }
    let value = itemValue(e.kind, this.save.level);
    if (isRock(e.kind)) value = Math.round(value * this.buffs.rockMultiplier);
    if (e.kind === 'diamond') value = Math.round(value * this.buffs.diamondMultiplier);
    if (e.kind === 'moleDiamond') value = Math.round(itemValue('mole', this.save.level) + itemValue('diamond', this.save.level) * this.buffs.diamondMultiplier);
    p.levelMoney += value;
    this.popups.push({ x: e.x, y: e.y - 30, text: `+$${value}`, color: PLAYER_COLORS[p.index] ?? '#fff', age: 0, life: 1.1 });
    this.events.onCash(e, value, p.index);
  }

  private openBag(e: Entity, p: Player): void {
    const rng = this.levelRng;
    const lucky = this.buffs.luckyBags;
    let outcome: BagOutcome;
    const roll = rng.next();
    if (!lucky && roll < 0.12) outcome = { type: 'nothing' };
    else if (roll < (lucky ? 0.35 : 0.3)) {
      const items: ItemId[] = ['dynamite', 'drink', 'rockBook', 'polish', 'clover'];
      outcome = { type: 'item', item: rng.pick(items) };
    } else {
      const lo = lucky ? 200 : 20;
      const hi = lucky ? 600 : 500;
      const amount = Math.round((rng.range(lo, hi) * Math.max(1, itemValue('goldS', this.save.level) / 50)) / 10) * 10;
      outcome = { type: 'cash', amount };
    }
    if (outcome.type === 'cash') {
      p.levelMoney += outcome.amount;
      this.popups.push({ x: e.x, y: e.y - 30, text: `+$${outcome.amount}`, color: PLAYER_COLORS[p.index] ?? '#fff', age: 0, life: 1.2 });
    } else if (outcome.type === 'item') {
      // Bag items apply immediately for the rest of this level and are consumed with it.
      if (outcome.item === 'dynamite') this.buffs.dynamite += 1;
      else if (outcome.item === 'drink') {
        this.buffs.reelMultiplier = 1.5;
        for (const pl of this.players) pl.hook.reelMultiplier = 1.5;
      } else if (outcome.item === 'rockBook') this.buffs.rockMultiplier = 3;
      else if (outcome.item === 'polish') this.buffs.diamondMultiplier = 1.5;
      else if (outcome.item === 'clover') this.buffs.luckyBags = true;
    }
    this.events.onBag(outcome, p.index);
  }
}
