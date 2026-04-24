// List of portrait files (located in public/portraits/).
// Filenames use underscores in place of apostrophes.
// e.g. "Chi_s Keki.png" -> display name "Chi's Keki".

const PORTRAIT_FILES = [
  'Artemis Selene.png',
  'Azura Focushearth.png',
  'Chi_s Keki.png',
  'Cino Cinnamon.png',
  'Coo Kie.png',
  'Cortana Aiur.png',
  'Dango Silvers.png',
  'Estelle Inoue.png',
  'Godric Brandr.png',
  'Haru Beoulve.png',
  'Hestia Exaltia.png',
  'Hori Sheet.png',
  'Jmo H.png',
  'Liokki K_an.png',
  'Lue Xion.png',
  'Luna Noonuccal.png',
  'Miyuki Moon.png',
  'Mutezs Nagi.png',
  'Nanami Kazuya.png',
  'Nier Arcana.jpg',
  'Persius Vladymir.png',
  'Pickle Tickle.png',
  'Raiden Woltz.png',
  'Red Raven.png',
  'Renzy Kun.png',
  'Silchus Ruin.png',
  'Trapizi Rei.png',
  'Yeme Chevalcroix.png',
  'Yuuna Kawashima.png',
  'Zehka_a Amariyo.png',
];

// Convert a portrait filename into a person record.
// Underscores in the base name are converted back to apostrophes.
//
// We synthesize the fairness inputs (priority, roles) needed by pickGroup
// from a deterministic hash of the file name so each portrait always has
// the same role pool across page loads. Without real signup data this
// gives the picker a varied-but-stable population to draw from.
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// Real role signups, keyed by normalised display name (lowercase, only
// alphanumerics). Anyone NOT listed here defaults to DPS only.
// Source of truth: roles.txt at the repo root. Each portrait gets the
// union of every section (Tanks/Healers/DPS) they appear in.
const TANKS = [
  'harubeoulve', 'horisheet', 'pickletickle', 'dangosilvers', 'cookie',
  'jmoh', 'redraven', 'hestiaexaltia', 'liokkikan', 'chiskeki',
  'estelleinoue', 'artemisselene', 'nierarcana', 'zehkaaamariyo',
  'cortanaaiur', 'cinocinnamon',
];
const HEALERS = [
  'luexion', 'harubeoulve', 'pickletickle', 'dangosilvers', 'cookie',
  'jmoh', 'azurafocushearth', 'liokkikan', 'chiskeki', 'renzykun',
  'miyukimoon', 'yuunakawashima', 'artemisselene', 'nierarcana',
  'nanamikazuya', 'mutezsnagi', 'cortanaaiur', 'cinocinnamon',
];
const DPS = [
  'luexion', 'trapizirei', 'harubeoulve', 'pickletickle', 'yemechevalcroix',
  'dangosilvers', 'cookie', 'jmoh', 'redraven', 'hestiaexaltia',
  'azurafocushearth', 'liokkikan', 'chiskeki', 'persiusvladymir',
  'renzykun', 'miyukimoon', 'yuunakawashima', 'artemisselene', 'nierarcana',
  'zehkaaamariyo', 'nanamikazuya', 'cortanaaiur', 'lunanoonuccal',
  'cinocinnamon', 'silchusruin', 'raidenwoltz',
];

const ROLE_SIGNUPS = {};
function addRole(key, role) {
  if (!ROLE_SIGNUPS[key]) ROLE_SIGNUPS[key] = [];
  if (!ROLE_SIGNUPS[key].includes(role)) ROLE_SIGNUPS[key].push(role);
}
for (const k of TANKS)   addRole(k, 'tank');
for (const k of HEALERS) addRole(k, 'healer');
for (const k of DPS)     addRole(k, 'dps');

// Roles for a portrait based on the real signup list. Anyone unmatched is
// DPS only.
function rolesFor(file) {
  const base = file.replace(/\.[^.]+$/, '').replace(/_/g, "'");
  const key = base.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ROLE_SIGNUPS[key] ? [...ROLE_SIGNUPS[key]] : ['dps'];
}

// Priority is flattened to 0 for everyone: there is no real signup data
// behind these numbers, and a hashed priority just creates artificial
// "low priority" portraits (e.g. Godric) who never get picked. With all
// priorities equal, the within-tier weighted shuffle in pickGroup is the
// sole ordering signal, so role-count fairness applies across the whole
// pool. Kept as a function (not a constant) so future real signup data
// can plug in here without touching callers.
function priorityFor(_file) {
  return 0;
}

function fileToPerson(file) {
  const base = file.replace(/\.[^.]+$/, ''); // strip extension
  const name = base.replace(/_/g, "'");
  return {
    id: file,        // stable unique id used by pickGroup
    name,
    file,
    src: `${import.meta.env.BASE_URL}portraits/${encodeURIComponent(file)}`,
    priority: priorityFor(file),
    roles: rolesFor(file),
  };
}

// Portraits explicitly excluded from the random roll pool. Their image files
// remain in the repo (and may still be referenced elsewhere), but they will
// never be selected by pickGroup / the RandomPersonSelector.
const EXCLUDED_FROM_ROLL = new Set([
  'Persius Vladymir.png',
  'Red Raven.png',
]);

export const PORTRAITS = PORTRAIT_FILES
  .filter((file) => !EXCLUDED_FROM_ROLL.has(file))
  .map(fileToPerson);

// Look up a portrait by display name (apostrophes optional / ignored, case
// insensitive, non-alphanumerics ignored). Returns the person record produced
// by fileToPerson, or null if no match. Used to seed the initial hardcoded
// alliance lineup from a list of names.
export function findPortraitByName(name) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(name);
  for (const file of PORTRAIT_FILES) {
    const base = file.replace(/\.[^.]+$/, '').replace(/_/g, "'");
    if (norm(base) === target) return fileToPerson(file);
  }
  return null;
}
