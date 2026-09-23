/**
 * Testi liberi del sito — l'ultimo miglio dell'onglet Sito.
 *
 * Le sezioni di `siteCopy.ts` coprono le pagine che hanno un editor
 * dedicato. Restavano fuori decine di schermate (account, partner, login,
 * conferme, listini) i cui testi vivevano solo nel codice: per cambiare una
 * parola serviva uno sviluppatore.
 *
 * Qui la copertura si chiude dal basso: OGNI stringa che passa da
 * `useTranslation().t(...)` puo' essere riscritta dal gestionale, senza che
 * la pagina debba prima essere migrata a uno schema tipizzato.
 *
 * La chiave:
 *   - `t('Sign_In')`         -> `k:Sign_In`   (voce del dizionario translations.ts)
 *   - `t({ it, en })`        -> `s:<hash>`    (impronta del testo ITALIANO)
 *
 * Il testo italiano fa da chiave perche' e' l'originale: se uno sviluppatore
 * lo riscrive, l'impronta cambia e l'override smette di applicarsi — la
 * pagina torna al testo del codice invece di mostrare una traduzione vecchia
 * appiccicata a una frase nuova. E' il comportamento voluto.
 *
 * Gli override stanno in `centralina_pro_config.config.site_copy.testi`,
 * la stessa riga che tiene tutto il resto del CMS.
 */
import { getTestiSito } from './siteCopy'

export interface TestoOverride {
  it?: string
  en?: string
}

/** FNV-1a a 32 bit: corta, stabile, senza dipendenze. */
export function chiaveTesto(testoIt: string): string {
  const s = String(testoIt).trim().replace(/\s+/g, ' ')
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return 's:' + (h >>> 0).toString(16).padStart(8, '0')
}

/** Chiave di una voce del dizionario translations.ts. */
export function chiaveDizionario(chiave: string): string {
  return 'k:' + chiave
}

let testi: Record<string, TestoOverride> = {}
let versione = 0
const ascoltatori = new Set<() => void>()

function avvisa() {
  versione += 1
  for (const fn of ascoltatori) fn()
}

/** useSyncExternalStore: si iscrive ai testi caricati dal database. */
export function iscrivitiTesti(fn: () => void): () => void {
  ascoltatori.add(fn)
  return () => { ascoltatori.delete(fn) }
}

export function versioneTesti(): number {
  return versione
}

/** Il testo riscritto dal gestionale, o null se non e' stato toccato. */
export function testoOverride(chiave: string, lang: 'it' | 'en'): string | null {
  const voce = testi[chiave]
  if (!voce) return null
  const valore = voce[lang]
  return typeof valore === 'string' && valore.trim() !== '' ? valore : null
}

/**
 * 23/09/2026 (direzione) — come `t({ it, en })`, ma per i file fuori da
 * React (utils/): gli errori del carrello, del codice fiscale, della targa.
 * La lingua e' quella della pagina (<html lang>, la tiene LanguageContext);
 * l'override arriva da Sito > Testi come per t(). scripts/genTestiCatalogo.mjs
 * nel gestionale raccoglie anche queste chiamate, quindi si scrivono con
 * due testi fissi (niente `${...}`): i valori si mettono con {segnaposto}.
 */
export function testoFisso(field: { it: string; en: string }): string {
  let lang: 'it' | 'en' = 'it'
  try {
    if (typeof document !== 'undefined' && document.documentElement.lang === 'en') lang = 'en'
  } catch { /* fuori dal browser: italiano */ }
  return testoOverride(chiaveTesto(field.it), lang) ?? field[lang]
}

// Caricamento unico all'avvio: la configurazione e' gia' in cache per il
// resto del CMS, qui si legge solo la sua sezione `testi`.
let inCorso: Promise<void> | null = null
export function caricaTestiSito(): Promise<void> {
  if (inCorso) return inCorso
  inCorso = getTestiSito()
    .then((mappa) => {
      testi = mappa || {}
      avvisa()
    })
    .catch(() => { /* nessun override: il sito mostra i testi del codice */ })
  return inCorso
}

void caricaTestiSito()
