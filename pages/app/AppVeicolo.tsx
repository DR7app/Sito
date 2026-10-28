import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { useBooking } from '../../hooks/useBooking';
import { CalendarioDisponibilitaPortale } from '../../components/ui/CalendarioDisponibilita';
import type { RentalItem } from '../../types';
import { useAppFleet, PriceFrom, wizardContextFor } from './appFleet';
import { tapFeedback } from './appPush';

/** Scheda auto: locandina intera, dati del gestionale, prenotazione vera. */
const AppVeicolo: React.FC = () => {
  const { id = '' } = useParams();
  const { t, lang } = useTranslation();
  const { openCarWizard } = useBooking();
  const { all, loading } = useAppFleet();
  const [calendario, setCalendario] = useState<RentalItem | null>(null);
  const found = all.find(({ v }) => v.id === decodeURIComponent(id));

  if (!found) {
    return (
      <div className="app-gutter pt-10 text-center">
        <p className="t-small" style={{ color: 'var(--fg-dim)' }}>
          {loading ? '…' : t({ it: 'Questo veicolo non è più disponibile.', en: 'This vehicle is no longer available.' })}
        </p>
        {!loading && <Link to="/app/terra" className="btn btn-secondary mt-8">{t({ it: 'Torna alla flotta', en: 'Back to the fleet' })}</Link>}
      </div>
    );
  }

  const { v, cat, label } = found;
  const disabled = (v as { bookingDisabled?: boolean }).bookingDisabled;
  const specs = (v.specs || []).filter((s) => s && s.value);
  const L = lang === 'it' ? 'it' : 'en';

  return (
    <div style={{ paddingBottom: '7rem' }}>
      <div className="app-gutter pt-4">
        <div className="app-frame mx-auto max-w-[22rem]">
          <img src={v.image} alt="" className="block h-auto w-full" />
        </div>
        <span className="sr-only">{v.name}</span>

        <span className="t-eyebrow mt-8 block">{label}</span>
        <h1 className="t-h2 mt-3">{v.name}</h1>
        <span className="seam-line mt-6 block" />

        <div className="mt-2">
          {specs.map((s, i) => (
            <div key={i} className="app-row" style={{ padding: '0.875rem 0' }}>
              <span className="grow t-small">{s.label?.[L] || s.label?.it}</span>
              <span className="t-meta" style={{ color: 'var(--fg-dim)' }}>{s.value}</span>
            </div>
          ))}
          <div className="app-row" style={{ padding: '0.875rem 0' }}>
            <span className="grow t-small">{t({ it: 'Assicurazione', en: 'Insurance' })}</span>
            <span className="t-meta" style={{ color: 'var(--fg-dim)' }}>{t({ it: 'Inclusa', en: 'Included' })}</span>
          </div>
          <div className="app-row" style={{ padding: '0.875rem 0' }}>
            <span className="grow t-small">{t({ it: 'Ritiro', en: 'Pick-up' })}</span>
            <span className="t-meta text-right" style={{ color: 'var(--fg-dim)' }}>DR7 Cagliari · Viale Marconi 229</span>
          </div>
          <div className="app-row" style={{ padding: '0.875rem 0' }}>
            <span className="grow t-small">{t({ it: 'Consegna a domicilio', en: 'Home delivery' })}</span>
            <span className="t-meta text-right" style={{ color: 'var(--fg-dim)' }}>{t({ it: "Calcolata sull'indirizzo", en: 'Priced by address' })}</span>
          </div>
        </div>

        {!disabled && (
          <button className="btn btn-text mt-8" onClick={() => setCalendario(v)}>
            {t({ it: 'Vedi disponibilità', en: 'See availability' })}
          </button>
        )}
      </div>

      {!disabled && (
        <div className="app-cta">
          <div className="min-w-0 flex-1"><PriceFrom item={v} size="lg" /></div>
          <button className="btn btn-primary flex-1" onClick={() => { tapFeedback('MEDIUM'); openCarWizard(v, wizardContextFor(cat)); }}>
            {t({ it: 'Prenota', en: 'Book' })}
          </button>
        </div>
      )}

      <CalendarioDisponibilitaPortale item={calendario} categoryContext={wizardContextFor(cat)} onClose={() => setCalendario(null)} />
    </div>
  );
};

export default AppVeicolo;
