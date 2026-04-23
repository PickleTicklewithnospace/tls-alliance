// Unit tests for pickGroup.
//
// pickGroup is the fairness core: it must respect priority order, fill
// roles exactly as requested, leave no slot mis-roled, and behave
// deterministically when given a deterministic RNG.

import { describe, it, expect } from 'vitest';
import { pickGroup, DEFAULT_SLOTS } from './pickGroup';

// Tiny seeded RNG so tests don't depend on Math.random. Deterministic
// across machines/Node versions.
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

// Helper: build N signups with the given role pool and a constant priority.
function makeSignups(n, roles, priority = 0, prefix = 's') {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `${prefix}${i}`, priority, roles: [...roles] });
  }
  return out;
}

describe('pickGroup - happy path', () => {
  it('fills 3/6/15 from a sufficient triple-role pool', () => {
    const signups = makeSignups(30, ['tank', 'healer', 'dps']);
    const result = pickGroup(signups, DEFAULT_SLOTS, mulberry32(42));

    expect(result.ok).toBe(true);
    expect(result.unfilled).toEqual({ tank: 0, healer: 0, dps: 0 });
    expect(result.assignments).toHaveLength(24);

    const counts = { tank: 0, healer: 0, dps: 0 };
    for (const a of result.assignments) counts[a.role]++;
    expect(counts).toEqual({ tank: 3, healer: 6, dps: 15 });
  });

  it('reports unfilled when a role pool is short', () => {
    // Only 2 tanks available - cannot fill 3.
    const signups = [
      ...makeSignups(2, ['tank'], 5, 't'),
      ...makeSignups(20, ['healer', 'dps'], 5, 'hd'),
    ];
    const result = pickGroup(signups, DEFAULT_SLOTS, mulberry32(1));
    expect(result.ok).toBe(false);
    expect(result.unfilled.tank).toBe(1);
    // Assignments should still respect role limits.
    const tanks = result.assignments.filter((a) => a.role === 'tank');
    expect(tanks).toHaveLength(2);
  });

  it('skips signups whose role pool is exhausted', () => {
    // 3 tanks claim the 3 tank slots; remaining tank-only people are skipped.
    const signups = [
      ...makeSignups(5, ['tank'], 10, 't'), // 5 tank-only at high priority
      ...makeSignups(6, ['healer'], 5, 'h'),
      ...makeSignups(15, ['dps'], 5, 'd'),
    ];
    const result = pickGroup(signups, DEFAULT_SLOTS, mulberry32(7));
    expect(result.ok).toBe(true);
    // 5 tank candidates but only 3 slots - 2 are skipped.
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every((id) => String(id).startsWith('t'))).toBe(true);
  });
});

describe('pickGroup - priority ordering', () => {
  it('high-priority signups are picked before low-priority ones', () => {
    // 24 high-pri DPS + 10 low-pri DPS. Only high-pri should make the cut.
    const signups = [
      ...makeSignups(24, ['dps'], 10, 'high'),
      ...makeSignups(10, ['dps'], 1, 'low'),
    ];
    // Override slots to dps-only so we can isolate the ordering effect.
    const result = pickGroup(signups, { tank: 0, healer: 0, dps: 15 }, mulberry32(99));
    expect(result.ok).toBe(true);
    for (const a of result.assignments) {
      expect(String(a.id).startsWith('high')).toBe(true);
    }
  });

  it('ties are broken randomly within a priority tier', () => {
    // Two tiers, all DPS. With 1 dps slot and 5 tied high-pri candidates,
    // the chosen id must vary across different RNG seeds.
    const signups = makeSignups(5, ['dps'], 10, 'tied');
    const slots = { tank: 0, healer: 0, dps: 1 };
    const winners = new Set();
    for (let seed = 0; seed < 50; seed++) {
      const r = pickGroup(signups, slots, mulberry32(seed));
      winners.add(r.assignments[0].id);
    }
    // Across 50 seeds we should observe at least 2 different winners
    // (probabilistically all 5, but 2 is enough to prove the shuffle is
    // doing something).
    expect(winners.size).toBeGreaterThan(1);
  });
});

describe('pickGroup - determinism', () => {
  it('is fully deterministic given the same seed and inputs', () => {
    const signups = makeSignups(30, ['tank', 'healer', 'dps']);
    const a = pickGroup(signups, DEFAULT_SLOTS, mulberry32(123));
    const b = pickGroup(signups, DEFAULT_SLOTS, mulberry32(123));
    expect(a).toEqual(b);
  });
});

describe('pickGroup - input validation', () => {
  it('throws on non-integer slot counts', () => {
    expect(() => pickGroup([], { tank: 1.5 })).toThrow(TypeError);
    expect(() => pickGroup([], { tank: -1 })).toThrow(TypeError);
    expect(() => pickGroup([], { tank: 'three' })).toThrow(TypeError);
  });

  it('throws on duplicate ids', () => {
    const signups = [
      { id: 'x', priority: 1, roles: ['dps'] },
      { id: 'x', priority: 1, roles: ['dps'] },
    ];
    expect(() => pickGroup(signups)).toThrow(/duplicate signup id/);
  });

  it('throws on bad signup shapes', () => {
    expect(() => pickGroup([null])).toThrow(TypeError);
    expect(() => pickGroup([{ id: 'x', priority: 1, roles: 'dps' }])).toThrow(TypeError);
    expect(() => pickGroup([{ id: 'x', priority: NaN, roles: ['dps'] }])).toThrow(TypeError);
  });

  it('skips signups with no usable roles after normalization', () => {
    const signups = [
      { id: 'a', priority: 1, roles: ['nonsense'] },
      { id: 'b', priority: 1, roles: ['dps'] },
    ];
    const result = pickGroup(signups, { tank: 0, healer: 0, dps: 1 }, mulberry32(0));
    expect(result.skipped).toContain('a');
    expect(result.assignments.map((x) => x.id)).toEqual(['b']);
  });

  it('normalizes role casing and dedupes', () => {
    const signups = [
      { id: 'x', priority: 5, roles: ['DPS', 'dps', 'Healer'] },
    ];
    const result = pickGroup(signups, { tank: 0, healer: 1, dps: 1 }, mulberry32(0));
    // Should be picked exactly once into one of the two open roles.
    expect(result.assignments).toHaveLength(1);
    expect(['healer', 'dps']).toContain(result.assignments[0].role);
  });
});

describe('pickGroup - role assignment', () => {
  it('only assigns a role the person actually listed', () => {
    const signups = [
      { id: 't1', priority: 5, roles: ['tank'] },
      { id: 'h1', priority: 5, roles: ['healer'] },
      { id: 'd1', priority: 5, roles: ['dps'] },
      ...makeSignups(25, ['tank', 'healer', 'dps'], 1),
    ];
    const result = pickGroup(signups, DEFAULT_SLOTS, mulberry32(11));
    const byId = new Map(signups.map((s) => [s.id, s]));
    for (const a of result.assignments) {
      expect(byId.get(a.id).roles).toContain(a.role);
    }
  });

  it('never exceeds the requested slot count for any role', () => {
    const signups = makeSignups(40, ['tank', 'healer', 'dps']);
    const result = pickGroup(signups, DEFAULT_SLOTS, mulberry32(5));
    const counts = { tank: 0, healer: 0, dps: 0 };
    for (const a of result.assignments) counts[a.role]++;
    expect(counts.tank).toBeLessThanOrEqual(3);
    expect(counts.healer).toBeLessThanOrEqual(6);
    expect(counts.dps).toBeLessThanOrEqual(15);
  });
});
