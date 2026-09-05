/**
 * Regole pure del calendario disponibilita' (popup Flotta).
 *
 * Nessun import di proposito: il file e' testabile con `npm test`
 * (node --test, niente rete, niente React). Stessa convenzione di
 * `flottaRules.ts`.
 *
 * Le REGOLE DI BUSINESS qui dentro devono restare identiche a quelle
 * gia' applicate da CarBookingWizard, altrimenti il popup mostra un
 * prezzo o dei giorni che il wizard poi contraddice:
 *
 *  - giorni fatturati = differenza di giorni di CALENDARIO, piu' un
 *    giorno se la riconsegna avviene dopo (ora di ritiro - grace).
 *    Vedi CarBookingWizard `billingDays` e utils/bookingValidation
 *    `getLateReturnGraceMinutes()`.
 *  - noleggio minimo 1 giorno: la riconsegna deve cadere ALMENO il
 *    giorno dopo il ritiro (stessa validazione del wizard).
 *  - domeniche e festivi chiusi: qui non si decide, arriva gia' dagli
 *    slot orari (utils/noleggioHours restituisce [] se chiuso).
 */

/** Intervallo occupato, in millisecondi epoch. */
export interface Intervallo {
  start: number;
  end: number;
}

/** Stato di una casella del calendario. */
export type StatoGiorno = 'passato' | 'chiuso' | 'occupato' | 'libero';

/** 'YYYY-MM-DD' di una data, in ora LOCALE (mai toISOString: sposta di un giorno). */
export function ymdLocale(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
}

