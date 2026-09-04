import { Track, TrackEvent, TrackParams } from '../seq/track';
import { play } from './voices';

export interface ScheduledEvent extends TrackEvent { time: number; color: string }
export interface Snapshot { bpm: number; swing: number; volume: number; reverb: number; tracks: TrackParams[] }

/**
 * Lookahead scheduler (Chris Wilson's "A Tale of Two Clocks"): a coarse JS timer
 * walks ahead of the audio clock and schedules note-ons at sample-accurate times.
 */
export class Engine {
  ctx: AudioContext;
  master: GainNode;
  analyser: AnalyserNode;
  reverbSend: GainNode;
  private convolver: ConvolverNode;
  tracks: Track[] = [];
  private trackGains: GainNode[] = [];
  bpm = 120;
  /** 0..1: delays every odd 16th by up to a third of a step. */
  swing = 0;
  running = false;
  step = 0; // next global step to schedule
  currentStep = -1; // the step currently sounding (for UI)
  private nextTime = 0;
  private timer: number | null = null;
  private readonly lookahead = 0.12; // seconds
  private readonly interval = 25; // ms
  private queue: ScheduledEvent[] = [];
  /** Total events actually scheduled - handy for tests. */
  eventCount = 0;
  onEvent: (e: ScheduledEvent) => void = () => {};

  constructor(ctx?: AudioContext) {
    this.ctx = ctx ?? new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;
    // Voices -> master -> analyser -> out, plus a parallel send through a synthetic-IR convolver.
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = impulseResponse(this.ctx, 2.2, 2.5);
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.25;
    this.master.connect(this.analyser).connect(this.ctx.destination);
    this.master.connect(this.reverbSend).connect(this.convolver).connect(this.analyser);
  }

  get stepDuration() { return 60 / this.bpm / 4; } // 16th notes
  private _volume = 0.8;
  private _reverb = 0.25;
  /** Target values are cached: AudioParam.value lags behind setTargetAtTime, which would make snapshots stale. */
  get volume() { return this._volume; }
  set volume(v: number) { this._volume = v; this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
  get reverb() { return this._reverb; }
  set reverb(v: number) { this._reverb = v; this.reverbSend.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }

  snapshot(): Snapshot {
    return { bpm: this.bpm, swing: this.swing, volume: this.volume, reverb: this.reverb, tracks: this.tracks.map((t) => ({ ...t.params })) };
  }
  restore(s: Snapshot) {
    this.bpm = s.bpm; this.swing = s.swing; this.volume = s.volume; this.reverb = s.reverb;
    s.tracks.forEach((p, i) => this.tracks[i]?.update(p));
  }

  async start() {
    if (this.running) return;
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.running = true;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.tick(), this.interval);
    this.tick();
  }

  stop() {
    this.running = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.step = 0;
    this.currentStep = -1;
    this.queue = [];
  }

  private tick() {
    while (this.nextTime < this.ctx.currentTime + this.lookahead) {
      const swung = this.nextTime + (this.step % 2 ? this.swing * this.stepDuration / 3 : 0);
      this.scheduleStep(this.step, swung);
      this.nextTime += this.stepDuration;
      this.step++;
    }
  }

  private scheduleStep(step: number, time: number) {
    this.tracks.forEach((t, i) => {
      const ev = t.tick(step, i);
      if (!ev) return;
      play(this.ctx, this.trackGain(i), t.params.voice, time, ev.midi, ev.velocity);
      this.eventCount++;
      this.queue.push({ ...ev, time, color: t.params.color });
    });
    this.queue.push({ track: -1, step, midi: 0, velocity: 0, time, color: '' });
  }

  /** Lazily create one GainNode per track; keeps it in sync with params.gain. */
  trackGain(i: number): GainNode {
    let g = this.trackGains[i];
    if (!g) { g = this.ctx.createGain(); g.connect(this.master); this.trackGains[i] = g; }
    const target = this.tracks[i].params.gain ?? 1;
    if (g.gain.value !== target) g.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
    return g;
  }

  /** Called from rAF: drain events whose time has arrived, so visuals stay in sync. */
  drain(): ScheduledEvent[] {
    const now = this.ctx.currentTime;
    const due: ScheduledEvent[] = [];
    while (this.queue.length && this.queue[0].time <= now) {
      const e = this.queue.shift()!;
      if (e.track === -1) this.currentStep = e.step;
      else { due.push(e); this.onEvent(e); }
    }
    return due;
  }
}

/** Exponentially decaying stereo noise burst - a cheap but convincing hall. */
function impulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
