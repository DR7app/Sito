/**
 * CalendarioDisponibilita — popup del calendario di un singolo veicolo.
 *
 * Si apre cliccando una macchina nella pagina Flotta. Mostra una griglia
 * mensile (mese corrente + i successivi) con le disponibilita' REALI di
 * quel veicolo: i giorni gia' impegnati sono grigi e non cliccabili, i
 * giorni liberi si cliccano per comporre il periodo. Scelte le due date
 * appare il prezzo, e il bottone porta al wizard di prenotazione GIA'
 * COMPILATO con quelle date.
 *
 * Non e' un secondo flusso di prenotazione: e' una scorciatoia che
 * finisce nello stesso CarBookingWizard di sempre (via
 * `setInitialSearchDates` + `openCarWizard`, lo stesso aggancio usato da
 * RentalPage per i preventivi). Tutte le regole — assicurazioni, extra,
 * cauzione, pagamento — restano dove sono.
 *
 * Le fonti dei dati sono quelle che gia' usa il wizard, nessuna nuova:
 *  - disponibilita': `getAvailabilityWindows` (Supabase: bookings +
 *    reservations + blocchi manutenzione, buffer da Centralina Pro).
 *    Per un gruppo di veicoli identici la funzione considera occupato
 *    solo quando TUTTI sono fuori.
 *  - orari selezionabili: `utils/noleggioHours` (Centralina Pro > Orari
 *    Noleggio), che restituisce [] la domenica e nei festivi.
 *  - prezzo: `calculate-dynamic-price`, la stessa funzione che il wizard
 *    interroga quando il cliente sceglie le date.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { RentalItem } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import { useBooking } from '../../hooks/useBooking';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { automazioniPronte, getLateReturnGraceMinutes } from '../../utils/bookingValidation';
import {
  getPickupTimesForDateString,
  getReturnTimesForDateString,
  orariPronti,
} from '../../utils/noleggioHours';
import {
  giorniFatturati,
  grigliaMese,
  msDaYmdOra,
  primoOccupatoDopo,
  slotLiberi,
  statoGiornoRiconsegna,
  statoGiornoRitiro,
  ultimaRiconsegnaPossibile,
  ymdLocale,
  type Intervallo,
  type StatoGiorno,
} from '../../utils/calendarioDisponibilitaRules';

const FUNCTIONS_BASE =
  import.meta.env.VITE_FUNCTIONS_BASE ??
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:8888'
    : window.location.origin);

/** Quanti mesi in avanti si puo' guardare. */
const MESI_ORIZZONTE = 12;

const MESI_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const MESI_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const GIORNI_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const GIORNI_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface PrezzoDinamico {
  enabled: boolean;
  finalDailyRateEur?: number;
  finalTotalEur?: number;
  rentalDays?: number;
  selectedBaseRateEur?: number;
}

interface Props {
  item: RentalItem;
  /** 'cars' oppure 'urban-cars': serve al wizard per il routing. */
  categoryContext: string;
  onClose: () => void;
}

const euro = (n: number) => new Intl.NumberFormat('it-IT', {
  style: 'currency', currency: 'EUR',
  minimumFractionDigits: n % 1 === 0 ? 0 : 2,
  maximumFractionDigits: 2,
}).format(n);

