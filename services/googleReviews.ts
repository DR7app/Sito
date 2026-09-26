import { supabase } from '../supabaseClient';
import { daRigaCache, piuRecentiPrima, type RigaRecensioneGoogle } from '../utils/recensioniGoogle';

export interface Review {
  author: string;
  rating: number;
  date: string;
  body: string;
  sourceUrl: string;
  /** true = recensione vera di Google (non una di quelle scritte a mano). */
  daGoogle?: boolean;
}

export interface RatingSummary {
  ratingValue: number;
  reviewCount: number;
}

export interface GoogleReviewsResponse {
  reviews: Review[];
  ratingSummary: RatingSummary;
  businessName: string;
}

const LINK_GOOGLE = 'https://share.google/o5c8DO8nmk3XMn0hF';
const QUANTE = 30;

/**
 * 26/09/2026 — Le recensioni arrivano dalla copia nel database
 * (google_reviews_cache + google_reviews_summary), che il gestionale aggiorna
 * ogni tre ore con le PIU' RECENTI. Prima il sito chiamava Google a ogni
 * visita e riceveva sempre le stesse 5 "piu' rilevanti".
 *
 * Riserva: se la copia non c'e' (migrazione non ancora eseguita) o e' vuota,
 * si chiede alla funzione get-google-reviews come prima. Il sito non resta mai
 * senza recensioni.
 */
async function daCopia(): Promise<GoogleReviewsResponse | null> {
  const [righe, sintesi] = await Promise.all([
    supabase.from('google_reviews_cache')
      .select('id, source, author, rating, text, published_at')
      .order('published_at', { ascending: false })
      .limit(QUANTE),
    supabase.from('google_reviews_summary').select('rating, total').eq('id', 'main').maybeSingle(),
  ]);
  if (righe.error || !righe.data?.length) return null;
  const reviews = piuRecentiPrima(
    (righe.data as RigaRecensioneGoogle[])
      .map(r => daRigaCache(r, LINK_GOOGLE))
      .filter((r): r is NonNullable<typeof r> => r !== null),
  );
  if (!reviews.length) return null;
  const s = sintesi.data as { rating?: number | null; total?: number | null } | null;
  return {
    reviews,
    ratingSummary: {
      ratingValue: Number(s?.rating) || 5,
      reviewCount: Number(s?.total) || 0,
    },
    businessName: 'DR7',
  };
}

async function daFunzione(): Promise<GoogleReviewsResponse> {
  const response = await fetch('/.netlify/functions/get-google-reviews?ordine=recenti');
  if (!response.ok) throw new Error(`Failed to fetch reviews: ${response.statusText}`);
  const data = await response.json() as GoogleReviewsResponse;
  return {
    ...data,
    reviews: piuRecentiPrima((data.reviews || []).map(r => ({ ...r, daGoogle: true }))),
  };
}

// Una sola lettura per pagina: vetrina e contatori ({reviewCount}) la condividono.
let inCorso: Promise<GoogleReviewsResponse> | null = null;

export function fetchGoogleReviews(): Promise<GoogleReviewsResponse> {
  if (!inCorso) {
    inCorso = (async () => {
      try {
        const copia = await daCopia();
        if (copia) return copia;
      } catch (err) {
        console.warn('[googleReviews] copia non disponibile, uso Google:', err);
      }
      return daFunzione();
    })().catch((error) => {
      inCorso = null; // la prossima richiesta riprova
      console.error('Error fetching Google reviews:', error);
      throw error;
    });
  }
  return inCorso;
}
