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
 * Stable-by-priority but random-within-tier ordering.
 * Assumes input is already sorted by priority desc.
 *
 * @template T
 * @param {Array<T & {priority:number}>} sortedDesc
 * @param {() => number} rng
 * @returns {Array<T & {priority:number}>}
 */
function shuffleEqualPriorityTiers(sortedDesc, rng) {
  const out = [];
  let i = 0;
  while (i < sortedDesc.length) {
    let j = i + 1;
    while (j < sortedDesc.length && sortedDesc[j].priority === sortedDesc[i].priority) j++;
    const tier = sortedDesc.slice(i, j);
    fisherYates(tier, rng);
    out.push(...tier);
    i = j;
  }
  return out;
}

/** In-place Fisher–Yates shuffle. */
function fisherYates(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1));
    [arr[i], arr[k]] = [arr[k], arr[i]];
  }
}
