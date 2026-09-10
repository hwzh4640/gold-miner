import { PIVOTS, PLAYER_COLORS, type GameEvents, type GameState, type GameView, type Player, type Popup } from '../game/Game';
import { Hook, swingPeriodForLevel } from '../game/Hook';
import { generateLevel, LEVEL_SECONDS, WORLD_W, type LevelData } from '../game/Level';
import { ITEM_SPECS, isMole, type Entity } from '../game/entities';
import { buffsFromInventory, canBuy, type ItemId, type LevelBuffs, type ShopOffer } from '../game/Shop';
import { SAVE_VERSION, type SaveState } from '../game/save';
import { PHASES, isHostMsg, isSnapshot, type HostMsg, type InputMsg, type Snapshot } from './protocol';
import type { RelayLink } from './RelayLink';

const noop: GameEvents = {
  onStateChange() {},
  onCash() {},
  onBag() {},
  onFire() {},
  onGrab() {},
  onDynamite() {},
  onTick() {},
};

/**
 * The guest's view of an online game. It never decides anything: it rebuilds the level
 * from the seed, runs the cheap deterministic parts locally (pendulums, reel in/out, moles)
 * for smoothness, and lets host snapshots correct it. Every action is forwarded to the host.
 */
export class RemoteGame implements GameView {
  state: GameState = 'menu';
  save: SaveState = { v: SAVE_VERSION, seed: 0, level: 1, money: 0, inventory: [], players: 2 };
  level: LevelData = { level: 1, goal: 0, entities: [] };
  players: Player[] = PIVOTS[2].map((px, i) => {
    const hook = new Hook();
    hook.pivotX = px;
    return { index: i, hook, levelMoney: 0 };
  });
  buffs: LevelBuffs = buffsFromInventory([]);
  timeLeft = LEVEL_SECONDS;
  popups: Popup[] = [];
  offers: ShopOffer[] = [];
  lastResultCleared = false;
  readonly localPlayer = 1;
  readonly isOnline = true;
  readonly isHost = false;
  private lastSeq = 0;
  private events: GameEvents;
  private byId = new Map<number, Entity>();
  private hostGone = false;

  constructor(
    readonly link: RelayLink,
    events: Partial<GameEvents>,
    private onHostLeft: (final: boolean) => void,
  ) {
    this.events = { ...noop, ...events };
    link.onMessageHandler = (m) => this.onMessage(m);
    link.onSnapshotHandler = (m) => {
      if (isSnapshot(m)) this.applySnapshot(m);
    };
    // Host dropped but may come back (its phone locked, network blip): keep the room.
    link.onPeerLeft = () => {
      if (!this.hostGone) this.onHostLeft(false);
    };
    link.onCloseHandler = () => {
      if (this.hostGone) return;
      this.hostGone = true;
      this.onHostLeft(true);
    };
  }

  get money(): number {
    return this.save.money + this.players.reduce((s, p) => s + p.levelMoney, 0);
  }

  private send(m: InputMsg): void {
    this.link.send(m);
  }

  /* ---------- Controller actions (forwarded) ---------- */

  primary(): void {
    if (this.state === 'levelIntro') this.send({ t: 'in', k: 'start' });
    else if (this.state === 'playing') {
      const hook = this.players[this.localPlayer]!.hook;
      if (hook.phase !== 'swing') return;
      // Optimistic: start extending right away so the tap feels instant; the host's
      // snapshot confirms (or corrects) within ~50 ms.
      this.send({ t: 'in', k: 'fire', a: hook.angle });
      hook.fire();
      this.events.onFire(this.localPlayer);
    }
  }
  useDynamite(): boolean {
    if (this.state !== 'playing' || this.buffs.dynamite <= 0) return false;
    this.send({ t: 'in', k: 'dyn' });
    return true;
  }
  pause(): void {
    if (this.state === 'playing') this.send({ t: 'in', k: 'pause' });
  }
  resume(): void {
    if (this.state === 'paused') this.send({ t: 'in', k: 'resume' });
  }
  restartLevel(): void {
    this.send({ t: 'in', k: 'restart' });
  }
  quitToMenu(): void {
    this.hostGone = true;
    this.link.close();
    this.setState('menu');
  }
  openShop(): void {
    /* host advances */
  }
  buy(offer: ShopOffer): boolean {
    if (!this.canBuy(offer)) return false;
    this.send({ t: 'in', k: 'buy', id: offer.id });
    return true;
  }
  nextLevel(): void {
    /* host only */
  }
  canBuy(offer: ShopOffer): boolean {
    return canBuy(this.save.inventory, offer.id, this.save.money, offer.price);
  }
  owns(id: ItemId): boolean {
    return this.save.inventory.includes(id);
  }

  /* ---------- Host messages ---------- */

  private setState(s: GameState): void {
    this.state = s;
    this.events.onStateChange(s);
  }

  private loadLevel(seed: number, level: number): void {
    this.level = generateLevel(seed, level, 2);
    this.byId = new Map(this.level.entities.map((e) => [e.id, e]));
    for (const p of this.players) {
      p.hook.reset();
      p.hook.swingPeriod = swingPeriodForLevel(level);
      p.levelMoney = 0;
    }
    this.timeLeft = LEVEL_SECONDS;
    this.popups = [];
    this.lastSeq = 0;
  }

