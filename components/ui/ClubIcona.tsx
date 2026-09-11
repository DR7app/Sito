import React from 'react';
import type { MembershipBenefitIcon } from '../../utils/siteCopy';

/**
 * Le icone della fascia vantaggi del Club.
 *
 * Di filo sottile e color oro, come quelle della pagina Business: sopra a una
 * riga di testo in maiuscoletto un simbolo pieno peserebbe piu' della parola
 * che accompagna. Nessuna scatola, nessun fondo: il segno e basta.
 */
const TRATTO = 'h-7 w-7 text-dr7-gold';

const ClubIcona: React.FC<{ icon: MembershipBenefitIcon }> = ({ icon }) => {
  const p = { className: TRATTO, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, viewBox: '0 0 24 24', 'aria-hidden': true } as const;

  if (icon === 'diamond') return (
    <svg {...p}><path d="M6 4h12l3 5-9 11L3 9l3-5z" /><path d="M3 9h18M9 4l3 16 3-16" /></svg>
  );
  if (icon === 'crown') return (
    <svg {...p}><path d="M4 17h16M4 17L3 8l5 3 4-6 4 6 5-3-1 9" /></svg>
  );
  if (icon === 'coins') return (
    <svg {...p}><ellipse cx="12" cy="6.5" rx="7" ry="2.8" /><path d="M5 6.5v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-4" /><path d="M5 10.5v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-4" /></svg>
  );
  if (icon === 'star') return (
    <svg {...p}><path d="M12 3.5l2.6 5.6 6 .7-4.5 4.2 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.8l6-.7L12 3.5z" /></svg>
  );
  if (icon === 'concierge') return (
    <svg {...p}><circle cx="12" cy="8" r="3.4" /><path d="M4.5 20c.6-3.8 3.7-6 7.5-6s6.9 2.2 7.5 6" /></svg>
  );
  return (
    <svg {...p}><rect x="3" y="9" width="18" height="11" /><path d="M3 9h18M12 9v11" /><path d="M12 9C9.8 9 8 7.9 8 6.4 8 5.1 9 4 10.3 4 11.6 4 12 6 12 9zM12 9c2.2 0 4-1.1 4-2.6C16 5.1 15 4 13.7 4 12.4 4 12 6 12 9z" /></svg>
  );
};

export default ClubIcona;
