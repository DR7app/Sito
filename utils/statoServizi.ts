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

// Prefisso del messaggio con cui il database rifiuta una prenotazione quando
// il System Control le ha sospese (trigger su bookings).
const PREFISSO_SOSPESE = 'PRENOTAZIONI_SOSPESE:';

/** Se l'errore e' "prenotazioni sospese", il testo da mostrare al cliente; altrimenti null. */
export function testoPrenotazioniSospese(err: unknown): string | null {
  const msg = typeof err === 'string' ? err : String((err as { message?: string } | null)?.message ?? '');
  const i = msg.indexOf(PREFISSO_SOSPESE);
  if (i < 0) return null;
  return msg.slice(i + PREFISSO_SOSPESE.length).trim() || 'Le prenotazioni online sono momentaneamente sospese.';
}
