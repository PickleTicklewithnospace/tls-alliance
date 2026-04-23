// Shared global sound module. Loads and plays the cursor and accept
// sounds via Web Audio (zero-latency). Used by both the
// RandomPersonSelector (its existing tick/accept calls) and the
// global hover/click handler that plays sounds on every interactive
// element.

let ctx = null;
let cursorBuffer = null;
let acceptBuffer = null;
let cursorGain = null;
let acceptGain = null;
let initStarted = false;

function init() {
  if (initStarted) return;
  initStarted = true;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    cursorGain = ctx.createGain();
    cursorGain.gain.value = 0.35;
    cursorGain.connect(ctx.destination);
    acceptGain = ctx.createGain();
    acceptGain.gain.value = 0.6;
    acceptGain.connect(ctx.destination);

    const base = import.meta.env.BASE_URL;
    fetch(`${base}sounds/cursor_trimmed.mp3`)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((d) => { cursorBuffer = d; })
      .catch(() => {});
    fetch(`${base}sounds/accept_trimmed.mp3`)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((d) => { acceptBuffer = d; })
      .catch(() => {});
  } catch { /* best-effort */ }
}

function play(buffer, gain) {
  if (!ctx || !buffer || !gain) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    src.start(0);
  } catch { /* best-effort */ }
}

export function playCursor() {
  init();
  if (typeof window !== 'undefined') {
    window.__cursorPlayCount = (window.__cursorPlayCount || 0) + 1;
  }
  play(cursorBuffer, cursorGain);
}
export function playAccept() {
  init();
  if (typeof window !== 'undefined') {
    window.__acceptPlayCount = (window.__acceptPlayCount || 0) + 1;
  }
  play(acceptBuffer, acceptGain);
}

// CSS selector matching all elements that should trigger the global
// hover/click sounds. Kept narrow so we don't fire on every span/div.
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  'input',
  'select',
  '.flip-card',
  '.member-row',
  '.portrait-lightbox__close',
].join(',');

let installed = false;
let currentHoverEl = null;

export function installGlobalUiSounds() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  init();

  // Resume audio on first user gesture.
  const resume = () => {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', resume, true);
  window.addEventListener('keydown', resume, true);

  // Elements inside the spinner panel manage their own sounds (tick/accept
  // tied to spin animation). Skip the global handler within `.selector`
  // and on any element opting out via `data-no-ui-sound`.
  function shouldSkip(el) {
    return el.closest('.selector') || el.closest('[data-no-ui-sound]');
  }

  // Walk up from `target` and return the OUTERMOST ancestor (closest to
  // <html>) matching INTERACTIVE_SELECTOR. Using the outermost ensures
  // that nested matched elements (e.g. `.member-row` inside `.flip-card`)
  // are treated as a single logical hover target, so moving between
  // them does not re-trigger the cursor sound.
  function outermostInteractive(target) {
    if (!target || !target.closest) return null;
    if (!target.closest(INTERACTIVE_SELECTOR)) return null;
    let node = target;
    let outer = null;
    while (node && node !== document) {
      if (node.matches && node.matches(INTERACTIVE_SELECTOR)) outer = node;
      node = node.parentNode;
    }
    return outer;
  }

  // An interactive element is "inert" (no sound) when it can't be
  // meaningfully activated. Currently: un-revealed flip-cards ("???").
  function isInert(el) {
    return el.classList && el.classList.contains('flip-card') &&
      !el.classList.contains('is-flipped');
  }

  document.addEventListener('pointerover', (e) => {
    const el = outermostInteractive(e.target);
    if (!el || shouldSkip(el) || isInert(el)) {
      // Pointer moved over a non-interactive area; if relatedTarget is
      // outside currentHoverEl, clear it so re-entering plays again.
      if (currentHoverEl) {
        const related = e.relatedTarget;
        if (!related || !currentHoverEl.contains(related)) {
          currentHoverEl = null;
        }
      }
      return;
    }
    // Same interactive ancestor as before: ignore (moving among children).
    if (el === currentHoverEl) return;
    currentHoverEl = el;
    playCursor();
  }, true);

  document.addEventListener('pointerout', (e) => {
    if (!currentHoverEl) return;
    // Only clear when actually leaving the matched interactive element,
    // not when crossing between its descendants.
    const related = e.relatedTarget;
    if (!related || !currentHoverEl.contains(related)) {
      currentHoverEl = null;
    }
  }, true);

  document.addEventListener('click', (e) => {
    const el = outermostInteractive(e.target);
    if (!el || shouldSkip(el) || isInert(el)) return;
    playAccept();
  }, true);
}
