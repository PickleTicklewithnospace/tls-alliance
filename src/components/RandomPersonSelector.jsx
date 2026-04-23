import { useEffect, useMemo, useRef, useState } from 'react';
import { PORTRAITS } from '../lib/portraits';
import { buildRaidLineup } from '../lib/buildLineup';

const VISIBLE = 5;
const CENTER = Math.floor(VISIBLE / 2);

// Total number of members that will ultimately be chosen for the alliance
// raid. The portrait pool may be larger than this (we have spare faces),
// but the selector only ever fills up to TARGET_SELECTIONS slots.
const TARGET_SELECTIONS = 24;

// Roulette timing - monotonically slowing schedule, total <= TOTAL_DURATION_MS.
const START_INTERVAL = 30;
const END_INTERVAL = 600;
const TOTAL_DURATION_MS = 7000;

function buildSchedule() {
  const intervals = [];
  let total = 0;
  let i = 0;
  while (true) {
    const t = Math.min(1, total / TOTAL_DURATION_MS);
    const eased = 1 - Math.pow(1 - t, 2);
    const next = START_INTERVAL + (END_INTERVAL - START_INTERVAL) * eased;
    if (total + next > TOTAL_DURATION_MS) break;
    intervals.push(next);
    total += next;
    if (++i > 500) break;
  }
  return intervals;
}

// A roll is modelled as a fixed strip of (CENTER + totalSteps + CENTER + 1)
// portraits. The viewport shows VISIBLE cards starting at offset; advancing
// = increasing offset by 1 (which translates the strip to the LEFT inside
// the viewport, but we want NEW cards entering from the LEFT, so we instead
// READ the strip from RIGHT-to-LEFT - i.e. translateX moves the strip
// RIGHTWARD, revealing untouched cards on the left).
//
// Simpler: build the strip so that index 0 is the FINAL card and the last
// index is the START position. Initial offset = (strip.length - VISIBLE).
// Each tick, offset -= 1 → strip translates RIGHTWARD by one card → new card
// appears on the LEFT, oldest on the right slides out.

// Pick a random index from [0, len) that does NOT appear among the most
// recent `avoidWindow` entries of `recent`. This guarantees that any
// sliding window of size (avoidWindow + 1) over the resulting sequence
// contains unique indices. When `len` is smaller than (avoidWindow + 1)
// uniqueness across that window is impossible - we relax by only avoiding
// the last (len - 1) entries (the best we can do).
function pickAvoiding(len, recent, avoidWindow) {
  const lookBack = Math.min(avoidWindow, len - 1);
  const forbidden = new Set();
  for (let i = recent.length - 1; i >= 0 && forbidden.size < lookBack; i--) {
    forbidden.add(recent[i]);
  }
  // Bail-out: if every index is forbidden (shouldn't happen given lookBack
  // <= len - 1) just return any index.
  if (forbidden.size >= len) return Math.floor(Math.random() * len);
  // Choose uniformly from the allowed set.
  let pick;
  // Rejection sampling - cheap because forbidden is at most VISIBLE-1.
  do {
    pick = Math.floor(Math.random() * len);
  } while (forbidden.has(pick));
  return pick;
}

