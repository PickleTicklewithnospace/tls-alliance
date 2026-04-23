import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ROLE_LABEL } from '../data';

// A single alliance slot. Default state shows "???" (face-down). When the
// slot's pick is made the card flips to reveal a panel with the picked
// person's headshot (cropped to the top of their portrait) and name.
//
// `role` is the slot's fixed role from ROLE_TEMPLATE - used both as the
// label on the "???" placeholder and (later) as the role assigned to the
// picked person when the lineup-builder is upgraded.
//
// `revealed` is either null (slot not yet picked) or a portrait record:
//   { name, file, src }
export default function MemberRow({ index, role, revealed }) {
  // `flipped` controls whether the revealed face is showing. We flip TO
  // the revealed face when a pick arrives, and back to "???" on reset.
  const [flipped, setFlipped] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setFlipped(Boolean(revealed));
  }, [revealed]);

  // Close expanded view on Escape.
  useEffect(() => {
    if (!expanded) return;
    function onKey(e) {
      if (e.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  function handleCardClick() {
    if (revealed) setExpanded(true);
  }

  return (
    <>
      <div
        className={`flip-card ${flipped ? 'is-flipped' : ''} ${expanded ? 'is-expanded' : ''}`}
        onClick={handleCardClick}
        aria-label={
          revealed ? `Slot ${index}: ${revealed.name}` : `Slot ${index}: hidden`
        }
      >
        <div className='flip-card__inner'>
          {/* FRONT - hidden placeholder ("???"), shown by default. Reuses
              the old "back" aesthetic: centered, gold border, gold label. */}
          <div className='flip-card__face flip-card__face--front member-row member-row--hidden'>
            <div className='flip-card__back-content'>
              <div className={`flip-card__back-label back-label--${role}`}>
                {ROLE_LABEL[role] || `Slot ${index}`}
              </div>
              <div className='flip-card__back-name'>???</div>
            </div>
          </div>

          {/* BACK - revealed panel, shown after the pick lands */}
          <div className='flip-card__face flip-card__face--back member-row member-row--revealed'>
            {revealed && (
              <>
                <div className='headshot'>
                  <img
                    className='headshot__img'
                    src={revealed.src}
                    alt={revealed.name}
                    draggable={false}
                  />
                </div>
                <div className='info'>
                  <div className='name'>{revealed.name}</div>
                  {role && (
                    <div className={`role-tag role-tag--${role}`}>
                      {ROLE_LABEL[role]}
                    </div>
                  )}
                </div>
                {role && (
                  <img
                    className={`role-icon role-icon--${role}`}
                    src={`${import.meta.env.BASE_URL}roles/${role}.png`}
                    alt={ROLE_LABEL[role] || role}
                    draggable={false}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {expanded && revealed && createPortal(
        <div
          className='portrait-lightbox'
          role='dialog'
          aria-label={`Expanded portrait: ${revealed.name}`}
          onClick={() => setExpanded(false)}
        >
          <div
            className='portrait-lightbox__card'
            onClick={(e) => e.stopPropagation()}
          >
            <img
              className='portrait-lightbox__img'
              src={revealed.src}
              alt={revealed.name}
              draggable={false}
            />
            <div className='portrait-lightbox__info'>
              <div className='portrait-lightbox__name'>{revealed.name}</div>
              {role && (
                <div className={`role-tag role-tag--${role}`}>
                  {ROLE_LABEL[role]}
                </div>
              )}
            </div>
            <button
              className='portrait-lightbox__close'
              onClick={() => setExpanded(false)}
              aria-label='Close'
            >
              ×
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
