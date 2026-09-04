import { Track } from './track';
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

describe('track phrase', () => {
  const mk = (walkSeed: number) => new Track({ name: 'b', color: '', voice: 'bass', steps: 16, hits: 16, rotate: 0, probability: 1, walkMin: -2, walkMax: 4, walkSeed }, 1);
  it('loops the same notes each cycle', () => {
    const t = mk(3);
    const a = Array.from({ length: 16 }, (_, i) => t.tick(i, 0)!.midi);
    const b = Array.from({ length: 16 }, (_, i) => t.tick(i + 16, 0)!.midi);
    expect(a).toEqual(b);
  });
  it('changes with the seed and restores via update', () => {
    const t = mk(3);
    const a = [...t.phrase];
    t.reseedWalk(99);
    expect(t.phrase).not.toEqual(a);
    t.update({ walkSeed: 3 });
    expect(t.phrase).toEqual(a);
  });
});

describe('random walk mode', () => {
  it('toggling back restores the looping phrase', () => {
    const t = new Track({ name: 'b', color: '', voice: 'bass', steps: 16, hits: 16, rotate: 0, probability: 1, walkMin: -2, walkMax: 4, walkSeed: 3 }, 1);
    const loop = Array.from({ length: 16 }, (_, i) => t.tick(i, 0)!.midi);
    t.update({ randomWalk: true });
    for (let i = 0; i < 64; i++) t.tick(i, 0);
    t.update({ randomWalk: false });
    expect(Array.from({ length: 16 }, (_, i) => t.tick(i, 0)!.midi)).toEqual(loop);
  });
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