const CalendarioDisponibilita: React.FC<Props> = ({ item, categoryContext, onClose }) => {
  const { lang } = useTranslation();
  const { setInitialSearchDates, openCarWizard } = useBooking();
  const it = lang === 'it';

  const [occupati, setOccupati] = useState<Intervallo[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [erroreDisponibilita, setErroreDisponibilita] = useState(false);
  // Griglia e conteggio giorni leggono la Centralina Pro in modo sincrono
  // (orari di apertura, grace ritardo): finche' non ha risposto si
  // userebbero i valori di fabbrica — che in produzione sono diversi da
  // quelli veri — e niente farebbe ridisegnare. Si aspetta, in parallelo
  // alla disponibilita', quindi senza attesa aggiuntiva percepita.
  const [configLetta, setConfigLetta] = useState(false);

  const [ritiroYmd, setRitiroYmd] = useState<string>('');
  const [ritiroOra, setRitiroOra] = useState<string>('');
  const [riconsegnaYmd, setRiconsegnaYmd] = useState<string>('');
  const [riconsegnaOra, setRiconsegnaOra] = useState<string>('');

  const [prezzo, setPrezzo] = useState<PrezzoDinamico | null>(null);
  const [prezzoInCorso, setPrezzoInCorso] = useState(false);

  const oggi = useMemo(() => new Date(), []);
  const oggiYmd = useMemo(() => ymdLocale(oggi), [oggi]);
  const orizzonteYmd = useMemo(() => {
    const d = new Date(oggi.getFullYear(), oggi.getMonth() + MESI_ORIZZONTE, 0);
    return ymdLocale(d);
  }, [oggi]);

  // Mese in alto a sinistra della griglia (se ne mostrano due su desktop).
  const [mese, setMese] = useState(() => new Date(oggi.getFullYear(), oggi.getMonth(), 1));

  // Gli id "veri" dei veicoli: per un gruppo (es. 3 Panda bianche) sono
  // tutti, cosi' la funzione puo' dire "occupato" solo quando sono fuori
  // tutte quante.
  const vehicleIds = useMemo(() => {
    const ids = (item as { vehicleIds?: string[] }).vehicleIds;
    if (ids && ids.length) return ids;
    return item.id ? [String(item.id).replace('car-', '')] : [];
  }, [item]);
  const vehiclePlates = useMemo(
    () => (item as { plates?: string[] }).plates || [],
    [item],
  );

  useEffect(() => {
    let annullato = false;
    Promise.all([orariPronti(), automazioniPronte()])
      .then(() => { if (!annullato) setConfigLetta(true); });
    return () => { annullato = true; };
  }, []);

  // ─── Disponibilita' ────────────────────────────────────────────────────
  useEffect(() => {
    let annullato = false;
    if (vehicleIds.length === 0) { setCaricamento(false); return; }

    (async () => {
      setCaricamento(true);
      setErroreDisponibilita(false);
      try {
        const res = await fetchWithTimeout(
          `${FUNCTIONS_BASE}/.netlify/functions/getAvailabilityWindows`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vehicleIds,
              vehiclePlates,
              startDate: new Date().toISOString(),
              endDate: new Date(msDaYmdOra(orizzonteYmd, '23:59')).toISOString(),
            }),
          },
          15000,
        );
        if (!res.ok) throw new Error(String(res.status));
        const dati = await res.json();
        if (annullato) return;
        const intervalli: Intervallo[] = (dati.busyIntervals || []).map(
          (b: { start: string; end: string }) => ({
            start: new Date(b.start).getTime(),
            end: new Date(b.end).getTime(),
          }),
        );
        setOccupati(intervalli);
      } catch {
        if (!annullato) {
          // Niente calendario inventato: se la disponibilita' non si legge
          // si dice, e si lascia al cliente la ricerca normale. Mostrare
          // tutto libero porterebbe a prenotare un'auto gia' fuori.
          setErroreDisponibilita(true);
        }
      } finally {
        if (!annullato) setCaricamento(false);
      }
    })();

    return () => { annullato = true; };
  }, [vehicleIds, vehiclePlates, orizzonteYmd]);

  // ─── Prezzo (stessa funzione del wizard) ───────────────────────────────
  useEffect(() => {
    if (!ritiroYmd || !riconsegnaYmd || !ritiroOra || !riconsegnaOra) {
      setPrezzo(null);
      return;
    }
    const vehicleId = vehicleIds[0];
    if (!vehicleId) return;

    let annullato = false;
    setPrezzoInCorso(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetchWithTimeout(
          `${FUNCTIONS_BASE}/.netlify/functions/calculate-dynamic-price`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vehicle_id: vehicleId,
              pickup_date: `${ritiroYmd}T${ritiroOra}`,
              dropoff_date: `${riconsegnaYmd}T${riconsegnaOra}`,
            }),
          },
          10000,
        );
        if (annullato) return;
        setPrezzo(res.ok ? await res.json() : null);
      } catch {
        if (!annullato) setPrezzo(null);
      } finally {
        if (!annullato) setPrezzoInCorso(false);
      }
    }, 250);

    return () => { annullato = true; clearTimeout(timer); };
  }, [ritiroYmd, ritiroOra, riconsegnaYmd, riconsegnaOra, vehicleIds]);

  // ─── Selezione ─────────────────────────────────────────────────────────
  const limiteRiconsegna = useMemo(() => {
    if (!ritiroYmd || !ritiroOra) return orizzonteYmd;
    return ultimaRiconsegnaPossibile(ritiroYmd, ritiroOra, occupati, orizzonteYmd);
  }, [ritiroYmd, ritiroOra, occupati, orizzonteYmd]);

  const statoDi = useCallback((ymd: string): StatoGiorno => {
    // Fuori dalla scelta della riconsegna — e anche sui giorni PRIMA del
    // ritiro, dove il click deve poter far ripartire il periodo invece di
    // costringere al bottone "Ricomincia" — vale lo stato di ritiro.
    if (!ritiroYmd || riconsegnaYmd || ymd <= ritiroYmd) {
      return statoGiornoRitiro(ymd, oggiYmd, getPickupTimesForDateString(ymd), occupati);
    }
    if (ymd > limiteRiconsegna) return 'occupato';
    return statoGiornoRiconsegna(
      ymd, ritiroYmd, ritiroOra, getReturnTimesForDateString(ymd), occupati,
    );
  }, [ritiroYmd, ritiroOra, riconsegnaYmd, oggiYmd, occupati, limiteRiconsegna]);

  const scegliGiorno = (ymd: string) => {
    // Terza selezione (periodo gia' completo) o click su un giorno
    // precedente al ritiro: si ricomincia da questo giorno.
    if (!ritiroYmd || riconsegnaYmd || ymd <= ritiroYmd) {
      const slot = slotLiberi(ymd, getPickupTimesForDateString(ymd), occupati);
      if (slot.length === 0) return;
      setRitiroYmd(ymd);
      setRitiroOra(slot[0]);
      setRiconsegnaYmd('');
      setRiconsegnaOra('');
      return;
    }
    const slot = slotLiberi(ymd, getReturnTimesForDateString(ymd), occupati);
    if (slot.length === 0) return;
    setRiconsegnaYmd(ymd);
    setRiconsegnaOra(slot[0]);
  };

  const azzera = () => {
    setRitiroYmd(''); setRitiroOra(''); setRiconsegnaYmd(''); setRiconsegnaOra('');
  };

  const slotRitiro = ritiroYmd
    ? slotLiberi(ritiroYmd, getPickupTimesForDateString(ritiroYmd), occupati) : [];
  // Gli orari di riconsegna scartano anche quelli che farebbero
  // attraversare la prenotazione successiva.
  const slotRiconsegna = riconsegnaYmd && ritiroYmd
    ? slotLiberi(riconsegnaYmd, getReturnTimesForDateString(riconsegnaYmd), occupati)
      .filter((s) => {
        const prossimo = primoOccupatoDopo(msDaYmdOra(ritiroYmd, ritiroOra), occupati);
        return !prossimo || msDaYmdOra(riconsegnaYmd, s) <= prossimo.start;
      })
    : [];

  const giorni = ritiroYmd && riconsegnaYmd
    ? giorniFatturati(ritiroYmd, ritiroOra, riconsegnaYmd, riconsegnaOra, getLateReturnGraceMinutes())
    : 0;

  // Si moltiplica la tariffa giornaliera dinamica per i giorni FATTURATI,
  // non si usa `finalTotalEur`: la funzione conta i giorni con un
  // ceil(ore/24), il wizard con i giorni di calendario piu' la regola
  // della grace. Prendendo la tariffa e contando i giorni come il wizard,
  // il numero del popup e quello del passo successivo coincidono.
  const totale = prezzo?.enabled && typeof prezzo.finalDailyRateEur === 'number'
    ? prezzo.finalDailyRateEur * giorni
    : (item.pricePerDay?.eur || 0) * giorni;
  const alGiorno = giorni > 0 ? totale / giorni : 0;

  // ─── Passaggio al wizard ───────────────────────────────────────────────
  const vaiAlWizard = () => {
    if (!ritiroYmd || !riconsegnaYmd) return;
    setInitialSearchDates({
      pickupDate: ritiroYmd,
      pickupTime: ritiroOra,
      returnDate: riconsegnaYmd,
      returnTime: riconsegnaOra,
      pickupLocation: 'dr7_office',
      returnLocation: 'dr7_office',
    });
    openCarWizard(item, categoryContext);
    onClose();
  };

  // Esc chiude, come le altre finestre del sito.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nomiMesi = it ? MESI_IT : MESI_EN;
  const nomiGiorni = it ? GIORNI_IT : GIORNI_EN;
  const meseSuccessivo = new Date(mese.getFullYear(), mese.getMonth() + 1, 1);
  const puoIndietro = mese > new Date(oggi.getFullYear(), oggi.getMonth(), 1);
  const puoAvanti = meseSuccessivo < new Date(oggi.getFullYear(), oggi.getMonth() + MESI_ORIZZONTE, 1);

  const rendiMese = (m: Date) => {
    const celle = grigliaMese(m.getFullYear(), m.getMonth());
    return (
      <div key={`${m.getFullYear()}-${m.getMonth()}`} className="min-w-0 flex-1">
        <p className="mb-4 text-center font-serif text-[17px] tracking-[-0.01em] text-[color:var(--fg)]">
          {nomiMesi[m.getMonth()]} {m.getFullYear()}
        </p>
        <div className="mb-2 grid grid-cols-7 gap-px">
          {nomiGiorni.map((g) => (
            <div key={g} className="py-1 text-center text-[9px] uppercase tracking-[0.18em] text-[color:var(--fg-dim)]">
              {g}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px">
          {celle.map((ymd, i) => {
            if (!ymd) return <div key={`v-${i}`} className="aspect-square" />;
            const stato = statoDi(ymd);
            const numero = Number(ymd.slice(8));
            const eRitiro = ymd === ritiroYmd;
            const eRiconsegna = ymd === riconsegnaYmd;
            const nelPeriodo = !!ritiroYmd && !!riconsegnaYmd && ymd > ritiroYmd && ymd < riconsegnaYmd;
            const cliccabile = stato === 'libero';

            let classi = 'border border-transparent text-[color:var(--fg-dim)]';
            if (stato === 'occupato') {
              classi = 'border border-transparent bg-[rgba(246,243,237,0.05)] text-[rgba(246,243,237,0.22)] line-through';
            } else if (stato === 'chiuso' || stato === 'passato') {
              classi = 'border border-transparent text-[rgba(246,243,237,0.18)]';
            } else if (eRitiro || eRiconsegna) {
              classi = 'border border-[color:var(--fg)] bg-[color:var(--fg)] text-[color:var(--bg)]';
            } else if (nelPeriodo) {
              classi = 'border border-transparent bg-[rgba(246,243,237,0.14)] text-[color:var(--fg)]';
            } else {
              classi = 'border border-[color:var(--line)] text-[color:var(--fg)] hover:border-[color:var(--fg)]';
            }

            return (
              <button
                key={ymd}
                type="button"
                disabled={!cliccabile}
                onClick={() => scegliGiorno(ymd)}
                title={
                  stato === 'occupato' ? (it ? 'Non disponibile' : 'Not available')
                    : stato === 'chiuso' ? (it ? 'Chiuso' : 'Closed')
                      : undefined
                }
                className={`aspect-square text-[12px] transition-colors duration-200 ${classi} ${
                  cliccabile ? 'cursor-pointer' : 'cursor-not-allowed'
                }`}
              >
                {numero}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[320] flex items-start justify-center overflow-y-auto bg-black/92 p-4 py-10"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0, y: 12 }}
        transition={{ type: 'spring', duration: 0.4, bounce: 0.12 }}
        className="relative w-full max-w-[720px] border border-[color:var(--line)] bg-[color:var(--c-graphite)] p-6 sm:p-9"
        style={{ boxShadow: '0 40px 90px -40px rgba(0,0,0,0.9)' }}
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
      >
        <button
          onClick={onClose}
          aria-label={it ? 'Chiudi' : 'Close'}
          className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center border border-[color:var(--line)] text-[color:var(--fg-dim)] transition-colors duration-300 hover:border-[color:var(--line-strong)] hover:text-[color:var(--fg)]"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <p className="t-eyebrow">{it ? 'Disponibilita' : 'Availability'}</p>
        <h3 className="mt-3 pr-10 font-serif text-[26px] font-normal leading-tight tracking-[-0.01em] text-[color:var(--fg)]">
          {item.name}
        </h3>
        <p className="mt-3 text-[12px] text-[color:var(--fg-dim)]">
          {!ritiroYmd
            ? (it ? 'Scegli il giorno di ritiro.' : 'Pick your collection day.')
            : !riconsegnaYmd
              ? (it ? 'Ora scegli il giorno di riconsegna.' : 'Now pick your return day.')
              : (it ? 'Periodo selezionato.' : 'Period selected.')}
        </p>

        <span className="seam-line my-6 block" />

        {caricamento || !configLetta ? (
          <p className="py-12 text-center text-[12px] text-[color:var(--fg-dim)]">
            {it ? 'Lettura del calendario…' : 'Loading the calendar…'}
          </p>
        ) : erroreDisponibilita ? (
          <p className="py-12 text-center text-[12px] text-[color:var(--fg-dim)]">
            {it
              ? 'Calendario non disponibile in questo momento. Usa "Prenota Ora" per la ricerca per date.'
              : 'The calendar is unavailable right now. Use "Book Now" to search by dates.'}
          </p>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() - 1, 1))}
                disabled={!puoIndietro}
                aria-label={it ? 'Mese precedente' : 'Previous month'}
                className="flex h-8 w-8 items-center justify-center border border-[color:var(--line)] text-[color:var(--fg)] transition-colors duration-300 enabled:hover:border-[color:var(--fg)] disabled:opacity-25"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="t-eyebrow">
                {it ? 'Prossimi 12 mesi' : 'Next 12 months'}
              </span>
              <button
                type="button"
                onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() + 1, 1))}
                disabled={!puoAvanti}
                aria-label={it ? 'Mese successivo' : 'Next month'}
                className="flex h-8 w-8 items-center justify-center border border-[color:var(--line)] text-[color:var(--fg)] transition-colors duration-300 enabled:hover:border-[color:var(--fg)] disabled:opacity-25"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-8 sm:flex-row sm:gap-7">
              {rendiMese(mese)}
              <div className="hidden sm:block">{rendiMese(meseSuccessivo)}</div>
            </div>

            {/* Legenda: il cliente deve capire perche' un giorno e' spento. */}
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.16em] text-[color:var(--fg-dim)]">
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 border border-[color:var(--line)]" />
                {it ? 'Libero' : 'Available'}
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 bg-[rgba(246,243,237,0.08)]" />
                {it ? 'Gia prenotato' : 'Already booked'}
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 bg-transparent text-[rgba(246,243,237,0.18)]">—</span>
                {it ? 'Chiuso (domenica e festivi)' : 'Closed (Sundays & holidays)'}
              </span>
            </div>

            {/* Orari + prezzo: appaiono solo a periodo completo. */}
            {ritiroYmd && (
              <>
                <span className="seam-line my-7 block" />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="t-eyebrow">{it ? 'Ritiro' : 'Collection'}</span>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-[13px] text-[color:var(--fg)]">
                        {ritiroYmd.split('-').reverse().join('/')}
                      </span>
                      <select
                        value={ritiroOra}
                        onChange={(e) => {
                          setRitiroOra(e.target.value);
                          setRiconsegnaYmd(''); setRiconsegnaOra('');
                        }}
                        className="border border-[color:var(--line)] bg-transparent px-3 py-2 text-[13px] text-[color:var(--fg)] outline-none focus:border-[color:var(--fg)]"
                      >
                        {slotRitiro.map((s) => <option key={s} value={s} className="bg-[color:var(--c-graphite)]">{s}</option>)}
                      </select>
                    </div>
                  </label>

                  <label className="block">
                    <span className="t-eyebrow">{it ? 'Riconsegna' : 'Return'}</span>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-[13px] text-[color:var(--fg)]">
                        {riconsegnaYmd
                          ? riconsegnaYmd.split('-').reverse().join('/')
                          : <span className="text-[color:var(--fg-dim)]">{it ? 'da scegliere' : 'to pick'}</span>}
                      </span>
                      {riconsegnaYmd && (
                        <select
                          value={riconsegnaOra}
                          onChange={(e) => setRiconsegnaOra(e.target.value)}
                          className="border border-[color:var(--line)] bg-transparent px-3 py-2 text-[13px] text-[color:var(--fg)] outline-none focus:border-[color:var(--fg)]"
                        >
                          {slotRiconsegna.map((s) => <option key={s} value={s} className="bg-[color:var(--c-graphite)]">{s}</option>)}
                        </select>
                      )}
                    </div>
                  </label>
                </div>
              </>
            )}

            {ritiroYmd && riconsegnaYmd && (
              <div className="mt-7 border border-[color:var(--line)] p-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="t-eyebrow">{it ? 'Solo noleggio' : 'Rental only'}</p>
                    <p className="mt-2 text-[11px] text-[color:var(--fg-dim)]">
                      {giorni} {giorni === 1 ? (it ? 'giorno' : 'day') : (it ? 'giorni' : 'days')}
                      {alGiorno > 0 && <> — {euro(alGiorno)}{it ? '/giorno' : '/day'}</>}
                    </p>
                  </div>
                  <p className="font-serif text-[30px] leading-none tracking-[-0.01em] text-[color:var(--fg)]">
                    {prezzoInCorso ? '…' : totale > 0 ? euro(totale) : '—'}
                  </p>
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-[color:var(--fg-dim)]">
                  {it
                    ? 'Assicurazione, chilometri, extra e cauzione si scelgono nel passo successivo: il totale finale puo cambiare in base alle opzioni.'
                    : 'Insurance, mileage, extras and deposit are chosen in the next step: the final total may change with your options.'}
                </p>
              </div>
            )}

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={azzera}
                disabled={!ritiroYmd}
                className="btn btn-text self-start text-[color:var(--fg-dim)] disabled:opacity-30"
              >
                {it ? 'Ricomincia' : 'Reset'}
              </button>
              <button
                type="button"
                onClick={vaiAlWizard}
                disabled={!ritiroYmd || !riconsegnaYmd}
                className="btn btn-primary btn-sm w-full sm:w-auto"
              >
                {it ? 'Continua la prenotazione' : 'Continue booking'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

export default CalendarioDisponibilita;

/** Contenitore con animazione di uscita, comodo per le pagine. */
export const CalendarioDisponibilitaPortale: React.FC<{
  item: RentalItem | null;
  categoryContext: string;
  onClose: () => void;
}> = ({ item, categoryContext, onClose }) => (
  <AnimatePresence>
    {item && (
      <CalendarioDisponibilita item={item} categoryContext={categoryContext} onClose={onClose} />
    )}
  </AnimatePresence>
);
