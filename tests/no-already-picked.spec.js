import { test, expect } from '@playwright/test';

// Regression test for: (1) the spinner strip must never display a person
// who has already been picked, and (2) the final landed selection must
// never be a person who has already been picked.
//
// We drive the picker with the test-only Skip button to pick several
// members deterministically, then start a real Roll and sample the
// visible strip throughout the spin and at landing.

test.describe('RandomPersonSelector excludes already-picked', () => {
  // Helper: read the names currently visible in the viewport, sorted by x.
  // Excludes the centered card (the just-landed winner is intentionally
  // displayed at the center after a pick); we only verify the SURROUNDING
  // strip cells never display an already-picked person.
  const collectVisibleNames = async (page) => page.evaluate(() => {
    const vp = document.querySelector('.selector__viewport');
    if (!vp) return [];
    const vpRect = vp.getBoundingClientRect();
    const cards = Array.from(document.querySelectorAll('.sel-card'));
    const visible = [];
    for (const c of cards) {
      if (c.classList.contains('sel-card--center')) continue;
      const r = c.getBoundingClientRect();
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

  // Helper: read the names currently shown in the alliance grid (the
  // already-picked roster) - cards that are NOT still showing "???".
  const collectPickedNames = async (page) => page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.flip-card'));
    const out = [];
    for (const c of cards) {
      // Revealed face uses .name; unrevealed face shows "???" in
      // .flip-card__back-name. We only collect actually-revealed names.
      const el = c.querySelector('.name');
      const t = (el?.textContent || '').trim();
      if (t && t !== '???') out.push(t);
    }
    return out;
  });

  test('visible strip and landed selection never include an already-picked member', async ({ page }) => {
    await page.goto('/');

    const skipBtn = page.locator('.skip-btn');
    const rollBtn = page.locator('.roll-btn');
    const titleLoc = page.locator('.selector__title h2');

    // Skip a few picks to populate the picked set. Using Skip avoids the
    // multi-second spin animation between picks.
    const NUM_SKIPS = 5;
    for (let i = 0; i < NUM_SKIPS; i++) {
      await expect(skipBtn).toBeEnabled();
      await skipBtn.click();
      await expect(titleLoc).toHaveText('Member Selected');
    }

    // Wait for any fly-overlay animation in the parent App to settle so
    // alliance cards have committed their picks to the DOM.
    await page.waitForTimeout(500);

    // Collect the set of already-picked names from the alliance grid.
    const picked = await collectPickedNames(page);
    expect(picked.length).toBeGreaterThanOrEqual(NUM_SKIPS);
    const pickedSet = new Set(picked);

    // 1) BEFORE the next roll begins (idle phase, post-skip), the visible
    //    strip should not contain any already-picked person.
    {
      const names = await collectVisibleNames(page);
      const offenders = names.filter((n) => pickedSet.has(n));
      expect(offenders, `idle strip showed already-picked: ${offenders.join(', ')}`).toEqual([]);
    }

    // 2) Start a real Roll and sample throughout the spin.
    await expect(rollBtn).toBeEnabled();
    await rollBtn.click();

    const failures = [];
    const start = Date.now();
    while (Date.now() - start < 10_000) {
      const names = await collectVisibleNames(page);
      const offenders = names.filter((n) => pickedSet.has(n));
      if (offenders.length > 0) {
        failures.push({ at: Date.now() - start, offenders, names });
      }
      const phase = (await titleLoc.textContent()) || '';
      if (phase === 'Member Selected') break;
      await page.waitForTimeout(50);
    }
    expect(failures, `spin showed already-picked: ${JSON.stringify(failures.slice(0, 3))}`).toEqual([]);

    // 3) After landing, the final centered selection must NOT be a
    //    previously-picked person.
    await expect(titleLoc).toHaveText('Member Selected');
    const winnerName = await page.locator('.selector__winner-name').textContent();
    expect(pickedSet.has((winnerName || '').trim()), `winner ${winnerName} was already picked`).toBe(false);
  });
});
