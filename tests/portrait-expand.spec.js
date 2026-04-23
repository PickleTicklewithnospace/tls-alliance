import { test, expect } from '@playwright/test';

test('clicking a revealed portrait opens stable lightbox (no flicker on mouse move)', async ({ page }) => {
  await page.goto('/');
  // Use Skip to reveal a few cards quickly.
  const skip = page.locator('.skip-btn');
  for (let i = 0; i < 3; i++) {
    await skip.click();
    await page.waitForTimeout(80);
  }

  const firstRevealed = page.locator('.flip-card.is-flipped').first();
  await expect(firstRevealed).toBeVisible({ timeout: 10000 });

  const beforeBox = await firstRevealed.boundingBox();
  await firstRevealed.click();

  const lightbox = page.locator('.portrait-lightbox__card');
  await expect(lightbox).toBeVisible();

  // Sample lightbox position over several mouse moves.
  const samples = [];
  const positions = [
    [100, 100], [400, 200], [800, 500], [200, 600], [640, 360],
    [50, 50], [1100, 100], [640, 700],
  ];
  for (const [x, y] of positions) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(40);
    const lb = await lightbox.boundingBox();
    const card = await firstRevealed.boundingBox();
    samples.push({ pos: [x, y], lb, card });
  }

  console.log('Samples:', JSON.stringify(samples, null, 2));

  // The lightbox center should never move.
  const centers = samples.map((s) => ({
    x: s.lb.x + s.lb.width / 2,
    y: s.lb.y + s.lb.height / 2,
  }));
  const xs = centers.map((c) => c.x);
  const ys = centers.map((c) => c.y);
  const xRange = Math.max(...xs) - Math.min(...xs);
  const yRange = Math.max(...ys) - Math.min(...ys);
  console.log('Lightbox center xRange/yRange:', xRange, yRange);
  expect(xRange).toBeLessThan(2);
  expect(yRange).toBeLessThan(2);

  // The underlying card should not move either (no hover lift).
  const cardCenters = samples.map((s) => ({
    x: s.card.x + s.card.width / 2,
    y: s.card.y + s.card.height / 2,
  }));
  const cx = cardCenters.map((c) => c.x);
  const cy = cardCenters.map((c) => c.y);
  console.log('Card center range:', Math.max(...cx) - Math.min(...cx),
                                     Math.max(...cy) - Math.min(...cy));
  expect(Math.max(...cy) - Math.min(...cy)).toBeLessThan(2);
});
