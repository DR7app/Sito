/**
 * FlottaIndexPage — landing pubblica "La Nostra Flotta".
 *
 * Mostra TUTTI i veicoli delle categorie selezionate in admin >
 * Sito > Flotta, raggruppati per categoria. Riusiamo RentalCard
 * cosi' il design (aspect 9/16, hover, prezzo, bottone) e' lo
 * stesso della pagina /supercar-luxury.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFlottaCategories } from '../hooks/useFlottaCategories';
import { useVehicles } from '../hooks/useVehicles';
import { useTranslation } from '../hooks/useTranslation';
import { useBooking } from '../hooks/useBooking';
import RentalCard from '../components/ui/RentalCard';
import HeroVideo from '../components/ui/HeroVideo';
import { CalendarioDisponibilitaPortale } from '../components/ui/CalendarioDisponibilita';
import { SARDEGNA_LOCATIONS, type SardegnaLocation } from '../data/sardegnaLocations';
import type { RentalItem } from '../types';
// Alias storici categoria DB <-> id Centralina Pro: definiti una volta
// sola in flottaConfig, insieme alla regola di visibilita'.
import { categoryAliases } from '../utils/flottaConfig';

const FlottaIndexPage: React.FC = () => {
  const { lang, t } = useTranslation();
  const { openCarWizard, setInitialSearchDates } = useBooking();
  const { categories: flottaCats, loading: catsLoading, status: catsStatus } = useFlottaCategories();
  const { vehicles: allVehicles, loading: vehLoading } = useVehicles(undefined);

  // "Prenota Ora" anche qui, sotto l'invito a scegliere: e' la pagina dove il
  // cliente guarda i mezzi, ed era l'unica in cui doveva tornare al menu per
  // aprire la ricerca. Stessa finestra della barra in alto, stesse etichette
  // dal pannello: una sola cosa da cambiare se cambiano.

  /**
   * Ricerca per citta', localita' o aeroporto — SOLO Sardegna.
   *
   * L'elenco e' quello prestabilito di `data/sardegnaLocations.ts`: citta',
   * paesi, porti, resort e i tre aeroporti dell'isola. Prima venivano fuori
   * anche Fiumicino, Linate e Nizza dagli aeroporti di listino: chi cercava
   * "Nizza" trovava un risultato e poi, in prenotazione, l'unico ritiro
   * possibile restava Cagliari. Meglio un elenco piu' corto e vero.
   *
   * Scegliendo un posto si apre la finestra di prenotazione, la stessa del
   * menu: il campo indica dove si parte, la prenotazione si fa li'.
   */
  // Dove porta "Accedi alla collezione". Un ref e non un querySelector: il
  // contenitore esiste da subito, le sezioni di categoria no.
  const collezioneRef = useRef<HTMLDivElement>(null);

  const [luogoQuery, setLuogoQuery] = useState('');
  const [luoghiAperti, setLuoghiAperti] = useState(false);
  // Il luogo scelto, non solo il testo: la finestra di prenotazione deve
  // aprirsi su QUELL'aeroporto, non sulla sede di Viale Marconi.
  const [luogoScelto, setLuogoScelto] = useState<SardegnaLocation | null>(null);

  const normalizzaLuogo = (v: string) =>
    v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const luoghi = useMemo(
    () => SARDEGNA_LOCATIONS.map((l) => ({
      chiave: l.id,
      luogo: l,
      titolo: l.label || l.name,
      dettaglio: l.province,
      // Gli alias entrano nella ricerca ma non si vedono: "casteddu" e
      // "elmas" devono trovare Cagliari senza comparire in elenco.
      cercabile: normalizzaLuogo([l.name, l.label, l.province, ...(l.aliases || [])].join(' ')),
    })),
    [],
  );

  const luoghiTrovati = useMemo(() => {
    const parole = normalizzaLuogo(luogoQuery).split(/\s+/).filter(Boolean);
    if (parole.length === 0) return [];
    return luoghi.filter((l) => parole.every((p) => l.cercabile.includes(p))).slice(0, 8);
  }, [luogoQuery, luoghi]);

  // Calendario di UN veicolo: si apre cliccando la sua locandina. Tiene
  // anche il categoryContext della sezione da cui e' partito il click,
  // perche' e' quello che il wizard usa per il routing urban/cars.
  const [calendarioVeicolo, setCalendarioVeicolo] = useState<RentalItem | null>(null);
  const [calendarioContesto, setCalendarioContesto] = useState('cars');

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
      className="pb-28 md:pb-36 bg-black min-h-screen"
    >
      {/* 10/09/2026 — Terra si apre col filmato della collezione DIETRO al
          titolo: parte da solo, senza audio, in ciclo, e sfuma nel nero
          della pagina. Titolo, filetto, frase e ricerca del luogo stanno
          dove erano, sopra la scena. */}
      <HeroVideo
        src="/video-terra.mp4"
        poster="/video-terra-poster.jpg"
        ariaLabel={lang === 'it' ? 'La collezione DR7 Terra' : 'The DR7 Land collection'}
      >
      <div className="container mx-auto px-6">
        <div className="text-center">
          <h1 className="t-display text-white">
            {lang === 'it' ? "OLTRE L'ORDINARIO." : 'BEYOND THE ORDINARY.'}
          </h1>
          <span className="mx-auto mt-8 block h-px w-16 bg-white/25" />
          <p className="text-gray-500 mt-8 text-base max-w-xl mx-auto">
            {lang === 'it'
              ? 'Non è semplicemente una scelta. È l\'accesso a qualcosa che non trovi altrove.'
              : "It isn't simply a choice. It's access to something you won't find elsewhere."}
          </p>
          {/* Al posto del bottone "Prenota Ora": si parte dal luogo, e la
              finestra di prenotazione si apre scegliendolo. */}
          <div className="relative mx-auto mt-10 max-w-xl text-left">
            <div className="flex items-center gap-3 border-b border-white/20 pb-3 transition-colors duration-500 ease-editorial focus-within:border-white/50">
              <svg className="h-4 w-4 shrink-0 text-white/40" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              <input
                type="text"
                value={luogoQuery}
                onChange={(e) => { setLuogoQuery(e.target.value); setLuogoScelto(null); setLuoghiAperti(true); }}
                onFocus={() => setLuoghiAperti(true)}
                placeholder={t({ it: 'Cerca città, località o aeroporto', en: 'Search city, location or airport' })}
                className="w-full bg-transparent text-base text-white placeholder:text-white/35 focus:outline-none"
              />
            </div>

            {luoghiAperti && luogoQuery.trim() !== '' && (
              <div className="absolute left-0 right-0 z-20 mt-2 max-h-72 overflow-y-auto border border-white/10 bg-[#0B0C0D]">
                {luoghiTrovati.length === 0 ? (
                  <p className="px-4 py-4 text-[13px] text-white/40">
                    {lang === 'it'
                      ? 'Nessun risultato: per ora copriamo solo la Sardegna.'
                      : 'No match: for now we cover Sardinia only.'}
                  </p>
                ) : (
                  luoghiTrovati.map((l) => (
                    <button
                      key={l.chiave}
                      onClick={() => { setLuogoQuery(l.titolo); setLuogoScelto(l.luogo); setLuoghiAperti(false); }}
                      className="block w-full border-b border-white/[0.06] px-4 py-3 text-left transition-colors duration-300 last:border-b-0 hover:bg-white/[0.04]"
                    >
                      <span className="block truncate text-[14px] text-white/80">{l.titolo}</span>
                      {l.dettaglio && <span className="mt-0.5 block text-[11px] text-white/35">{l.dettaglio}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* "Accedi alla collezione": porta ai veicoli piu' in basso. Non
              apre la prenotazione — prima si guarda, poi si prenota.

              07/09/2026 — puntava alla prima sezione di categoria, che pero'
              esiste solo a flotta CARICATA: chi premeva il bottone nei primi
              istanti, o quando la lista era vuota o non disponibile, non
              vedeva succedere niente. Ora punta al contenitore dei
              risultati, che c'e' sempre. */}
          <button
            onClick={() => collezioneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="mt-10 inline-flex items-center justify-center border border-white bg-white px-8 py-3.5 text-[11px] font-medium uppercase tracking-[0.2em] text-black transition-colors duration-500 ease-editorial hover:bg-transparent hover:text-white"
          >
            {t({ it: 'ACCEDI ALLA COLLEZIONE', en: 'ENTER THE COLLECTION' })}
          </button>
        </div>
      </div>
      </HeroVideo>

      <div className="container mx-auto px-6 pt-20 md:pt-28">
        <div ref={collezioneRef} className="scroll-mt-28">
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
              <section key={group.id} id={group.id} data-collezione className="scroll-mt-32">
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
      </div>

      <CalendarioDisponibilitaPortale
        item={calendarioVeicolo}
        categoryContext={calendarioContesto}
        onClose={() => setCalendarioVeicolo(null)}
      />

    </motion.div>
  );
};

export default FlottaIndexPage;
