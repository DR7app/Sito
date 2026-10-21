import { supabase } from '../supabaseClient';

/**
 * 21/10/2026 — Storico accessi e pagine visitate (Report Sito del gestionale).
 *
 * Prima il report leggeva solo l'ULTIMO accesso di ogni account: un cliente
 * collegato ieri e oggi compariva una volta. Qui ogni visita e' una riga.
 *
 * Regole (GDPR, decise dalla direzione):
 *  - cliente collegato: la visita si registra sempre (storico accessi);
 *  - pagine visitate: SOLO con consenso ai cookie (dr7-cookie-consent=true);
 *  - anonimo senza consenso: niente di niente.
 * Una visita finisce dopo 30 minuti senza attivita'. Si registra solo il
 * percorso della pagina, mai la query (puo' contenere token e codici).
 * user_id lo mette il database (auth.uid()): dal browser non si sceglie.
 */

const CHIAVE_VISITA = 'dr7_visita';
const INATTIVITA_MS = 30 * 60 * 1000;
const BATTITO_MS = 5 * 60 * 1000;
const PERCORSI_ESCLUSI = ['/reset-password', '/firma'];

let disattivato = false; // funzioni assenti nel database (migrazione non ancora applicata)
let registrata = '';
let ultimoBattito = 0;

function consensoStatistiche(): boolean {
  try { return localStorage.getItem('dr7-cookie-consent') === 'true'; } catch { return false; }
}

function nuovoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Visita in corso, condivisa fra le schede; nuova dopo 30 minuti di pausa. */
function visitaCorrente(): string {
  const adesso = Date.now();
  try {
    const salvata = JSON.parse(localStorage.getItem(CHIAVE_VISITA) || 'null') as { id?: string; ts?: number } | null;
    const id = salvata?.id && salvata.ts && adesso - salvata.ts < INATTIVITA_MS ? salvata.id : nuovoId();
    localStorage.setItem(CHIAVE_VISITA, JSON.stringify({ id, ts: adesso }));
    return id;
  } catch {
    return registrata.split('|')[0] || nuovoId();
  }
}

function dispositivo(): string {
  const w = window.innerWidth;
  return w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
}

/** Da dove arriva: utm_source, altrimenti il sito di provenienza, altrimenti "diretto". */
function provenienza(): string {
  try {
    const utm = new URLSearchParams(window.location.search).get('utm_source');
    if (utm) return utm.toLowerCase();
    if (document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (host && host !== window.location.hostname.replace(/^www\./, '')) return host;
    }
  } catch { /* ignora */ }
  return 'diretto';
}

function funzioneMancante(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message || ''));
}

export async function tracciaPagina(percorso: string, userId: string | null): Promise<void> {
  if (disattivato || typeof window === 'undefined') return;
  if (PERCORSI_ESCLUSI.some(p => percorso.startsWith(p))) return;
  const consenso = consensoStatistiche();
  if (!consenso && !userId) return;

  const visita = visitaCorrente();
  const chiave = `${visita}|${userId || ''}|${consenso}`;
  try {
    if (chiave !== registrata || Date.now() - ultimoBattito > BATTITO_MS) {
      registrata = chiave;
      ultimoBattito = Date.now();
      const { error } = await supabase.rpc('sito_registra_visita', {
        p_id: visita,
        p_dispositivo: dispositivo(),
        p_provenienza: provenienza(),
        p_pagina: percorso,
        p_consenso: consenso,
      });
      if (funzioneMancante(error)) { disattivato = true; return; }
    }
    if (consenso) {
      const { error } = await supabase.rpc('sito_registra_pagina', { p_visita: visita, p_percorso: percorso });
      if (funzioneMancante(error)) disattivato = true;
    }
  } catch {
    // Il tracciamento non deve mai disturbare la navigazione.
  }
}
