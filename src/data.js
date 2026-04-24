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

// Hardcoded initial alliance lineup. The roll has already been done IRL;
// these names are the locked-in result and are shown as the revealed state
// on first load. Order is by SLOT (A0..A7, B0..B7, C0..C7) and matches
// ROLE_TEMPLATE (tank, healer, healer, dps×5) within each alliance.
export const INITIAL_LINEUP_NAMES = [
  // Alliance A
  'Coo Kie',         // tank
  'Lue Xion',        // healer
  'Renzy Kun',       // healer
  "Chi's Keki",      // dps
  'Raiden Woltz',    // dps
  'Yeme Chevalcroix',// dps
  'Dango Silvers',   // dps
  'Trapizi Rei',     // dps
  // Alliance B
  'Cortana Aiur',       // tank
  'Mutezs Nagi',        // healer
  'Azura Focushearth',  // healer
  'Jmo H',              // dps
  'Luna Noonuccal',     // dps
  "Liokki K'an",        // dps
  'Hori Sheet',         // dps
  'Nier Arcana',        // dps
  // Alliance C
  "Zehka'a Amariyo",  // tank
  'Pickle Tickle',    // healer
  'Haru Beoulve',     // healer
  'Hestia Exaltia',   // dps
  'Artemis Selene',   // dps
  'Silchus Ruin',     // dps
  'Yuuna Kawashima',  // dps
  'Miyuki Moon',      // dps
];

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
