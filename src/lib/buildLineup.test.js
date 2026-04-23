// Unit tests for buildRaidLineup.
//
// buildRaidLineup is the bridge between the fairness picker (pickGroup)
// and the alliance grid UI. It must return entries in slot order such
// that lineup[N].role === ROLE_TEMPLATE[N % SLOTS_PER_ALLIANCE].

import { describe, it, expect } from 'vitest';
import { buildRaidLineup } from './buildLineup';
import { ROLE_TEMPLATE, ALLIANCES, SLOTS_PER_ALLIANCE } from '../data';

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a synthetic portrait-shaped pool large enough to fill the raid.
// Roles are spread so all three are well-represented.
function makePool(n = 30) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `p${i}`,
      name: `Person ${i}`,
      file: `p${i}.png`,
      src: `/portraits/p${i}.png`,
      priority: i % 5, // some variety; not all-tied
      roles: ['tank', 'healer', 'dps'],
    });
  }
  return out;
}

const TOTAL_SLOTS = ALLIANCES.length * SLOTS_PER_ALLIANCE;

describe('buildRaidLineup', () => {
  it('returns one entry per alliance slot when the pool is sufficient', () => {
    const pool = makePool(30);
    const lineup = buildRaidLineup(pool, mulberry32(1));
    expect(lineup).toHaveLength(TOTAL_SLOTS);
  });

  it('roles align with ROLE_TEMPLATE at each entry\'s destination slot', () => {
    // Lineup is now in REVEAL order (tank → healer → DPS) but each
    // entry carries its destination `slot`; the role at that slot must
    // still match ROLE_TEMPLATE.
    const pool = makePool(30);
    const lineup = buildRaidLineup(pool, mulberry32(7));
    for (const { slot, role } of lineup) {
      const expected = ROLE_TEMPLATE[slot % SLOTS_PER_ALLIANCE];
      expect(role).toBe(expected);
    }
  });

  it('reveals tanks first, then healers, then DPS', () => {
    const pool = makePool(30);
    const lineup = buildRaidLineup(pool, mulberry32(11));
    const seq = lineup.map((e) => e.role);
    const tankCount = seq.filter((r) => r === 'tank').length;
    const healerCount = seq.filter((r) => r === 'healer').length;
    expect(seq.slice(0, tankCount).every((r) => r === 'tank')).toBe(true);
    expect(seq.slice(tankCount, tankCount + healerCount).every((r) => r === 'healer')).toBe(true);
    expect(seq.slice(tankCount + healerCount).every((r) => r === 'dps')).toBe(true);
  });

  it('every entry has a unique destination slot in [0, TOTAL_SLOTS)', () => {
    const pool = makePool(30);
    const lineup = buildRaidLineup(pool, mulberry32(5));
    const slots = new Set();
    for (const { slot } of lineup) {
      expect(typeof slot).toBe('number');
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(TOTAL_SLOTS);
      expect(slots.has(slot)).toBe(false);
      slots.add(slot);
    }
  });

  it('every entry references a portrait from the input pool', () => {
    const pool = makePool(30);
    const lineup = buildRaidLineup(pool, mulberry32(2));
    const ids = new Set(pool.map((p) => p.id));
    for (const { portrait } of lineup) {
      expect(ids.has(portrait.id)).toBe(true);
    }
  });

  it('does not pick the same portrait twice', () => {
    const pool = makePool(30);
    const lineup = buildRaidLineup(pool, mulberry32(3));
    const seen = new Set();
    for (const { portrait } of lineup) {
      expect(seen.has(portrait.id)).toBe(false);
      seen.add(portrait.id);
    }
  });

  it('only assigns roles the picked person was eligible for', () => {
    // Use a pool with restricted roles so this assertion is meaningful.
    const pool = [];
    for (let i = 0; i < 10; i++) pool.push({ id: `t${i}`, name: `T${i}`, file: `t${i}.png`, src: '', priority: 1, roles: ['tank'] });
    for (let i = 0; i < 10; i++) pool.push({ id: `h${i}`, name: `H${i}`, file: `h${i}.png`, src: '', priority: 1, roles: ['healer'] });
    for (let i = 0; i < 20; i++) pool.push({ id: `d${i}`, name: `D${i}`, file: `d${i}.png`, src: '', priority: 1, roles: ['dps'] });
    const lineup = buildRaidLineup(pool, mulberry32(13));
    expect(lineup).toHaveLength(TOTAL_SLOTS);
    for (const { portrait, role } of lineup) {
      expect(portrait.roles).toContain(role);
    }
  });

  it('returns a short lineup (no mis-roled slots) when a role pool is insufficient', () => {
    // Only 2 tank-eligible portraits → cannot fill the 3 tank slots.
    const pool = [];
    for (let i = 0; i < 2; i++) pool.push({ id: `t${i}`, name: `T${i}`, file: '', src: '', priority: 1, roles: ['tank'] });
    for (let i = 0; i < 10; i++) pool.push({ id: `h${i}`, name: `H${i}`, file: '', src: '', priority: 1, roles: ['healer'] });
    for (let i = 0; i < 20; i++) pool.push({ id: `d${i}`, name: `D${i}`, file: '', src: '', priority: 1, roles: ['dps'] });

    const lineup = buildRaidLineup(pool, mulberry32(0));
    // Each entry's role must match its destination slot's template
    // role (no silent role-swapping).
    for (const { slot, role } of lineup) {
      expect(role).toBe(ROLE_TEMPLATE[slot % SLOTS_PER_ALLIANCE]);
    }
    // The lineup MUST be shorter than TOTAL_SLOTS because there aren't
    // enough tanks to cover all 3 tank positions.
    expect(lineup.length).toBeLessThan(TOTAL_SLOTS);
  });

  it('is deterministic with a fixed RNG', () => {
    const pool = makePool(30);
    const a = buildRaidLineup(pool, mulberry32(42));
    const b = buildRaidLineup(pool, mulberry32(42));
    expect(a.map((e) => `${e.portrait.id}:${e.role}`))
      .toEqual(b.map((e) => `${e.portrait.id}:${e.role}`));
  });

  it('produces different orderings for different RNG seeds', () => {
    const pool = makePool(30);
    const a = buildRaidLineup(pool, mulberry32(1));
    const b = buildRaidLineup(pool, mulberry32(2));
    const seqA = a.map((e) => e.portrait.id).join(',');
    const seqB = b.map((e) => e.portrait.id).join(',');
    expect(seqA).not.toBe(seqB);
  });
});

