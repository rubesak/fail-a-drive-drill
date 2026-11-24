import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

// Short timings so a full cycle runs in about two seconds.
const FAST = { rebuildMs: 300, detectMs: 50, holdMs: 50, copybackMs: 100, animate: false };

let server, browser, base;

before(async () => {
  server = await serve(0);
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function open(path, options = {}) {
  const page = await browser.newPage(options);
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
  await page.goto(base + path);
  return { page, problems };
}

async function fixture(options) {
  const r = await open('/test/fixture.html', options);
  await r.page.waitForFunction(() => window.ready);
  return r;
}

const status = (page, sel = '.fad') => page.$eval(sel, (el) => el.dataset.status);
const waitStatus = (page, value, sel = '.fad') =>
  page.waitForFunction(([s, v]) => document.querySelector(s)?.dataset.status === v, [sel, value], { timeout: 5000 });

test('demo page: auto-init mounts every instance without errors or CSP violations', async () => {
  const { page, problems } = await open('/');
  await page.waitForSelector('.fad.is-live');
  assert.equal(await page.locator('.fad').count(), 2);
  assert.equal(await page.locator('.fad').nth(0).locator('.fad-disk').count(), 24);
  assert.equal(await page.locator('.fad').nth(1).locator('.fad-disk').count(), 12);
  assert.equal(await page.evaluate(() => typeof window.FailADrive.mount), 'function');
  await page.locator('.fad').first().locator('.fad-disk').nth(3).click();
  assert.equal(await status(page), 'degraded');
  assert.deepEqual(problems, []);
  await page.close();
});

test('one failure: degraded, rebuild, protected, copyback, online', async () => {
  const { page, problems } = await fixture();
  await page.evaluate((o) => { window.drill = window.FailADrive.mount('#a', o); }, FAST);
  assert.equal(await status(page), 'online');
  await page.evaluate(() => window.drill.fail(4));
  assert.equal(await status(page), 'degraded');
  assert.match(await page.textContent('.fad-story'), /Drive 4 failed\./);
  assert.equal(await page.locator('.fad-pips i.is-off').count(), 1);
  await waitStatus(page, 'online');
  const seq = await page.evaluate(() => window.events.map((e) => (e.type === 'faildrive:rebuild' ? 'rebuild' : e.detail.status)));
  assert.deepEqual(seq, ['degraded', 'rebuild', 'rebuilding', 'protected', 'copyback', 'online']);
  assert.match(await page.textContent('.fad-story'), /Back to normal\./);
  assert.equal(await page.locator('.fad-disk.is-failed, .fad-disk.is-replaced, .fad-blk.is-restored').count(), 0);
  assert.equal(await page.locator('.fad-pips i.is-off').count(), 0);
  assert.deepEqual(problems, []);
  await page.close();
});

test('two failures: critical, then a full recovery of both drives', async () => {
  const { page } = await fixture();
  await page.evaluate((o) => { window.drill = window.FailADrive.mount('#a', o); }, { ...FAST, rebuildMs: 1000 });
  await page.evaluate(() => { window.drill.fail(1); });
  await waitStatus(page, 'rebuilding');
  await page.evaluate(() => { window.drill.fail(2); });
  assert.equal(await status(page), 'critical');
  assert.equal(await page.locator('.fad.is-critical').count(), 1);
  assert.match(await page.textContent('.fad-story'), /Drive 2 failed during the rebuild\./);
  await waitStatus(page, 'protected');
  assert.match(await page.textContent('.fad-state'), /replace drives 1, 2/);
  await waitStatus(page, 'online');
  await page.close();
});

test('three failures: offline, restore from backup, focus moves with the buttons', async () => {
  const { page } = await fixture();
  await page.evaluate((o) => { window.drill = window.FailADrive.mount('#a', o); }, { ...FAST, rebuildMs: 5000 });
  const failBtn = page.locator('.fad-btn:not(.fad-btn-primary)');
  const restoreBtn = page.locator('.fad-btn-primary');
  await failBtn.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  assert.equal(await status(page), 'offline');
  assert.equal(await page.locator('.fad-disk.is-failed').count(), 3);
  assert.equal(await failBtn.isVisible(), false);
  assert.equal(await restoreBtn.isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('fad-btn-primary')), true);
  // Clicking drives does nothing while offline.
  await page.locator('.fad-disk:not(.is-failed)').first().click();
  assert.equal(await page.locator('.fad-disk.is-failed').count(), 3);
  await restoreBtn.focus();
  await page.keyboard.press('Enter');
  assert.equal(await status(page), 'online');
  assert.match(await page.textContent('.fad-story'), /Restored from backup\./);
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Fail a random drive');
  await page.close();
});

test('a failed drive cannot fail again, and drives are locked during copyback', async () => {
  const { page } = await fixture();
  await page.evaluate((o) => { window.drill = window.FailADrive.mount('#a', o); }, { ...FAST, copybackMs: 3000 });
  await page.evaluate(() => { window.drill.fail(0); window.drill.fail(0); });
  assert.equal(await page.locator('.fad-pips i.is-off').count(), 1);
  await waitStatus(page, 'copyback');
  await page.evaluate(() => window.drill.fail(5));
  assert.equal(await page.locator('.fad-disk.is-failed').count(), 0);
  assert.equal(await status(page), 'copyback');
  await page.close();
});

test('data attributes are read and clamped', async () => {
  const { page } = await fixture();
  await page.evaluate(() => { window.b = window.FailADrive.mount('#b'); });
  assert.equal(await page.locator('#b .fad-disk').count(), 48);
  assert.equal(await page.locator('#b .fad-disk').first().locator('.fad-blk').count(), 3);
  assert.equal(await page.$eval('#b .fad', (el) => el.dataset.theme), 'dark');
  assert.equal(await page.textContent('#b h3.fad-title'), 'From data attributes');
  assert.equal(await page.$eval('#b .fad', (el) => el.getAttribute('aria-labelledby') === el.querySelector('h3').id), true);
  await page.close();
});

test('options: strings, no heading, small arrays', async () => {
  const { page } = await fixture();
  const r = await page.evaluate(() => {
    const c = window.FailADrive.mount('#a', {
      drives: 2,
      headingLevel: 0,
      title: 'Array demo',
      strings: { failButton: 'Pull a drive', state: { online: () => 'All good' }, story: { idle: '**Hello.** Plain text <b>not parsed</b>' } },
    });
    return {
      disks: c.root.querySelectorAll('.fad-disk').length,
      heading: c.root.querySelector('h1, h2, h3, h4, h5, h6'),
      label: c.root.getAttribute('aria-label'),
      button: c.root.querySelector('.fad-btn').textContent,
      state: c.root.querySelector('.fad-state span:nth-child(2)').textContent,
      boldCount: c.root.querySelectorAll('.fad-story b').length,
      story: c.root.querySelector('.fad-story').textContent,
      untouched: c.root.querySelector('.fad-hint').textContent,
    };
  });
  assert.equal(r.disks, 6);
  assert.equal(r.heading, null);
  assert.equal(r.label, 'Array demo');
  assert.equal(r.button, 'Pull a drive');
  assert.equal(r.state, 'All good');
  assert.equal(r.boldCount, 1);
  assert.equal(r.story, 'Hello. Plain text <b>not parsed</b>');
  assert.equal(r.untouched, 'or click any drive');
  await page.close();
});

test('destroy stops the drill and puts the fallback back; mounting twice replaces the first instance', async () => {
  const { page } = await fixture();
  await page.evaluate((o) => { window.drill = window.FailADrive.mount('#a', o); }, FAST);
  assert.equal(await page.locator('#fallback').count(), 0);
  await page.evaluate((o) => { window.drill2 = window.FailADrive.mount('#a', o); }, FAST);
  assert.equal(await page.locator('#a .fad').count(), 1);
  await page.evaluate(() => { window.drill2.fail(1); window.drill2.destroy(); });
  assert.equal(await page.locator('#fallback').count(), 1);
  assert.equal(await page.locator('#a .fad').count(), 0);
  const before = await page.evaluate(() => window.events.length);
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.events.length), before);
  await page.close();
});

