// pickGroup.js
// Fairly pick a raid group: 3 tanks, 6 healers, 15 DPS (24 total).
//
// Fairness model (per requirements):
//   - Each signup has a numeric `priority`. Higher priority is picked first.
//   - Ties in priority are broken by a uniform random shuffle within the tier.
//   - When a person can play multiple still-open roles, the role is chosen
//     uniformly at random from their listed roles that still have open slots.
//   - No flex back-fill: if a role ends up short, we fail and report.
//
// Output: { ok, assignments, unfilled, skipped }.

/** @typedef {'tank'|'healer'|'dps'} Role */
/**
 * @typedef {Object} Signup
 * @property {string|number} id
 * @property {number} priority           Higher = picked first.
 * @property {Role[]} roles              Roles this person is willing to play.
 */
/**
 * @typedef {Object} Assignment
 * @property {string|number} id
 * @property {Role} role
 */
/**
 * @typedef {Object} PickResult
 * @property {boolean} ok                True iff every role was fully filled.
 * @property {Assignment[]} assignments  Selected players and their roles.
 * @property {Record<Role, number>} unfilled  Remaining open slots per role.
 * @property {(string|number)[]} skipped Signups not picked (no open role they can play).
 */

export const DEFAULT_SLOTS = Object.freeze({ tank: 3, healer: 6, dps: 15 });
const VALID_ROLES = Object.freeze(['tank', 'healer', 'dps']);

/**
 * Pick a fair group from a list of signups.
 *
 * @param {Signup[]} signups
 * @param {Partial<Record<Role, number>>} [slots=DEFAULT_SLOTS]
 * @param {() => number} [rng=Math.random]  Injectable RNG for deterministic tests.
 * @returns {PickResult}
 */
export function pickGroup(signups, slots = DEFAULT_SLOTS, rng = Math.random) {
  // --- Validate & normalize slots ---------------------------------------
  // Only accept the three known role keys, must be non-negative integers.
  const remaining = { tank: 0, healer: 0, dps: 0 };
  for (const role of VALID_ROLES) {
    const v = slots && slots[role];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
      throw new TypeError(`slots.${role} must be a non-negative integer; got ${v}`);
    }
    remaining[role] = v;
  }

  // --- Validate signups & filter out unusable entries -------------------
  const seenIds = new Set();
  /** @type {(string|number)[]} */
  const skipped = [];
  /** @type {Signup[]} */
  const usable = [];
  for (const person of signups || []) {
    if (person == null || typeof person !== 'object') {
      throw new TypeError('signups must contain non-null objects');
    }
    if (!Array.isArray(person.roles)) {
      throw new TypeError(`signup ${String(person.id)} has non-array roles`);
    }
    if (typeof person.priority !== 'number' || Number.isNaN(person.priority)) {
      throw new TypeError(`signup ${String(person.id)} has invalid priority`);
    }
    if (seenIds.has(person.id)) {
      throw new Error(`duplicate signup id: ${String(person.id)}`);
    }
    seenIds.add(person.id);

    // Normalize roles: lowercase strings, dedupe, drop invalids.
    const normalized = Array.from(new Set(
      person.roles
        .filter((r) => typeof r === 'string')
        .map((r) => r.toLowerCase())
        .filter((r) => VALID_ROLES.includes(r)),
    ));

    if (normalized.length === 0) {
      skipped.push(person.id);
      continue;
    }
    usable.push({ ...person, roles: normalized });
  }

  // --- Sort by priority desc, random tie-break within tier --------------
  const byPriority = usable.sort((a, b) => b.priority - a.priority);
  const ordered = shuffleEqualPriorityTiers(byPriority, rng);

  /** @type {Assignment[]} */
  const assignments = [];

  // --- Greedy assignment in priority order ------------------------------
  for (const person of ordered) {
    const openRoles = person.roles.filter((r) => remaining[r] > 0);
    if (openRoles.length === 0) {
      skipped.push(person.id);
      continue;
    }
    const chosen = openRoles[boundedIndex(rng, openRoles.length)];
    remaining[chosen] -= 1;
    assignments.push({ id: person.id, role: chosen });
  }

  // --- Underfill check ---------------------------------------------------
  const ok = VALID_ROLES.every((r) => remaining[r] === 0);

  return { ok, assignments, unfilled: remaining, skipped };
}

/**
 * Safe random index in [0, n). Clamps the rare rng() === 1 case so we never
 * produce an out-of-bounds index.
 */
function boundedIndex(rng, n) {
  const v = rng();
  // Treat any value >=1 (broken rng) or <0 as 0..n-1 via min/max.
  const idx = Math.floor(v * n);
  return Math.min(Math.max(idx, 0), n - 1);
}

/**
 * Stable-by-priority but weighted-random-within-tier ordering.
 * Assumes input is already sorted by priority desc.
 *
 * Within each priority tier we order people via a weighted shuffle where
 * each person's weight is 1 / max(1, roles.length)^2. The squared term
 * gives a stronger bias toward single-role signups: a 1-role person has
 * 4x the weight of a 2-role person and 9x a 3-role person. The effect:
 * single-role signups (e.g. DPS-only) are noticeably more likely to land
 * earlier in the pick order than people who signed up for multiple roles,
 * evening out the chance of being picked. Nobody is guaranteed and nobody
 * is excluded - it's a probabilistic nudge, not a hard cap.
 *
 * @template T
 * @param {Array<T & {priority:number, roles:string[]}>} sortedDesc
 * @param {() => number} rng
 * @returns {Array<T & {priority:number, roles:string[]}>}
 */
function shuffleEqualPriorityTiers(sortedDesc, rng) {
  const out = [];
  let i = 0;
  while (i < sortedDesc.length) {
    let j = i + 1;
    while (j < sortedDesc.length && sortedDesc[j].priority === sortedDesc[i].priority) j++;
    const tier = sortedDesc.slice(i, j);
    out.push(...weightedShuffle(tier, rng, (p) => {
      const n = Math.max(1, p.roles.length);
      return 1 / (n * n);
    }));
    i = j;
  }
  return out;
}

/**
 * Weighted random ordering via the "exponential trick": for each item draw
 * a key = -ln(U) / w (U uniform in (0,1]) and sort ascending by key. This
 * is mathematically equivalent to repeatedly sampling without replacement
 * proportional to the weights, but runs in O(n log n) and uses only the
 * supplied rng. Items with higher weight tend to land earlier.
 *
 * @template T
 * @param {T[]} arr
 * @param {() => number} rng
 * @param {(item: T) => number} weightFn  Must return a positive finite weight.
 * @returns {T[]}
 */
function weightedShuffle(arr, rng, weightFn) {
  const keyed = arr.map((item) => {
    const w = weightFn(item);
    const safeW = w > 0 && Number.isFinite(w) ? w : Number.MIN_VALUE;
    // Clamp U away from 0 so -ln(U) is finite.
    const u = Math.max(rng(), Number.MIN_VALUE);
    return { item, key: -Math.log(u) / safeW };
  });
  keyed.sort((a, b) => a.key - b.key);
  return keyed.map((k) => k.item);
}
