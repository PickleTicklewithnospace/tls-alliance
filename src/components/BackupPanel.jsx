// BackupPanel
// -----------
// Fixed-position panel that displays a small set of "backup" raid members.
// Backups are picked AFTER the 24 main alliance slots are filled. They
// live outside the 3 alliance grid cards and are rendered in two corner
// panels (bottom-left and bottom-right) to keep them visually distinct
// from the main roster while still feeling like part of the poster.
//
// Each backup slot is identified globally by its `backupIndex` (0..N-1).
// The lineup encodes a backup's index in its negative `slot` field as
// `slot = -1 - backupIndex` so the parent (App) can route the pick to
// the correct backup slot via the same fly-animation flow used for the
// main raid.
//
// Props:
//   side          'left' | 'right'  Which corner the panel renders in.
//   startIndex    Number   The first backupIndex this panel owns.
//   count         Number   How many backup slots this panel owns.
//   backups       Array    Indexed by backupIndex; each entry is either
//                          a picked person object (with `name` and `src`)
//                          or undefined for unfilled slots.

export default function BackupPanel({ side, startIndex, count, backups = [] }) {
  return (
    <aside
      className={`backup-panel backup-panel--${side}`}
      aria-label={`Backup members (${side})`}
    >
      <div className='backup-panel__title'>
        <span className='backup-panel__title-orn' aria-hidden='true'>◆</span>
        <span>Backups</span>
        <span className='backup-panel__title-orn' aria-hidden='true'>◆</span>
      </div>
      <ul className='backup-panel__list'>
        {Array.from({ length: count }, (_, i) => {
          const backupIndex = startIndex + i;
          const person = backups[backupIndex] || null;
          // Each slot exposes its backupIndex via a data attribute so the
          // parent's fly animation can locate the correct destination
          // element by querying [data-backup-index="N"].
          return (
            <li
              key={backupIndex}
              className={
                'backup-slot' +
                (person ? ' backup-slot--revealed' : ' backup-slot--hidden')
              }
              data-backup-index={backupIndex}
            >
              <div className='backup-slot__frame'>
                {person ? (
                  <img
                    className='backup-slot__img'
                    src={person.src}
                    alt={person.name}
                    draggable={false}
                  />
                ) : (
                  <span className='backup-slot__placeholder' aria-hidden='true'>?</span>
                )}
              </div>
              <div className='backup-slot__name'>
                {person ? person.name : '???'}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
