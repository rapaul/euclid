import { describe, expect, it } from 'vitest';
import { euclid } from './euclid';
import { degreeToMidi, midiToFreq } from './scale';
import { RandomWalk, rng } from './random';

const s = (b: boolean[]) => b.map((x) => (x ? 'x' : '.')).join('');

describe('euclid', () => {
  it('produces the classic patterns', () => {
    expect(s(euclid(3, 8))).toBe('x..x..x.');
    expect(s(euclid(5, 8))).toBe('x.xx.xx.');
    expect(s(euclid(4, 16))).toBe('x...x...x...x...');
    expect(s(euclid(7, 12))).toBe('x.xx.x.xx.x.');
  });
  it('handles edges', () => {
    expect(s(euclid(0, 4))).toBe('....');
    expect(s(euclid(4, 4))).toBe('xxxx');
    expect(s(euclid(9, 4))).toBe('xxxx');
    expect(euclid(3, 0)).toEqual([]);
  });
  it('rotates', () => {
    expect(s(euclid(3, 8, 1))).toBe('..x..x.x');
    expect(s(euclid(3, 8, -1))).toBe('.x..x..x');
  });
  it('always has exactly `hits` true entries', () => {
    for (let n = 1; n <= 16; n++) for (let k = 0; k <= n; k++)
      expect(euclid(k, n).filter(Boolean).length).toBe(k);
  });
});

describe('scale', () => {
  it('maps degrees across octaves', () => {
    const pent = [0, 3, 5, 7, 10];
    expect(degreeToMidi(0, pent, 48)).toBe(48);
    expect(degreeToMidi(4, pent, 48)).toBe(58);
    expect(degreeToMidi(5, pent, 48)).toBe(60);
    expect(degreeToMidi(-1, pent, 48)).toBe(46);
  });
  it('A4 = 440', () => expect(midiToFreq(69)).toBe(440));
});

describe('random', () => {
  it('is deterministic', () => {
    const a = rng(42), b = rng(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
  it('walk stays in bounds', () => {
    const w = new RandomWalk(0, -3, 5, rng(7));
    for (let i = 0; i < 500; i++) { const v = w.next(); expect(v).toBeGreaterThanOrEqual(-3); expect(v).toBeLessThanOrEqual(5); }
  });
});
