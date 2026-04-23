import { test, expect } from '@playwright/test';

// Regression: the global hover cursor sound should play exactly ONCE
// per entry into a `.flip-card` (or other interactive element), not
// repeat as the pointer moves among inner children. It should play
// again on entering a different card or on re-entering after leaving.

test.describe('global hover cursor sound', () => {
  test('plays once per interactive element entry, not per child move', async ({ page }) => {
    await page.addInitScript(() => {
      window.__cursorPlayCount = 0;
    });

    await page.goto('/');

    // Reveal at least 2 portraits via Skip.
    const skip = page.locator('.skip-btn');
    for (let i = 0; i < 4; i++) {
      await skip.click();
      await page.waitForTimeout(80);
    }

    const cards = page.locator('.flip-card.is-flipped');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(2);

    const card1 = cards.nth(0);
    const card2 = cards.nth(1);
    await card1.scrollIntoViewIfNeeded();
    await card2.scrollIntoViewIfNeeded();
    await card1.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const box1 = await card1.boundingBox();
    const box2 = await card2.boundingBox();
    if (!box1 || !box2) throw new Error('cards not laid out');

    // Find a guaranteed non-interactive point on the page (no closest()
    // match for INTERACTIVE_SELECTOR). Search a grid; pick the first.
    const neutral = await page.evaluate(() => {
      const SEL = 'button,a[href],[role="button"],input,select,.flip-card,.member-row,.portrait-lightbox__close';
      const w = window.innerWidth, h = window.innerHeight;
      for (let y = 4; y < h; y += 8) {
        for (let x = 4; x < w; x += 8) {
          const el = document.elementFromPoint(x, y);
          if (!el) continue;
          if (el.closest && !el.closest(SEL) && !el.closest('.selector') && !el.closest('[data-no-ui-sound]')) {
            return { x, y };
          }
        }
      }
      return null;
    });
    if (!neutral) throw new Error('no neutral spot found');

    // Park pointer at neutral spot first.
    await page.mouse.move(neutral.x, neutral.y);
    await page.waitForTimeout(60);

    // --- Test 1: enter card1, wiggle across many child elements. ---
    await page.evaluate(() => { window.__cursorPlayCount = 0; });
    const c1cx = box1.x + box1.width / 2;
    const c1cy = box1.y + box1.height / 2;
    // Use offsets relative to card SIZE so we stay strictly inside the
    // card's bounding box (cards may sit immediately adjacent to others).
    const w1 = box1.width, h1 = box1.height;
    const w2 = box2.width, h2 = box2.height;
    function offsetsFor(w, h) {
      const dx = w * 0.3, dy = h * 0.3;
      return [
        [0, 0], [-dx, -dy], [dx, dy], [-dx, dy], [dx, -dy],
        [0, dy], [0, -dy], [dx, 0], [-dx, 0], [dx / 2, dy / 2],
      ];
    }
    const offsets1 = offsetsFor(w1, h1);
    const offsets2 = offsetsFor(w2, h2);
    const offsets = offsets1; // back-compat alias for card1 loop below
    for (const [dx, dy] of offsets) {
      await page.mouse.move(c1cx + dx, c1cy + dy);
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(80);
    const card1Plays = await page.evaluate(() => window.__cursorPlayCount);
    expect(card1Plays).toBe(1);

    // --- Test 2: leave to neutral, then enter card2. ---
    await page.mouse.move(neutral.x, neutral.y);
    await page.waitForTimeout(60);
    await page.evaluate(() => { window.__cursorPlayCount = 0; });
    const c2cx = box2.x + box2.width / 2;
    const c2cy = box2.y + box2.height / 2;
    for (const [dx, dy] of offsets2) {
      await page.mouse.move(c2cx + dx, c2cy + dy);
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(80);
    const card2Plays = await page.evaluate(() => window.__cursorPlayCount);
    expect(card2Plays).toBe(1);

    // --- Test 3: leave to neutral, re-enter card1. ---
    await page.mouse.move(neutral.x, neutral.y);
    await page.waitForTimeout(60);
    await page.evaluate(() => { window.__cursorPlayCount = 0; });
    for (const [dx, dy] of offsets) {
      await page.mouse.move(c1cx + dx, c1cy + dy);
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(80);
    const card1AgainPlays = await page.evaluate(() => window.__cursorPlayCount);
    expect(card1AgainPlays).toBe(1);
  });
});
