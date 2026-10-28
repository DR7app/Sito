import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { useMyBookings, bookingStart, bookingEnd, fmtDay, fmtTime, untilLabel, type AppBooking } from './appTrips';
import { formatEur } from './appFleet';

const STATUS: Record<string, { it: string; en: string }> = {
  confirmed: { it: 'Confermata', en: 'Confirmed' }, confermata: { it: 'Confermata', en: 'Confirmed' },
  pending: { it: 'In attesa', en: 'Pending' }, in_attesa: { it: 'In attesa', en: 'Pending' },
  active: { it: 'In corso', en: 'Active' }, in_corso: { it: 'In corso', en: 'Active' },
  completed: { it: 'Conclusa', en: 'Completed' }, completata: { it: 'Conclusa', en: 'Completed' },
  cancelled: { it: 'Annullata', en: 'Cancelled' }, annullata: { it: 'Annullata', en: 'Cancelled' },
};

const Row: React.FC<{ b: AppBooking; live?: boolean }> = ({ b, live }) => {
  const { lang } = useTranslation();
  const L = lang === 'it' ? 'it' : 'en';
  const s = bookingStart(b); const e = bookingEnd(b);
  const st = STATUS[(b.status || '').toLowerCase()];
  return (
    <Link to="/app/viaggi/gestisci" className="app-row">
      <span className="grow">
        <span className="block truncate">{b.vehicle_name || b.service_name || 'DR7'}</span>
        <span className="t-small block" style={{ color: 'var(--fg-dim)' }}>
          {fmtDay(s, L)}{e && e.getTime() !== s?.getTime() ? ` → ${fmtDay(e, L)}` : ''} · {fmtTime(s)}
          {typeof b.price_total === 'number' && b.price_total > 0 ? ` · ${formatEur(b.price_total / 100)}` : ''}
        </span>
        {b.vehicle_plate && <span className="t-meta mt-1 block" style={{ color: 'var(--c-metal)' }}>{b.vehicle_plate}</span>}
      </span>
      <span className={`app-pill ${live ? 'solid' : ''}`}>{live ? untilLabel(b, L) : st ? st[L] : (b.status || '')}</span>
    </Link>
  );
};

/** Viaggi: le prenotazioni vere del cliente; si gestiscono con la pagina del sito. */
const AppViaggi: React.FC = () => {
  const { t } = useTranslation();
  const { upcoming, past, loading } = useMyBookings();
  return (
    <div className="app-gutter pt-6">
      <span className="t-eyebrow block">{t({ it: 'Le mie prenotazioni', en: 'My bookings' })}</span>
      <h1 className="t-display mt-4">{t({ it: 'Viaggi', en: 'Trips' })}</h1>

      <span className="t-eyebrow mt-10 block">{t({ it: 'In arrivo', en: 'Upcoming' })}</span>
      {loading ? <p className="t-small mt-4" style={{ color: 'var(--fg-dim)' }}>…</p> :
        upcoming.length ? upcoming.map((b, i) => <Row key={b.id} b={b} live={i === 0} />) : (
          <div className="mt-4">
            <p className="t-small" style={{ color: 'var(--fg-dim)' }}>{t({ it: 'Nessuna prenotazione in arrivo.', en: 'No upcoming bookings.' })}</p>
            <Link to="/app/terra" className="btn btn-primary mt-6">{t({ it: 'Prenota', en: 'Book' })}</Link>
          </div>
        )}

      <div className="mt-8 grid grid-cols-2 gap-3">
        <Link to="/app/viaggi/gestisci" className="btn btn-secondary btn-sm">{t({ it: 'Modifica o annulla', en: 'Change or cancel' })}</Link>
        <Link to="/app/viaggi/prevendite" className="btn btn-secondary btn-sm">{t({ it: 'Le mie prevendite', en: 'My presales' })}</Link>
      </div>

      {past.length > 0 && (
        <>
          <span className="t-eyebrow mt-12 block">{t({ it: 'Passate', en: 'Past' })}</span>
          {past.slice(0, 20).map((b) => <Row key={b.id} b={b} />)}
        </>
      )}
    </div>
  );
};

export default AppViaggi;
