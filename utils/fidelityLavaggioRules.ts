/**
 * fidelityLavaggioRules — regole della Fidelity Card lavaggio (06/11/2026).
 *
 * Pura, senza import: si passa la config gia' letta e si ottengono i valori
 * da mostrare. Le regole stanno in `centralina_pro_config.config.fidelity_lavaggio`
 * (admin > Centralina Pro > Fidelity Lavaggio). I punti li calcola SOLO il
 * database (migrazione DR7-AI 20261106_fidelity_lavaggio_da_centralina.sql):
 * il sito legge `customers_extended.fidelity_points` e queste regole, basta.
 *
 * Gemella di dr7_fidelity_lavaggio_norm (SQL) e di
 * DR7-AI/src/utils/fidelityLavaggio.ts: un valore mancante, a zero, negativo
 * o non numerico torna al default. Cambiare in tutti e tre.
 */

export type TipoPremioFidelity = 'credito_wallet' | 'codice_sconto';

export interface FidelityLavaggioConfig {
  attivo: boolean;
  euro_per_punto: number;
  soglia_punti: number;
  importo_premio: number;
  validita_giorni: number;
  tipo_premio: TipoPremioFidelity;
}

export const FIDELITY_LAVAGGIO_KEY = 'fidelity_lavaggio';

export const FIDELITY_LAVAGGIO_DEFAULT: FidelityLavaggioConfig = {
  attivo: true,
  euro_per_punto: 1,
  soglia_punti: 250,
  importo_premio: 25,
  validita_giorni: 15,
  tipo_premio: 'credito_wallet',
};

function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim().replace(',', '.');
    return /^[0-9]+(\.[0-9]+)?$/.test(t) ? Number(t) : null;
  }
  return null;
}

const due = (n: number) => Math.round(n * 100) / 100;

export function normalizzaFidelityLavaggio(raw: unknown): FidelityLavaggioConfig {
  const v = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const d = FIDELITY_LAVAGGIO_DEFAULT;

  let epp = numero(v.euro_per_punto);
  if (epp === null || epp <= 0 || epp > 100000) epp = d.euro_per_punto;
  epp = due(epp);
  if (epp <= 0) epp = d.euro_per_punto;

  let soglia = numero(v.soglia_punti);
  soglia = soglia === null ? null : Math.floor(soglia);
  if (soglia === null || soglia < 1 || soglia > 1000000) soglia = d.soglia_punti;

  let importo = numero(v.importo_premio);
  if (importo === null || importo <= 0 || importo > 100000) importo = d.importo_premio;
  importo = due(importo);
  if (importo <= 0) importo = d.importo_premio;

  let giorni = numero(v.validita_giorni);
  giorni = giorni === null ? null : Math.floor(giorni);
  if (giorni === null || giorni < 1 || giorni > 3650) giorni = d.validita_giorni;

  return {
    attivo: typeof v.attivo === 'boolean' ? v.attivo : d.attivo,
    euro_per_punto: epp,
    soglia_punti: soglia,
    importo_premio: importo,
    validita_giorni: giorni,
    tipo_premio: v.tipo_premio === 'codice_sconto' ? 'codice_sconto' : 'credito_wallet',
  };
}

/** Regole dalla config intera della riga 'main'. */
export function fidelityLavaggioDaConfig(config: Record<string, unknown> | null | undefined): FidelityLavaggioConfig {
  return normalizzaFidelityLavaggio((config || {})[FIDELITY_LAVAGGIO_KEY]);
}

/** "25" per 25; "12,50" (it) / "12.50" (en) per 12.5. */
export function euroFidelity(n: number, lang: 'it' | 'en' = 'it'): string {
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(2);
  return lang === 'it' ? s.replace('.', ',') : s;
}

/** Sostituisce {chiave} nel testo (dopo l'eventuale override da Sito > Testi). */
export function riempiFidelity(testo: string, valori: Record<string, string | number>): string {
  return testo.replace(/\{(\w+)\}/g, (m, k) => (k in valori ? String(valori[k]) : m));
}
