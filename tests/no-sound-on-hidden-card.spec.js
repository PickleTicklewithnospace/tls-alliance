import { test, expect } from '@playwright/test';

// Clicking a "???" (un-revealed) flip-card must NOT play the accept sound.
// Clicking a revealed card SHOULD play it (lightbox open).

test('hidden flip-card click is silent; revealed flip-card click plays accept', async ({ page }) => {
  await page.goto('/');

  // Wait for at least one hidden card to render.
  const hidden = page.locator('.flip-card:not(.is-flipped)').first();
  await expect(hidden).toBeVisible();

  // Park the mouse at a known non-interactive spot first so subsequent
  // moves dispatch real pointerover events.
  await hidden.scrollIntoViewIfNeeded();
  await page.waitForTimeout(20);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(20);

  // Hover over a hidden card - should not play cursor sound.
  await page.evaluate(() => { window.__cursorPlayCount = 0; });
  const hbox = await hidden.boundingBox();
  await page.mouse.move(hbox.x + hbox.width / 2, hbox.y + hbox.height / 2, { steps: 3 });
  await page.waitForTimeout(60);
  const afterHover = await page.evaluate(() => window.__cursorPlayCount || 0);
  expect(afterHover).toBe(0);

  // Move mouse out of the way before click test.
  await page.mouse.move(1, 1);

  // Reset counter then click a hidden card.
  await page.evaluate(() => { window.__acceptPlayCount = 0; });
  await hidden.click();
  await page.waitForTimeout(50);
  const afterHidden = await page.evaluate(() => window.__acceptPlayCount || 0);
  expect(afterHidden).toBe(0);

  // Now reveal one card via Skip and click it - should play exactly 1 accept
  // sound (the global click handler). The Skip button itself lives inside
  // .selector and is excluded from the global handler, so it should not
  // increment the counter.
  await page.evaluate(() => { window.__acceptPlayCount = 0; });
  await page.locator('.skip-btn').click();
  await page.waitForTimeout(150);
  const afterSkip = await page.evaluate(() => window.__acceptPlayCount || 0);
  expect(afterSkip).toBe(0);

  const revealed = page.locator('.flip-card.is-flipped').first();
  await expect(revealed).toBeVisible();

  // Scroll the revealed card into view so mouse.move can land on it.
  await revealed.scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  // Move mouse far away first so re-entering revealed card fires pointerover.
  await page.mouse.move(5, 5);
  await page.mouse.move(500, 5);
  await page.waitForTimeout(40);
  await page.evaluate(() => { window.__cursorPlayCount = 0; });
  const rbox = await revealed.boundingBox();
  await page.mouse.move(rbox.x + rbox.width / 2, rbox.y + rbox.height / 2, { steps: 3 });
  await page.waitForTimeout(80);
  const afterRevealedHover = await page.evaluate(() => window.__cursorPlayCount || 0);
  expect(afterRevealedHover).toBeGreaterThanOrEqual(1);

  await revealed.click();
  await page.waitForTimeout(50);
  const afterRevealed = await page.evaluate(() => window.__acceptPlayCount || 0);
  expect(afterRevealed).toBe(1);
});
