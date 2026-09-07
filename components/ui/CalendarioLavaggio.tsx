/**
 * CalendarioLavaggio — scelta di orario e giorno per il lavaggio.
 *
 * 07/09/2026 — prima si sceglieva prima il GIORNO, poi si scopriva quali
 * orari restavano. Chi ha un orario in testa ("passo alle 18") doveva
 * aprire i giorni uno per uno per trovarlo. Qui l'ordine e' rovesciato:
 * si sceglie l'ORARIO sulla griglia di apertura, e il calendario mostra
 * subito in quali giorni quell'orario e' libero. Se non lo e' da nessuna
 * parte, lo dice e invita a sceglierne un altro.
 *
 * Gli orari sono quelli di Centralina Pro > Orari Lavaggio, e la
 * disponibilita' e' "intelligente" come prima: un lavaggio da 45 minuti e
 * un carrello da due ore e mezza non hanno gli stessi orari possibili,
 * perche' il servizio deve entrare INTERO in una finestra di apertura e
 * non accavallarsi a quello che e' gia' preso.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '../../supabaseClient';
import { useTranslation } from '../../hooks/useTranslation';
import {
  generateLavaggioSlotsForDate,
  getDayHours,
  orariLavaggioPronti,
} from '../../utils/lavaggioHours';
import {
  raggruppaPerOra,
  valutaSlot,
  type PrenotazioneLavaggio,
} from '../../utils/lavaggioSlotRules';

/** Quanti giorni avanti si guarda. */
const GIORNI_ORIZZONTE = 60;
/** Preavviso minimo per prenotare nella giornata di oggi. */
const PREAVVISO_MINUTI = 120;

interface Props {
  aperto: boolean;
  onClose: () => void;
  /** Durata totale del carrello, in minuti. */
  durataMinuti: number;
  /** 'YYYY-MM-DD': primo giorno prenotabile. */
  minDate: string;
  /** Giorni fermati da Centralina Pro > Automazioni. */
  bloccato?: (ymd: string) => boolean;
  onConferma: (data: string, ora: string) => void;
  oraIniziale?: string;
}