/** Millisecondi locali di 'YYYY-MM-DD' + 'HH:MM'. */
export function msDaYmdOra(ymd: string, hm: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = (hm || '00:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0).getTime();
}

/** True se l'istante cade dentro un intervallo occupato. */
export function istanteOccupato(ms: number, occupati: Intervallo[]): boolean {
  for (const o of occupati) {
    if (ms >= o.start && ms < o.end) return true;
  }
  return false;
}

/** True se [inizio, fine) tocca almeno un intervallo occupato. */
export function periodoOccupato(inizio: number, fine: number, occupati: Intervallo[]): boolean {
  for (const o of occupati) {
    if (inizio < o.end && fine > o.start) return true;
  }
  return false;
}

/**
 * Gli slot del giorno che NON cadono dentro un periodo occupato.
 *
 * E' qui che il buffer post-noleggio fa il suo lavoro: se un'auto
 * rientra alle 09:00 e il buffer e' 90 minuti, gli slot delle 10:30 in
 * poi restano liberi e il giorno resta prenotabile — invece di
 * cancellare l'intera giornata come farebbe un controllo "il giorno
 * tocca una prenotazione".
 */
export function slotLiberi(ymd: string, slot: string[], occupati: Intervallo[]): string[] {
  return slot.filter((s) => !istanteOccupato(msDaYmdOra(ymd, s), occupati));
}

/** Il primo periodo occupato che inizia da `ms` in poi (null se nessuno). */
export function primoOccupatoDopo(ms: number, occupati: Intervallo[]): Intervallo | null {
  let scelto: Intervallo | null = null;
  for (const o of occupati) {
    if (o.start >= ms && (scelto === null || o.start < scelto.start)) scelto = o;
  }
  return scelto;
}

/**
 * Giorni fatturati — stessa formula di CarBookingWizard.
 *
 * giorni di calendario (ritiro -> riconsegna), minimo 1; +1 se l'ora di
 * riconsegna supera (ora di ritiro - grace), perche' l'auto rientra
 * troppo tardi per essere rinoleggiata quel giorno.
 */
export function giorniFatturati(
  ritiroYmd: string,
  ritiroOra: string,
  riconsegnaYmd: string,
  riconsegnaOra: string,
  graceMinuti: number,
): number {
  const p = msDaYmdOra(ritiroYmd, ritiroOra);
  const r = msDaYmdOra(riconsegnaYmd, riconsegnaOra);
  if (!(p < r)) return 0;

  const pMezzanotte = msDaYmdOra(ritiroYmd, '00:00');
  const rMezzanotte = msDaYmdOra(riconsegnaYmd, '00:00');
  const giorniCalendario = Math.round((rMezzanotte - pMezzanotte) / 86400000);

  let giorni = Math.max(1, giorniCalendario);
  const [ph, pm] = ritiroOra.split(':').map(Number);
  const [rh, rm] = riconsegnaOra.split(':').map(Number);
  const sogliaRitardo = (ph * 60 + pm) - graceMinuti;
  if (giorniCalendario > 0 && (rh * 60 + rm) > sogliaRitardo) giorni += 1;
  return giorni;
}

/**
 * Griglia di un mese, settimane che iniziano di LUNEDI'.
 * Le caselle prima del giorno 1 e dopo l'ultimo sono `null`.
 */
export function grigliaMese(anno: number, mese0: number): Array<string | null> {
  const primo = new Date(anno, mese0, 1);
  const ultimo = new Date(anno, mese0 + 1, 0);
  let offset = primo.getDay() - 1;
  if (offset === -1) offset = 6; // domenica -> ultima colonna
  const celle: Array<string | null> = [];
  for (let i = 0; i < offset; i++) celle.push(null);
  for (let g = 1; g <= ultimo.getDate(); g++) {
    celle.push(`${anno}-${String(mese0 + 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`);
  }
  while (celle.length % 7 !== 0) celle.push(null);
  return celle;
}

/**
 * Stato della casella per la scelta del RITIRO.
 *
 * `chiuso` e `occupato` sono distinti apposta: al cliente va detto
 * perche' non puo' cliccare (siamo chiusi vs. l'auto e' gia' fuori).
 *
 * Non basta che il giorno abbia uno slot libero: siccome il noleggio
 * minimo e' 1 giorno, la finestra libera che parte da quello slot deve
 * arrivare almeno al giorno dopo. Caso reale (Huracan Performante,
 * 09/09/2026): l'auto esce alle 10:30, i ritiri aprono alle 10:00 —
 * lo slot delle 10:00 e' libero ma non porta da nessuna parte, e il
 * cliente si trovava un giorno cliccabile senza nessuna riconsegna
 * possibile. Si guardano TUTTI gli slot: basta che UNO apra una
 * finestra che scavalca la mezzanotte.
 */
export function statoGiornoRitiro(
  ymd: string,
  oggiYmd: string,
  slotRitiro: string[],
  occupati: Intervallo[],
): StatoGiorno {
  if (ymd < oggiYmd) return 'passato';
  if (slotRitiro.length === 0) return 'chiuso';

  if (slotRitiroUtili(ymd, slotRitiro, occupati).length === 0) return 'occupato';
  return 'libero';
}

/**
 * Gli slot di ritiro davvero utilizzabili: liberi E con davanti una
 * finestra che arriva almeno al giorno dopo (noleggio minimo 1 giorno).
 *
 * E' la stessa condizione di `statoGiornoRitiro`, esposta a parte perche'
 * la tendina degli orari non deve proporre un orario che poi non porta a
 * nessuna riconsegna possibile.
 */
export function slotRitiroUtili(
  ymd: string,
  slotRitiro: string[],
  occupati: Intervallo[],
): string[] {
  return slotLiberi(ymd, slotRitiro, occupati).filter((s) => {
    const prossimo = primoOccupatoDopo(msDaYmdOra(ymd, s), occupati);
    return !prossimo || ymdLocale(new Date(prossimo.start)) > ymd;
  });
}

/**
 * Stato della casella per la scelta della RICONSEGNA, dato un ritiro.
 *
 * Regole, in ordine:
 *  1. minimo 1 giorno -> la riconsegna non puo' essere il giorno stesso;
 *  2. chiusi -> niente slot di riconsegna;
 *  3. l'auto deve restare libera per TUTTO il periodo: se una
 *     prenotazione inizia in mezzo, quel giorno e tutti i successivi
 *     non sono selezionabili.
 */
export function statoGiornoRiconsegna(
  ymd: string,
  ritiroYmd: string,
  ritiroOra: string,
  slotRiconsegna: string[],
  occupati: Intervallo[],
): StatoGiorno {
  if (ymd <= ritiroYmd) return 'passato';
  if (slotRiconsegna.length === 0) return 'chiuso';

  const liberi = slotLiberi(ymd, slotRiconsegna, occupati);
  if (liberi.length === 0) return 'occupato';

  const inizio = msDaYmdOra(ritiroYmd, ritiroOra);
  // Il primo slot libero e' quello che accorcia di piu' il periodo:
  // se nemmeno lui sta dentro una finestra pulita, nessuno lo fa.
  const fine = msDaYmdOra(ymd, liberi[0]);
  if (periodoOccupato(inizio, fine, occupati)) return 'occupato';
  return 'libero';
}

/**
 * Ultimo giorno selezionabile come riconsegna: il giorno prima che
 * inizi la prossima prenotazione. Serve a fermare la selezione a
 * trascinamento sul calendario.
 */
export function ultimaRiconsegnaPossibile(
  ritiroYmd: string,
  ritiroOra: string,
  occupati: Intervallo[],
  orizzonteYmd: string,
): string {
  const prossimo = primoOccupatoDopo(msDaYmdOra(ritiroYmd, ritiroOra), occupati);
  if (!prossimo) return orizzonteYmd;
  const limite = ymdLocale(new Date(prossimo.start));
  return limite < orizzonteYmd ? limite : orizzonteYmd;
}