function buildStrip(pool, startIdx, finalIdx, totalSteps) {
  const len = pool.length;
  // Build the index sequence left-to-right, ensuring no duplicate appears
  // within any window of VISIBLE+1 consecutive cells (i.e. each new index
  // differs from the previous VISIBLE indices). VISIBLE+1 covers the case
  // where the carousel is mid-transition and 6 cards are partially in
  // view simultaneously - all of those will still be unique.
  //
  // Layout: [padLeft (CENTER+2) | startIdx | middle (totalSteps-1) | finalIdx | padRight (CENTER+2)]
  // We want NEW cards to enter from the RIGHT, so the track translates
  // LEFTWARD over time and startIdx sits on the left, finalIdx on the right.
  const AVOID = VISIBLE;
  const indices = [];
  const padCount = CENTER + 2;

  // padLeft - free random with no-duplicate window constraint.
  for (let i = 0; i < padCount; i++) {
    indices.push(pickAvoiding(len, indices, AVOID));
  }
  // startIdx is fixed (must align with the currently visible center). If
  // it collides with the recent window we accept it - the visual continuity
  // matters more than perfect uniqueness at the seam, but in practice this
  // is rare since padLeft was chosen to avoid duplicates anyway.
  indices.push(startIdx);
  // middle fillers
  for (let i = 0; i < totalSteps - 1; i++) {
    indices.push(pickAvoiding(len, indices, AVOID));
  }
  // finalIdx is fixed. To still keep the window unique around it, we made
  // sure middle cells avoid duplicates of recent picks; if finalIdx happens
  // to clash with the trailing window we re-pick the last few middles to
  // resolve the conflict.
  resolveSeamConflict(indices, finalIdx, len, AVOID);
  indices.push(finalIdx);
  // padRight
  for (let i = 0; i < padCount; i++) {
    indices.push(pickAvoiding(len, indices, AVOID));
  }
  return indices.map((idx, i) => ({ ...pool[idx], _i: i, _idx: idx }));
}

// If the fixed index `fixedIdx` would collide with one of the trailing
// `avoidWindow` entries of `indices`, replace those colliding entries with
// safe alternatives so the constraint still holds when fixedIdx is appended.
function resolveSeamConflict(indices, fixedIdx, len, avoidWindow) {
  const lookBack = Math.min(avoidWindow, len - 1);
  for (let back = 1; back <= lookBack && indices.length - back >= 0; back++) {
    const pos = indices.length - back;
    if (indices[pos] !== fixedIdx) continue;
    // Recompute this slot avoiding its own neighbouring window AND fixedIdx.
    const forbidden = new Set([fixedIdx]);
    for (let j = Math.max(0, pos - lookBack); j < pos; j++) forbidden.add(indices[j]);
    for (let j = pos + 1; j < indices.length && j <= pos + lookBack; j++)
      forbidden.add(indices[j]);
    if (forbidden.size >= len) continue; // no safe pick possible
    let pick;
    do {
      pick = Math.floor(Math.random() * len);
    } while (forbidden.has(pick));
    indices[pos] = pick;
  }
}

// For the idle/landed states (no spin in progress) we still need a strip
// so the ribbon renders. Just show the centered card surrounded by random
// neighbours.
function buildIdleStrip(pool, centerIdx) {
  const len = pool.length;
  const out = [];
  for (let slot = 0; slot < VISIBLE; slot++) {
    const offset = slot - CENTER;
    const idx = ((centerIdx + offset) % len + len) % len;
    out.push({ ...pool[idx], _i: slot, _idx: idx });
  }
  return out;
}

// Pre-determine the full lineup of TARGET_SELECTIONS members up-front so
// the entire roster is known before the first roll. Each entry is
// { poolIdx, role } - the pool index of the chosen portrait and the role
// pickGroup assigned that person to play. Slot N of the alliance grid is
// filled by lineup[N], which is guaranteed to carry the role expected at
// that slot (per ROLE_TEMPLATE).
function buildLineup(pool) {
  const raid = buildRaidLineup(pool);
  // Map portrait -> pool index. Portrait identity is stable (same object
  // ref returned from buildRaidLineup), so indexOf is fine for our small
  // pool sizes.
  return raid.map(({ portrait, role, slot }) => ({
    poolIdx: pool.indexOf(portrait),
    role,
    slot,
  }));
}

