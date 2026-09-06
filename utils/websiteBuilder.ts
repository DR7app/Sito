/**
 * websiteBuilder.ts — il sito legge la configurazione pubblicata.
 *
 * UNA sola chiamata per tutto il sito: la RPC `wb_public_site` restituisce
 * l'istantanea completa dell'ultima pubblicazione (pagine, tema, menu,
 * popup, integrazioni). Non c'e' una query per sezione, per immagine o per
 * pulsante — sarebbe il modo piu' rapido per rallentare il sito.
 *
 * Tre difese contro le regressioni, tutte volute:
 *  1. se la migrazione non e' stata eseguita o la RPC fallisce, la
 *     funzione restituisce `null` e il sito si comporta esattamente come
 *     prima: le pagine React esistenti restano al loro posto;
 *  2. una pagina del builder prende il posto di una rotta esistente solo
 *     se ha `overrides_route` acceso;
 *  3. l'istantanea viene tenuta in memoria per la sessione e in
 *     `sessionStorage`, cosi' il passaggio da una pagina all'altra non
 *     ripete la richiesta.
 */

import { supabase } from '../supabaseClient';
import type {
  WbSnapshot, WbSnapshotPage, WbTheme, WbOverlay, WbScript, WbLocale,
} from '../components/website/wbSchema';

const CHIAVE_SITO = 'dr7';
const TENANT = 'dr7';
const CACHE_KEY = 'dr7-wb-snapshot-v1';
/** L'istantanea cambia solo quando qualcuno pubblica: 5 minuti bastano. */
const CACHE_MS = 5 * 60 * 1000;

let inMemoria: Promise<WbSnapshot | null> | null = null;

interface Cache {
  at: number;
  snapshot: WbSnapshot | null;
}

function leggiCache(): WbSnapshot | null | undefined {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const c = JSON.parse(raw) as Cache;
    if (Date.now() - c.at > CACHE_MS) return undefined;
    return c.snapshot;
  } catch {
    return undefined;
  }
}

function scriviCache(snapshot: WbSnapshot | null): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), snapshot } satisfies Cache));
  } catch {
    /* sessionStorage pieno o disabilitato: si continua senza cache. */
  }
}

/** L'istantanea pubblicata. `null` = il builder non serve questo sito. */
export function caricaSitoBuilder(): Promise<WbSnapshot | null> {
  if (inMemoria) return inMemoria;

  const daCache = leggiCache();
  if (daCache !== undefined) {
    inMemoria = Promise.resolve(daCache);
    return inMemoria;
  }

  inMemoria = (async () => {
    try {
      const { data, error } = await supabase.rpc('wb_public_site', {
        p_key: CHIAVE_SITO,
        p_tenant: TENANT,
      });
      if (error) {
        // Migrazione non eseguita, permessi, rete: in tutti i casi il sito
        // continua con le sue pagine originali.
        console.warn('[wb] configurazione non disponibile:', error.message);
        scriviCache(null);
        return null;
      }
      const snap = (data as WbSnapshot) || null;
      scriviCache(snap);
      return snap;
    } catch (e) {
      console.warn('[wb] configurazione non disponibile', e);
      scriviCache(null);
      return null;
    }
  })();

  return inMemoria;
}

/** Ricarica forzata: usata dall'anteprima e dopo una pubblicazione. */
export function invalidaSitoBuilder(): void {
  inMemoria = null;
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* niente */ }
}

// ─── Regole di scelta ───────────────────────────────────────────────────────
// Vivono in `websiteBuilderRules.ts`: pure, senza rete, con i loro test.
export {
  pagineVisibili,
  paginaPerPercorso,
  temaAttivo,
  impostazioniSito,
  overlayAttivi,
  scriptAttivi,
  usaHeaderBuilder,
  usaFooterBuilder,
} from './websiteBuilderRules';

export type { WbSnapshot, WbSnapshotPage, WbTheme, WbOverlay, WbScript, WbLocale };
