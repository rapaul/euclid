import type { Engine, Snapshot } from '../audio/engine';
import { History } from '../seq/history';
import type { Viz } from '../viz/viz';

export function buildUI(root: HTMLElement, engine: Engine, viz?: Viz) {
  root.innerHTML = '';
  const initial = engine.snapshot();
  const history = new History<Snapshot>(structuredClone(initial));
  const commit = () => { history.push(structuredClone(engine.snapshot())); syncTransport(); };
  const apply = (s: Snapshot | null) => { if (!s) return; engine.restore(structuredClone(s)); render(); syncTransport(); };

  // ── transport ─────────────────────────────────────────────────────────────
  const transport = el('div', 'transport');
  const play = btn('play', '▶ Play', 'Space');
  play.setAttribute('aria-pressed', 'false');
  play.onclick = async () => { if (engine.running) engine.stop(); else await engine.start(); syncTransport(); };

  const bpm = num('bpm', 40, 240, engine.bpm);
  bpm.onchange = () => { engine.bpm = clamp(Number(bpm.value) || 120, 40, 240); bpm.value = String(engine.bpm); commit(); };
  const tap = btn('tap', 'Tap', 'Tap tempo (T)');
  const taps: number[] = [];
  tap.onclick = () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length >= 2) {
      const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      engine.bpm = clamp(Math.round(60000 / iv), 40, 240); bpm.value = String(engine.bpm); commit();
    }
    if (taps.length > 8) taps.shift();
  };

  const swing = range('swing', 0, 1, 0.01, engine.swing);
  swing.oninput = () => { engine.swing = Number(swing.value); };
  swing.onchange = commit;
  const vol = range('volume', 0, 1, 0.01, engine.volume);
  vol.oninput = () => { engine.volume = Number(vol.value); };
  vol.onchange = commit;
  const rev = range('reverb', 0, 1, 0.01, engine.reverb);
  rev.oninput = () => { engine.reverb = Number(rev.value); };
  rev.onchange = commit;

  const seed = btn('reseed', '⟳ Seed', 'Randomise all patterns (R)');
  seed.onclick = () => { engine.tracks.forEach((t) => t.update({ rotate: Math.floor(Math.random() * t.params.steps), hits: 1 + Math.floor(Math.random() * t.params.steps * 0.6) })); render(); commit(); };
  const bassline = btn('bassline', '♪ New Baseline', 'Generate a new bassline (B)');
  bassline.onclick = () => { engine.tracks.forEach((t) => t.reseedWalk()); commit(); };
  const randomBass = btn('random-bass', '~ Random Baseline', 'Toggle live random-walk bassline (M)');
  const pitched = () => engine.tracks.filter((t) => t.phrase.length);
  randomBass.onclick = () => { const on = !pitched()[0]?.params.randomWalk; pitched().forEach((t) => t.update({ randomWalk: on })); render(); commit(); };
  const undo = btn('undo', '↶ Undo', 'Undo (Ctrl+Z)');
  undo.onclick = () => apply(history.undo());
  const redo = btn('redo', '↷ Redo', 'Redo (Ctrl+Shift+Z)');
  redo.onclick = () => apply(history.redo());
  const reset = btn('reset', '⟲ Reset', 'Revert to defaults');
  reset.onclick = () => { engine.restore(structuredClone(initial)); render(); commit(); };

  const vizBtn = btn('viz-preset', viz?.presetName ?? '', 'Next visualisation (N)');
  vizBtn.className = 'viz-name';
  vizBtn.onclick = () => { if (!viz) return; viz.nextPreset(); vizBtn.textContent = viz.presetName; };
  if (!viz) vizBtn.hidden = true;

  transport.append(
    play, group(bpm, label('bpm', tap)), group(label('swing', swing), label('vol', vol), label('reverb', rev)),
    sep(), seed, bassline, randomBass, undo, redo, reset, vizBtn,
  );

  // ── tracks ────────────────────────────────────────────────────────────────
  const tracks = el('div', 'tracks');
  const head = el('div', 'track head');
  const headParams = el('div', 'params');
  for (const k of ['steps', 'hits', 'rotate', 'prob', 'vol']) headParams.append(el('span', '', k));
  head.append(el('div'), el('div'), headParams); tracks.append(head);
  const rows = engine.tracks.map((t, i) => {
    const row = el('div', 'track'); row.dataset.track = String(i); row.style.setProperty('--track', t.params.color);
    const name = el('div', 'name', t.params.name); name.style.color = t.params.color;
    const steps = el('div', 'steps');
    const params = el('div', 'params');
    const inputs: Record<string, HTMLInputElement> = {};
    const mk = (key: 'steps' | 'hits' | 'rotate' | 'probability' | 'gain', min: number, max: number, stepv = 1) => {
      const r = range(`${key}-${i}`, min, max, stepv, t.params[key] ?? 1); r.dataset.param = key;
      r.oninput = () => { t.update({ [key]: Number(r.value) }); if (key === 'gain') engine.trackGain(i); if (key === 'steps') inputs.hits.max = r.value; render(); };
      r.onchange = commit;
      inputs[key] = r;
      return r;
    };
    params.append(mk('steps', 1, 32), mk('hits', 0, t.params.steps), mk('rotate', 0, 31), mk('probability', 0, 1, 0.05), mk('gain', 0, 1, 0.01));
    row.append(name, steps, params); tracks.append(row);
    return { steps, t, inputs };
  });
  root.append(transport, tracks);

  // Pulse any button on activation (mouse, keyboard, or programmatic .click()).
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    b.classList.remove('pulse'); void b.offsetWidth; // restart animation on rapid presses
    b.classList.add('pulse');
    b.addEventListener('animationend', () => b.classList.remove('pulse'), { once: true });
  });

  function render() {
    rows.forEach(({ steps, t, inputs }) => {
      steps.innerHTML = '';
      t.pattern.forEach((hit) => steps.append(el('div', 'step' + (hit ? ' hit' : ''))));
      for (const k in inputs) inputs[k].value = String(t.params[k as keyof typeof t.params] ?? 1);
      engine.trackGain(rows.indexOf(rows.find((r) => r.t === t)!));
      inputs.hits.max = String(t.params.steps);
    });
    randomBass.setAttribute('aria-pressed', String(!!pitched()[0]?.params.randomWalk));
  }
  function syncTransport() {
    play.setAttribute('aria-pressed', String(engine.running));
    play.textContent = engine.running ? '■ Stop' : '▶ Play';
    bpm.value = String(engine.bpm); swing.value = String(engine.swing); vol.value = String(engine.volume); rev.value = String(engine.reverb);
    undo.disabled = !history.canUndo; redo.disabled = !history.canRedo;
  }
  render(); syncTransport();

  // ── keyboard ──────────────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' && e.key !== 'Escape') return;
    if (e.code === 'Space') { e.preventDefault(); play.click(); }
    else if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); (e.shiftKey ? redo : undo).click(); }
    else if (e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); redo.click(); }
    else if (e.key.toLowerCase() === 't') tap.click();
    else if (e.key.toLowerCase() === 'r') seed.click();
    else if (e.key.toLowerCase() === 'b') bassline.click();
    else if (e.key.toLowerCase() === 'm') randomBass.click();
    else if (e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'v') vizBtn.click();
  });

  /** Cheap per-frame update: only toggles the `cur` class. */
  function frame() {
    if (viz && vizBtn.textContent !== viz.presetName) vizBtn.textContent = viz.presetName;
    rows.forEach(({ steps, t }) => {
      const cur = engine.currentStep < 0 ? -1 : engine.currentStep % t.params.steps;
      const kids = steps.children;
      for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('cur', i === cur);
    });
  }
  return { frame, render, history };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function el(tag: string, cls = '', text = '') { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
function btn(id: string, text: string, title: string) { const b = el('button', '', text) as HTMLButtonElement; b.id = id; b.title = title; return b; }
function num(id: string, min: number, max: number, v: number) { const i = document.createElement('input'); i.type = 'number'; i.id = id; i.min = String(min); i.max = String(max); i.value = String(v); return i; }
function range(id: string, min: number, max: number, step: number, v: number) { const r = document.createElement('input'); r.type = 'range'; r.id = id; r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(v); return r; }
function label(text: string, input: HTMLElement) { const l = document.createElement('label'); l.append(input, document.createTextNode(text)); return l; }
function group(...kids: HTMLElement[]) { const g = el('div', 'group'); g.append(...kids); return g; }
function sep() { return el('span', 'sep'); }
