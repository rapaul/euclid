import { Engine } from './audio/engine';
import { Track } from './seq/track';
import { buildUI } from './ui/ui';
import { Viz } from './viz/viz';

const engine = new Engine();
engine.tracks = [
  new Track({ name: 'kick', color: '#ff4fd8', voice: 'kick', steps: 16, hits: 4, rotate: 0, probability: 1, gain: 1 }, 1),
  new Track({ name: 'snare', color: '#4fd8ff', voice: 'snare', steps: 16, hits: 2, rotate: 4, probability: 0.95, gain: 0.9 }, 2),
  new Track({ name: 'hat', color: '#d8ff4f', voice: 'hat', steps: 12, hits: 7, rotate: 0, probability: 0.85, gain: 0.7 }, 3),
  new Track({ name: 'bass', color: '#ff8c4f', voice: 'bass', steps: 16, hits: 5, rotate: 0, probability: 0.9, walkMin: -2, walkMax: 4, root: 45, scale: 'minorPent', gain: 0.85 }, 4),
];

const canvas = document.getElementById('viz') as HTMLCanvasElement;
const viz = new Viz(canvas, engine.analyser);
const ui = buildUI(document.getElementById("ui")!, engine, viz);

function loop() {
  const now = performance.now() / 1000;
  for (const e of engine.drain()) viz.pulse(e, engine.tracks.length, now);
  viz.render(now);
  ui.frame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Expose for e2e tests / console poking.
declare global { interface Window { __synth: { engine: Engine; viz: Viz; ui: ReturnType<typeof buildUI> } } }
window.__synth = { engine, viz, ui };
