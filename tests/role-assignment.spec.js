import { test, expect } from '@playwright/test';

// After picking with the new pickGroup-driven lineup, every revealed
// alliance slot must show a role tag that matches the ROLE_TEMPLATE
// position for that slot (per alliance: tank, healer, healer, dps×5).
// We use the test-only Skip button to fill all 24 slots without waiting
// for the spin animation.
test.describe('Alliance role assignments', () => {
  test('revealed slots show roles matching ROLE_TEMPLATE', async ({ page }) => {
    await page.goto('/');

    const expectedRoles = ['tank', 'healer', 'healer', 'dps', 'dps', 'dps', 'dps', 'dps'];
    const TOTAL = 24;

    const skipBtn = page.locator('.skip-btn');
    await expect(skipBtn).toBeEnabled();

    // Click Skip 24 times. After each click the selected counter must
    // tick up - we wait on it so we never race the React state update.
    for (let i = 0; i < TOTAL; i++) {
      await skipBtn.click();
      await expect(page.locator('.selected-counter__value')).toContainText(
        `${i + 1} / ${TOTAL}`,
      );
    }

    // Inspect every alliance card and verify the role tag on each
    // revealed member matches the template position.
    const allianceCards = page.locator('.card');
    const allianceCount = await allianceCards.count();
    expect(allianceCount).toBe(3);

    for (let a = 0; a < allianceCount; a++) {
      const rows = allianceCards.nth(a).locator('.flip-card');
      const rowCount = await rows.count();
      expect(rowCount).toBe(8);
      for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i);
        // Should be flipped (revealed) by now.
        await expect(row).toHaveClass(/is-flipped/);
        // The revealed face's role-tag must match expectedRoles[i].
        const roleTag = row.locator('.role-tag');
        await expect(roleTag).toHaveClass(
          new RegExp(`role-tag--${expectedRoles[i]}`),
        );
      }
    }
  });

  test('roster reveals exactly 3 tanks, 6 healers, 15 dps', async ({ page }) => {
    await page.goto('/');
    const skipBtn = page.locator('.skip-btn');
    for (let i = 0; i < 24; i++) {
      await skipBtn.click();
      await expect(page.locator('.selected-counter__value')).toContainText(
        `${i + 1} / 24`,
      );
    }

    const counts = await page.evaluate(() => {
      const out = { tank: 0, healer: 0, dps: 0 };
      for (const tag of document.querySelectorAll('.role-tag')) {
        for (const role of ['tank', 'healer', 'dps']) {
          if (tag.classList.contains(`role-tag--${role}`)) out[role]++;
        }
      }
      return out;
    });

    expect(counts).toEqual({ tank: 3, healer: 6, dps: 15 });
  });
});
