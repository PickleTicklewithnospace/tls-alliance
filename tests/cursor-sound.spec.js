import { test, expect } from '@playwright/test';

// Verifies selector audio behaviour:
//   1. Cursor tick plays immediately on Roll click (no perceptible delay)
//   2. Cursor ticks equal panels passing during spin (1:1 ±1)
//   3. No cursor ticks fire after landing
//   4. Accept sound plays exactly once when a member is selected
//   5. Accept sound fires close to the landing moment
//
// We don't actually play audio — we monkey-patch the Web Audio API so
// every AudioBufferSourceNode.start() is recorded with a timestamp and
// the URL of the buffer's source (cursor vs accept). The buffer→URL
// mapping is built by hooking fetch() and decodeAudioData() so each
// decoded AudioBuffer carries a `__url` tag.

test.describe('RandomPersonSelector cursor sound', () => {
  test('plays exactly once per panel passing, none after landing', async ({ page }) => {
    // Install audio + tick instrumentation BEFORE the app boots so we
    // capture the very first play call. The selector uses Web Audio API
    // (AudioBufferSourceNode.start) for low-latency playback; we hook
    // start() to record each tick. We keep the real audio pipeline
    // intact apart from the tap (start still runs).
    await page.addInitScript(() => {
      window.__plays = [];
      window.__ticks = [];

      // 1) Track which URL each ArrayBuffer came from by tagging the
      //    response.arrayBuffer() return value.
      const origFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        return origFetch(input, init).then((res) => {
          const origAB = res.arrayBuffer.bind(res);
          res.arrayBuffer = function () {
            return origAB().then((ab) => {
              try { ab.__url = url; } catch { /* DataView etc. */ }
              return ab;
            });
          };
          return res;
        });
      };

      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;

      // 2) Hook decodeAudioData so the resulting AudioBuffer inherits
      //    the URL tag from the source ArrayBuffer.
      const origDecode = Ctor.prototype.decodeAudioData;
      Ctor.prototype.decodeAudioData = function (ab, ...rest) {
        const url = ab && ab.__url;
        const p = origDecode.call(this, ab, ...rest);
        return p.then((audioBuffer) => {
          try { audioBuffer.__url = url; } catch { /* no-op */ }
          return audioBuffer;
        });
      };

      // 3) Hook createBufferSource so we can read the URL tag on
      //    .buffer = X and record it on start().
      const origCreate = Ctor.prototype.createBufferSource;
      Ctor.prototype.createBufferSource = function (...args) {
        const node = origCreate.apply(this, args);
        const origStart = node.start.bind(node);
        node.start = function (...startArgs) {
          const url = (node.buffer && node.buffer.__url) || '';
          window.__plays.push({ t: performance.now(), url });
          return origStart(...startArgs);
        };
        return node;
      };
    });

    await page.goto('/');

    // Set up a MutationObserver that records each time the centered card
    // changes name. This corresponds to "a panel passed".
    await page.evaluate(() => {
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

    // Reset both streams to start counting from the click.
    await page.evaluate(() => { window.__plays = []; window.__ticks = []; });

    const rollBtn = page.locator('.roll-btn');
    await expect(rollBtn).toBeEnabled();
    await rollBtn.click();

    // Capture timestamp of the click (relative to performance.now in page).
    const clickT = await page.evaluate(() => performance.now());

    // Wait for the spin to land.
    await expect(page.locator('.selector__title h2')).toHaveText('Member Selected', {
      timeout: 20_000,
    });

    // Capture the timestamp of the landing event from the page.
    const landedT = await page.evaluate(() => performance.now());

    // Wait a generous grace period to detect any straggler audio plays
    // that fire AFTER landing (the bug we're guarding against).
    await page.waitForTimeout(1500);

    const { plays, ticks } = await page.evaluate(() => {
      window.__obs && window.__obs.disconnect();
      return { plays: window.__plays, ticks: window.__ticks };
    });

    // Partition plays by sound source. Anything not matching cursor
    // or accept (e.g. silent warmup buffers) is ignored for the
    // 1-per-panel check.
    const cursorPlays = plays.filter((p) => /cursor/.test(p.url));
    const acceptPlays = plays.filter((p) => /accept/.test(p.url));

    console.log('Click t (ms):        ', Math.round(clickT));
    console.log('Landed t (ms):       ', Math.round(landedT));
    console.log('All plays count:     ', plays.length);
    console.log('Cursor plays count:  ', cursorPlays.length);
    console.log('Accept plays count:  ', acceptPlays.length);
    console.log('Ticks (panels) count:', ticks.length);
    console.log('First cursor offset: ',
      cursorPlays[0] ? Math.round(cursorPlays[0].t - clickT) : 'NO PLAYS');
    console.log('Last cursor offset:  ',
      cursorPlays.at(-1) ? Math.round(cursorPlays.at(-1).t - clickT) : 'n/a');
    console.log('Accept offset:       ',
      acceptPlays[0] ? Math.round(acceptPlays[0].t - landedT) : 'n/a');

    // --- Cursor sound assertions ---

    // 1) Some cursor ticks happened.
    expect(cursorPlays.length).toBeGreaterThan(0);

    // 2) First cursor tick at click time (within 150ms).
    const firstCursorOffset = cursorPlays[0].t - clickT;
    expect(firstCursorOffset).toBeLessThan(150);

    // 3) Cursor ticks ≈ 1 per panel passing (±1 grace for the seam
    //    between the synchronous initial tick and the first observed
    //    center change).
    expect(Math.abs(cursorPlays.length - ticks.length)).toBeLessThanOrEqual(1);

    // 4) No cursor ticks AFTER landing (50ms grace for the final
    //    scheduled tick that fires alongside the landing setTimeout).
    const lateCursor = cursorPlays.filter((p) => p.t > landedT + 50);
    if (lateCursor.length) {
      console.log('Late cursor plays (ms past landing):',
        lateCursor.map((p) => Math.round(p.t - landedT)));
    }
    expect(lateCursor).toEqual([]);

    // --- Accept sound assertions ---

    // 5) Accept sound played exactly once.
    expect(acceptPlays.length).toBe(1);

    // 6) Accept sound fired close to the landing moment.
    //    The `landedT` reading happens after the test's CDP round-trip
    //    that resolved the "Member Selected" text wait, which itself
    //    polls every ~100ms. So the offset is dominated by detection
    //    latency, not actual play scheduling. ±500ms is plenty.
    const acceptOffset = acceptPlays[0].t - landedT;
    expect(Math.abs(acceptOffset)).toBeLessThan(500);
  });
});
