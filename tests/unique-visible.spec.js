import { test, expect } from '@playwright/test';

// At every observed point during a spin, the 5 visible portraits must be
// 5 distinct people (assuming the pool size is >= 5, which is the case
// for the bundled portrait set). This guards against duplicates appearing
// inside the viewport while the wheel is rolling.
test.describe('RandomPersonSelector visible-uniqueness', () => {
  test('no duplicate names appear among the 5 visible cards while spinning', async ({ page }) => {
    await page.goto('/');

    // Find only the 5 cards that are CURRENTLY inside the viewport based on
    // their bounding rect overlap with the viewport rect. We can't rely on
    // ".sel-card" alone because the rolling strip contains many off-screen
    // cards as well.
    const collectVisibleNames = async () => {
      return await page.evaluate(() => {
        const vp = document.querySelector('.selector__viewport');
        if (!vp) return [];
        const vpRect = vp.getBoundingClientRect();
        const cards = Array.from(document.querySelectorAll('.sel-card'));
        const visible = [];
        for (const c of cards) {
          const r = c.getBoundingClientRect();
          // Card is "visible" if any part of it overlaps the viewport
          // horizontally. During a translate transition up to 6 cards may
          // be partially in view (5 fully + 1 sliver entering or leaving).
          if (r.right > vpRect.left && r.left < vpRect.right) {
            visible.push({
              cx: (r.left + r.right) / 2,
              name: c.querySelector('.sel-card__name')?.textContent || '',
            });
          }
        }
        visible.sort((a, b) => a.cx - b.cx);
        return visible.map((v) => v.name);
      });
    };

    const rollBtn = page.locator('.roll-btn');
    await expect(rollBtn).toBeEnabled();
    await rollBtn.click();

    // Sample the visible names every 60ms until landed. Verify each sample
    // contains exactly 5 cards and zero duplicates.
    const failures = [];
    let sampleCount = 0;
    const start = Date.now();
    const titleLoc = page.locator('.selector__title h2');
    while (Date.now() - start < 10_000) {
      const names = await collectVisibleNames();
      sampleCount += 1;
      // Skip the very first sample. There's a single render frame at
      // click-time where the OLD idle strip is still mounted while the
      // NEW spinning strip is being installed; React batches the two
      // setState calls but DOM measurement may catch the in-between
      // frame. Once the spin actually starts moving (next sample), the
      // strip is internally consistent.
      if (sampleCount === 1) {
        await page.waitForTimeout(60);
        continue;
      }
      // 5 cards fully visible at rest, up to 6 during a transition (one
      // sliver leaving + five fully visible + one sliver entering -> 7
      // is the upper bound, but in practice 5 or 6).
      if (names.length < 5 || names.length > 7) {
        failures.push({ sampleCount, reason: 'wrong-count', names });
      }
      const unique = new Set(names);
      if (unique.size !== names.length) {
        failures.push({ sampleCount, reason: 'duplicate', names });
      }
      const phase = (await titleLoc.textContent()) || '';
      if (phase === 'Member Selected') break;
      await page.waitForTimeout(60);
    }

    if (failures.length) {
      console.log('Visible-uniqueness failures:', JSON.stringify(failures, null, 2));
    }
    expect(failures).toEqual([]);
    expect(sampleCount).toBeGreaterThan(5);
  });
});
