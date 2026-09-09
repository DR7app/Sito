/**
 * CalendarioGiornoOrario — scelta di GIORNO e poi ORARIO.
 *
 * 09/09/2026 — il lavaggio ha il suo calendario (CalendarioLavaggio) che
 * parte dall'orario: li' il cliente ha una fascia in testa ("passo alle
 * 18") e vuole sapere quando c'e' posto. Ovunque altro l'ordine naturale
 * e' l'opposto: prima si sceglie il giorno, poi si vede cosa resta libero
 * in quel giorno. Terra (ritiro e riconsegna), Mare e Casa passano tutti
 * di qui, cosi' il calendario del sito e' uno solo e ha lo stesso aspetto
 * del lavaggio: fondo nero, riquadri squadrati, orari raggruppati per ora.
 *
 * Il componente non sa nulla di noleggio o di tour: chiede al chiamante
 * gli orari di un giorno (`orariDelGiorno`). Se per un giorno non torna
 * nessun orario, quel giorno e' spento nel calendario.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from '../../hooks/useTranslation';
import { raggruppaPerOra } from '../../utils/lavaggioSlotRules';
import { orariPronti } from '../../utils/noleggioHours';

interface Bilingue { it: string; en: string }

interface Props {
  aperto: boolean;
  onClose: () => void;
  /** 'YYYY-MM-DD': primo giorno scegliibile. */
  minDate?: string;
  /** 'YYYY-MM-DD': ultimo giorno scegliibile. */
  maxDate?: string;
  /** Gli orari prenotabili di un giorno. Vuoto = giorno non scegliibile. */
  orariDelGiorno: (ymd: string) => string[];
  dataIniziale?: string;
  oraIniziale?: string;
  titolo?: Bilingue;
  sottotitolo?: Bilingue;
  onConferma: (data: string, ora: string) => void;
}

