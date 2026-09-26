// Interruttori del System Control visti dal sito: prenotazioni e pagamenti
// possono essere sospesi dalla direzione (per tutti o per un solo business).
// Lettura "fail-open": se l'endpoint non risponde, il servizio e' aperto
// (il database rifiuta comunque le prenotazioni quando sono sospese).

export type BusinessSito = 'terra' | 'mare' | 'aria' | 'soggiorni' | 'lavaggio';

export interface StatoServizi {
  prenotazioni: { attiva: boolean; messaggio: string | null };
  pagamenti: { attiva: boolean; messaggio: string | null };
}

export const STATO_APERTO: StatoServizi = {
  prenotazioni: { attiva: true, messaggio: null },
  pagamenti: { attiva: true, messaggio: null },
};

const BASE =
  (import.meta as { env?: Record<string, string> }).env?.VITE_FUNCTIONS_BASE ??
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8888'
    : (typeof window !== 'undefined' ? window.location.origin : ''));

const inCorso = new Map<string, Promise<StatoServizi>>();

/** Una lettura per business per caricamento di pagina. */
export function leggiStatoServizi(business: BusinessSito): Promise<StatoServizi> {
  let p = inCorso.get(business);
  if (!p) {
    p = fetch(`${BASE}/.netlify/functions/stato-servizi?business=${business}`)
      .then(r => (r.ok ? r.json() : STATO_APERTO))
      .then((d: Partial<StatoServizi>) => ({
        prenotazioni: d?.prenotazioni ?? STATO_APERTO.prenotazioni,
        pagamenti: d?.pagamenti ?? STATO_APERTO.pagamenti,
      }))
      .catch(() => STATO_APERTO);
    inCorso.set(business, p);
  }
  return p;
}

// Prefissi dei messaggi con cui il database rifiuta una prenotazione:
//  - PRENOTAZIONI_SOSPESE: il System Control le ha sospese;
//  - PROMO_NON_VALIDA: la promozione e' scaduta, esaurita, su un altro veicolo
//    o con un prezzo che non torna (trigger trg_01_promozione_valida).
// Il testo dopo il prefisso e' gia' scritto per il cliente.
const PREFISSI_CLIENTE: { prefisso: string; ripiego: string }[] = [
  { prefisso: 'PRENOTAZIONI_SOSPESE:', ripiego: 'Le prenotazioni online sono momentaneamente sospese.' },
  { prefisso: 'PROMO_NON_VALIDA:', ripiego: 'La promozione non e piu valida per questa prenotazione.' },
];

/**
 * Se l'errore del database e' uno di quelli scritti per il cliente
 * (prenotazioni sospese, promozione non valida), il testo da mostrare;
 * altrimenti null.
 */
export function testoPrenotazioniSospese(err: unknown): string | null {
  const msg = typeof err === 'string' ? err : String((err as { message?: string } | null)?.message ?? '');
  for (const { prefisso, ripiego } of PREFISSI_CLIENTE) {
    const i = msg.indexOf(prefisso);
    if (i >= 0) return msg.slice(i + prefisso.length).trim() || ripiego;
  }
  return null;
}
