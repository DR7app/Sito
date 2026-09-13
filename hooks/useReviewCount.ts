import { useEffect, useState } from 'react';
import { fetchGoogleReviews } from '../services/googleReviews';

/**
 * Il numero delle recensioni, una volta sola e da una fonte sola.
 *
 * 14/09/2026 — su piu' schermi il numero era scritto a mano ("317+"): le
 * recensioni nuove arrivavano, la cifra restava ferma e il sito raccontava
 * meno di quello che DR7 aveva davvero. Qui il conteggio arriva da Google
 * (Places, campo `user_ratings_total`), lo stesso che usa la vetrina delle
 * recensioni, e ogni testo che deve dirlo scrive `{reviewCount}` invece di
 * una cifra.
 *
 * Finche' la risposta non arriva si riparte dall'ultimo numero conosciuto,
 * tenuto sul browser di chi guarda (stessa chiave della vetrina, cosi' le
 * due sezioni non mostrano mai due numeri diversi). Se non si sa ancora
 * niente il valore e' `null`: chi lo usa NON inventa una cifra, toglie la
 * riga. Meglio un dato in meno che un dato vecchio.
 */

const CHIAVE_MEMORIA = 'dr7_recensioni_google';

function ultimoNumeroConosciuto(): number | null {
  try {
    const salvato = localStorage.getItem(CHIAVE_MEMORIA);
    if (salvato) {
      const v = JSON.parse(salvato) as { reviewCount?: number };
      if (typeof v?.reviewCount === 'number' && v.reviewCount > 0) return v.reviewCount;
    }
  } catch { /* browser senza memoria locale: si aspetta la rete */ }
  return null;
}

export function useReviewCount(): number | null {
  const [conteggio, setConteggio] = useState<number | null>(ultimoNumeroConosciuto);

  useEffect(() => {
    let annullato = false;
    fetchGoogleReviews()
      .then((data) => {
        const n = data.ratingSummary?.reviewCount;
        if (typeof n !== 'number' || n <= 0) return;
        if (!annullato) setConteggio(n);
        try { localStorage.setItem(CHIAVE_MEMORIA, JSON.stringify(data.ratingSummary)); } catch { /* niente */ }
      })
      .catch((err) => console.error('[useReviewCount] conteggio recensioni non disponibile:', err));
    return () => { annullato = true; };
  }, []);

  return conteggio;
}

/** Il testo contiene il segnaposto del conteggio? */
export function haSegnapostoRecensioni(testo: string): boolean {
  return testo.includes('{reviewCount}');
}

/**
 * Sostituisce `{reviewCount}` col numero vero. Se il numero non si conosce
 * torna `null`: chi chiama salta quella riga invece di stamparne una monca.
 */
export function risolviReviewCount(testo: string, conteggio: number | null): string | null {
  if (!haSegnapostoRecensioni(testo)) return testo;
  if (conteggio === null) return null;
  return testo.split('{reviewCount}').join(String(conteggio));
}
