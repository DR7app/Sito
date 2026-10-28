import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getHomeCopy, type HomeCopy } from '../../utils/siteCopy';
import { useTranslation } from '../../hooks/useTranslation';
import { useBooking } from '../../hooks/useBooking';
import { useAuth } from '../../hooks/useAuth';
import MediaVideo from '../../components/editorial/MediaVideo';
import { APP_EQUIVALENTS } from './appEnv';
import { useAppFleet, AppVehicleCard } from './appFleet';
import { useMyBookings, bookingStart, fmtDay, fmtTime, untilLabel } from './appTrips';

/** Date rapide passate al wizard del sito (stesso formato di Flotta). */
const QUICK = [
  { it: 'Oggi', en: 'Today', start: 0, days: 1 },
  { it: 'Domani', en: 'Tomorrow', start: 1, days: 1 },
  { it: 'Weekend', en: 'Weekend', start: -1, days: 2 },
  { it: '3 giorni', en: '3 days', start: 0, days: 3 },
  { it: 'Settimana', en: 'Week', start: 0, days: 7 },
];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function rangeFor(i: number) {
  const q = QUICK[i];
  const s = new Date(); s.setHours(0, 0, 0, 0);
  if (q.start === -1) { const add = (6 - s.getDay() + 7) % 7 || 7; s.setDate(s.getDate() + add); } else s.setDate(s.getDate() + q.start);
  const e = new Date(s); e.setDate(e.getDate() + q.days);
  return { s, e };
}

