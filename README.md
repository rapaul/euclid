# Euclid — generative groovebox

Euclidean / probabilistic sequencer with synthesised drums, random-walk bass & lead,
and a WebGL2 feedback-kaleidoscope visualiser driven by both the FFT and the
sequencer's own note events. See `ALTERNATIVES.md` for the options considered.

```
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"   # node via nvm
npm run dev        # http://localhost:5173  (press ▶ Play)
npm test           # vitest unit tests (sequencer core)
npm run e2e        # Playwright: layout, audio energy, viz pixels, controls
```

Layout: `src/seq` (pure logic, unit-tested) · `src/audio` (voices + lookahead
scheduler) · `src/viz` (shader) · `src/ui` (DOM) · `e2e` (Playwright).

Note: on WSL2 the browser audio path through WSLg is mediocre — open the URL in a
Windows browser for proper sound.
