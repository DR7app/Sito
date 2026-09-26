// Recensioni Google lette dalla copia nel database (google_reviews_cache),
// aggiornata ogni tre ore dal gestionale (sync-google-reviews-cron).
//
// 26/09/2026 — prima il sito chiamava Google a ogni visita e riceveva le 5
// recensioni "piu' rilevanti" scelte da Google, mai le ultime. Ora legge le
// piu' recenti dalla copia; Google resta solo come riserva.
//
// Qui solo funzioni pure (niente rete), cosi' si provano con `npm test`.

export interface RigaRecensioneGoogle {
  id: string;
  source: string;
  author: string | null;
  rating: number | null;
  text: string | null;
  published_at: string | null;
  reply?: string | null;
}

export interface RecensioneSito {
  author: string;
  rating: number;
  date: string;
  body: string;
  sourceUrl: string;
  /** true = arriva da Google (serve ai dati strutturati per i motori di ricerca). */
  daGoogle?: boolean;
}

/** Riga della copia -> recensione mostrata dal sito. Righe senza testo scartate. */
export function daRigaCache(r: RigaRecensioneGoogle, linkGoogle: string): RecensioneSito | null {
  const testo = (r.text || '').trim();
  if (!testo) return null;
  return {
    author: (r.author || '').trim() || 'Cliente Google',
    rating: Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5))),
    date: (r.published_at || '').slice(0, 10),
    body: testo,
    sourceUrl: linkGoogle,
    daGoogle: true,
  };
}

/** Le piu' recenti prima; a parita' di data l'ordine di arrivo resta. */
export function piuRecentiPrima<T extends { date: string }>(lista: T[]): T[] {
  return lista
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.date || '').localeCompare(a.r.date || '') || a.i - b.i)
    .map(x => x.r);
}

/**
 * Chiave anti-doppione: la stessa recensione puo' arrivare da Google Business
 * (con il suo id) e da Google Maps (senza id). Autore + giorno + stelle la
 * riconoscono in entrambi i casi. Stessa regola del gestionale
 * (netlify/functions/utils/recensioniGoogle.ts in DR7-AI).
 */
export function chiaveRecensione(autore: string | null | undefined, pubblicata: string | Date | null | undefined, stelle: number | null | undefined): string {
  const nome = String(autore || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const d = pubblicata ? new Date(pubblicata) : null;
  const giorno = d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : 'senza-data';
  return `${nome}|${giorno}|${Math.round(Number(stelle) || 0)}`;
}
