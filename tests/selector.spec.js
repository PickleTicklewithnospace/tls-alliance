import { test, expect } from '@playwright/test';

test.describe('RandomPersonSelector roulette', () => {
  test('rolls within 7s, never speeds up, ends on a card', async ({ page }) => {
    await page.goto('/');

    // Track every change to the centered card by observing the DOM.
    // We record (timestamp, name) tuples to derive intervals and
    // verify monotonic non-decreasing intervals.
    await page.evaluate(() => {
      window.__ticks = [];
      const root = document.querySelector('.selector__viewport');
      if (!root) throw new Error('viewport not mounted');

      const record = () => {
        const center = document.querySelector('.sel-card--center .sel-card__name');
        if (!center) return;
        const name = center.textContent || '';
        const last = window.__ticks[window.__ticks.length - 1];
        if (!last || last.name !== name) {
          window.__ticks.push({ t: performance.now(), name });
        }
      };

      const obs = new MutationObserver(record);
      obs.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
      window.__obs = obs;
      record();
    });

    // Reset tick log to start counting only from after click.
    await page.evaluate(() => { window.__ticks = []; });
    const startWall = Date.now();
    const rollBtn = page.locator('.roll-btn');
    await expect(rollBtn).toBeEnabled();
    await rollBtn.click();

    // Wait until the panel reports "Member Selected" (landed phase).
    await expect(page.locator('.selector__title h2')).toHaveText('Member Selected', {
      timeout: 20_000,
    });
    const totalWall = Date.now() - startWall;

    const ticks = await page.evaluate(() => {
      window.__obs && window.__obs.disconnect();
      return window.__ticks;
    });

    console.log('Total wall time (ms):', totalWall);
    console.log('Tick count:', ticks.length);

    // Compute intervals between consecutive distinct centered cards.
    // Drop the first interval because it represents the click->first-render
    // latency rather than a true tick interval (it can be artificially short
    // due to React batching with the warm-up rAF frames).
    const rawIntervals = [];
    for (let i = 1; i < ticks.length; i++) {
      rawIntervals.push(Math.round(ticks[i].t - ticks[i - 1].t));
    }
    const intervals = rawIntervals.slice(1);
    console.log('Raw first interval (warm-up):', rawIntervals[0]);
    console.log('First 5 intervals (ms):', intervals.slice(0, 5));
    console.log('Last 5 intervals  (ms):', intervals.slice(-5));
    console.log('Min/Max interval:', Math.min(...intervals), '/', Math.max(...intervals));
    console.log(
      'Spin duration from first tick to last (ms):',
      Math.round(ticks.at(-1).t - ticks[0].t),
    );

    // --- Assertions ---
    // 1) Hard cap: total run completes within 7s of clicking Roll.
    expect(totalWall).toBeLessThan(7500); // small grace for landing detection

    // 2) Some movement actually occurred.
    expect(intervals.length).toBeGreaterThan(5);

    // 3) Speed must be non-increasing - intervals should never significantly
    //    drop. We allow tiny jitter from setTimeout scheduling (<= 25ms).
    const violations = [];
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i] + 25 < intervals[i - 1]) {
        violations.push({ at: i, prev: intervals[i - 1], cur: intervals[i] });
      }
    }
    if (violations.length) {
      console.log('Monotonicity violations:', violations);
    }
    expect(violations).toEqual([]);

    // 4) The first interval (start speed) should be <= 80ms (we want ~30ms).
    expect(intervals[0]).toBeLessThan(80);

    // 5) The final interval should be much slower than the first.
    expect(intervals.at(-1)).toBeGreaterThan(intervals[0] * 3);
  });
});
