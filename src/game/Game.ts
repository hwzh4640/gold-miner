import { Hook } from './Hook';
import { generateLevel, itemValue, LEVEL_SECONDS, WORLD_W, type LevelData } from './Level';
import { ITEM_SPECS, isMole, isRock, type Entity } from './entities';
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

export interface GameEvents {
  onStateChange(state: GameState): void;
  onCash(entity: Entity, amount: number): void;
  onBag(outcome: BagOutcome): void;
  onFire(): void;
  onGrab(entity: Entity): void;
  onDynamite(): void;
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

export class Game {
  state: GameState = 'menu';
  save: SaveState = newSave(0);
  level: LevelData = { level: 1, goal: 0, entities: [] };
  hook = new Hook();
  buffs: LevelBuffs = buffsFromInventory([]);
  /** Money earned in the current attempt (save.money is the value at level start). */
  levelMoney = 0;
  timeLeft = LEVEL_SECONDS;
  popups: Popup[] = [];
  offers: ShopOffer[] = [];
  lastResultCleared = false;
  private levelRng = new Rng(0);
  private lastWholeSecond = LEVEL_SECONDS;
  private acc = 0;
  private events: GameEvents;

  constructor(events: Partial<GameEvents> = {}) {
    this.events = { ...noop, ...events };
  }

  get money(): number {
    return this.save.money + this.levelMoney;
  }

  private setState(s: GameState): void {
    this.state = s;
    this.events.onStateChange(s);
  }

  /* ---------- Flow ---------- */

  newGame(): void {
    this.save = newSave(randomSeed());
    persistSave(this.save);
    this.loadLevel();
  }

  continueGame(save: SaveState): void {
    this.save = { ...save, inventory: [...save.inventory] };
    persistSave(this.save);
    this.loadLevel();
  }

  quitToMenu(): void {
    this.setState('menu');
  }

  /** Prepare the current save.level and show the intro card. */
  loadLevel(): void {
    this.level = generateLevel(this.save.seed, this.save.level);
    this.levelRng = new Rng(subSeed(this.save.seed, 500_000 + this.save.level));
    this.buffs = buffsFromInventory(this.save.inventory);
    this.hook.reset();
    this.hook.reelMultiplier = this.buffs.reelMultiplier;
    this.levelMoney = 0;
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
      this.levelMoney = 0;
      this.save.inventory = []; // consumables are spent
      this.offers = shopOffers(this.save.seed, this.save.level);
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
    this.save.level += 1;
    persistSave(this.save);
    this.loadLevel();
  }

  /* ---------- Input ---------- */

  /** Primary action: start level, or fire the hook. */
  primary(): void {
    if (this.state === 'levelIntro') {
      this.startLevel();
      return;
    }
    if (this.state === 'playing' && this.hook.fire()) this.events.onFire();
  }

  useDynamite(): boolean {
    if (this.state !== 'playing' || this.buffs.dynamite <= 0) return false;
    const e = this.hook.dynamite();
    if (!e) return false;
    this.buffs.dynamite -= 1;
    this.events.onDynamite();
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
      this.hook.update(dt, []);
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

    const cashed = this.hook.update(dt, this.level.entities);
    if (this.hook.justGrabbed) {
      this.events.onGrab(this.hook.justGrabbed);
      this.hook.justGrabbed = null;
    }
    if (cashed) this.cash(cashed);

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

  private cash(e: Entity): void {
    if (e.kind === 'bag') {
      this.openBag(e);
      return;
    }
    let value = itemValue(e.kind, this.save.level);
    if (isRock(e.kind)) value = Math.round(value * this.buffs.rockMultiplier);
    if (e.kind === 'diamond') value = Math.round(value * this.buffs.diamondMultiplier);
    if (e.kind === 'moleDiamond') value = Math.round(itemValue('mole', this.save.level) + itemValue('diamond', this.save.level) * this.buffs.diamondMultiplier);
    this.levelMoney += value;
    this.popups.push({ x: e.x, y: e.y - 30, text: `+$${value}`, color: '#ffe86b', age: 0, life: 1.1 });
    this.events.onCash(e, value);
  }

  private openBag(e: Entity): void {
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
      this.levelMoney += outcome.amount;
      this.popups.push({ x: e.x, y: e.y - 30, text: `+$${outcome.amount}`, color: '#ffe86b', age: 0, life: 1.2 });
    } else if (outcome.type === 'item') {
      // Bag items apply immediately for the rest of this level and are consumed with it.
      if (outcome.item === 'dynamite') this.buffs.dynamite += 1;
      else if (outcome.item === 'drink') {
        this.buffs.reelMultiplier = 1.5;
        this.hook.reelMultiplier = 1.5;
      } else if (outcome.item === 'rockBook') this.buffs.rockMultiplier = 3;
      else if (outcome.item === 'polish') this.buffs.diamondMultiplier = 1.5;
      else if (outcome.item === 'clover') this.buffs.luckyBags = true;
    }
    this.events.onBag(outcome);
  }
}
