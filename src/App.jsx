import { useCallback, useEffect, useRef, useState } from 'react';
import { ALLIANCES, SLOTS_PER_ALLIANCE } from './data';
import Header from './components/Header';
import Footer from './components/Footer';
import AllianceCard from './components/AllianceCard';
import RandomPersonSelector from './components/RandomPersonSelector';

// Timing for the "fly" reveal animation. The picked portrait first
// expands to the centre of the screen (over all UI), pauses briefly,
// then shrinks into its alliance slot - at which point the slot
// flips to its revealed state.
const FLY_TO_CENTER_MS = 380;
const FLY_HOLD_MS = 1260;
const FLY_TO_SLOT_MS = 380;

export default function App() {
  // Centralised list of picked people. Indexed BY SLOT (A0..A7, B0..B7,
  // C0..C7) so each pick lands in its predetermined alliance position
  // regardless of reveal order. (Reveal order is tank → healer → DPS,
  // but slot positions remain fixed per alliance.)
  const [selected, setSelected] = useState([]);

  // Fly-overlay state. While set, a fixed-position portrait is animated
  // across the screen; the alliance slot it targets stays "???" until
  // the animation completes, then we commit the pick to `selected` so
  // the slot flips.
  // Shape: { person, stage: 'to-center' | 'hold' | 'to-slot', startRect,
  //          centerRect, targetRect }
  const [fly, setFly] = useState(null);
  const flyTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(flyTimerRef.current), []);

  const commitSelected = useCallback((person) => {
    setSelected((prev) => {
      const next = prev.slice();
      const slot = typeof person.slot === 'number' ? person.slot : next.length;
      next[slot] = person;
      return next;
    });
  }, []);

  // Compute the geometry for the fly animation. Source is the center
  // sel-card frame (the freshly-landed portrait); target is the
  // alliance slot (.flip-card) at the person's destination index.
  const computeFlyRects = useCallback((person) => {
    const slotIdx = typeof person.slot === 'number' ? person.slot : null;
    if (slotIdx == null) return null;
    const slotEls = document.querySelectorAll('.flip-card');
    const targetEl = slotEls[slotIdx];
    const sourceEl = document.querySelector('.sel-card--center .sel-card__frame');
    if (!targetEl || !sourceEl) return null;
    const startRect = sourceEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    // Center rect: large portrait centered in viewport, preserving the
    // 3:4 portrait aspect of sel-card frames. Sized to ~62vh tall but
    // capped so it never overflows the viewport.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const targetH = Math.min(vh * 0.7, vh - 80);
    const targetW = targetH * (3 / 4);
    const w = Math.min(targetW, vw * 0.6);
    const h = w * (4 / 3);
    const centerRect = {
      left: (vw - w) / 2,
      top: (vh - h) / 2,
      width: w,
      height: h,
    };
    return { startRect, centerRect, targetRect };
  }, []);

  const handleSelect = useCallback((person, opts = {}) => {
    // If a previous fly animation is still running, commit it now so we
    // don't lose that pick before starting a new one. (Happens when the
    // user clicks Skip in rapid succession.)
    setFly((prev) => {
      if (prev) commitSelected(prev.person);
      return prev; // will be overwritten below
    });
    clearTimeout(flyTimerRef.current);
    // The Skip button (test-only) bypasses the fly reveal so back-to-back
    // picks land instantly without waiting on the multi-stage animation.
    if (opts.instant) {
      commitSelected(person);
      setFly(null);
      return;
    }
    const rects = computeFlyRects(person);
    if (!rects) {
      // Fallback - just commit immediately if we can't measure.
      commitSelected(person);
      setFly(null);
      return;
    }
    // Stage 1: render at source, then on next frame transition to center.
    setFly({ person, stage: 'to-center', ...rects });
  }, [computeFlyRects, commitSelected]);

  // Drive the fly stages with timers. Effect re-runs when stage changes.
  useEffect(() => {
    if (!fly) return;
    if (fly.stage === 'to-center') {
      flyTimerRef.current = setTimeout(() => {
        setFly((f) => (f ? { ...f, stage: 'hold' } : f));
      }, FLY_TO_CENTER_MS);
    } else if (fly.stage === 'hold') {
      flyTimerRef.current = setTimeout(() => {
        // Re-measure target slot in case layout has shifted.
        setFly((f) => {
          if (!f) return f;
          const slotIdx =
            typeof f.person.slot === 'number' ? f.person.slot : null;
          if (slotIdx != null) {
            const slotEls = document.querySelectorAll('.flip-card');
            const targetEl = slotEls[slotIdx];
            if (targetEl) {
              const r = targetEl.getBoundingClientRect();
              return { ...f, stage: 'to-slot', targetRect: r };
            }
          }
          return { ...f, stage: 'to-slot' };
        });
      }, FLY_HOLD_MS);
    } else if (fly.stage === 'to-slot') {
      flyTimerRef.current = setTimeout(() => {
        commitSelected(fly.person);
        setFly(null);
      }, FLY_TO_SLOT_MS);
    }
    return () => clearTimeout(flyTimerRef.current);
  }, [fly, commitSelected]);

  const handleReset = useCallback(() => {
    clearTimeout(flyTimerRef.current);
    setFly(null);
    setSelected([]);
  }, []);

  // Build the fixed-position style for the flying portrait based on
  // its current stage. Each stage targets a different rect; CSS
  // transitions interpolate the change.
  let flyStyle = null;
  let flyTransitionMs = 0;
  if (fly) {
    let r;
    if (fly.stage === 'to-center') {
      // Frame 0: rendered at startRect with no transition; on the next
      // commit (we set stage to-center immediately) we move toward
      // centerRect. To get the initial paint at startRect, we render
      // a single frame at startRect and switch to centerRect on rAF.
      r = fly._switched ? fly.centerRect : fly.startRect;
      flyTransitionMs = fly._switched ? FLY_TO_CENTER_MS : 0;
    } else if (fly.stage === 'hold') {
      r = fly.centerRect;
      flyTransitionMs = 0;
    } else {
      r = fly.targetRect;
      flyTransitionMs = FLY_TO_SLOT_MS;
    }
    flyStyle = {
      position: 'fixed',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      transition:
        flyTransitionMs > 0
          ? `left ${flyTransitionMs}ms cubic-bezier(0.22, 0.61, 0.36, 1), ` +
            `top ${flyTransitionMs}ms cubic-bezier(0.22, 0.61, 0.36, 1), ` +
            `width ${flyTransitionMs}ms cubic-bezier(0.22, 0.61, 0.36, 1), ` +
            `height ${flyTransitionMs}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
          : 'none',
    };
  }

  // Trigger the start→center transition on the next animation frame
  // after the overlay first mounts at startRect.
  useEffect(() => {
    if (fly && fly.stage === 'to-center' && !fly._switched) {
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFly((f) => (f && f.stage === 'to-center' && !f._switched
            ? { ...f, _switched: true }
            : f));
        });
      });
      return () => cancelAnimationFrame(id);
    }
  }, [fly]);

  return (
    <div className='page'>
      <Header />
      <main className='alliances'>
        {ALLIANCES.map((alliance, ai) => (
          <AllianceCard
            key={alliance.key}
            alliance={alliance}
            startSlot={ai * SLOTS_PER_ALLIANCE}
            selected={selected}
          />
        ))}
      </main>
      <RandomPersonSelector
        selected={selected}
        onSelect={handleSelect}
        onReset={handleReset}
      />
      <Footer />
      {fly && (
        <div className='fly-portrait' style={flyStyle} aria-hidden='true'>
          <img
            className='fly-portrait__img'
            src={fly.person.src}
            alt=''
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}