function ymdLocale(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Durata di una prenotazione gia' presa, dal solo importo (dato storico). */
function durataDaPrezzo(euro: number): number {
  if (euro <= 15) return 15;
  if (euro <= 20) return 30;
  if (euro <= 25) return 45;
  if (euro <= 49) return 90;
  if (euro <= 75) return 120;
  return 150;
}

const CalendarioLavaggio: React.FC<Props> = ({
  aperto, onClose, durataMinuti, minDate, bloccato, onConferma, oraIniziale,
}) => {
  const { t, lang } = useTranslation();
  const it = lang === 'it';
  const [pronto, setPronto] = useState(false);
  const [prenotazioni, setPrenotazioni] = useState<PrenotazioneLavaggio[]>([]);
  const [oraScelta, setOraScelta] = useState<string>(oraIniziale || '');
  const [caricamento, setCaricamento] = useState(true);

  // Riaprendo si riparte dalla scelta dell'orario.
  useEffect(() => { if (!aperto) setOraScelta(oraIniziale || ''); }, [aperto, oraIniziale]);

  useEffect(() => {
    if (!aperto) return;
    let vivo = true;
    (async () => {
      setCaricamento(true);
      await orariLavaggioPronti();
      if (vivo) setPronto(true);
      // Le prenotazioni di tutto l'orizzonte in UNA lettura: servono per
      // dire, di un orario, in quali giorni e' libero.
      try {
        const oggi = new Date();
        const fine = new Date();
        fine.setDate(fine.getDate() + GIORNI_ORIZZONTE);
        const { data } = await supabase
          .from('bookings')
          .select('appointment_date, appointment_time, price_total, status')
          .eq('service_type', 'car_wash')
          .gte('appointment_date', ymdLocale(oggi))
          .lte('appointment_date', ymdLocale(fine));
        const escluse = new Set(['cancelled', 'annullata']);
        const righe = (data || [])
          .filter((b: any) => b.appointment_time && !escluse.has(String(b.status || '').toLowerCase()))
          .map((b: any) => ({
            data: String(b.appointment_date).slice(0, 10),
            ora: String(b.appointment_time).slice(0, 5),
            durataMinuti: durataDaPrezzo(Number(b.price_total || 0) / 100),
          }));
        if (vivo) setPrenotazioni(righe);
      } catch (err) {
        // Senza l'elenco si mostrano gli orari di apertura: meglio una
        // proposta da confermare che una finestra vuota.
        console.warn('[CalendarioLavaggio] prenotazioni non lette:', err);
      } finally {
        if (vivo) setCaricamento(false);
      }
    })();
    return () => { vivo = false; };
  }, [aperto]);

  /** I giorni dell'orizzonte, con le loro finestre e prenotazioni. */
  const giorni = useMemo(() => {
    if (!pronto) return [];
    const out: { ymd: string; data: Date; finestre: { start: string; end: string }[] }[] = [];
    const d = new Date();
    for (let i = 0; i < GIORNI_ORIZZONTE; i++) {
      const giorno = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      const ymd = ymdLocale(giorno);
      out.push({ ymd, data: giorno, finestre: getDayHours(giorno).windows || [] });
    }
    return out;
  }, [pronto]);

  /**
   * La griglia degli orari: l'unione degli slot di apertura dei prossimi
   * giorni, cosi' la griglia non dipende da quale giorno si guarda.
   */
  const griglia = useMemo(() => {
    if (!pronto) return [];
    const visti = new Set<string>();
    for (const g of giorni) {
      if (g.finestre.length === 0) continue;
      for (const s of generateLavaggioSlotsForDate(g.data)) visti.add(s);
    }
    return raggruppaPerOra([...visti].sort());
  }, [giorni, pronto]);

  const minutiAdesso = useCallback(() => {
    const ora = new Date();
    return ora.getHours() * 60 + ora.getMinutes();
  }, []);

  /** Per l'orario scelto: in quali giorni e' davvero prenotabile. */
  const giorniPerOra = useMemo(() => {
    if (!oraScelta) return [];
    const oggiYmd = ymdLocale(new Date());
    return giorni.map((g) => {
      const esito = valutaSlot(oraScelta, {
        finestre: g.finestre,
        prenotazioni: prenotazioni.filter((p) => p.data === g.ymd),
        durataMinuti,
        oggi: g.ymd === oggiYmd,
        minutiAdesso: minutiAdesso(),
        preavvisoMinuti: PREAVVISO_MINUTI,
        nonPrenotabile: g.ymd < minDate ? 'passato' : (bloccato?.(g.ymd) ? 'bloccato' : undefined),
      });
      return { ...g, esito };
    });
  }, [oraScelta, giorni, prenotazioni, durataMinuti, minDate, bloccato, minutiAdesso]);

  /** Un orario si offre solo se esiste almeno un giorno in cui e' libero. */
  const oreLibere = useMemo(() => {
    if (!pronto) return new Set<string>();
    const oggiYmd = ymdLocale(new Date());
    const libere = new Set<string>();
    for (const riga of griglia) {
      for (const ora of riga.minuti) {
        const qualcuno = giorni.some((g) => valutaSlot(ora, {
          finestre: g.finestre,
          prenotazioni: prenotazioni.filter((p) => p.data === g.ymd),
          durataMinuti,
          oggi: g.ymd === oggiYmd,
          minutiAdesso: minutiAdesso(),
          preavvisoMinuti: PREAVVISO_MINUTI,
          nonPrenotabile: g.ymd < minDate ? 'passato' : (bloccato?.(g.ymd) ? 'bloccato' : undefined),
        }).disponibile);
        if (qualcuno) libere.add(ora);
      }
    }
    return libere;
  }, [griglia, giorni, prenotazioni, durataMinuti, minDate, bloccato, pronto, minutiAdesso]);

  const giorniDisponibili = giorniPerOra.filter((g) => g.esito.disponibile);

  const durataTesto = durataMinuti >= 60
    ? `${Math.floor(durataMinuti / 60)}h${durataMinuti % 60 ? ` ${durataMinuti % 60}min` : ''}`
    : `${durataMinuti} min`;

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
              {t({ it: 'Scegli prima l\'orario', en: 'Pick your time first' })}
            </h3>
            <p className="mb-6 text-[12px] text-white/40">
              {it
                ? `Poi ti mostriamo i giorni in cui quell'orario è libero. Servizio da ${durataTesto}.`
                : `We then show the days that time is free. Service takes ${durataTesto}.`}
            </p>

            {caricamento ? (
              <p className="py-10 text-center text-sm text-white/40">…</p>
            ) : (
              <>
                {/* ── 1. La griglia degli orari di apertura ── */}
                <div className="space-y-2">
                  {griglia.map((riga) => (
                    <div key={riga.ora} className="flex items-center gap-3">
                      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-white/30">
                        {String(riga.ora).padStart(2, '0')}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {riga.minuti.map((ora) => {
                          const libera = oreLibere.has(ora);
                          const scelta = ora === oraScelta;
                          return (
                            <button
                              key={ora}
                              type="button"
                              disabled={!libera}
                              onClick={() => setOraScelta(ora)}
                              className={`border px-2.5 py-1.5 text-[12px] tabular-nums transition-colors ${
                                scelta
                                  ? 'border-white bg-white text-black'
                                  : libera
                                    ? 'border-white/15 text-white/75 hover:border-white/50'
                                    : 'border-white/5 text-white/20 line-through'
                              }`}
                            >
                              {ora}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── 2. I giorni in cui quell'orario e' libero ── */}
                {oraScelta && (
                  <div className="mt-8 border-t border-white/10 pt-6">
                    {giorniDisponibili.length === 0 ? (
                      <p className="text-[13px] text-amber-300">
                        {it
                          ? `Alle ${oraScelta} non c'è posto nei prossimi giorni: scegli un altro orario qui sopra.`
                          : `No day available at ${oraScelta} in the coming weeks: pick another time above.`}
                      </p>
                    ) : (
                      <>
                        <p className="mb-4 text-[12px] text-white/40">
                          {it
                            ? `Giorni con posto alle ${oraScelta}. Gli altri sono già presi o chiusi.`
                            : `Days with room at ${oraScelta}. The others are booked or closed.`}
                        </p>
                        <div className="grid max-h-[40vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                          {giorniDisponibili.map((g) => (
                            <button
                              key={g.ymd}
                              type="button"
                              onClick={() => { onConferma(g.ymd, oraScelta); onClose(); }}
                              className="border border-white/15 px-3 py-2.5 text-left transition-colors hover:border-white hover:bg-white/[0.04]"
                            >
                              <span className="block text-[13px] capitalize text-white/85">
                                {g.data.toLocaleDateString(it ? 'it-IT' : 'en-GB', { weekday: 'long', day: '2-digit', month: 'long' })}
                              </span>
                              <span className="mt-0.5 block text-[11px] tabular-nums text-white/35">{oraScelta}</span>
                            </button>
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

export default CalendarioLavaggio;
