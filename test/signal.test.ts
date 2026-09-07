import { describe, it, expect } from 'vitest';
import { extractCode, parseHash } from '../src/net/signal';

describe('signal hash handling', () => {
  it('parses invite, reply and save fragments', () => {
    expect(parseHash('#o=abc_DEF-123')).toEqual({ kind: 'invite', code: 'abc_DEF-123' });
    expect(parseHash('#a=xyz')).toEqual({ kind: 'reply', code: 'xyz' });
    expect(parseHash('#g=AVp_1qUBAAAAAAAAxg')).toEqual({ kind: 'save', code: 'AVp_1qUBAAAAAAAAxg' });
    expect(parseHash('#nope').kind).toBeNull();
    expect(parseHash('').kind).toBeNull();
    expect(parseHash('#o=has space').kind).toBeNull();
  });
  it('extracts codes from pasted links or bare codes of the expected kind', () => {
    const code = 'A'.repeat(60);
    expect(extractCode(`https://pages.hz.ax/gold-miner/#a=${code}`, 'reply')).toBe(code);
    expect(extractCode(`https://pages.hz.ax/gold-miner/#a=${code}`, 'invite')).toBeNull();
    expect(extractCode(`  ${code}\n`, 'reply')).toBe(code);
    expect(extractCode('short', 'reply')).toBeNull();
  });
});
