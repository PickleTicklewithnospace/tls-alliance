// Alliance definitions. Members are no longer hardcoded - the alliance roster
// is filled in dynamically as the RandomPersonSelector picks portraits.
// Each alliance has SLOTS_PER_ALLIANCE empty slots that start as "???"
// and reveal a name when the corresponding pick is made.

export const SLOTS_PER_ALLIANCE = 8;

// Fixed role layout per alliance: 1 Tank, 2 Healers, 5 DPS.
// Index = slot position within the alliance (0..7).
export const ROLE_TEMPLATE = [
  'tank',
  'healer',
  'healer',
  'dps',
  'dps',
  'dps',
  'dps',
  'dps',
];

export const ROLE_LABEL = {
  tank: 'Tank',
  healer: 'Healer',
  dps: 'DPS',
};

export const ALLIANCES = [
  { key: 'A', name: 'Alliance A', color: 'blue' },
  { key: 'B', name: 'Alliance B', color: 'green' },
  { key: 'C', name: 'Alliance C', color: 'purple' },
];

export const TOTAL_SLOTS = ALLIANCES.length * SLOTS_PER_ALLIANCE;

export const META = {
  title: 'The Last Stand',
  game: 'Final Fantasy XIV',
  subtitle: 'Alliance Raid',
  tagline: 'One purpose. Twenty-four hearts. One victory.',
  content: { label: 'Echoes of Vana\u2019Diel', sub: 'The Third Walk' },
  date: { label: 'April 29, 2026', sub: '8:00 PM GMT+10' },
  fc: { label: 'The Last Stand', sub: '<<TLS>>' },
  mission: { label: 'Blind Run', sub: 'No spoilers. Just vibes.' },
  motto: 'For the Fish!',
}
