import { META } from '../data';

export default function Header() {
  return (
    <header className='header'>
      <div className='header__game'>{META.game}</div>
      <h1 className='header__title'>{META.title}</h1>
      <div className='header__subtitle'>{META.subtitle}</div>
      <div className='header__divider'><span>◆</span></div>
      <div className='header__tagline'>{META.tagline}</div>
    </header>
  );
}
