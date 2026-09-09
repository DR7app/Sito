/**
 * CalendarioLavaggio — scelta di giorno e orario per il lavaggio.
 *
 * 09/09/2026 — il lavaggio aveva un calendario tutto suo, che partiva
 * dall'orario e poi mostrava i giorni. Era l'unico posto del sito fatto
 * cosi': Terra, Mare e Casa aprono un calendario a mese, si sceglie il
 * giorno e sotto compaiono gli orari liberi. Ora anche il lavaggio usa
 * QUELLO (CalendarioGiornoOrario): un solo calendario per tutto il sito.
 *
 * Qui resta soltanto quello che il lavaggio ha di suo: quali orari sono
 * davvero liberi in un dato giorno. Gli orari di apertura sono quelli di
 * Centralina Pro > Orari Lavaggio, e la disponibilita' resta
 * "intelligente": un lavaggio da 45 minuti e un carrello da due ore e
 * mezza non hanno gli stessi orari possibili, perche' il servizio deve
 * entrare INTERO in una finestra di apertura e non accavallarsi a quello
 * che e' gia' preso.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import {
  generateLavaggioSlotsForDate,
  getDayHours,
  orariLavaggioPronti,
} from '../../utils/lavaggioHours';
import { valutaSlot, type PrenotazioneLavaggio } from '../../utils/lavaggioSlotRules';
import CalendarioGiornoOrario, { ymdLocale } from './CalendarioGiornoOrario';

/** Quanti giorni avanti si puo' prenotare. */
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
  dataIniziale?: string;
  oraIniziale?: string;
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
  aperto, onClose, durataMinuti, minDate, bloccato, onConferma, dataIniziale, oraIniziale,
}) => {
  const [prenotazioni, setPrenotazioni] = useState<PrenotazioneLavaggio[]>([]);

  // Le prenotazioni di tutto l'orizzonte in UNA lettura: servono per spegnere
  // nel calendario i giorni in cui non entra piu' niente.
  useEffect(() => {
    if (!aperto) return;
    let vivo = true;
    (async () => {
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
        // proposta da confermare che un calendario tutto spento.
        console.warn('[CalendarioLavaggio] prenotazioni non lette:', err);
      }
    })();
    return () => { vivo = false; };
  }, [aperto]);

  /** L'ultimo giorno prenotabile: oltre l'orizzonte non si guarda. */
  const maxDate = useMemo(() => {
    const fine = new Date();
    fine.setDate(fine.getDate() + GIORNI_ORIZZONTE);
    return ymdLocale(fine);
  }, [aperto]);

  /** Gli orari davvero liberi di un giorno, con le regole del lavaggio. */
  const orariDelGiorno = useCallback((ymd: string): string[] => {
    if (ymd < minDate || ymd > maxDate) return [];
    if (bloccato?.(ymd)) return [];
    const giorno = new Date(`${ymd}T12:00:00`);
    const finestre = getDayHours(giorno).windows || [];
    if (finestre.length === 0) return [];
    const adesso = new Date();
    const dellaGiornata = prenotazioni.filter((p) => p.data === ymd);
    return generateLavaggioSlotsForDate(giorno).filter((ora) => valutaSlot(ora, {
      finestre,
      prenotazioni: dellaGiornata,
      durataMinuti,
      oggi: ymd === ymdLocale(adesso),
      minutiAdesso: adesso.getHours() * 60 + adesso.getMinutes(),
      preavvisoMinuti: PREAVVISO_MINUTI,
    }).disponibile);
  }, [minDate, maxDate, bloccato, prenotazioni, durataMinuti]);

  const durataTesto = durataMinuti >= 60
    ? `${Math.floor(durataMinuti / 60)}h${durataMinuti % 60 ? ` ${durataMinuti % 60}min` : ''}`
    : `${durataMinuti} min`;

  return (
    <CalendarioGiornoOrario
      aperto={aperto}
      onClose={onClose}
      minDate={minDate}
      maxDate={maxDate}
      orariDelGiorno={orariDelGiorno}
      attendiOrari={orariLavaggioPronti}
      dataIniziale={dataIniziale}
      oraIniziale={oraIniziale}
      titolo={{ it: 'Scegli il giorno', en: 'Pick your day' }}
      sottotitolo={{
        it: `Poi ti mostriamo gli orari liberi di quel giorno. Servizio da ${durataTesto}.`,
        en: `We then show the times free on that day. Service takes ${durataTesto}.`,
      }}
      onConferma={onConferma}
    />
  );
};

export default CalendarioLavaggio;