export default function RandomPersonSelector({
  selected = [],
  onSelect,
  onReset,
}) {
  const pool = PORTRAITS;
  const [centerIdx, setCenterIdx] = useState(0);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'rolling' | 'landed'
  const [pulseKey, setPulseKey] = useState(0);

  // `selected` is indexed BY SLOT (not pick order), so `selected.length` is
  // the highest-filled slot index + 1, not the count of picks made. We
  // count actual picks by filtering out empty/sparse entries.
  const pickCount = selected.filter(Boolean).length;

  // Pre-determined lineup of pool indices (length up to TARGET_SELECTIONS).
  // Built once on mount and rebuilt only on reset. The next pick is always
  // lineup[selected.length] - guaranteed unique and the full roster is
  // knowable from the moment the component appears.
  const [lineup, setLineup] = useState(() => buildLineup(PORTRAITS));

  // Log the predetermined roster on mount so it can be inspected before
  // any roll happens.
  useEffect(() => {
    const summary = lineup.map(({ poolIdx, role }) => `${pool[poolIdx].name} (${role})`);
    // eslint-disable-next-line no-console
    console.log(
      `[RandomPersonSelector] Predetermined lineup (${summary.length}/${TARGET_SELECTIONS}):`,
      summary,
    );
    // Intentionally only run when the lineup itself changes (mount + reset).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineup]);

  // Roll-time strip and offset. When phase === 'idle'|'landed' we render the
  // idle strip and ignore offset/duration.
  const [strip, setStrip] = useState(() => buildIdleStrip(PORTRAITS, 0));
  const [offset, setOffset] = useState(0);    // index of leftmost visible
  const [duration, setDuration] = useState(0); // current transition (ms)

  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Cursor "tick" sound. We use the Web Audio API instead of
  // <audio> elements for zero-latency playback: the file is fetched
  // and decoded once into an AudioBuffer at mount, then each tick
  // creates a fresh AudioBufferSourceNode (cheap, GC'd automatically)
  // which starts playing instantly with no decode/network wait.
  // HTMLAudioElement.play() can have ~100-300ms first-call latency
  // even after preload because the browser may defer the decode until
  // first play. Web Audio avoids that entirely.
  const audioCtxRef = useRef(null);
  const cursorBufferRef = useRef(null);
  const cursorGainRef = useRef(null);
  const activeSourcesRef = useRef([]);
  const acceptBufferRef = useRef(null);
  const acceptGainRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let ctx;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      audioCtxRef.current = ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      gain.connect(ctx.destination);
      cursorGainRef.current = gain;
      const acceptGain = ctx.createGain();
      acceptGain.gain.value = 0.7;
      acceptGain.connect(ctx.destination);
      acceptGainRef.current = acceptGain;
      fetch(`${import.meta.env.BASE_URL}sounds/cursor_trimmed.mp3`)
        .then((r) => r.arrayBuffer())
        .then((buf) => ctx.decodeAudioData(buf))
        .then((decoded) => { if (!cancelled) cursorBufferRef.current = decoded; })
        .catch(() => { /* best-effort */ });
      fetch(`${import.meta.env.BASE_URL}sounds/accept_trimmed.mp3`)
        .then((r) => r.arrayBuffer())
        .then((buf) => ctx.decodeAudioData(buf))
        .then((decoded) => { if (!cancelled) acceptBufferRef.current = decoded; })
        .catch(() => { /* best-effort */ });
    } catch { /* best-effort */ }

    // Warm up the audio device on the FIRST user gesture anywhere on
    // the page. Browsers start AudioContexts in 'suspended' state and
    // even after resume() the system audio engine has cold-start
    // latency on the first real playback (~100-300ms). By resuming
    // and playing a silent buffer on the very first pointerdown we
    // get the device running so that when the user actually clicks
    // Roll, the first tick is truly instant.
    const warmup = () => {
      const c = audioCtxRef.current;
      if (!c) return;
      const resumeP = c.state === 'suspended' ? c.resume() : Promise.resolve();
      resumeP
        .then(() => {
          try {
            const silent = c.createBuffer(1, 1, c.sampleRate);
            const src = c.createBufferSource();
            src.buffer = silent;
            src.connect(c.destination);
            src.start(0);
          } catch { /* no-op */ }
        })
        .catch(() => {});
      window.removeEventListener('pointerdown', warmup, true);
      window.removeEventListener('keydown', warmup, true);
      window.removeEventListener('touchstart', warmup, true);
    };
    window.addEventListener('pointerdown', warmup, true);
    window.addEventListener('keydown', warmup, true);
    window.addEventListener('touchstart', warmup, true);

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', warmup, true);
      window.removeEventListener('keydown', warmup, true);
      window.removeEventListener('touchstart', warmup, true);
      if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
    };
  }, []);

  function playTick() {
    const ctx = audioCtxRef.current;
    const buffer = cursorBufferRef.current;
    const gain = cursorGainRef.current;
    if (!ctx || !buffer || !gain) return;
    // The audio context starts in 'suspended' state until a user
    // gesture resumes it. The first call to playTick() runs inside
    // the Roll click handler, so resume() will succeed there.
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      src.start(0);
      activeSourcesRef.current.push(src);
      src.onended = () => {
        const arr = activeSourcesRef.current;
        const i = arr.indexOf(src);
        if (i >= 0) arr.splice(i, 1);
      };
    } catch { /* best-effort */ }
  }

  function stopAllTicks() {
    for (const src of activeSourcesRef.current) {
      try { src.stop(0); } catch { /* may already be stopped */ }
    }
    activeSourcesRef.current = [];
  }

  function playAccept() {
    const ctx = audioCtxRef.current;
    const buffer = acceptBufferRef.current;
    const gain = acceptGainRef.current;
    if (!ctx || !buffer || !gain) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      src.start(0);
    } catch { /* best-effort */ }
  }

  // When we return to the truly idle state, rebuild the idle strip. We do
  // NOT rebuild on 'landed' because that would re-shuffle the surrounding
  // cards the moment the wheel stops, causing a jarring reorder. The
  // already-rendered roll strip stays in place; only its center cell gets
  // the landed highlight.
  useEffect(() => {
    if (phase === 'idle') {
      setStrip(buildIdleStrip(pool, centerIdx));
      setOffset(0);
      setDuration(0);
    }
  }, [phase, centerIdx, pool]);

  function roll() {
    if (phase === 'rolling' || pool.length === 0) return;
    // Roster already complete - nothing left to pick.
    if (pickCount >= lineup.length) return;

    // The next winner is the next entry in the predetermined lineup. The
    // user sees a random spin, but the outcome was decided up-front.
    const nextEntry = lineup[pickCount];
    const finalIdx = nextEntry.poolIdx;
    const schedule = buildSchedule();
    const totalSteps = schedule.length;
    const startIdx = centerIdx;

    const newStrip = buildStrip(pool, startIdx, finalIdx, totalSteps);
    // Initial offset positions startIdx at the center of the viewport.
    // Strip layout: [padLeft (CENTER+2) | startIdx | middle (totalSteps-1) | finalIdx | padRight]
    // startIdx is at strip index = padLeft.length = CENTER + 2.
    const startStripIdx = CENTER + 2;
    // Leftmost visible cell = startStripIdx - CENTER, so:
    const initialOffset = startStripIdx - CENTER;

    // Set up initial state with NO transition.
    setStrip(newStrip);
    setOffset(initialOffset);
    setDuration(0);
    setPhase('rolling');

    // Play the FIRST cursor tick synchronously inside the click handler so
    // browser autoplay policy is satisfied (a user gesture is on the stack)
    // and the user hears immediate audio feedback as the spin starts.
    // (This corresponds to the starting card already centered in the
    // yellow frame at t=0, so it is in-phase by definition.)
    playTick();

    // Wait two frames so the no-transition initial state commits, then
    // begin ticking. (Single rAF was not always enough across browsers.)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        let step = 0;
        let curOffset = initialOffset;

        // The CSS transition lasts `dur` ms with easing
        // cubic-bezier(0.22, 0.61, 0.36, 1) (front-loaded ease-out).
        // The incoming card crosses the center yellow frame when the
        // animation's *progress* reaches 0.5. With this bezier curve,
        // progress=0.5 is reached at input-time x ≈ 0.22 (NOT 0.5,
        // because the curve moves fast early and decelerates). We
        // schedule each cursor tick at dur * 0.22 after the slide
        // starts so the audible click coincides with the moment the
        // portrait overlaps the center frame. Without this offset the
        // tick fires too early (at the start of the slide, before the
        // card has reached center) and feels out-of-phase.
        const CENTER_CROSS_FRACTION = 0.22;
        const tick = () => {
          // Each iteration advances the strip by 1 card with the duration
          // assigned to THIS step (so the CSS transition matches the
          // setTimeout that schedules the next step).
          const dur = schedule[step];
          curOffset += 1; // strip slides leftward → new card from RIGHT
          setOffset(curOffset);
          setDuration(dur);
          // Schedule the audible click for the moment the incoming
          // portrait is centered in the yellow frame (mid-transition).
          // Skip step 0 — that "incoming" card was the initially
          // centered card whose tick we already fired synchronously.
          if (step > 0) {
            // Fire-and-forget; stopAllTicks handles any in-flight audio
            // sources, and the worst-case dangling timeout is a no-op
            // because cursorBufferRef is still valid post-landing.
            setTimeout(() => { playTick(); }, dur * CENTER_CROSS_FRACTION);
          }
          step += 1;

          if (step >= totalSteps) {
            // After the final translate completes, mark landed.
            timerRef.current = setTimeout(() => {
              setCenterIdx(finalIdx);
              setPhase('landed');
              setPulseKey((k) => k + 1);
              stopAllTicks();
              playAccept();
              recordSelection(finalIdx, nextEntry.role, nextEntry.slot);
            }, dur + 20);
            return;
          }
          timerRef.current = setTimeout(tick, dur);
        };

        tick();
      });
    });
  }

  function reset() {
    clearTimeout(timerRef.current);
    setPhase('idle');
    // Reshuffle the lineup so a fresh roster is drawn for the next round.
    setLineup(buildLineup(pool));
    if (onReset) onReset();
  }

  // Notify the parent of the new pick. The lineup guarantees uniqueness so
  // we just append unconditionally. The role comes from the lineup entry
  // (pickGroup decided it up-front) so the alliance slot can render a
  // role tag that matches what was actually assigned.
  // `instant` skips the fly-to-slot reveal animation in the parent (used
  // by the test-only Skip button so back-to-back picks land immediately).
  function recordSelection(finalIdx, role, slot, instant = false) {
    const winner = { ...pool[finalIdx], role, slot };
    // eslint-disable-next-line no-console
    console.log(
      `[RandomPersonSelector] Selected #${pickCount + 1}/${TARGET_SELECTIONS}: ${winner.name} (${role}) → slot ${slot}`,
    );
    if (onSelect) onSelect(winner, { instant });
  }

  // Test-only: instantly pick the next member from the predetermined
  // lineup, skipping all spin animation.
  function skip() {
    if (phase === 'rolling' || pool.length === 0) return;
    if (pickCount >= lineup.length) return;
    clearTimeout(timerRef.current);

    const nextEntry = lineup[pickCount];
    const finalIdx = nextEntry.poolIdx;
    // Build an idle-style strip centered on the chosen winner so the
    // viewport renders 5 unique surrounding cards immediately, with no
    // transition.
    setStrip(buildIdleStrip(pool, finalIdx));
    setOffset(0);
    setDuration(0);
    setCenterIdx(finalIdx);
    setPhase('landed');
    setPulseKey((k) => k + 1);
    stopAllTicks();
    playAccept();
    recordSelection(finalIdx, nextEntry.role, nextEntry.slot, true);
  }

  const status =
    phase === 'rolling'
      ? 'Selecting Member…'
      : phase === 'landed'
      ? 'Member Selected'
      : 'Ready to Roll';

  // The track is translated so that the cell at `offset` lands at the left
  // edge of the viewport. translateX = -(offset * cardStep).
  const trackStyle = {
    transform: `translateX(calc(-1 * var(--card-step) * ${offset}))`,
    transition:
      duration > 0
        ? `transform ${duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
        : 'none',
  };

  // Determine which strip index is currently centered (for highlight + name).
  const centerStripIdx = offset + CENTER;
  const centerCard = strip[centerStripIdx] || pool[centerIdx];

  return (
    <section className='selector'>
      <div className='selector__panel'>
        <div className='selector__title'>
          <span className='selector__title-orn'>◆</span>
          <h2>{status}</h2>
          <span className='selector__title-orn'>◆</span>
        </div>

        <div className='selector__viewport'>
          <div className='selector__center-frame' aria-hidden='true' />
          <div className='selector__track' style={trackStyle}>
            {strip.map((p, i) => {
              const isCenter = i === centerStripIdx;
              const dist = Math.min(3, Math.abs(i - centerStripIdx));
              return (
                <div
                  key={`${p.file}-${i}`}
                  className={
                    'sel-card' +
                    (isCenter ? ' sel-card--center' : '') +
                    (phase === 'landed' && isCenter ? ' sel-card--landed' : '') +
                    ` sel-card--dist-${dist}`
                  }
                >
                  <div className='sel-card__frame'>
                    <img
                      className='sel-card__img'
                      src={p.src}
                      alt={p.name}
                      draggable={false}
                    />
                    {isCenter && phase === 'landed' && (
                      <span
                        key={pulseKey}
                        className='sel-card__pulse'
                        aria-hidden='true'
                      />
                    )}
                  </div>
                  <div className='sel-card__name'>{p.name}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className='selector__controls'>
          <div className='selector__hint'>
            {phase === 'rolling'
              ? 'Spinning the wheel of fate…'
              : 'Click the roulette to select a member'}
          </div>
          <div className='selector__actions'>
            <button
              type='button'
              className='roll-btn'
              onClick={roll}
              disabled={phase === 'rolling' || pickCount >= lineup.length}
              aria-label='Roll for a random member'
            >
              <span className='roll-btn__crystal' aria-hidden='true'>◆</span>
              <span className='roll-btn__label'>
                <span className='roll-btn__big'>Roll</span>
                <span className='roll-btn__small'>Select Random Member</span>
              </span>
              <span className='roll-btn__crystal' aria-hidden='true'>◆</span>
            </button>

            <div className='selected-counter'>
              <div className='selected-counter__label'>Selected</div>
              <div className='selected-counter__value'>
                {pickCount} <span className='selected-counter__sep'>/</span>{' '}
                {TARGET_SELECTIONS}
              </div>
            </div>

            {pickCount > 0 && (
              <button
                type='button'
                className='reset-btn'
                onClick={reset}
                aria-label='Reset the selection history'
              >
                Reset
              </button>
            )}

            {/* TEST-ONLY: instantly pick a winner, bypassing the spin
                animation. Remove once no longer needed for testing. */}
            <button
              type='button'
              className='skip-btn'
              onClick={skip}
              disabled={phase === 'rolling' || pickCount >= lineup.length}
              aria-label='Skip animation and immediately select a random member (test only)'
              title='Test only - skip animation and pick instantly'
            >
              Skip ▶▶
            </button>
          </div>
        </div>

        <div
          className={
            'selector__winner' +
            (phase === 'landed' ? ' selector__winner--visible' : '')
          }
          aria-live='polite'
          aria-hidden={phase !== 'landed'}
        >
          <span className='selector__winner-label'>Chosen:</span>{' '}
          <span className='selector__winner-name'>
            {centerCard ? centerCard.name : '\u00A0'}
          </span>
        </div>
      </div>
    </section>
  );
}
