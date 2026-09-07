import { describe, it, expect } from 'vitest';
import { encodeSave, decodeSave, newSave, readSaveFromHash, SAVE_VERSION } from '../src/game/save';

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
    };
    const d = decodeSave(encodeSave({ ...s, inventory: [...s.inventory] }));
    expect(d).not.toBeNull();
    expect(d!.level).toBe(13);
    expect(d!.money).toBe(123456);
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
    expect(d).toEqual({ v: SAVE_VERSION, seed: 7, level: 3, money: 1200, inventory: ['dynamite', 'drink'], players: 1 });
  });

  it('reads from a hash string', () => {
    const s = newSave(5);
    expect(readSaveFromHash('#g=' + encodeSave(s))).toEqual(s);
    expect(readSaveFromHash('#other')).toBeNull();
    expect(readSaveFromHash('')).toBeNull();
  });
});
