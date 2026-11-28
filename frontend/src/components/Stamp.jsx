import { fmtDate } from '../utils';
import Check from './Check.jsx';

// The acknowledgement "receipt stamp". It presses down with an animation only when `animate` is true,
// i.e. when the status has just changed on screen, not on every page load.
export default function Stamp({ at, late, animate }) {
  return (
    <div className={`stamp ${late ? 'stamp-late' : ''} ${animate ? 'stamp-in' : ''}`} role="img"
      aria-label={late ? 'Acknowledged late' : 'Acknowledged'}>
      <Check animate={animate} className="h-6 w-6" delay={0.3} />
      <span className="text-[15px] leading-tight">{late ? 'Late' : 'Acknowledged'}</span>
      {late && <span className="text-xs">Acknowledged</span>}
      <span className="mt-1 max-w-[6rem] px-1 text-[10px] font-sans leading-tight">{fmtDate(at)}</span>
    </div>
  );
}
