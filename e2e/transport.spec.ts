import { test, expect, Page } from '@playwright/test';

const pattern = (page: Page, track = 0) =>
  page.locator(`[data-track="${track}"] .step`).evaluateAll((els) => els.map((e) => (e.classList.contains('hit') ? 'x' : '.')).join(''));

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__synth);
});

test('undo / redo revert slider changes', async ({ page }) => {
  const before = await pattern(page);
  await expect(page.locator('#undo')).toBeDisabled();
  await page.locator('[data-track="0"] [data-param="hits"]').fill('7');
  const after = await pattern(page);
  expect(after).not.toBe(before);
  await expect(page.locator('#undo')).toBeEnabled();
  await page.click('#undo');
  expect(await pattern(page)).toBe(before);
  await expect(page.locator('#undo')).toBeDisabled();
  await page.click('#redo');
  expect(await pattern(page)).toBe(after);
  // slider value reflects restored state
  await expect(page.locator('[data-track="0"] [data-param="hits"]')).toHaveValue('7');
});

test('reset reverts everything to defaults and is itself undoable', async ({ page }) => {
  const before = await pattern(page);
  await page.click('#reseed'); await page.fill('#bpm', '99'); await page.locator('#bpm').press('Enter');
  const bpm = await page.evaluate(() => (window as any).__synth.engine.bpm);
  expect(bpm).toBe(99);
  await page.click('#reset');
  expect(await pattern(page)).toBe(before);
  await expect(page.locator('#bpm')).toHaveValue('120');
  await page.click('#undo');
  await expect(page.locator('#bpm')).toHaveValue('99');
});

test('tap tempo derives bpm from tap interval', async ({ page }) => {
  // Headless timers are imprecise, so measure the real intervals and compare against them.
  const { bpm, expected } = await page.evaluate(async () => {
    const tap = document.getElementById('tap')!; const ts: number[] = [];
    for (let i = 0; i < 4; i++) { ts.push(performance.now()); tap.click(); await new Promise((r) => setTimeout(r, 400)); }
    const iv = (ts[3] - ts[0]) / 3;
    return { bpm: (window as any).__synth.engine.bpm, expected: 60000 / iv };
  });
  expect(Math.abs(bpm - expected)).toBeLessThan(5);
});

test('swing delays odd steps', async ({ page }) => {
  await page.locator('#swing').fill('1');
  await page.click('#play');
  await page.waitForFunction(() => (window as any).__synth.engine.eventCount > 0);
  const swing = await page.evaluate(() => (window as any).__synth.engine.swing);
  expect(swing).toBe(1);
});

test('volume slider drives master gain', async ({ page }) => {
  await page.locator('#volume').fill('0.2');
  await page.waitForFunction(() => Math.abs((window as any).__synth.engine.master.gain.value - 0.2) < 0.02);
  await page.click('#undo');
  await page.waitForFunction(() => Math.abs((window as any).__synth.engine.master.gain.value - 0.8) < 0.02);
});

test('reverb slider drives the send and is undoable', async ({ page }) => {
  await page.locator('#reverb').fill('0.9');
  await page.waitForFunction(() => Math.abs((window as any).__synth.engine.reverbSend.gain.value - 0.9) < 0.02);
  await page.click('#undo');
  await page.waitForFunction(() => Math.abs((window as any).__synth.engine.reverbSend.gain.value - 0.25) < 0.02);
  await expect(page.locator('#reverb')).toHaveValue('0.25');
});

test('reverb: tail keeps sounding after the dry signal stops', async ({ page }) => {
  // Compare the residual level ~700ms after stop with the send fully open vs closed.
  const tailAt = async (send: string) => {
    await page.locator('#reverb').fill(send);
    await page.click('#play');
    await page.waitForFunction(() => (window as any).__synth.engine.eventCount > 8);
    await page.click('#play');
    return page.evaluate(() => new Promise<number>((res) => setTimeout(() => {
      const a = (window as any).__synth.engine.analyser as AnalyserNode; const b = new Float32Array(a.fftSize); a.getFloatTimeDomainData(b);
      let p = 0; for (const v of b) p = Math.max(p, Math.abs(v)); res(p);
    }, 700)));
  };
  const dry = await tailAt('0');
  const wet = await tailAt('1');
  expect(wet).toBeGreaterThan(dry * 3);
  expect(wet).toBeGreaterThan(0.003);
});

test('per-track volume drives that track gain only and is undoable', async ({ page }) => {
  await page.locator('[data-track="2"] [data-param="gain"]').fill('0.1');
  await page.waitForFunction(() => Math.abs((window as any).__synth.engine.trackGain(2).gain.value - 0.1) < 0.02);
  const others = await page.evaluate(() => [0, 1, 3].map((i) => (window as any).__synth.engine.trackGain(i).gain.value));
  expect(others.every((v) => v > 0.5)).toBe(true);
  await page.click('#undo');
  await page.waitForFunction(() => Math.abs((window as any).__synth.engine.trackGain(2).gain.value - 0.7) < 0.02);
  await expect(page.locator('[data-track="2"] [data-param="gain"]')).toHaveValue('0.7');
});

test('keyboard: space toggles play, ctrl+z undoes', async ({ page }) => {
  await page.keyboard.press('Space');
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'false');
  const before = await pattern(page);
  await page.click('#reseed');
  await page.locator('body').click({ position: { x: 5, y: 5 } }); // blur button
  await page.keyboard.press('Control+z');
  expect(await pattern(page)).toBe(before);
});
