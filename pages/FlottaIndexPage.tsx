/**
 * FlottaIndexPage — landing pubblica "La Nostra Flotta".
 *
 * Mostra TUTTI i veicoli delle categorie selezionate in admin >
 * Sito > Flotta, raggruppati per categoria. Riusiamo RentalCard
 * cosi' il design (aspect 9/16, hover, prezzo, bottone) e' lo
 * stesso della pagina /supercar-luxury.
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useFlottaCategories } from '../hooks/useFlottaCategories';
import { useVehicles } from '../hooks/useVehicles';
import { useTranslation } from '../hooks/useTranslation';
import { useBooking } from '../hooks/useBooking';
import RentalCard from '../components/ui/RentalCard';
import type { RentalItem } from '../types';
// Alias storici categoria DB <-> id Centralina Pro: definiti una volta
// sola in flottaConfig, insieme alla regola di visibilita'.
import { categoryAliases } from '../utils/flottaConfig';

const FlottaIndexPage: React.FC = () => {
  const { lang } = useTranslation();
  const { openCarWizard } = useBooking();
  const { categories: flottaCats, loading: catsLoading, status: catsStatus } = useFlottaCategories();
  const { vehicles: allVehicles, loading: vehLoading } = useVehicles(undefined);

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
    </motion.div>
  );
};

export default FlottaIndexPage;
