// buildLineup.js
// Compose the ordered roster the UI walks through, one pick per slot.
//
// pickGroup(...) decides WHO gets in and WHICH ROLE each picked person
// will play (3 tanks, 6 healers, 15 DPS by default). The UI then reveals
// those people one at a time into fixed alliance slots whose roles are
// dictated by ROLE_TEMPLATE (per alliance: tank, healer, healer, dps×5).
//
// This module bridges the two: take pickGroup's role assignments and
// arrange them in the exact order the slots will be filled, so that
// pick #N already carries the role expected at slot #N.
//
// Output: array of { portrait, role } in slot order. Length equals
// min(TOTAL_SLOTS, available). If pickGroup can't fully fill the raid
// (not enough role-eligible people), the returned lineup will be short
// rather than mis-roled.

import { pickGroup, DEFAULT_SLOTS } from './pickGroup';
import { ROLE_TEMPLATE, ALLIANCES, SLOTS_PER_ALLIANCE } from '../data';

/**
 * @typedef {{ id: string|number, name: string, file: string, src: string,
 *             priority: number, roles: ('tank'|'healer'|'dps')[] }} Portrait
 */

/**
 * @param {Portrait[]} portraits   Pool of available signups.
 * @param {() => number} [rng]     Injectable RNG for deterministic tests.
 * @returns {{ portrait: Portrait, role: 'tank'|'healer'|'dps' }[]}
 */
export function buildRaidLineup(portraits, rng = Math.random) {
  const result = pickGroup(portraits, DEFAULT_SLOTS, rng);

  // Index portraits by id for O(1) lookup when we hydrate assignments.
  const byId = new Map(portraits.map((p) => [p.id, p]));

  // Bucket the assignments by role so we can pop one per slot.
  const buckets = { tank: [], healer: [], dps: [] };
  for (const a of result.assignments) {
    const portrait = byId.get(a.id);
    if (!portrait) continue; // defensive: assignment id must come from input
    buckets[a.role].push(portrait);
  }

  // Shuffle each bucket so the reveal order is random across slots.
  // Without this, pickGroup's priority order leaks into the UI: high-
  // priority people always appear in the earliest slots of Alliance A.
  // Shuffling preserves WHO got picked and WHICH role they have, while
  // randomising WHEN they are revealed.
  for (const role of ['tank', 'healer', 'dps']) {
    fisherYates(buckets[role], rng);
  }

  // Build the slot-iteration order. The UI reveals members one-at-a-time
  // in this order, but each entry carries its DESTINATION slot index so
  // alliance cards still place each member in the correct fixed position.
  //
  // Reveal order: all TANK slots first (across alliances A→B→C, in slot
  // order), then all HEALER slots, then all DPS slots. Within each role
  // we keep alliance-major / position-minor traversal so the tank of
  // Alliance A is revealed before the tank of Alliance B, etc.
  const totalSlots = ALLIANCES.length * SLOTS_PER_ALLIANCE;
  const slotsByRole = { tank: [], healer: [], dps: [] };
  for (let slot = 0; slot < totalSlots; slot++) {
    const role = ROLE_TEMPLATE[slot % SLOTS_PER_ALLIANCE];
    slotsByRole[role].push(slot);
  }
  const slotOrder = [
    ...slotsByRole.tank,
    ...slotsByRole.healer,
    ...slotsByRole.dps,
  ];

  // For each slot in reveal order, pop the next person from the matching
  // role bucket. If a particular role bucket runs dry we just skip its
  // remaining slots (they stay as "???" in the UI) but keep filling
  // OTHER roles - we never silently swap a person into a role they
  // didn't sign up for, but we also don't drop a healer pick just
  // because a tank slot is unfilled.
  const lineup = [];
  for (const slot of slotOrder) {
    const role = ROLE_TEMPLATE[slot % SLOTS_PER_ALLIANCE];
    const portrait = buckets[role].shift();
    if (!portrait) continue;
    lineup.push({ portrait, role, slot });
  }
  return lineup;
}

/** In-place Fisher–Yates shuffle. */
function fisherYates(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1));
    [arr[i], arr[k]] = [arr[k], arr[i]];
  }
}
