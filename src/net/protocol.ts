import type { GameState, BagOutcome } from '../game/Game';
import type { ItemId, LevelBuffs, ShopOffer } from '../game/Shop';
import type { HookPhase } from '../game/Hook';

/** Guest → host. */
export type InputMsg =
  | { t: 'in'; k: 'fire'; a: number }
  | { t: 'in'; k: 'dyn' }
  | { t: 'in'; k: 'start' }
  | { t: 'in'; k: 'buy'; id: ItemId }
  | { t: 'in'; k: 'pause' }
  | { t: 'in'; k: 'resume' }
  | { t: 'in'; k: 'restart' };

/** Host → guest, reliable channel. */
export type HostMsg =
  | { t: 'hello'; seed: number; level: number; money: number; inventory: ItemId[] }
  | {
      t: 'phase';
      state: GameState;
      seed: number;
      level: number;
      goal: number;
      money: number;
      inventory: ItemId[];
      offers: ShopOffer[];
      cleared: boolean;
      buffs: LevelBuffs;
    }
  | { t: 'ev'; k: 'fire'; p: number }
  | { t: 'ev'; k: 'grab'; p: number; id: number }
  | { t: 'ev'; k: 'cash'; p: number; id: number; amount: number; x: number; y: number }
  | { t: 'ev'; k: 'bag'; p: number; id: number; outcome: BagOutcome; x: number; y: number }
  | { t: 'ev'; k: 'dyn'; p: number; x: number; y: number }
  | { t: 'ev'; k: 'tick'; s: number }
  | { t: 'buffs'; buffs: LevelBuffs }
  | { t: 'bye' };

export const PHASES: HookPhase[] = ['swing', 'extend', 'retract'];

/** Host → guest, unreliable channel, ~20 Hz while playing. */
export interface Snapshot {
  t: 's';
  q: number;
  /** Time left in the level. */
  tl: number;
  /** Per-player money earned this level. */
  m: number[];
  /** Shared dynamite count. */
  d: number;
  /** Per hook: [angle, length, phase index, grabbed entity id or -1, swing clock]. */
  h: [number, number, number, number, number][];
  /** Moving entities: [id, x, y]. */
  e: [number, number, number][];
  /** Ids of all taken entities. */
  tk: number[];
}

export type PeerMsg = InputMsg | HostMsg | Snapshot;

export function isInput(m: unknown): m is InputMsg {
  return !!m && typeof m === 'object' && (m as { t?: string }).t === 'in';
}
export function isHostMsg(m: unknown): m is HostMsg {
  const t = (m as { t?: string } | null)?.t;
  return t === 'hello' || t === 'phase' || t === 'ev' || t === 'buffs' || t === 'bye';
}
export function isSnapshot(m: unknown): m is Snapshot {
  return !!m && typeof m === 'object' && (m as { t?: string }).t === 's';
}
