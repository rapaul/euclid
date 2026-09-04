import { test, expect, Page } from '@playwright/test';


const synth = (page: Page) => page.evaluate(() => window.__synth);

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__synth);
  expect(errors).toEqual([]);
});

test('layout: controls content-sized and flush with the bottom, viz fills the rest', async ({ page }) => {
  const vp = page.viewportSize()!;
  const viz = (await page.locator('#viz').boundingBox())!;
  const ui = (await page.locator('#ui').boundingBox())!;
  const lastRow = (await page.locator('.track').last().boundingBox())!;
  expect(viz.y).toBe(0);
  expect(ui.y + ui.height).toBeCloseTo(vp.height, 0);
  expect(viz.height).toBeCloseTo(ui.y, 0);
  // no slack below the last track row (padding only)
  expect(vp.height - (lastRow.y + lastRow.height)).toBeLessThan(16);
  expect(ui.height).toBeLessThan(vp.height / 3);
});

test('tracks render euclidean patterns in the UI', async ({ page }) => {
  await expect(page.locator('.track:not(.head)')).toHaveCount(4);
  // kick: 4 hits over 16 steps -> x...x...x...x...
  const kick = page.locator('[data-track="0"] .step');
  await expect(kick).toHaveCount(16);
  const hits = await kick.evaluateAll((els) => els.map((e) => e.classList.contains('hit')));
  expect(hits.map((h) => (h ? 'x' : '.')).join('')).toBe('x...x...x...x...');
});

test('play starts the audio clock, advances steps, schedules events', async ({ page }) => {
  await page.click('#play');
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForFunction(() => window.__synth.engine.ctx.state === 'running');
  await page.waitForFunction(() => window.__synth.engine.step > 8, null, { timeout: 5000 });
  const s = await page.evaluate(() => ({ events: window.__synth.engine.eventCount, cur: window.__synth.engine.currentStep }));
  expect(s.events).toBeGreaterThan(4);
  expect(s.cur).toBeGreaterThanOrEqual(0);
  // The playhead highlight should exist on exactly one step per track.
  const curCount = await page.locator('[data-track="0"] .step.cur').count();
  expect(curCount).toBe(1);
});

test('sound: analyser sees real signal energy while playing', async ({ page }) => {
  await page.click('#play');
  await page.waitForFunction(() => window.__synth.engine.step > 4);
  const energy = await page.evaluate(() => {
    const a = window.__synth.engine.analyser as AnalyserNode;
    const buf = new Uint8Array(a.fftSize);
    let peak = 0;
    return new Promise<number>((res) => {
      let n = 0;
      const poll = () => { a.getByteTimeDomainData(buf); for (const v of buf) peak = Math.max(peak, Math.abs(v - 128)); if (++n < 60) requestAnimationFrame(poll); else res(peak); };
      poll();
    });
  });
  expect(energy).toBeGreaterThan(10); // out of 128; silence is ~0
});

test('sound: stop silences and resets', async ({ page }) => {
  await page.click('#play');
  await page.waitForFunction(() => window.__synth.engine.step > 4);
  await page.click('#play');
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'false');
  const s = await page.evaluate(() => ({ running: window.__synth.engine.running, step: window.__synth.engine.step }));
  expect(s).toEqual({ running: false, step: 0 });
  await expect(page.locator('.step.cur')).toHaveCount(0);
});

test('visualiser renders frames and lights up on events', async ({ page }) => {
  const idle = await sampleCanvas(page);
  await page.click('#play');
  await page.waitForFunction(() => window.__synth.engine.eventCount > 6);
  await page.waitForFunction(() => window.__synth.viz.frames > 30);
  const active = await sampleCanvas(page);
  expect(active.frames).toBeGreaterThan(idle.frames);
  expect(active.brightness).toBeGreaterThan(idle.brightness);
  expect(active.brightness).toBeGreaterThan(2);
});

test('changing hits re-generates the pattern', async ({ page }) => {
  const hits = page.locator('[data-track="0"] [data-param="hits"]');
  await hits.fill('3');
  const pat = await page.locator('[data-track="0"] .step').evaluateAll((els) => els.map((e) => (e.classList.contains('hit') ? 'x' : '.')).join(''));
  expect(pat.split('x').length - 1).toBe(3);
});

test('bpm change speeds up the clock', async ({ page }) => {
  await page.fill('#bpm', '240');
  await page.click('#play');
  const t0 = Date.now();
  await page.waitForFunction(() => window.__synth.engine.step >= 16);
  const dt = Date.now() - t0;
  // 16 sixteenths at 240 BPM = 1 bar = 1s; allow scheduler lookahead + slack.
  expect(dt).toBeLessThan(1600);
});

async function sampleCanvas(page: Page) {
  return page.evaluate(() => {
    const c = document.getElementById('viz') as HTMLCanvasElement;
    const gl = window.__synth.viz.gl as WebGL2RenderingContext;
    const w = c.width, h = c.height;
    const px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
    return { brightness: sum / (w * h * 3), frames: window.__synth.viz.frames as number };
  });
}