  private onMessage(m: unknown): void {
    if (!isHostMsg(m) || this.hostGone) return;
    switch (m.t) {
      case 'hello':
        this.save = { v: SAVE_VERSION, seed: m.seed, level: m.level, money: m.money, inventory: [...m.inventory], players: 2 };
        break;
      case 'phase': {
        const levelChanged = m.seed !== this.save.seed || m.level !== this.save.level || this.level.entities.length === 0;
        this.save = { v: SAVE_VERSION, seed: m.seed, level: m.level, money: m.money, inventory: [...m.inventory], players: 2 };
        this.offers = m.offers;
        this.lastResultCleared = m.cleared;
        this.buffs = m.buffs;
        if (levelChanged || m.state === 'levelIntro') this.loadLevel(m.seed, m.level);
        this.level.goal = m.goal;
        for (const p of this.players) p.hook.reelMultiplier = this.buffs.reelMultiplier;
        if (m.state !== this.state) this.setState(m.state);
        break;
      }
      case 'buffs':
        this.buffs = m.buffs;
        for (const p of this.players) p.hook.reelMultiplier = this.buffs.reelMultiplier;
        break;
      case 'ev':
        this.onEvent(m);
        break;
      case 'bye':
        if (!this.hostGone) {
          this.hostGone = true;
          this.onHostLeft(true);
        }
        break;
    }
  }

  private onEvent(m: Extract<HostMsg, { t: 'ev' }>): void {
    switch (m.k) {
      case 'fire': {
        const hook = this.players[m.p]?.hook;
        if (hook && m.p !== this.localPlayer) hook.fire();
        if (m.p !== this.localPlayer) this.events.onFire(m.p);
        break;
      }
      case 'grab': {
        const e = this.byId.get(m.id);
        const hook = this.players[m.p]?.hook;
        if (e && hook) {
          e.taken = true;
          hook.grabbed = e;
          hook.phase = 'retract';
          this.events.onGrab(e, m.p);
        }
        break;
      }
      case 'cash': {
        const e = this.byId.get(m.id);
        if (e) e.taken = true;
        const hook = this.players[m.p]?.hook;
        if (hook && hook.grabbed?.id === m.id) hook.grabbed = null;
        this.popups.push({ x: m.x, y: m.y - 30, text: `+$${m.amount}`, color: PLAYER_COLORS[m.p] ?? '#fff', age: 0, life: 1.1 });
        this.events.onCash(e ?? { id: m.id, kind: 'goldS', x: m.x, y: m.y, rot: 0, variant: 0, vx: 0, taken: true }, m.amount, m.p);
        break;
      }
      case 'bag': {
        const hook = this.players[m.p]?.hook;
        if (hook && hook.grabbed?.id === m.id) hook.grabbed = null;
        if (m.outcome.type === 'cash') this.popups.push({ x: m.x, y: m.y - 30, text: `+$${m.outcome.amount}`, color: PLAYER_COLORS[m.p] ?? '#fff', age: 0, life: 1.2 });
        this.events.onBag(m.outcome, m.p);
        break;
      }
      case 'dyn': {
        const hook = this.players[m.p]?.hook;
        if (hook?.grabbed) {
          hook.grabbed.taken = true;
          hook.grabbed = null;
        }
        this.popups.push({ x: m.x, y: m.y, text: 'BOOM!', color: '#ff5a2a', age: 0, life: 0.8 });
        this.events.onDynamite(m.p);
        break;
      }
      case 'tick':
        this.events.onTick(m.s);
        break;
    }
  }

  private applySnapshot(s: Snapshot): void {
    if (s.q <= this.lastSeq) return;
    this.lastSeq = s.q;
    this.timeLeft = s.tl;
    this.buffs.dynamite = s.d;
    s.m.forEach((v, i) => {
      const p = this.players[i];
      if (p) p.levelMoney = v;
    });
    for (const id of s.tk) {
      const e = this.byId.get(id);
      if (e) e.taken = true;
    }
    s.h.forEach(([angle, length, phaseIdx, grabbedId, clock], i) => {
      const hook = this.players[i]?.hook;
      if (!hook) return;
      const phase = PHASES[phaseIdx] ?? 'swing';
      hook.swingClock = clock;
      if (phase === 'swing') {
        // Own hook: trust the local pendulum unless we are clearly out of sync (the host
        // may have rejected a fire, or we just re-synced after a level change).
        if (i !== this.localPlayer || hook.phase !== 'swing' || Math.abs(hook.angle - angle) > 0.2) {
          hook.phase = 'swing';
          hook.angle = angle;
        }
        hook.length = Math.min(hook.length, length + 5);
        hook.grabbed = null;
      } else {
        hook.phase = phase;
        hook.angle = angle;
        hook.length = length;
        const g = grabbedId >= 0 ? this.byId.get(grabbedId) ?? null : null;
        if (g) g.taken = true;
        hook.grabbed = g;
      }
    });
    for (const [id, x, y] of s.e) {
      const e = this.byId.get(id);
      if (e) {
        e.vx = x > e.x ? Math.abs(e.vx) : x < e.x ? -Math.abs(e.vx) : e.vx;
        e.x = x;
        e.y = y;
      }
    }
  }

  /* ---------- Local simulation between snapshots ---------- */

  frame(dt: number): void {
    const step = Math.min(dt, 0.1);
    for (const p of this.popups) p.age += step;
    this.popups = this.popups.filter((p) => p.age < p.life);
    if (this.state === 'levelIntro') {
      for (const p of this.players) p.hook.update(step, []);
      return;
    }
    if (this.state !== 'playing') return;
    this.timeLeft = Math.max(0, this.timeLeft - step);
    for (const e of this.level.entities) {
      if (e.taken || !isMole(e.kind)) continue;
      e.x += e.vx * step;
      const r = ITEM_SPECS[e.kind].radius;
      if (e.x < r + 10 || e.x > WORLD_W - r - 10) e.vx = -e.vx;
    }
    for (const p of this.players) {
      // No entities passed: grabbing is the host's call, we only animate.
      const cashed = p.hook.update(step, []);
      if (cashed) cashed.taken = true;
    }
  }
}
