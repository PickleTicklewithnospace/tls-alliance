import { META } from '../data';

function Item({ icon, label, value, sub }) {
  return (
    <div className='footer__item'>
      <div className='footer__label'>
        <span className='footer__icon'>{icon}</span> {label}
      </div>
      <div className='footer__value'>{value}</div>
      {sub && <div className='footer__sub'>{sub}</div>}
    </div>
  );
}

export default function Footer() {
  return (
    <footer className='footer'>
      <Item icon='◆' label='Content'
        value={META.content.label} sub={META.content.sub} />
      <Item icon='📅' label='Date'
        value={META.date.label} sub={META.date.sub} />
      <div className='footer__emblem' aria-hidden='true'>🛡</div>
      <Item icon='' label='FC'
        value={META.fc.label} sub={META.fc.sub} />
      <Item icon='⚔' label='Mission'
        value={META.mission.label} sub={META.mission.sub} />
      <Item icon='🐤' label='' value={META.motto} />
    </footer>
  );
}
