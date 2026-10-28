import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { useFilmato } from '../../hooks/useFilmato';
import { useBooking } from '../../hooks/useBooking';
import MediaVideo from '../../components/editorial/MediaVideo';
import { useAppFleet, AppVehicleCard } from './appFleet';

/** Terra: la pagina Flotta del sito, in versione app. */
const AppTerra: React.FC = () => {
  const { t } = useTranslation();
  const filmato = useFilmato('terra');
  const { groups, loading, error } = useAppFleet();
  const { initialSearchDates } = useBooking();
  const [cat, setCat] = useState<string | null>(null);

  useEffect(() => { if (!cat && groups.length) setCat(groups[0].id); }, [groups, cat]);
  const current = groups.find((g) => g.id === cat) ?? groups[0];

  return (
    <>
      <section className="relative -mt-[var(--app-top)] flex h-[19rem] items-end overflow-hidden surface-dark">
        {filmato.src && <div className="absolute inset-0 opacity-70"><MediaVideo src={filmato.src} poster={filmato.poster} className="h-full w-full" loading="eager" active /></div>}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(0,0,0,.5),rgba(0,0,0,.15) 40%,#000)' }} />
        <div className="app-gutter relative z-[2] w-full pb-6 text-center">
          <h1 className="t-display">{t({ it: "Oltre l'ordinario.", en: 'Beyond the ordinary.' })}</h1>
          <span className="mx-auto mt-6 block h-px w-16 bg-white/25" />
        </div>
      </section>

      <div className="app-gutter">
        <p className="t-body mt-5 text-center" style={{ color: 'var(--fg-dim)' }}>
          {t({ it: "Non è semplicemente una scelta. È l'accesso a qualcosa che non trovi altrove.", en: "It isn't simply a choice. It's access to something you won't find elsewhere." })}
        </p>
        <div className="mt-6 text-center">
          <Link to="/app/prevendite" className="t-nav inline-flex items-center gap-3" style={{ color: '#e5322d', letterSpacing: '0.2em' }}>
            {t({ it: 'PREVENDITA E PROMOZIONI', en: 'PRESALES & PROMOTIONS' })} →
          </Link>
        </div>

        {initialSearchDates && (
          <p className="t-meta mt-6 text-center" style={{ color: 'var(--c-metal)' }}>
            {initialSearchDates.pickupDate.split('-').reverse().join('/')} → {initialSearchDates.returnDate.split('-').reverse().join('/')}
          </p>
        )}

        {groups.length > 1 && (
          <div className="mt-8 flex gap-6 overflow-x-auto border-b" style={{ borderColor: 'var(--line)', scrollbarWidth: 'none' }}>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setCat(g.id)}
                className="t-nav -mb-px shrink-0 border-b pb-3.5"
                style={{ borderColor: g.id === current?.id ? 'var(--c-ivory)' : 'transparent', color: g.id === current?.id ? 'var(--c-ivory)' : 'var(--fg-dim)' }}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-8">
          {loading && !groups.length ? (
            <p className="t-small text-center" style={{ color: 'var(--fg-dim)' }}>…</p>
          ) : error ? (
            <p className="t-small text-center" style={{ color: 'var(--fg-dim)' }}>{t({ it: 'Flotta momentaneamente non disponibile. Riprova tra poco.', en: 'Fleet temporarily unavailable. Please try again shortly.' })}</p>
          ) : !current ? (
            <p className="t-small text-center" style={{ color: 'var(--fg-dim)' }}>{t({ it: 'Nessun veicolo disponibile al momento.', en: 'No vehicles available right now.' })}</p>
          ) : (
            <div className="app-grid">
              {current.vehicles.map((v) => <AppVehicleCard key={v.id} item={v} catId={current.id} />)}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AppTerra;
