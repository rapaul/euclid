import { midiToFreq } from '../seq/scale';

export type VoiceName = 'kick' | 'snare' | 'hat' | 'lead' | 'bass';

/** Simple synthesised drum + tonal voices using native Web Audio nodes. */
export function play(ctx: AudioContext, out: AudioNode, voice: VoiceName, time: number, midi: number, vel: number) {
  switch (voice) {
    case 'kick': return kick(ctx, out, time, vel);
    case 'snare': return snare(ctx, out, time, vel);
    case 'hat': return hat(ctx, out, time, vel);
    case 'bass': return tone(ctx, out, time, midiToFreq(midi - 12), vel, 'sawtooth', 0.35, 300);
    case 'lead': return tone(ctx, out, time, midiToFreq(midi + 12), vel, 'square', 0.25, 1800);
  }
}

function env(ctx: AudioContext, t: number, peak: number, decay: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  return g;
}

function kick(ctx: AudioContext, out: AudioNode, t: number, vel: number) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  const g = env(ctx, t, vel, 0.4);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + 0.45);
}

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function snare(ctx: AudioContext, out: AudioNode, t: number, vel: number) {
  const n = noise(ctx);
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
  const g = env(ctx, t, vel * 0.6, 0.18);
  n.connect(f).connect(g).connect(out);
  n.start(t); n.stop(t + 0.2);
  const o = ctx.createOscillator(); o.frequency.value = 190;
  const g2 = env(ctx, t, vel * 0.5, 0.1);
  o.connect(g2).connect(out); o.start(t); o.stop(t + 0.12);
}

function hat(ctx: AudioContext, out: AudioNode, t: number, vel: number) {
  const n = noise(ctx);
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = env(ctx, t, vel * 0.25, 0.06);
  n.connect(f).connect(g).connect(out);
  n.start(t); n.stop(t + 0.08);
}

function tone(ctx: AudioContext, out: AudioNode, t: number, freq: number, vel: number, type: OscillatorType, decay: number, cutoff: number) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
  f.frequency.setValueAtTime(cutoff * 3, t);
  f.frequency.exponentialRampToValueAtTime(cutoff, t + decay);
  const g = env(ctx, t, vel * 0.3, decay);
  o.connect(f).connect(g).connect(out);
  o.start(t); o.stop(t + decay + 0.05);
}
