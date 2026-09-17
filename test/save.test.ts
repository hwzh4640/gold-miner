import { describe, it, expect } from 'vitest';
import { encodeSave, decodeSave, newSave, pickSave, readSaveFromHash, SAVE_VERSION } from '../src/game/save';
import { levelEarnTarget } from '../src/game/Level';

describe('save codec', () => {
  it('round-trips a fresh save', () => {
    const s = newSave(0xdeadbeef);
    expect(decodeSave(encodeSave(s))).toEqual(s);
  });
  it('round-trips level, money and inventory including stacked dynamite', () => {
    const s = {
      v: SAVE_VERSION,
      seed: 7,
      level: 13,
      money: 123456,
      inventory: ['dynamite', 'dynamite', 'drink', 'clover'] as const,
      players: 1 as const,
      goal: 130_000,
    };
    const d = decodeSave(encodeSave({ ...s, inventory: [...s.inventory] }));
    expect(d).not.toBeNull();
    expect(d!.level).toBe(13);
    expect(d!.money).toBe(123456);
    expect(d!.goal).toBe(130_000);
    expect(d!.seed).toBe(7);
    expect(d!.inventory.filter((i) => i === 'dynamite').length).toBe(2);
    expect(d!.inventory).toContain('drink');
    expect(d!.inventory).toContain('clover');
    expect(d!.inventory).not.toContain('polish');
  });
  it('produces URL-safe codes', () => {
    for (let i = 0; i < 50; i++) {
      const code = encodeSave({ ...newSave(i * 2654435761), money: i * 977, level: (i % 40) + 1 });
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
  it('rejects garbage, wrong length and tampered codes', () => {
    expect(decodeSave('')).toBeNull();
    expect(decodeSave('hello world!')).toBeNull();
    expect(decodeSave('AAAA')).toBeNull();
    const good = encodeSave(newSave(1));
    const tampered = good.slice(0, 3) + (good[3] === 'A' ? 'B' : 'A') + good.slice(4);
    expect(decodeSave(tampered)).toBeNull();
  });
  it('round-trips the two-player flag', () => {
    const s = newSave(99, 2);
    const d = decodeSave(encodeSave(s));
    expect(d?.players).toBe(2);
    expect(decodeSave(encodeSave(newSave(99)))?.players).toBe(1);
  });

  it('rebuilds a goal the bank already meets so old links never start on a cleared level', () => {
    const s = { ...newSave(3), level: 4, money: 5000, goal: 4000 };
    const d = decodeSave(encodeSave(s));
    expect(d!.goal).toBe(5000 + levelEarnTarget(4));
    const ok = { ...newSave(3), level: 4, money: 5000, goal: 5001 };
    expect(decodeSave(encodeSave(ok))!.goal).toBe(5001);
  });

  it('still decodes version-1 codes as solo games', () => {
    // Hand-built v1 code: version 1, seed 7, level 3, money 1200, mask 0x0011 (1 dynamite + drink).
    const bytes = new Uint8Array(13);
    const dv = new DataView(bytes.buffer);
    dv.setUint8(0, 1);
    dv.setUint32(1, 7);
    dv.setUint8(5, 3);
    dv.setUint32(6, 1200);
    dv.setUint16(10, 0x0011);
    let c = 0x5a;
    for (let i = 0; i < 12; i++) c = (c * 31 + bytes[i]!) & 0xff;
    bytes[12] = c;
    const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const d = decodeSave(code);
    // Goals were not stored before v3: rebuilt from the bank and the level's earn target.
    expect(d).toEqual({ v: SAVE_VERSION, seed: 7, level: 3, money: 1200, inventory: ['dynamite', 'drink'], players: 1, goal: 1200 + levelEarnTarget(3) });
  });

  it('writes 18-byte v3 codes for solo and co-op alike', () => {
    const solo = encodeSave(newSave(1));
    const coop = encodeSave(newSave(1, 2));
    expect(solo.length).toBe(24); // 18 bytes → 24 base64url chars
    expect(coop.length).toBe(24);
    expect(decodeSave(solo)?.players).toBe(1);
    expect(decodeSave(coop)?.players).toBe(2);
    expect(decodeSave(coop)?.goal).toBe(1050);
  });

  it('pickSave prefers the further progress of the same game and never hides a different local game', () => {
    const link = { ...newSave(5), level: 1, money: 0 };
    const local = { ...newSave(5), level: 4, money: 5000 };
    expect(pickSave(link, local).primary).toEqual(local);
    expect(pickSave(local, link).primary).toEqual(local);
    expect(pickSave(link, local).alternative).toBeNull();
    const other = { ...newSave(9), level: 2, money: 100 };
    const r = pickSave(link, other);
    expect(r.primary).toEqual(link);
    expect(r.alternative).toEqual(other);
    expect(pickSave(null, other).primary).toEqual(other);
    expect(pickSave(link, null).primary).toEqual(link);
  });

  it('reads from a hash string', () => {
    const s = newSave(5);
    expect(readSaveFromHash('#g=' + encodeSave(s))).toEqual(s);
    expect(readSaveFromHash('#other')).toBeNull();
    expect(readSaveFromHash('')).toBeNull();
  });
});