export function ymdLocale(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CalendarioGiornoOrario: React.FC<Props> = ({
  aperto, onClose, minDate, maxDate, orariDelGiorno,
  dataIniziale, oraIniziale, titolo, sottotitolo, onConferma,
}) => {
  const { t, lang } = useTranslation();
  const it = lang === 'it';
  const locale = it ? 'it-IT' : 'en-GB';

  // Gli orari arrivano da Centralina Pro e si leggono una volta sola: finche'
  // non sono arrivati la griglia mostrerebbe quelli di fabbrica e non si
  // ridisegnerebbe piu'.
  const [pronto, setPronto] = useState(false);
  useEffect(() => { let vivo = true; orariPronti().then(() => { if (vivo) setPronto(true); }); return () => { vivo = false; }; }, []);

  const [giornoScelto, setGiornoScelto] = useState<string>(dataIniziale || '');
  const [mese, setMese] = useState<Date>(() => {
    const base = dataIniziale || minDate;
    const d = base ? new Date(`${base}T12:00:00`) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Riaprendo si riparte dal giorno gia' scelto, non da dove si era rimasti.
  useEffect(() => {
    if (!aperto) return;
    setGiornoScelto(dataIniziale || '');
    const base = dataIniziale || minDate;
    const d = base ? new Date(`${base}T12:00:00`) : new Date();
    setMese(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [aperto, dataIniziale, minDate]);

  /** Le celle del mese: i vuoti iniziali (settimana che parte da lunedi') e i giorni. */
  const celle = useMemo(() => {
    const primo = new Date(mese.getFullYear(), mese.getMonth(), 1);
    const vuoti = (primo.getDay() + 6) % 7; // lunedi' = 0
    const ultimo = new Date(mese.getFullYear(), mese.getMonth() + 1, 0).getDate();
    const out: ({ ymd: string; numero: number } | null)[] = Array(vuoti).fill(null);
    for (let g = 1; g <= ultimo; g++) {
      const d = new Date(mese.getFullYear(), mese.getMonth(), g);
      out.push({ ymd: ymdLocale(d), numero: g });
    }
    return out;
  }, [mese]);

  const scegliibile = useMemo(() => {
    const cache = new Map<string, boolean>();
    return (ymd: string) => {
      if (cache.has(ymd)) return cache.get(ymd)!;
      const ok = !(minDate && ymd < minDate) && !(maxDate && ymd > maxDate) && orariDelGiorno(ymd).length > 0;
      cache.set(ymd, ok);
      return ok;
    };
    // `pronto` entra fra le dipendenze: cambiano gli orari, cambiano i giorni aperti.
  }, [minDate, maxDate, orariDelGiorno, pronto]);

  const griglia = useMemo(
    () => (giornoScelto ? raggruppaPerOra([...orariDelGiorno(giornoScelto)].sort()) : []),
    [giornoScelto, orariDelGiorno, pronto],
  );

  const oggiYmd = ymdLocale(new Date());
  const meseLabel = mese.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const giorniSettimana = it
    ? ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Non si torna indietro oltre il mese del primo giorno prenotabile.
  const meseMinimo = minDate ? minDate.slice(0, 7) : oggiYmd.slice(0, 7);
  const meseCorrente = `${mese.getFullYear()}-${String(mese.getMonth() + 1).padStart(2, '0')}`;
  const meseMassimo = maxDate ? maxDate.slice(0, 7) : null;
  const cambiaMese = (delta: number) => setMese((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <AnimatePresence>
      {aperto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[320] flex items-start justify-center overflow-y-auto bg-black/90 p-4 py-10"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 12 }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0.12 }}
            className="relative w-full max-w-2xl border border-white/10 bg-[#0A0B0C] p-6 sm:p-8"
          >
            <button
              onClick={onClose}
              aria-label={t({ it: 'Chiudi', en: 'Close' })}
              className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center border border-white/10 text-white/40 transition-colors hover:border-white/30 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="mb-1 font-serif text-[24px] text-white">
              {titolo ? t(titolo) : t({ it: 'Scegli prima il giorno', en: 'Pick your day first' })}
            </h3>
            <p className="mb-6 text-[12px] text-white/40">
              {sottotitolo
                ? t(sottotitolo)
                : t({ it: 'Poi ti mostriamo gli orari liberi di quel giorno.', en: 'We then show the times free on that day.' })}
            </p>

            {!pronto ? (
              <p className="py-10 text-center text-sm text-white/40">…</p>
            ) : (
              <>
                {/* ── 1. Il mese ── */}
                <div className="mb-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => cambiaMese(-1)}
                    disabled={meseCorrente <= meseMinimo}
                    aria-label={t({ it: 'Mese precedente', en: 'Previous month' })}
                    className="flex h-8 w-8 items-center justify-center border border-white/15 text-white/60 transition-colors hover:border-white/50 hover:text-white disabled:border-white/5 disabled:text-white/15"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-[13px] capitalize text-white/85">{meseLabel}</span>
                  <button
                    type="button"
                    onClick={() => cambiaMese(1)}
                    disabled={!!meseMassimo && meseCorrente >= meseMassimo}
                    aria-label={t({ it: 'Mese successivo', en: 'Next month' })}
                    className="flex h-8 w-8 items-center justify-center border border-white/15 text-white/60 transition-colors hover:border-white/50 hover:text-white disabled:border-white/5 disabled:text-white/15"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>

                <div className="mb-1.5 grid grid-cols-7 gap-1.5">
                  {giorniSettimana.map((g) => (
                    <span key={g} className="text-center text-[10px] uppercase tracking-wider text-white/25">{g}</span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {celle.map((cella, i) => {
                    if (!cella) return <span key={`v${i}`} />;
                    const libero = scegliibile(cella.ymd);
                    const scelto = cella.ymd === giornoScelto;
                    return (
                      <button
                        key={cella.ymd}
                        type="button"
                        disabled={!libero}
                        onClick={() => setGiornoScelto(cella.ymd)}
                        className={`border py-2 text-[12px] tabular-nums transition-colors ${
                          scelto
                            ? 'border-white bg-white text-black'
                            : libero
                              ? `border-white/15 text-white/75 hover:border-white/50 ${cella.ymd === oggiYmd ? 'border-white/40' : ''}`
                              : 'border-white/5 text-white/20 line-through'
                        }`}
                      >
                        {cella.numero}
                      </button>
                    );
                  })}
                </div>

                {/* ── 2. Gli orari di quel giorno ── */}
                {giornoScelto && (
                  <div className="mt-8 border-t border-white/10 pt-6">
                    {griglia.length === 0 ? (
                      <p className="text-[13px] text-amber-300">
                        {it
                          ? 'In questo giorno non ci sono orari liberi: scegline un altro qui sopra.'
                          : 'No free time on this day: pick another one above.'}
                      </p>
                    ) : (
                      <>
                        <p className="mb-4 text-[12px] capitalize text-white/40">
                          {new Date(`${giornoScelto}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long' })}
                        </p>
                        <div className="max-h-[40vh] space-y-2 overflow-y-auto">
                          {griglia.map((riga) => (
                            <div key={riga.ora} className="flex items-center gap-3">
                              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-white/30">
                                {String(riga.ora).padStart(2, '0')}
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {riga.minuti.map((ora) => (
                                  <button
                                    key={ora}
                                    type="button"
                                    onClick={() => { onConferma(giornoScelto, ora); onClose(); }}
                                    className={`border px-2.5 py-1.5 text-[12px] tabular-nums transition-colors ${
                                      ora === oraIniziale && giornoScelto === dataIniziale
                                        ? 'border-white bg-white text-black'
                                        : 'border-white/15 text-white/75 hover:border-white/50'
                                    }`}
                                  >
                                    {ora}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CalendarioGiornoOrario;
