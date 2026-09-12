/**
 * Carrello del sito — tipi e regole comuni.
 *
 * Un articolo del carrello e' un servizio gia' configurato dal cliente
 * (veicolo, date, posti, servizio del lavaggio...) con dentro tutto quello
 * che serve a farlo nascere dopo il pagamento. Al momento del pagamento ogni
 * articolo riceve un suo ordine Nexi "figlio": la prenotazione, la ricarica o
 * l'iscrizione nascono esattamente come nascevano prima del carrello, cosi'
 * callback, gestionale, contratti e fatture non cambiano.
 */

export type TipoArticolo =
  | 'noleggio'
  | 'lavaggio'
  | 'meccanica'
  | 'tour'
  | 'club'
  | 'membership'
  | 'wallet';

export interface ArticoloCarrello {
  /** uuid della riga (o id locale per chi non ha ancora l'accesso). */
  id: string;
  tipo: TipoArticolo;
  titolo: string;
  sottotitolo?: string;
  immagine?: string;
  prezzoCents: number;
  /** Il carico utile: cambia per tipo, lo legge solo il checkout. */
  dati: Record<string, unknown>;
  creatoIl: string;
}

/** Articolo appena composto, prima di essere salvato. */
export type NuovoArticolo = Omit<ArticoloCarrello, 'id' | 'creatoIl'>;

export const CHIAVE_CARRELLO_LOCALE = 'dr7_carrello';

/** Oltre questo tempo il carrello e' di un'altra visita: si riparte puliti. */
export const SCADENZA_CARRELLO_MS = 24 * 60 * 60 * 1000;

/**
 * Articoli pagabili col Credit Wallet.
 *
 * La ricarica del wallet non puo' pagarsi col wallet, e Club e Membership
 * sono a sola carta (regola di sempre: l'abbonamento non si paga a credito).
 * Se nel carrello c'e' uno di questi, l'intero ordine va a carta.
 */
export const TIPI_PAGABILI_A_CREDITO: TipoArticolo[] = ['noleggio', 'lavaggio', 'meccanica', 'tour'];

export function carrelloPagabileACredito(articoli: ArticoloCarrello[]): boolean {
  return articoli.length > 0 && articoli.every(a => TIPI_PAGABILI_A_CREDITO.includes(a.tipo));
}

export function totaleCarrelloCents(articoli: ArticoloCarrello[]): number {
  return articoli.reduce((somma, a) => somma + (Number(a.prezzoCents) || 0), 0);
}

/** Etichetta del servizio, nella lingua del sito. */
export function etichettaTipo(tipo: TipoArticolo, lang: 'it' | 'en'): string {
  const nomi: Record<TipoArticolo, { it: string; en: string }> = {
    noleggio: { it: 'Noleggio', en: 'Rental' },
    lavaggio: { it: 'Lavaggio', en: 'Car wash' },
    meccanica: { it: 'Meccanica', en: 'Mechanical' },
    tour: { it: 'Tour', en: 'Tour' },
    club: { it: 'DR7 Club', en: 'DR7 Club' },
    membership: { it: 'Membership', en: 'Membership' },
    wallet: { it: 'Credit Wallet', en: 'Credit Wallet' },
  };
  return nomi[tipo][lang];
}

/**
 * Ordine Nexi del carrello e ordini figli.
 *
 * `DR7C…` marca l'ordine padre (quello davvero pagato); i figli aggiungono
 * `-1`, `-2`… ma senza trattino, perche' create-nexi-payment ripulisce
 * l'ordine dai caratteri non alfanumerici e due ordini devono restare
 * diversi anche dopo quella ripulita.
 */
export function nuovoOrdineCarrello(): string {
  return `DR7C${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

export function ordineFiglio(ordinePadre: string, indice: number): string {
  return `${ordinePadre}S${indice + 1}`;
}

export function euro(cents: number): string {
  return `€${((Number(cents) || 0) / 100).toFixed(2)}`;
}