const AppHome: React.FC = () => {
  const { t, lang } = useTranslation();
  const L = lang === 'it' ? 'it' : 'en';
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setInitialSearchDates } = useBooking();
  const [copy, setCopy] = useState<HomeCopy | null>(null);
  const [quick, setQuick] = useState(0);
  const { all, loading } = useAppFleet();
  const { next } = useMyBookings();

  useEffect(() => { let c = false; getHomeCopy().then((x) => { if (!c) setCopy(x); }); return () => { c = true; }; }, []);

  const { s, e } = useMemo(() => rangeFor(quick), [quick]);
  const chooseDates = () => {
    setInitialSearchDates({ pickupDate: ymd(s), pickupTime: '10:00', returnDate: ymd(e), returnTime: '10:00', pickupLocation: 'dr7_cagliari', returnLocation: 'dr7_cagliari' });
    navigate('/app/terra');
  };

  if (!copy) return <div className="min-h-screen bg-black" aria-busy="true" />;
  const tx = (it: string, en: string) => (L === 'it' ? it : en);
  const slide = copy.hero_slides[0];
  const headline = tx(copy.hero_headline_it, copy.hero_headline_en).split('\n');
  const statement = L === 'it' ? copy.statement_lines_it : copy.statement_lines_en;
  const brandLines = L === 'it' ? copy.brand_lines_it : copy.brand_lines_en;
  const appTo = (to: string) => APP_EQUIVALENTS[to] || to;

  return (
    <>
      {/* Atto 01 — Arrivo: lo stesso filmato e la stessa frase della home del sito */}
      <section className="app-hero surface-dark">
        {slide && (
          <div className="scene">
            <MediaVideo src={slide.video_src} mobileSrc={slide.mobile_src} poster={slide.poster_src} className="h-full w-full" loading="eager" active />
          </div>
        )}
        <div className="veil" />
        <div className="in app-gutter">
          <span className="t-eyebrow block">{tx(copy.hero_kicker_it, copy.hero_kicker_en)}</span>
          <h1 className="t-display-xl mt-6">{headline.map((l, i) => <span key={i} className="block">{l}</span>)}</h1>
          <p className="t-body-xl mt-6 max-w-md" style={{ color: 'var(--c-ivory)', opacity: 0.78 }}>{tx(copy.hero_microcopy_it, copy.hero_microcopy_en)}</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link to="/app/terra" className="btn btn-primary">{tx(copy.hero_cta_label_it, copy.hero_cta_label_en)}</Link>
            <a href="#esperienze" className="btn btn-text">{tx(copy.hero_cta2_label_it, copy.hero_cta2_label_en)}</a>
          </div>
        </div>
      </section>

      <div className="app-gutter">
        {/* Il prossimo noleggio del cliente: dati veri dalla tabella bookings */}
        {user && next && (
          <Link to="/app/viaggi" className="app-panel mt-8 block p-5">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <span className="t-eyebrow block">{t({ it: 'Il tuo prossimo noleggio', en: 'Your next rental' })}</span>
                <p className="t-h3 mt-4 truncate">{next.vehicle_name || next.service_name || 'DR7'}</p>
                <p className="t-small mt-1" style={{ color: 'var(--fg-dim)' }}>
                  {fmtDay(bookingStart(next), L)} · {fmtTime(bookingStart(next))}{next.pickup_location ? ` · ${next.pickup_location}` : ''}
                </p>
              </div>
              <span className="app-pill solid shrink-0">{untilLabel(next, L)}</span>
            </div>
          </Link>
        )}

        {/* Prenotazione in tre tocchi: le date vanno nel wizard del sito */}
        <div className="mt-4 border p-5" style={{ borderColor: 'var(--line)' }}>
          <span className="t-eyebrow block">{t({ it: 'Prenota in tre tocchi', en: 'Book in three taps' })}</span>
          <h2 className="t-h2 mt-3">{t({ it: 'Quando ti serve?', en: 'When do you need it?' })}</h2>
          <div className="app-chips mt-5">
            {QUICK.map((q, i) => (
              <button key={q.it} className={`app-chip ${i === quick ? 'active' : ''}`} onClick={() => setQuick(i)}>{L === 'it' ? q.it : q.en}</button>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-4">
            <span className="t-meta" style={{ color: 'var(--fg-dim)' }}>{fmtDay(s, L)} → {fmtDay(e, L)}</span>
            <button className="btn btn-secondary btn-sm" onClick={chooseDates}>{t({ it: 'Vedi le auto', en: 'See the cars' })}</button>
          </div>
        </div>
      </div>

      {/* Atto 02 — Silenzio, sul marmo come sul sito */}
      <section className="marmo mt-16 py-20">
        <div className="app-gutter">
          <h2 className="t-display">{statement.map((l, i) => <span key={i} className="block">{l}</span>)}</h2>
          <div className="mt-10 flex items-center gap-6">
            <span className="seam-line max-w-[6rem] flex-1" />
            <span className="t-eyebrow">{tx(copy.statement_note_it, copy.statement_note_en)}</span>
          </div>
        </div>
      </section>

      {/* Atto 03 — La Collezione: veicoli veri, locandine intere */}
      <section className="app-gutter pt-16">
        <span className="t-eyebrow block">{tx(copy.collection_eyebrow_it, copy.collection_eyebrow_en)}</span>
        <h2 className="t-display mt-5">{tx(copy.collection_title_it, copy.collection_title_en)}</h2>
        <p className="t-body mt-4" style={{ color: 'var(--fg-dim)' }}>{tx(copy.collection_intro_it, copy.collection_intro_en)}</p>
        {copy.collection_image && <div className="app-frame mt-8"><img src={copy.collection_image} alt="" className="block h-auto w-full" loading="lazy" /></div>}
        <div className="app-rail mt-8">
          {loading && !all.length ? <p className="t-small" style={{ color: 'var(--fg-dim)' }}>…</p> :
            all.slice(0, 8).map(({ v, cat }) => <AppVehicleCard key={v.id} item={v} catId={cat} showBook={false} />)}
        </div>
        <Link to="/app/terra" className="btn btn-secondary mt-8 w-full">{tx(copy.collection_cta_label_it, copy.collection_cta_label_en)}</Link>
      </section>

      {/* Atto 04 — Esperienza: le stesse quattro del sito, aperte dentro l'app */}
      {copy.experiences.length > 0 && (
        <section id="esperienze" className="app-gutter scroll-mt-20 pt-20">
          <span className="t-eyebrow block">{tx(copy.experiences_eyebrow_it, copy.experiences_eyebrow_en)}</span>
          <h2 className="t-display mt-5">{tx(copy.experiences_title_it, copy.experiences_title_en)}</h2>
          <div className="mt-10 flex flex-col gap-14">
            {copy.experiences.map((x) => (
              <Link key={x.id} to={appTo(x.to)} className="block">
                <div className="app-frame overflow-hidden">
                  {x.video_src
                    ? <MediaVideo src={x.video_src} poster={x.image_src} className="aspect-[16/9] w-full" />
                    : <img src={x.image_src} alt="" loading="lazy" className="block h-auto w-full" />}
                </div>
                <h3 className="t-h2 mt-6">{tx(x.title_it, x.title_en)}</h3>
                <p className="t-body mt-2" style={{ color: 'var(--fg-dim)' }}>{tx(x.copy_it, x.copy_en)}</p>
                <span className="t-nav link-reveal mt-5 inline-block">{tx(x.cta_it, x.cta_en)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Atto 05 — Marca, superficie chiara */}
      <section className="surface-light mt-20 py-16">
        <div className="app-gutter">
          <h2 className="t-display">{brandLines.map((l, i) => <span key={i} className="block">{l}</span>)}</h2>
          {copy.brand_paragraphs.slice(0, 1).map((p, i) => (
            <p key={i} className="t-body mt-6" style={{ color: 'var(--fg-dim)' }}>{tx(p.text_it, p.text_en)}</p>
          ))}
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Link to="/app/club" className="btn btn-primary">DR7 Club</Link>
            <Link to="/app/wallet" className="btn btn-secondary">Credit Wallet</Link>
          </div>
        </div>
      </section>

      {/* Atto 06 — Accesso */}
      <section className="relative overflow-hidden py-24 surface-dark">
        <div className="absolute inset-0"><MediaVideo src={copy.access_video_src} poster={copy.access_media_src} className="h-full w-full" /></div>
        <div className="pointer-events-none absolute inset-0 media-veil" />
        <div className="app-gutter relative z-[2]">
          <h2 className="t-display-xl whitespace-pre-line">{tx(copy.access_title_it, copy.access_title_en)}</h2>
          <p className="t-body-xl mt-6" style={{ color: 'var(--c-ivory)', opacity: 0.78 }}>{tx(copy.access_copy_it, copy.access_copy_en)}</p>
          <Link to="/app/terra" className="btn btn-primary mt-8">{tx(copy.access_cta_label_it, copy.access_cta_label_en)}</Link>
        </div>
      </section>
    </>
  );
};

export default AppHome;
