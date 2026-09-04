export const SCALES: Record<string, number[]> = {
  minorPent: [0, 3, 5, 7, 10],
  majorPent: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  wholeTone: [0, 2, 4, 6, 8, 10],
};

/** Map a scale degree (may be negative / beyond the octave) to a MIDI note. */
export function degreeToMidi(degree: number, scale: number[], root = 48): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return root + oct * 12 + scale[idx];
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
