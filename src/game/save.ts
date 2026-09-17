import { goalFor } from './Level';
import type { ItemId } from './Shop';

export const SAVE_VERSION = 3;
export const STORAGE_KEY = 'goldminer.save';
export const HASH_PREFIX = '#g=';

/** Everything needed to resume a game: layouts and shop offers derive from seed + level. */
export interface SaveState {
  v: number;
  seed: number;
  level: number;
  money: number;
  /** Consumables owned for the upcoming level. */
  inventory: ItemId[];
  /** 1 = solo, 2 = co-op (local or online). */
  players: 1 | 2;
  /** Absolute money goal of `level`: the bank when the previous level ended plus its earn target. */
  goal: number;
}

/** Order defines the bit position in the inventory bitmask. Never reorder; append only. */
export const ITEM_ORDER: readonly ItemId[] = ['dynamite', 'drink', 'rockBook', 'polish', 'clover'];

export function newSave(seed: number, players: 1 | 2 = 1): SaveState {
  return { v: SAVE_VERSION, seed, level: 1, money: 0, inventory: [], players, goal: goalFor(0, 1, players) };
}

function inventoryToMask(inv: ItemId[]): number {
  let mask = 0;
  // Dynamite is stackable: low 4 bits store the dynamite count, higher bits are flags.
  const dyn = Math.min(15, inv.filter((i) => i === 'dynamite').length);
  mask |= dyn;
  for (let i = 1; i < ITEM_ORDER.length; i++) {
    if (inv.includes(ITEM_ORDER[i] as ItemId)) mask |= 1 << (i + 3);
  }
  return mask;
}

function maskToInventory(mask: number): ItemId[] {
  const inv: ItemId[] = [];
  const dyn = mask & 15;
  for (let i = 0; i < dyn; i++) inv.push('dynamite');
  for (let i = 1; i < ITEM_ORDER.length; i++) {
    if (mask & (1 << (i + 3))) inv.push(ITEM_ORDER[i] as ItemId);
  }
  return inv;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function checksum(bytes: Uint8Array, len: number): number {
  let c = 0x5a;
  for (let i = 0; i < len; i++) c = (c * 31 + (bytes[i] as number)) & 0xff;
  return c;
}

const FLAG_COOP = 1;

const u32 = (n: number) => Math.max(0, Math.min(0xffffffff, Math.floor(n)));

/**
 * Binary layout, big-endian.
 *   v1 (13 bytes):        [0] version, [1..4] seed u32, [5] level u8, [6..9] money u32,
 *                         [10..11] inventory mask u16, [12] checksum of bytes 0..11
 *   v2 (14 bytes): as v1 plus [12] flags u8 (bit 0 = two players), [13] checksum of 0..12
 *   v3 (18 bytes): as v2 plus [13..16] goal u32, [17] checksum of 0..16
 * v1/v2 codes (from before goals were stored) still decode; their goal is rebuilt from
 * the bank so the level is never already cleared.
 */
export function encodeSave(s: SaveState): string {
  const len = 18;
  const bytes = new Uint8Array(len);
  const dv = new DataView(bytes.buffer);
  dv.setUint8(0, 3);
  dv.setUint32(1, s.seed >>> 0);
  dv.setUint8(5, Math.max(1, Math.min(255, s.level)));
  dv.setUint32(6, u32(s.money));
  dv.setUint16(10, inventoryToMask(s.inventory));
  dv.setUint8(12, s.players === 2 ? FLAG_COOP : 0);
  dv.setUint32(13, u32(s.goal));
  dv.setUint8(len - 1, checksum(bytes, len - 1));
  return toBase64Url(bytes);
}

/**
 * Choose which save to offer on the menu when both a link (`#g=`) and local storage have
 * one. A stale bookmark must not hide newer progress: same game → the further one wins;
 * different games → the link wins and the local one is offered as an alternative.
 */
export function pickSave(fromHash: SaveState | null, fromStorage: SaveState | null): { primary: SaveState | null; alternative: SaveState | null } {
  if (!fromHash) return { primary: fromStorage, alternative: null };
  if (!fromStorage || fromStorage.seed !== fromHash.seed || fromStorage.players !== fromHash.players) {
    return { primary: fromHash, alternative: fromStorage && fromStorage.seed !== fromHash.seed ? fromStorage : null };
  }
  const further = fromStorage.level > fromHash.level || (fromStorage.level === fromHash.level && fromStorage.money > fromHash.money);
  return { primary: further ? fromStorage : fromHash, alternative: null };
}

export function decodeSave(code: string): SaveState | null {
  const bytes = fromBase64Url(code.trim());
  if (!bytes) return null;
  const v = bytes[0] ?? 0;
  const len = v === 1 ? 13 : v === 2 ? 14 : v === 3 ? 18 : -1;
  if (len < 0 || bytes.length !== len) return null;
  if (checksum(bytes, len - 1) !== bytes[len - 1]) return null;
  const dv = new DataView(bytes.buffer);
  const level = dv.getUint8(5);
  if (level < 1) return null;
  const flags = v >= 2 ? dv.getUint8(12) : 0;
  const players: 1 | 2 = flags & FLAG_COOP ? 2 : 1;
  const money = dv.getUint32(6);
  const goal = v >= 3 ? dv.getUint32(13) : goalFor(money, level, players);
  return {
    v: SAVE_VERSION,
    seed: dv.getUint32(1),
    level,
    money,
    inventory: maskToInventory(dv.getUint16(10)),
    players,
    // A goal at or below the bank would clear itself; rebuild it from the bank instead.
    goal: goal > money ? goal : goalFor(money, level, players),
  };
}

/* ---- Browser persistence (hash + localStorage). Safe to call in non-DOM tests. ---- */

export function readSaveFromHash(hash: string = typeof location !== 'undefined' ? location.hash : ''): SaveState | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  return decodeSave(hash.slice(HASH_PREFIX.length));
}

export function readSaveFromStorage(): SaveState | null {
  try {
    const code = localStorage.getItem(STORAGE_KEY);
    return code ? decodeSave(code) : null;
  } catch {
    return null;
  }
}

export function persistSave(s: SaveState): string {
  const code = encodeSave(s);
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* private mode / quota — the URL still works */
  }
  if (typeof history !== 'undefined' && typeof location !== 'undefined') {
    const url = location.pathname + location.search + HASH_PREFIX + code;
    history.replaceState(null, '', url);
  }
  return code;
}

export function clearStoredSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function shareUrl(s: SaveState): string {
  if (typeof location === 'undefined') return HASH_PREFIX + encodeSave(s);
  return location.origin + location.pathname + location.search + HASH_PREFIX + encodeSave(s);
}
