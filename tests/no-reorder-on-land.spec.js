import { test, expect } from '@playwright/test';

// Verifies that the moment the wheel stops, the surrounding (non-center)
// cards do NOT suddenly reorder/swap. We capture the visible names just
// before the landed phase begins and compare against the names rendered
// once the panel reports "Member Selected".
test.describe('RandomPersonSelector landing stability', () => {
  test('non-center cards do not reorder when a winner is chosen', async ({ page }) => {
    await page.goto('/');

    const rollBtn = page.locator('.roll-btn');
    await expect(rollBtn).toBeEnabled();
    await rollBtn.click();

    // Wait until we are visibly inside the rolling phase.
    await expect(page.locator('.selector__title h2')).toHaveText('Selecting Member…', {
      timeout: 5_000,
    });

    // Poll the visible card names every 50ms while rolling. Stop polling
    // as soon as we observe the landed phase. The last sample taken
    // BEFORE landed becomes our "pre-landed" snapshot.
    const samples = await page.evaluate(async () => {
      const out = [];
      const start = performance.now();
      const phaseTitle = () => document.querySelector('.selector__title h2')?.textContent || '';
      const snapshot = () =>
        Array.from(document.querySelectorAll('.sel-card')).map((c) => ({
          name: c.querySelector('.sel-card__name')?.textContent || '',
          isCenter: c.classList.contains('sel-card--center'),
        }));
      while (performance.now() - start < 10_000) {
        const phase = phaseTitle();
        out.push({ t: performance.now(), phase, cards: snapshot() });
        if (phase === 'Member Selected') break;
        await new Promise((r) => setTimeout(r, 50));
      }
      return out;
    });

    // Find last "rolling" sample and the first "landed" sample.
    const lastRolling = [...samples].reverse().find((s) => s.phase === 'Selecting Member…');
    const firstLanded = samples.find((s) => s.phase === 'Member Selected');
    expect(lastRolling, 'expected at least one rolling sample').toBeTruthy();
    expect(firstLanded, 'expected to reach landed phase').toBeTruthy();

    const namesBefore = lastRolling.cards.map((c) => c.name);
    const namesAfter = firstLanded.cards.map((c) => c.name);

    console.log('Before landing:', namesBefore);
    console.log('After landing :', namesAfter);

    // The visible strip of cards should be identical (same names, same
    // order) across the rolling→landed transition. If a separate "idle"
    // strip is rebuilt at landing, this would change the order entirely.
    expect(namesAfter).toEqual(namesBefore);
  });
});
