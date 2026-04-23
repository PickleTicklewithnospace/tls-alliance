import { test, expect } from '@playwright/test';

test('footer bread emblem is horizontally centered on the page', async ({ page }) => {
  await page.goto('/');
  const emblem = page.locator('.footer__emblem');
  await expect(emblem).toBeVisible();

  const emblemBox = await emblem.boundingBox();
  const viewport = page.viewportSize();
  if (!emblemBox || !viewport) throw new Error('missing box/viewport');

  const emblemCenter = emblemBox.x + emblemBox.width / 2;
  const pageCenter = viewport.width / 2;
  const offset = Math.abs(emblemCenter - pageCenter);

  console.log('Viewport width:', viewport.width);
  console.log('Page center:', pageCenter);
  console.log('Emblem center:', emblemCenter);
  console.log('Offset (px):', offset);

  // Allow up to 2px tolerance.
  expect(offset).toBeLessThan(2);
});

test('footer items are evenly spaced (text gaps == bread gaps)', async ({ page }) => {
  await page.goto('/');

  const boxes = await page.evaluate(() => {
    const order = [
      ...document.querySelectorAll('.footer__side--left .footer__item'),
      document.querySelector('.footer__emblem'),
      ...document.querySelectorAll('.footer__side--right .footer__item'),
    ];
    return order.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    });
  });

  // Compute horizontal gaps between consecutive items.
  const gaps = [];
  for (let i = 1; i < boxes.length; i++) {
    gaps.push(Math.round(boxes[i].left - boxes[i - 1].right));
  }
  console.log('Footer item gaps (px):', gaps);

  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  // Allow ~2px rounding tolerance.
  expect(max - min).toBeLessThan(3);
});
