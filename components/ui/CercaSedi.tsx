/**
 * CercaSedi — la ricerca delle sedi, dalla lente in alto a destra.
 *
 * Cerca dentro il catalogo del pannello (Sito > Locations): le SEDI DR7 —
 * punti di ritiro e riconsegna, marina, eliporti.
 *
 * Gli AEROPORTI restano fuori di proposito. Sono scali di terzi che servono
 * ai voli, non posti dove DR7 sta: in elenco facevano sembrare che DR7 avesse
 * una sede a Nizza o a Ibiza. Chi cerca "Olbia" oggi non trova niente, ed e'
 * la risposta giusta finche' li' una sede non c'e'.
 *
 * Fuori anche la consegna a domicilio: e' un servizio, non un posto.
 *
 * Non e' un motore di ricerca del sito: e' l'elenco delle sedi DR7.
 * Ogni risultato porta alla pagina del servizio a cui appartiene — auto, mare
 * o aria — cosi' dalla ricerca si arriva alla prenotazione.
 *
 * L'elenco NON e' scritto qui dentro: se l'operatore aggiunge una sede nel
 * pannello, si trova da subito anche qui.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { getLocationsCopy, type LocationsCopy } from '../../utils/siteCopy';

type Risultato = {
  chiave: string;
  titolo: string;
  /** Riga sotto: citta', codice IATA, indirizzo. Puo' mancare. */
  dettaglio?: string;
  gruppo: string;
  to: string;
};

/** Toglie accenti e maiuscole: "Cagliari" trova "cagliari", "Nizza" trova "Nice". */
function normalizza(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const CercaSedi: React.FC<{ aperto: boolean; onClose: () => void }> = ({ aperto, onClose }) => {
  const { lang, t } = useTranslation();
  const navigate = useNavigate();
  const [locations, setLocations] = useState<LocationsCopy | null>(null);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let annullato = false;
    getLocationsCopy().then((l) => { if (!annullato) setLocations(l); });
    return () => { annullato = true; };
  }, []);

  // Il cursore va nel campo appena la finestra si apre: chi preme la lente sta
  // gia' per scrivere.
  useEffect(() => {
    if (!aperto) return;
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { clearTimeout(id); window.removeEventListener('keydown', esc); };
  }, [aperto, onClose]);

  // Chiudendo si svuota: riaprendo non si trova la ricerca di ieri.
  useEffect(() => { if (!aperto) setQuery(''); }, [aperto]);

  const tutte = useMemo<Risultato[]>(() => {
    if (!locations) return [];
    const et = {
      ritiro: t({ it: 'Ritiro e riconsegna', en: 'Pickup and return' }),
      marina: t({ it: 'Marina', en: 'Marinas' }),
      eliporti: t({ it: 'Eliporti', en: 'Heliports' }),
    };
    const bil = (i: { label_it: string; label_en: string }) => (lang === 'it' ? i.label_it : i.label_en);
    const out: Risultato[] = [];

    // Ritiro e riconsegna condividono quasi sempre gli stessi posti: si
    // mostrano una volta sola, se no la lista dice tutto due volte.
    // La consegna a domicilio non e' una sede: non e' un posto dove andare.
    const domicilio = (v: string) => /domicili|delivery|home pickup/i.test(v);
    const visti = new Set<string>();
    for (const p of [...(locations.pickup_locations || []), ...(locations.return_locations || [])]) {
      const etichetta = bil(p);
      if (!etichetta || visti.has(etichetta)) continue;
      if (domicilio(etichetta) || domicilio(p.id)) continue;
      visti.add(etichetta);
      out.push({ chiave: `pick-${p.id}-${etichetta}`, titolo: etichetta, gruppo: et.ritiro, to: '/flotta' });
    }
    for (const m of locations.yacht_marinas || []) {
      out.push({ chiave: `mar-${m.id}`, titolo: bil(m), gruppo: et.marina, to: '/noleggio-mare' });
    }
    const eli = new Set<string>();
    for (const h of [...(locations.heli_departure_points || []), ...(locations.heli_arrival_points || [])]) {
      if (eli.has(h.name)) continue;
      eli.add(h.name);
      out.push({ chiave: `eli-${h.id}-${h.name}`, titolo: h.name, gruppo: et.eliporti, to: '/noleggio-aria' });
    }
    return out;
  }, [locations, lang, t]);

  const risultati = useMemo(() => {
    const q = normalizza(query);
    if (!q) return [];
    return tutte.filter((r) => normalizza(`${r.titolo} ${r.dettaglio || ''}`).includes(q)).slice(0, 24);
  }, [query, tutte]);

  const vai = (to: string) => { onClose(); navigate(to); };

  return (
    <AnimatePresence>
      {aperto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[280] bg-[#08090A]/[0.97] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <div className="container mx-auto px-6 pt-28 md:pt-36">
            <div className="mx-auto max-w-2xl">
              <div className="flex items-center justify-between gap-6">
                <span className="text-[11px] uppercase tracking-[0.28em] text-white/40">
                  {t({ it: 'Cerca una sede', en: 'Find a location' })}
                </span>
                <button
                  onClick={onClose}
                  aria-label={t({ it: 'Chiudi', en: 'Close' })}
                  className="flex h-9 w-9 items-center justify-center border border-white/15 text-white/50 transition-colors duration-500 ease-editorial hover:border-white/40 hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.4} viewBox="0 0 24 24">
                    <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t({ it: 'Cagliari, Porto Cervo...', en: 'Cagliari, Porto Cervo...' })}
                className="mt-8 w-full border-b border-white/20 bg-transparent pb-5 font-serif text-3xl font-normal text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none md:text-5xl"
              />

              <div className="mt-10 max-h-[52vh] overflow-y-auto pb-16">
                {query && risultati.length === 0 && (
                  <p className="text-sm text-white/40">
                    {t({ it: 'Nessuna sede con questo nome.', en: 'No location with that name.' })}
                  </p>
                )}
                {risultati.map((r) => (
                  <button
                    key={r.chiave}
                    onClick={() => vai(r.to)}
                    className="group flex w-full items-baseline justify-between gap-6 border-b border-white/[0.08] py-4 text-left transition-colors duration-300 hover:border-white/25"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-white/75 transition-colors duration-300 group-hover:text-white">
                        {r.titolo}
                      </span>
                      {r.dettaglio && (
                        <span className="mt-1 block text-[12px] text-white/35">{r.dettaglio}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-white/30">{r.gruppo}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CercaSedi;
