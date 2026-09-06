import { Rng, subSeed } from './rng';

export type ItemId = 'dynamite' | 'drink' | 'rockBook' | 'polish' | 'clover';

export interface ShopOffer {
  id: ItemId;
  price: number;
}

export const ALL_ITEMS: readonly ItemId[] = ['dynamite', 'drink', 'rockBook', 'polish', 'clover'];

/** Base prices, scaled by level like the original (prices climb as goals climb). */
const BASE_PRICE: Record<ItemId, [min: number, max: number]> = {
  dynamite: [50, 250],
  drink: [100, 600],
  rockBook: [30, 400],
  polish: [200, 1000],
  clover: [40, 500],
};

/** Offers for the shop shown *after* `level` was cleared. Deterministic from seed. */
export function shopOffers(seed: number, level: number): ShopOffer[] {
  const rng = new Rng(subSeed(seed, 1_000_000 + level));
  const count = rng.int(3, 5);
  const pool = rng.shuffle([...ALL_ITEMS]);
  const chosen = pool.slice(0, count);
  const scale = 1 + Math.min(4, (level - 1) * 0.35);
  return chosen.map((id) => {
    const [lo, hi] = BASE_PRICE[id];
    const raw = rng.range(lo, hi) * scale;
    return { id, price: Math.round(raw / 5) * 5 };
  });
}

/** Effects of owned consumables applied to a level. */
export interface LevelBuffs {
  dynamite: number;
  reelMultiplier: number;
  rockMultiplier: number;
  diamondMultiplier: number;
  luckyBags: boolean;
}

export function buffsFromInventory(inv: readonly ItemId[]): LevelBuffs {
  return {
    dynamite: inv.filter((i) => i === 'dynamite').length,
    reelMultiplier: inv.includes('drink') ? 1.5 : 1,
    rockMultiplier: inv.includes('rockBook') ? 3 : 1,
    diamondMultiplier: inv.includes('polish') ? 1.5 : 1,
    luckyBags: inv.includes('clover'),
  };
}

/** Can this item be bought again? Only dynamite stacks. */
export function canBuy(inv: readonly ItemId[], id: ItemId, money: number, price: number): boolean {
  if (money < price) return false;
  if (id === 'dynamite') return inv.filter((i) => i === 'dynamite').length < 15;
  return !inv.includes(id);
}
