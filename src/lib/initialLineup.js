import { INITIAL_LINEUP_NAMES, ROLE_TEMPLATE, SLOTS_PER_ALLIANCE } from '../data';
import { findPortraitByName } from './portraits';

// Build the slot-indexed `selected` array used by App from the hardcoded
// roster of names. Each entry mirrors what RandomPersonSelector.recordSelection
// would produce for a real pick: { ...person, role, slot }. Names that don't
// resolve to a known portrait are skipped (slot stays empty / "???").
export function buildInitialSelected() {
  return INITIAL_LINEUP_NAMES.map((name, slot) => {
    const person = findPortraitByName(name);
    if (!person) {
      // eslint-disable-next-line no-console
      console.warn(`[initialLineup] No portrait found for "${name}" (slot ${slot})`);
      return undefined;
    }
    const role = ROLE_TEMPLATE[slot % SLOTS_PER_ALLIANCE];
    return { ...person, role, slot };
  });
}
