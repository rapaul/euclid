import { euclid } from './euclid';
import { RandomWalk, rng } from './random';
import { SCALES, degreeToMidi } from './scale';

export interface TrackParams {
  name: string;
  color: string;
  steps: number;
  hits: number;
  rotate: number;
  probability: number; // 0..1 chance a hit actually fires
  gain?: number; // 0..1 per-track level (default 1)
  voice: 'kick' | 'snare' | 'hat' | 'lead' | 'bass';
  /** For pitched voices: random-walk melody range in scale degrees. */
  walkMin?: number;
  walkMax?: number;
  root?: number;
  scale?: string;
  /** Seed for the melodic phrase; change it to get a new bassline. */
  walkSeed?: number;
  /** When true, notes come from a live random walk instead of the looping phrase. */
  randomWalk?: boolean;
}

export interface TrackEvent {
  track: number;
  step: number;
  midi: number;
  velocity: number;
}

export class Track {
  pattern: boolean[];
  /** Fixed melodic phrase in scale degrees, one per step, looped. Empty for unpitched tracks. */
  phrase: number[] = [];
  private liveWalk: RandomWalk | null = null;
  private rand: () => number;

  constructor(public params: TrackParams, seed = 1) {
    this.rand = rng(seed);
    this.pattern = euclid(params.hits, params.steps, params.rotate);
    this.buildPhrase();
  }

  /** Bake a looping phrase from the seed so the bassline is a riff, not an endless meander. */
  private buildPhrase() {
    const { walkMin, walkMax, walkSeed = 1 } = this.params;
    if (walkMin === undefined || walkMax === undefined) { this.phrase = []; return; }
    const r = rng(walkSeed);
    const start = walkMin + Math.floor(r() * (walkMax - walkMin + 1));
    const walk = new RandomWalk(start, walkMin, walkMax, r);
    this.phrase = Array.from({ length: Track.PHRASE_LEN }, (_, i) => (i === 0 ? start : walk.next()));
  }
  static readonly PHRASE_LEN = 32;

  /** Pick a fresh seed for the melodic phrase (pitched voices only). */
  reseedWalk(seed = Math.floor(Math.random() * 2 ** 31)) {
    if (this.phrase.length) this.update({ walkSeed: seed });
  }

  update(p: Partial<TrackParams>) {
    const prev = this.params.walkSeed;
    Object.assign(this.params, p);
    this.pattern = euclid(this.params.hits, this.params.steps, this.params.rotate);
    if (this.params.walkSeed !== prev) this.buildPhrase();
  }

  /** Live random walk (legacy mode). Created lazily; the phrase is left intact so toggling back restores it. */
  private walkNext(): number {
    const { walkMin, walkMax } = this.params;
    this.liveWalk ??= new RandomWalk(0, walkMin!, walkMax!, this.rand);
    return this.liveWalk.next();
  }

  /** Called once per global tick. Returns an event if this track fires. */
  tick(globalStep: number, trackIndex: number): TrackEvent | null {
    const step = globalStep % this.params.steps;
    if (!this.pattern[step]) return null;
    if (this.rand() > this.params.probability) return null;
    let midi = 60;
    if (this.phrase.length) {
      const scale = SCALES[this.params.scale ?? 'minorPent'];
      const degree = this.params.randomWalk ? this.walkNext() : this.phrase[step % this.phrase.length];
      midi = degreeToMidi(degree, scale, this.params.root ?? 48);
    }
    const velocity = step === 0 ? 1 : 0.7 + this.rand() * 0.3;
    return { track: trackIndex, step, midi, velocity };
  }
}
