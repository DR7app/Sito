/**
 * FlottaIndexPage — landing pubblica "La Nostra Flotta".
 *
 * Mostra TUTTI i veicoli delle categorie selezionate in admin >
 * Sito > Flotta, raggruppati per categoria. Riusiamo RentalCard
 * cosi' il design (aspect 9/16, hover, prezzo, bottone) e' lo
 * stesso della pagina /supercar-luxury.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFlottaCategories } from '../hooks/useFlottaCategories';
import { useVehicles } from '../hooks/useVehicles';
import { useTranslation } from '../hooks/useTranslation';
import { useBooking } from '../hooks/useBooking';
import RentalCard from '../components/ui/RentalCard';
import BookingSearchBox from '../components/ui/BookingSearchBox';
import { CalendarioDisponibilitaPortale } from '../components/ui/CalendarioDisponibilita';
import { getHeaderCopy, type HeaderCopy } from '../utils/siteCopy';
import type { RentalItem } from '../types';
// Alias storici categoria DB <-> id Centralina Pro: definiti una volta
// sola in flottaConfig, insieme alla regola di visibilita'.
import { categoryAliases } from '../utils/flottaConfig';

const FlottaIndexPage: React.FC = () => {
  const { lang } = useTranslation();
  const { openCarWizard, setInitialSearchDates } = useBooking();
  const { categories: flottaCats, loading: catsLoading, status: catsStatus } = useFlottaCategories();
  const { vehicles: allVehicles, loading: vehLoading } = useVehicles(undefined);

  // "Prenota Ora" anche qui, sotto l'invito a scegliere: e' la pagina dove il
  // cliente guarda i mezzi, ed era l'unica in cui doveva tornare al menu per
  // aprire la ricerca. Stessa finestra della barra in alto, stesse etichette
  // dal pannello: una sola cosa da cambiare se cambiano.
  const [prenotaAperto, setPrenotaAperto] = useState(false);

  // Calendario di UN veicolo: si apre cliccando la sua locandina. Tiene
  // anche il categoryContext della sezione da cui e' partito il click,
  // perche' e' quello che il wizard usa per il routing urban/cars.
  const [calendarioVeicolo, setCalendarioVeicolo] = useState<RentalItem | null>(null);
  const [calendarioContesto, setCalendarioContesto] = useState('cars');
  const [headerCopy, setHeaderCopy] = useState<HeaderCopy | null>(null);
  useEffect(() => {
    let annullato = false;
    getHeaderCopy().then((c) => { if (!annullato) setHeaderCopy(c); });
    return () => { annullato = true; };
  }, []);
  const hc = (it: keyof HeaderCopy, en: keyof HeaderCopy): string =>
    headerCopy ? (headerCopy as Record<string, string>)[(lang === 'it' ? it : en) as string] : '';

  // categoryContext serve a CarBookingWizard per scegliere il routing:
  // 'urban-cars' per la fascia urban, 'cars' per tutto il resto.
  const categoryContextFor = (catId: string): string => {
    if (catId === 'urban' || catId === 'urban-cars') return 'urban-cars';
    return 'cars';
  };

  // Veicoli filtrati per categoria selezionata, raggruppati.
  const groups = useMemo(() => {
    const out: Array<{ id: string; label: string; vehicles: typeof allVehicles }> = [];
    for (const cat of flottaCats) {
      const aliasSet = new Set(categoryAliases(cat.id).map(a => a.toLowerCase()));
      const list = allVehicles.filter(v => {
        const c = (v.category || '').toLowerCase();
        return aliasSet.has(c);
      });
      // 2026-05-23: skip categorie vuote — l'admin non vuole headers tipo
      // "Moto"/"Scooter" visibili sul sito se non ci sono ancora veicoli
      // assegnati. Quando si aggiungono veicoli alla categoria, riappare.
      if (list.length === 0) continue;
      out.push({ id: cat.id, label: cat.label, vehicles: list });
    }
    return out;
  }, [flottaCats, allVehicles]);

  const totalCount = useMemo(() => groups.reduce((s, g) => s + g.vehicles.length, 0), [groups]);
  const isLoading = catsLoading || vehLoading;

  const handleBook = (item: RentalItem, catId: string) => {
    openCarWizard(item, categoryContextFor(catId));
  };

  // Le date scelte nel calendario restano nel contesto finche' il wizard
  // le legge al montaggio. Uscendo dalla pagina si azzerano, altrimenti
  // una prenotazione aperta altrove ripartirebbe con date vecchie (stessa
  // pulizia che fa RentalPage).
  useEffect(() => {
    return () => { setInitialSearchDates(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apriCalendario = (item: RentalItem, catId: string) => {
    // I veicoli con prenotazione disabilitata restano in vetrina ma non
    // aprono il calendario: non c'e' niente da prenotare.
    if ((item as { bookingDisabled?: boolean }).bookingDisabled) return;
    setCalendarioContesto(categoryContextFor(catId));
    setCalendarioVeicolo(item);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="pt-40 pb-28 md:pt-48 md:pb-36 bg-black min-h-screen"
    >
      <div className="container mx-auto px-6">
        <div className="text-center mb-16 md:mb-24">
          <h1 className="t-display text-white">
            {lang === 'it' ? 'La Nostra Flotta' : 'Our Fleet'}
          </h1>
          <span className="mx-auto mt-8 block h-px w-16 bg-white/25" />
          <p className="text-gray-500 mt-8 text-base max-w-xl mx-auto">
            {lang === 'it'
              ? 'Scegli il tuo veicolo dalla nostra flotta esclusiva.'
              : 'Pick your vehicle from our exclusive fleet.'}
          </p>
          <button
            onClick={() => setPrenotaAperto(true)}
            className="mt-10 inline-flex items-center justify-center border border-white bg-white px-8 py-3.5 text-[11px] font-medium uppercase tracking-[0.2em] text-black transition-colors duration-500 ease-editorial hover:bg-transparent hover:text-white"
          >
            {hc('drawer_book_cta_it', 'drawer_book_cta_en') || (lang === 'it' ? 'Prenota Ora' : 'Book Now')}
          </button>
        </div>

        {isLoading ? (
          <p className="text-center text-gray-400">…</p>
        ) : catsStatus === 'error' ? (
          // Config non letta: non si mostra il catalogo intero "per sicurezza",
          // si dice che la lista non e' disponibile. Vedi utils/flottaConfig.ts.
          <p className="text-center text-gray-400">
            {lang === 'it'
              ? 'Flotta momentaneamente non disponibile. Riprova tra poco.'
              : 'Fleet temporarily unavailable. Please try again shortly.'}
          </p>
        ) : totalCount === 0 ? (
          <p className="text-center text-gray-400">
            {lang === 'it'
              ? 'Nessun veicolo disponibile al momento.'
              : 'No vehicles available right now.'}
          </p>
        ) : (
          <div className="space-y-24 md:space-y-32">
            {groups.map((group) => (
              // L'id serve alle CTA della homepage, che puntano al gruppo
              // della categoria del veicolo in evidenza (/flotta#exotic).
              <section key={group.id} id={group.id} className="scroll-mt-32">
                <h2 className="font-serif text-3xl md:text-5xl font-normal tracking-[-0.015em] text-white mb-10 border-b border-white/10 pb-6">
                  {group.label}
                </h2>

                {group.vehicles.length === 0 ? (
                  <p className="text-gray-500 text-sm italic">
                    {lang === 'it'
                      ? 'Nessun veicolo in questa categoria al momento.'
                      : 'No vehicles in this category yet.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                    {group.vehicles.map((v) => (
                      <RentalCard
                        key={v.id}
                        item={v as RentalItem}
                        onBook={(item) => handleBook(item, group.id)}
                        onCardClick={(item) => apriCalendario(item, group.id)}
                        categoryId={categoryContextFor(group.id)}
                        // Su "La Nostra Flotta" rimuoviamo il "Prenota Ora"
                        // dal card. Il cliente clicca il veicolo e usa il
                        // wizard centralizzato (Prenota Ora popup / pagina
                        // categoria) — niente CTA duplicato per ogni macchina.
                        hideBookButton
                        // 2026-05-21: niente prezzi nella vista flotta —
                        // la pagina mostra il listino veicoli, i prezzi reali
                        // sono dinamici e li vede il cliente nel wizard dopo
                        // aver scelto le date.
                        hidePrice
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      <CalendarioDisponibilitaPortale
        item={calendarioVeicolo}
        categoryContext={calendarioContesto}
        onClose={() => setCalendarioVeicolo(null)}
      />

      <AnimatePresence>
        {prenotaAperto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 p-4"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setPrenotaAperto(false); }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
              className="relative w-full max-w-[440px] border border-white/10 bg-[#0A0B0C] p-8 sm:p-10"
              style={{ boxShadow: '0 40px 90px -40px rgba(0,0,0,0.9)' }}
            >
              <button
                onClick={() => setPrenotaAperto(false)}
                aria-label={lang === 'it' ? 'Chiudi' : 'Close'}
                className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center border border-white/10 text-white/40 transition-colors duration-300 hover:border-white/30 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h3 className="mb-2 text-center font-serif text-[26px] font-normal tracking-[-0.01em] text-white">{hc('popup_title_it', 'popup_title_en')}</h3>
              <p className="mb-8 text-center text-[12px] text-white/35">{hc('popup_subtitle_it', 'popup_subtitle_en')}</p>
              <BookingSearchBox variant="popup" onClose={() => setPrenotaAperto(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default FlottaIndexPage;