test('autoInit mounts only elements that are not mounted yet', async () => {
  const { page } = await fixture();
  const counts = await page.evaluate(() => {
    for (const id of ['a', 'b']) document.getElementById(id).setAttribute('data-fail-a-drive', '');
    return [window.FailADrive.autoInit().length, window.FailADrive.autoInit().length];
  });
  assert.deepEqual(counts, [2, 0]);
  await page.close();
});

test('reduced motion: no power-on effect, no animations', async () => {
  const { page } = await open('/', { reducedMotion: 'reduce' });
  await page.waitForSelector('.fad.is-live');
  assert.equal(await page.locator('.fad.is-booting, .fad.is-booted').count(), 0);
  await page.locator('.fad').first().locator('.fad-disk').first().click();
  const anim = await page.$eval('.fad .fad-disk.is-failed .fad-flt', (el) => getComputedStyle(el).animationName);
  assert.equal(anim, 'none');
  await page.close();
});

test('themes: system dark, forced light, and no horizontal overflow on a phone', async () => {
  const { page } = await open('/', { colorScheme: 'dark', viewport: { width: 390, height: 844 } });
  await page.waitForSelector('.fad.is-live');
  const bg = () => page.$eval('.fad', (el) => getComputedStyle(el).backgroundColor);
  assert.equal(await bg(), 'rgb(21, 24, 29)');
  await page.$eval('.fad', (el) => el.setAttribute('data-theme', 'light'));
  assert.equal(await bg(), 'rgb(250, 250, 250)');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(await page.$eval('.fad-bays', (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length), 12);
  await page.close();
});
