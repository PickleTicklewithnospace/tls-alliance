import MemberRow from './MemberRow';
import { SLOTS_PER_ALLIANCE, ROLE_TEMPLATE } from '../data';

export default function AllianceCard({ alliance, startSlot, selected }) {
  return (
    <section className={`card card--${alliance.color}`}>
      <div className='card__header'>
        <span className='card__crystal' aria-hidden='true'>✦</span>
        <h2>{alliance.name}</h2>
      </div>
      <div className='members'>
        {Array.from({ length: SLOTS_PER_ALLIANCE }, (_, i) => {
          const slotIdx = startSlot + i;
          const revealed = selected[slotIdx] || null;
          // Slot's nominal role comes from the template; once revealed,
          // prefer the role pickGroup actually assigned (defensive: they
          // are guaranteed to match by construction in buildRaidLineup).
          const role = (revealed && revealed.role) || ROLE_TEMPLATE[i];
          return (
            <MemberRow
              key={i}
              index={i + 1}
              role={role}
              revealed={revealed}
              color={alliance.color}
            />
          );
        })}
      </div>
    </section>
  );
}
