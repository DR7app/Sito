/**
 * seatPlan — pianta dei sedili dell'abitacolo, senza interfaccia.
 *
 * Serve ai servizi Prime Wash venduti "a sedile" (PRIME SEAT CLEAN, PRIME
 * SEAT PROTECT): prima si sceglieva solo QUANTI sedili con un +/- nel
 * carrello e in officina nessuno sapeva QUALI.
 *
 * Sta separato dal componente (components/ui/SeatPlanPicker.tsx) perche' le
 * sigle finiscono su prenotazione, WhatsApp e riepiloghi: le leggono anche
 * file che non devono tirarsi dietro React. E cosi' si testa senza DOM.
 */

/** Un sedile della pianta. `id` e' la sigla salvata sulla prenotazione. */
export interface SeatSpot {
  id: string;
  /** Sigla mostrata dentro il sedile. */
  shortIt: string;
  shortEn: string;
  labelIt: string;
  labelEn: string;
  /** Posizione orizzontale in percentuale sul riquadro della pianta. */
  x: number;
  /** Fila: la posizione verticale dipende da quante file sono visibili,
   *  quindi si calcola invece di essere scritta qui. */
  row: 1 | 2 | 3;
}

/**
 * Disposizione standard: 2 davanti + 3 dietro, piu' una terza fila
 * opzionale da 2 per monovolume e SUV a 7 posti.
 */
export const SEAT_LAYOUT: SeatSpot[] = [
  { id: 'AS', shortIt: 'AS', shortEn: 'FL', labelIt: 'Guidatore',            labelEn: 'Driver',          x: 33, row: 1 },
  { id: 'AD', shortIt: 'AD', shortEn: 'FR', labelIt: 'Passeggero anteriore', labelEn: 'Front passenger', x: 67, row: 1 },
  { id: 'PS', shortIt: 'PS', shortEn: 'RL', labelIt: 'Posteriore sinistro',  labelEn: 'Rear left',       x: 26, row: 2 },
  { id: 'PC', shortIt: 'PC', shortEn: 'RC', labelIt: 'Posteriore centrale',  labelEn: 'Rear centre',     x: 50, row: 2 },
  { id: 'PD', shortIt: 'PD', shortEn: 'RR', labelIt: 'Posteriore destro',    labelEn: 'Rear right',      x: 74, row: 2 },
  { id: 'TS', shortIt: 'TS', shortEn: 'TL', labelIt: 'Terza fila sinistra',  labelEn: 'Third row left',  x: 33, row: 3 },
  { id: 'TD', shortIt: 'TD', shortEn: 'TR', labelIt: 'Terza fila destra',    labelEn: 'Third row right', x: 67, row: 3 },
];

/** Altezza in percentuale di ogni fila: la vettura si "allunga" a 7 posti. */
export const ROW_Y: Record<'5' | '7', Record<1 | 2 | 3, number>> = {
  '5': { 1: 35, 2: 65, 3: 0 },
  '7': { 1: 27, 2: 52, 3: 77 },
};

/** Etichetta estesa di una sigla, per riepiloghi e messaggi. */
export function seatLabel(id: string, lang: string): string {
  const s = SEAT_LAYOUT.find(x => x.id === id);
  if (!s) return id;              // sigla sconosciuta: si mostra com'e'
  return lang === 'en' ? s.labelEn : s.labelIt;
}

/**
 * Riordina e ripulisce una selezione: ordine della pianta, niente duplicati,
 * niente sigle inesistenti. Le prenotazioni vecchie o un dato manomesso non
 * devono far comparire righe strane nei riepiloghi.
 */
export function normalizeSeats(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const wanted = new Set(ids.filter((x): x is string => typeof x === 'string'));
  return SEAT_LAYOUT.filter(s => wanted.has(s.id)).map(s => s.id);
}

/** Elenco leggibile: "Guidatore, Posteriore destro". */
export function seatListLabel(ids: string[], lang: string, sep = ', '): string {
  return normalizeSeats(ids).map(id => seatLabel(id, lang)).join(sep);
}

/**
 * Un servizio si vende a sedile quando il catalogo lo dice nell'unita' di
 * prezzo (`price_unit` = "a sedile" / "per seat"). Non c'e' una lista di id
 * scritta nel codice: un nuovo servizio a sedile creato dall'admin apre la
 * pianta da solo.
 */
export function isSeatPricedUnit(priceUnit?: string | null): boolean {
  return /sedil|seat/i.test(priceUnit || '');
}

/**
 * Un servizio si vende a sedile se lo dice l'unita' di prezzo del catalogo
 * ("a sedile" / "per seat") OPPURE se lo dice il nome (PRIME SEAT CLEAN,
 * PRIME SEAT PROTECT, "lavaggio sedili").
 *
 * Il nome serve davvero: in catalogo quei due servizi hanno price_unit
 * "Qta'", quindi con la sola unita' la pianta non si apriva mai. Cosi'
 * funziona con il catalogo di oggi e continua a funzionare se domani
 * l'unita' viene scritta per bene.
 */
export function isSeatPricedService(name?: string | null, priceUnit?: string | null): boolean {
  return isSeatPricedUnit(priceUnit) || /\bseats?\b|sedil/i.test(name || '');
}
