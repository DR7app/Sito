import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useVehicles } from '../../hooks/useVehicles';
import { useFlottaCategories } from '../../hooks/useFlottaCategories';
import { useTranslation } from '../../hooks/useTranslation';
import { useBooking } from '../../hooks/useBooking';
import { categoryAliases } from '../../utils/flottaConfig';
import type { RentalItem } from '../../types';

/**
 * La flotta dell'app e' la flotta del sito: stessi veicoli (tabella
 * `vehicles`, aggiornata in tempo reale), stesse categorie visibili e stessi
 * prezzi di Centralina Pro. Un'auto tolta o un prezzo cambiato nel gestionale
 * cambiano qui nello stesso momento.
 */
export function useAppFleet() {
  const { categories, loading: catsLoading, status } = useFlottaCategories();
  const { vehicles, loading: vehLoading } = useVehicles(undefined);

  const groups = useMemo(() => {
    const out: Array<{ id: string; label: string; vehicles: RentalItem[] }> = [];
    for (const cat of categories) {
      const aliases = new Set(categoryAliases(cat.id).map((a) => a.toLowerCase()));
      const list = vehicles.filter((v) => aliases.has((v.category || '').toLowerCase())) as unknown as RentalItem[];
      if (list.length) out.push({ id: cat.id, label: cat.label, vehicles: list });
    }
    return out;
  }, [categories, vehicles]);

  const all = useMemo(() => groups.flatMap((g) => g.vehicles.map((v) => ({ v, cat: g.id, label: g.label }))), [groups]);

  return { groups, all, loading: catsLoading || vehLoading, error: status === 'error' };
}

/** Il contesto che il wizard del sito si aspetta per ogni categoria. */
export const wizardContextFor = (catId: string) => (catId === 'urban' || catId === 'urban-cars' ? 'urban-cars' : 'cars');

/** Id per l'indirizzo dell'app (/app/auto/:id). */
export const vehicleSlug = (v: RentalItem) => encodeURIComponent(v.id);

export const formatEur = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);

/** Prezzo come sul sito: "Da € X /giorno", oppure niente se il gestionale non ne ha. */
export const PriceFrom: React.FC<{ item: RentalItem; size?: 'sm' | 'lg' }> = ({ item, size = 'sm' }) => {
  const { t } = useTranslation();
  const p = item.pricePerDay?.eur;
  if (!p) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="t-eyebrow">{t({ it: 'Da', en: 'From' })}</span>
      <span className="font-serif" style={{ fontSize: size === 'lg' ? '1.875rem' : '1.375rem', lineHeight: 1.1 }}>{formatEur(p)}</span>
      <span className="t-eyebrow">/{t('per_day')}</span>
    </div>
  );
};

/** Scheda auto compatta: la locandina intera (regola del sito: mai ritagliata). */
export const AppVehicleCard: React.FC<{ item: RentalItem; catId: string; showBook?: boolean }> = ({ item, catId, showBook = true }) => {
  const { t } = useTranslation();
  const { openCarWizard } = useBooking();
  const disabled = (item as { bookingDisabled?: boolean }).bookingDisabled;
  return (
    <div className="flex min-w-0 flex-col">
      <Link to={`/app/auto/${vehicleSlug(item)}`} className="app-frame block" aria-label={item.name}>
        <img src={item.image} alt="" loading="lazy" decoding="async" className="block h-auto w-full" />
      </Link>
      <span className="sr-only">{item.name}</span>
      <span className="t-meta mt-3 truncate" style={{ color: 'var(--fg-dim)' }} title={item.name}>{item.name}</span>
      <span className="t-eyebrow mt-2">{t({ it: 'Assicurazione inclusa', en: 'Insurance included' })}</span>
      <span className="seam-line mt-3" />
      <div className="mt-3"><PriceFrom item={item} /></div>
      {showBook && !disabled && (
        <button className="btn btn-secondary btn-sm mt-4 w-full" onClick={() => openCarWizard(item, wizardContextFor(catId))}>
          {t({ it: 'Prenota', en: 'Book' })}
        </button>
      )}
    </div>
  );
};
