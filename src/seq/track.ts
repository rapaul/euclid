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
}

export interface TrackEvent {
  track: number;
  step: number;
  midi: number;
  velocity: number;
}

export class Track {
  pattern: boolean[];
  private walk: RandomWalk | null;
  private rand: () => number;

  constructor(public params: TrackParams, seed = 1) {
    this.rand = rng(seed);
    this.pattern = euclid(params.hits, params.steps, params.rotate);
    this.walk =
      params.walkMin !== undefined && params.walkMax !== undefined
        ? new RandomWalk(0, params.walkMin, params.walkMax, this.rand)
        : null;
  }

  update(p: Partial<TrackParams>) {
    Object.assign(this.params, p);
    this.pattern = euclid(this.params.hits, this.params.steps, this.params.rotate);
  }

  /** Called once per global tick. Returns an event if this track fires. */
  tick(globalStep: number, trackIndex: number): TrackEvent | null {
    const step = globalStep % this.params.steps;
    if (!this.pattern[step]) return null;
    if (this.rand() > this.params.probability) return null;
    let midi = 60;
    if (this.walk) {
      const scale = SCALES[this.params.scale ?? 'minorPent'];
      midi = degreeToMidi(this.walk.next(), scale, this.params.root ?? 48);
    }
    const velocity = step === 0 ? 1 : 0.7 + this.rand() * 0.3;
    return { track: trackIndex, step, midi, velocity };
  }
}
