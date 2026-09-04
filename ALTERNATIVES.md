# Alternatives considered

Goal: a synth / sampler / groovebox-style instrument where the top half of the
screen is dedicated to trippy, music-reactive visualisation.

## Recommendation

**Build as a web app** (TypeScript + Vite, AudioWorklet for DSP, WebGL2 shaders
for visuals). Go native only if sub-5 ms round-trip latency for live playing or
VST/AU plugin hosting becomes a requirement.

Chosen option: **4. Generative / Euclidean sequencer** (see below).

## What to build

| # | Option | Description | Web-feasible? |
|---|--------|-------------|---------------|
| 1 | **Step-sequencer groovebox** (Elektron / TR-8 style) | 16-step grid, 4–8 tracks, drum synth + per-step parameter locks, swing, pattern chaining | ✅ Easiest, most fun first. Lookahead scheduling from an AudioWorklet clock is rock solid. |
| 2 | **Sample-based sampler / slicer** (SP-404 / Octatrack) | Load/record samples, auto-slice on transients, pitch & time-stretch, pad triggering | ✅ Sample playback is trivial; decent time-stretch (phase vocoder / granular) works in a Worklet. |
| 3 | **Subtractive / wavetable poly synth** | Oscillators, filter, envelopes, LFOs, mod matrix, arpeggiator | ✅ Custom DSP in AudioWorklet (JS or Rust→WASM). Well-trodden. |
| 4 | **Generative / Euclidean sequencer** ← chosen | Euclidean rhythms, probability, random walks, scale quantisation — "set it and let it evolve" | ✅ Pure logic; pairs beautifully with reactive visuals. |
| 5 | **Granular texture engine** | Clouds-style grain synthesis on samples, ambient/drone focus | ✅ Heavier CPU but fine in WASM; grains are inherently trippy to visualise. |
| 6 | **Modular patcher** | Nodes + cables, build-your-own | ⚠️ Big scope. Feasible on web, but the UI is a project in itself. |

## Visualisation (top half of screen)

All web-viable at 60 fps, ordered by effort:

- **Spectrum / waveform reactive shaders** — `AnalyserNode` → uniforms → GLSL
  fragment shader (feedback loops, kaleidoscopes, domain warping). Cheap and
  very trippy.
- **Feedback framebuffer effects** — Milkdrop-style: previous frame warped /
  zoomed / rotated + new content. Classic trip look, one shader.
- **3D particles / geometry** (three.js or raw WebGL) — beat-triggered bursts,
  per-track colour.
- **Per-event driven** — sequencer steps fire visual events directly (not just
  FFT), so visuals stay tightly locked to the music. Key differentiator; do this
  from the start.
- **WebGPU compute** for 1M+ particles / fluid sim if going further (Chrome,
  Edge, Safari; Firefox partial).

## Web vs native

**Web wins on:** iteration speed, shareability (a URL), shaders as first-class
citizens, no install.

**Web latency:** ~10–20 ms output on Chrome/Linux with AudioWorklet; worse under
WSL2 (audio through WSLg PulseAudio is mediocre — test in a Windows browser
instead). Fine for sequenced music; noticeable but acceptable for finger
drumming.

**Web MIDI:** works in Chrome/Edge, not Safari. Acceptable.

**Native wins on:** sub-5 ms latency (JACK / ASIO), plugin hosting,
file-system-heavy sample libraries. If that path is ever needed: Rust + `cpal`
+ `wgpu` + egui, or Tauri wrapping the web UI while keeping a native audio
thread.

## Stack

- TypeScript + Vite
- AudioWorklet for DSP (Rust→WASM for hot loops if JS gets tight)
- WebGL2 shaders for visuals (raw or three.js / regl)
- Tone.js **not** used for the core — its scheduling/latency opinions get in
  the way — but fine for prototyping
- Keep the DSP module UI-agnostic so a Tauri wrap later is trivial
- Playwright for end-to-end tests
