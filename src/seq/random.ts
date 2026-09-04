/** Deterministic PRNG (mulberry32) so tests and replays are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bounded random walk over integer scale degrees. */
export class RandomWalk {
  constructor(
    public value: number,
    private min: number,
    private max: number,
    private rand: () => number,
    private maxStep = 2,
  ) {}
  next(): number {
    const delta = Math.round((this.rand() * 2 - 1) * this.maxStep);
    let v = this.value + delta;
    if (v > this.max) v = this.max - (v - this.max);
    if (v < this.min) v = this.min + (this.min - v);
    this.value = Math.max(this.min, Math.min(this.max, v));
    return this.value;
  }
}
