// Unit tests for the PORTRAITS module.
//
// PORTRAITS is the static pool of in-game characters. Since pickGroup
// now consumes them directly, every entry must satisfy the Signup
// contract (id, priority, roles) in addition to the rendering fields
// (name, file, src). These tests pin those invariants down so a future
// edit to the file list cannot quietly break the picker.

import { describe, it, expect } from 'vitest';
import { PORTRAITS } from './portraits';

const VALID_ROLES = new Set(['tank', 'healer', 'dps']);

describe('PORTRAITS pool', () => {
  it('contains at least 24 entries (raid size)', () => {
    expect(PORTRAITS.length).toBeGreaterThanOrEqual(24);
  });

  it('every entry has the rendering fields', () => {
    for (const p of PORTRAITS) {
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
      expect(typeof p.file).toBe('string');
      expect(p.file.length).toBeGreaterThan(0);
      expect(typeof p.src).toBe('string');
      expect(p.src.startsWith('/portraits/')).toBe(true);
    }
  });

  it('every entry has a valid pickGroup-compatible signup shape', () => {
    for (const p of PORTRAITS) {
      expect(p.id).toBeDefined();
      expect(typeof p.priority).toBe('number');
      expect(Number.isFinite(p.priority)).toBe(true);
      expect(Array.isArray(p.roles)).toBe(true);
      expect(p.roles.length).toBeGreaterThan(0);
      for (const r of p.roles) expect(VALID_ROLES.has(r)).toBe(true);
    }
  });

  it('ids are unique', () => {
    const ids = PORTRAITS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has enough role-eligible signups to fill 3 tank / 6 healer / 15 dps', () => {
    let t = 0, h = 0, d = 0;
    for (const p of PORTRAITS) {
      if (p.roles.includes('tank')) t++;
      if (p.roles.includes('healer')) h++;
      if (p.roles.includes('dps')) d++;
    }
    expect(t).toBeGreaterThanOrEqual(3);
    expect(h).toBeGreaterThanOrEqual(6);
    expect(d).toBeGreaterThanOrEqual(15);
  });

  it('apostrophe filenames decode to apostrophes in display name', () => {
    const chi = PORTRAITS.find((p) => p.file === 'Chi_s Keki.png');
    expect(chi).toBeDefined();
    expect(chi.name).toBe("Chi's Keki");
  });

  it('priority and roles are deterministic across loads', async () => {
    // Re-import via cache-bust to prove the synthesis is pure.
    const mod = await import('./portraits?reimport=1');
    for (let i = 0; i < PORTRAITS.length; i++) {
      const a = PORTRAITS[i];
      const b = mod.PORTRAITS[i];
      expect(b.priority).toBe(a.priority);
      expect(b.roles).toEqual(a.roles);
    }
  });
});

// Shared deterministic RNG for the seed-sweep tests below.
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

// ---------------------------------------------------------------------------
// Role-eligibility safety net.
//
// The whole point of attaching a `roles` array to each PORTRAIT is to stop
// the picker from ever assigning someone to a role they did not sign up
// for. These tests sweep many RNG seeds and assert that invariant against
// both the low-level pickGroup and the slot-aware buildRaidLineup, using
// the REAL portraits pool (so a future edit to roles.txt that drops a
// signup will fail loudly here).
// ---------------------------------------------------------------------------
describe('PORTRAITS role-eligibility invariants', () => {
  // Map id -> Set of roles the person is willing to play. We resolve this
  // once from the portraits pool so the test mirrors what pickGroup sees.
  const eligibleById = new Map(
    PORTRAITS.map((p) => [p.id, new Set(p.roles)]),
  );

  it('pickGroup never assigns a role outside the signup list', async () => {
    const { pickGroup, DEFAULT_SLOTS } = await import('./pickGroup');
    for (let seed = 0; seed < 50; seed++) {
      const result = pickGroup(PORTRAITS, DEFAULT_SLOTS, mulberry32(seed));
      for (const a of result.assignments) {
        const eligible = eligibleById.get(a.id);
        expect(eligible, `seed ${seed}: unknown id ${a.id}`).toBeDefined();
        expect(
          eligible.has(a.role),
          `seed ${seed}: ${a.id} assigned ${a.role} but eligible roles are [${[...eligible].join(', ')}]`,
        ).toBe(true);
      }
    }
  });

  it('buildRaidLineup never seats someone in a role outside their signup list', async () => {
    const { buildRaidLineup } = await import('./buildLineup');
    for (let seed = 0; seed < 50; seed++) {
      const lineup = buildRaidLineup(PORTRAITS, mulberry32(seed));
      for (const entry of lineup) {
        const eligible = eligibleById.get(entry.portrait.id);
        expect(
          eligible.has(entry.role),
          `seed ${seed}: ${entry.portrait.name} seated as ${entry.role} ` +
          `but eligible roles are [${[...eligible].join(', ')}]`,
        ).toBe(true);
      }
    }
  });

  it('buildRaidLineup respects the slot template (slot role matches assigned role)', async () => {
    const { buildRaidLineup } = await import('./buildLineup');
    const { ROLE_TEMPLATE, SLOTS_PER_ALLIANCE } = await import('../data');
    for (let seed = 0; seed < 50; seed++) {
      const lineup = buildRaidLineup(PORTRAITS, mulberry32(seed));
      for (const entry of lineup) {
        const slotRole = ROLE_TEMPLATE[entry.slot % SLOTS_PER_ALLIANCE];
        expect(
          entry.role,
          `seed ${seed}: slot ${entry.slot} expects ${slotRole} but got ${entry.role}`,
        ).toBe(slotRole);
      }
    }
  });

  // Derive the single-role portraits from the actual pool so any future
  // change to roles.txt extends coverage automatically.
  const SINGLE_ROLE_PORTRAITS = PORTRAITS
    .filter((p) => p.roles.length === 1)
    .map((p) => ({ name: p.name, only: p.roles[0] }));

  it('the derived single-role list is non-empty (sanity)', () => {
    // If this drops to 0 the table-driven test below silently passes
    // without checking anything. Guard against that.
    expect(SINGLE_ROLE_PORTRAITS.length).toBeGreaterThan(0);
  });

  it.each(SINGLE_ROLE_PORTRAITS)(
    '$name is only ever picked as $only across many seeds',
    async ({ name, only }) => {
      const { buildRaidLineup } = await import('./buildLineup');
      const portrait = PORTRAITS.find((p) => p.name === name);
      for (let seed = 0; seed < 50; seed++) {
        const lineup = buildRaidLineup(PORTRAITS, mulberry32(seed));
        const entry = lineup.find((e) => e.portrait.id === portrait.id);
        if (!entry) continue;
        expect(
          entry.role,
          `seed ${seed}: ${name} got ${entry.role}, expected only ${only}`,
        ).toBe(only);
      }
    },
  );
});