describe('buildRaidLineup - reveal-order spread', () => {
  // Build a pool where a small set of high-priority signups sit far above
  // the rest. They will always be picked, but they should NOT always end
  // up in the earliest slots - buildRaidLineup shuffles role buckets to
  // randomise reveal order.
  function makeHighPriorityPool() {
    const pool = [];
    // 9 high-priority all-role signups.
    for (let i = 0; i < 9; i++) {
      pool.push({
        id: `H${i}`, name: `H${i}`, file: `H${i}.png`, src: '',
        priority: 1_000_000, roles: ['tank', 'healer', 'dps'],
      });
    }
    // Plus a sufficient pool of normal-priority all-role signups.
    for (let i = 0; i < 30; i++) {
      pool.push({
        id: `N${i}`, name: `N${i}`, file: `N${i}.png`, src: '',
        priority: 1, roles: ['tank', 'healer', 'dps'],
      });
    }
    return pool;
  }

  it('high-priority picks land at varied slot positions across seeds', () => {
    const pool = makeHighPriorityPool();
    // For each high-priority id, collect the set of slot indices it ends
    // up at across many seeds. If the bucket weren't shuffled, every
    // high-priority id would map to ONE fixed slot - the test would fail.
    const positionsById = new Map();
    for (let seed = 0; seed < 30; seed++) {
      const lineup = buildRaidLineup(pool, mulberry32(seed));
      for (const { portrait, slot } of lineup) {
        if (!portrait.id.startsWith('H')) continue;
        if (!positionsById.has(portrait.id)) positionsById.set(portrait.id, new Set());
        positionsById.get(portrait.id).add(slot);
      }
    }
    // Every high-priority id should have appeared at >1 distinct slot.
    for (const [id, positions] of positionsById) {
      expect(positions.size, `${id} only ever appeared at slot(s) ${[...positions]}`)
        .toBeGreaterThan(1);
    }
  });

  it('all high-priority picks still appear in every lineup', () => {
    const pool = makeHighPriorityPool();
    const highPriorityIds = pool.filter((p) => p.priority === 1_000_000).map((p) => p.id);
    for (let seed = 0; seed < 20; seed++) {
      const lineup = buildRaidLineup(pool, mulberry32(seed));
      const ids = new Set(lineup.map((e) => e.portrait.id));
      for (const hid of highPriorityIds) {
        expect(ids.has(hid), `seed ${seed} missing ${hid}`).toBe(true);
      }
    }
  });
});

describe('buildRaidLineup - role distribution', () => {
  it('overall counts match DEFAULT_SLOTS (3 tank / 6 healer / 15 dps)', () => {
    const pool = makePool(30);
    const lineup = buildRaidLineup(pool, mulberry32(9));
    const counts = { tank: 0, healer: 0, dps: 0 };
    for (const { role } of lineup) counts[role]++;
    expect(counts).toEqual({ tank: 3, healer: 6, dps: 15 });
  });
});
