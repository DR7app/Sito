/**
 * flottaRules — regola pura "quali categorie veicolo sono visibili".
 *
 * Nessun import, nessuna I/O: si passa la config gia' letta e si ottiene la
 * decisione. Sta separata da `flottaConfig.ts` (che fa la lettura da
 * Supabase) proprio per poter essere testata senza rete e senza client.
 *
 * ── Il problema che risolve ───────────────────────────────────────────────
 * La selezione vive in `centralina_pro_config.config.site_copy.flotta`
 * (admin > Sito > Flotta) e il catalogo in `...config.categories`
 * (admin > Centralina Pro > Categorie).
 *
 * Fino ad ora la selezione era il solo campo `visible_category_ids`, e un
 * array vuoto voleva dire due cose incompatibili:
 *   a) "non ho mai configurato niente"  -> il sito deve mostrare tutto;
 *   b) "non voglio mostrare nulla"      -> il sito non deve mostrare niente.
 * L'editor admin riscrive l'intero snapshot di Sito a ogni salvataggio,
 * quindi `visible_category_ids: []` finiva sul database anche solo aprendo e
 * salvando un'altra sotto-tab: da fuori era indistinguibile da una scelta
 * voluta. Nel maggio 2026 leggere il vuoto come "nessuna categoria" ha
 * svuotato la pagina Flotta e si e' dovuto tornare a "vuoto = tutte".
 *
 * ── La regola ora ─────────────────────────────────────────────────────────
 * Al campo esistente si affianca `mode`, che rende la scelta esplicita:
 *
 *   mode assente        riga vecchia, mai configurata dalla tab Flotta:
 *                       lista piena  -> whitelist (comportamento storico)
 *                       lista vuota  -> tutte le categorie (comportamento
 *                                       storico, nessuna regressione)
 *   mode = 'all'        l'operatore ha scelto "mostra tutte"
 *   mode = 'custom'     l'operatore ha scelto lui: vale ESATTAMENTE la
 *                       lista, vuota compresa (= nessuna categoria)
 *
 * `mode` e' additivo: nessuna migrazione, le righe esistenti continuano a
 * funzionare, e appena l'operatore tocca la tab Flotta la configurazione
 * diventa non ambigua.
 *
 * ── Fail-safe ─────────────────────────────────────────────────────────────
 * Se la config non si riesce a leggere, `status` vale 'error' e la lista
 * torna VUOTA: meglio una sezione che non compare che un'istanza (in ottica
 * multi-azienda / franchising) che espone categorie di un'altra. Chi consuma
 * deve trattare 'loading' e 'error' come "non so ancora", non come "mostra
 * tutto".
 */

/** Categoria veicolo come definita in Centralina Pro. */
export interface FlottaCategory {
  id: string;
  label: string;
}

/** Come e' stata risolta la visibilita' (utile in diagnostica). */
export type FlottaMode = 'all' | 'custom' | 'legacy-empty';

export interface FlottaResolution {
  status: 'ready' | 'error';
  mode: FlottaMode;
  /** Categorie da mostrare, nell'ordine del catalogo di Centralina Pro. */
  categories: FlottaCategory[];
  /** Catalogo completo, per diagnostica e per l'editor admin. */
  allCategories: FlottaCategory[];
  /** Anomalie della configurazione: id inesistenti, duplicati, formati. */
  issues: string[];
}

/**
 * Alias storici delle categorie. Centralina Pro ha rinominato "exotic" in
 * "supercars" (aprile 2026) ma in `vehicles.category` convivono entrambe:
 * selezionare "supercars" deve continuare a mostrare i veicoli salvati come
 * "exotic", altrimenti la whitelist ne nasconde meta'.
 */
export const CATEGORY_ALIASES: Record<string, string[]> = {
  exotic: ['exotic', 'supercars'],
  supercars: ['exotic', 'supercars'],
};

/** Tutte le sigle equivalenti a un id categoria (l'id compreso). */
export function categoryAliases(id: string): string[] {
  return CATEGORY_ALIASES[id] || [id];
}

const EMPTY_ON_ERROR: FlottaResolution = {
  status: 'error',
  mode: 'custom',
  categories: [],
  allCategories: [],
  issues: ['Configurazione non leggibile.'],
};

/** Estrae e valida il catalogo categorie, scartando le voci malformate. */
function readCatalog(config: Record<string, unknown>, issues: string[]): FlottaCategory[] {
  const raw = (config as { categories?: unknown }).categories;
  if (raw === undefined) {
    issues.push('config.categories assente: nessuna categoria definita in Centralina Pro.');
    return [];
  }
  if (!Array.isArray(raw)) {
    issues.push("config.categories non e' una lista: ignorata.");
    return [];
  }
  const out: FlottaCategory[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, i) => {
    const c = entry as { id?: unknown; label?: unknown } | null;
    if (!c || typeof c.id !== 'string' || !c.id.trim()) {
      issues.push(`categorie[${i}]: id mancante o non testuale, voce ignorata.`);
      return;
    }
    if (seen.has(c.id)) {
      issues.push(`categorie[${i}]: id duplicato "${c.id}", tenuta la prima.`);
      return;
    }
    seen.add(c.id);
    out.push({ id: c.id, label: typeof c.label === 'string' && c.label ? c.label : c.id });
  });
  return out;
}

/**
 * Risolve la configurazione Flotta a partire dalla riga gia' letta.
 * Non lancia mai: ogni anomalia finisce in `issues` e la funzione
 * restituisce comunque uno stato usabile.
 *
 * @param config  contenuto di `centralina_pro_config.config`
 * @param ok      false se la lettura e' fallita (rete, permessi, ...)
 */
export function resolveFlottaFromConfig(
  config: Record<string, unknown>,
  ok: boolean,
): FlottaResolution {
  if (!ok) return EMPTY_ON_ERROR;

  const issues: string[] = [];
  const allCategories = readCatalog(config, issues);

  const siteCopy = (config.site_copy ?? {}) as Record<string, unknown>;
  const flotta = siteCopy.flotta as
    | { mode?: unknown; visible_category_ids?: unknown }
    | undefined;

  const rawIds = flotta?.visible_category_ids;
  const ids: string[] = [];
  if (rawIds !== undefined) {
    if (!Array.isArray(rawIds)) {
      issues.push("site_copy.flotta.visible_category_ids non e' una lista: ignorata.");
    } else {
      const seen = new Set<string>();
      rawIds.forEach((v, i) => {
        if (typeof v !== 'string' || !v.trim()) {
          issues.push(`visible_category_ids[${i}]: valore non testuale, ignorato.`);
          return;
        }
        if (seen.has(v)) {
          issues.push(`visible_category_ids[${i}]: id duplicato "${v}", contato una volta sola.`);
          return;
        }
        seen.add(v);
        ids.push(v);
      });
    }
  }

  const rawMode = flotta?.mode;
  let mode: FlottaMode;
  if (rawMode === 'all' || rawMode === 'custom') {
    mode = rawMode;
  } else {
    if (rawMode !== undefined) {
      issues.push(`site_copy.flotta.mode: valore "${String(rawMode)}" non riconosciuto, trattato come riga non configurata.`);
    }
    // Riga precedente all'introduzione di `mode`.
    mode = ids.length > 0 ? 'custom' : 'legacy-empty';
  }

  if (mode === 'all' || mode === 'legacy-empty') {
    return { status: 'ready', mode, categories: allCategories, allCategories, issues };
  }

  // mode === 'custom': vale esattamente la lista, vuota compresa.
  const known = new Set(allCategories.map(c => c.id));
  const wanted = new Set<string>();
  for (const id of ids) {
    if (!known.has(id)) {
      issues.push(`categoria selezionata "${id}" non esiste piu' in Centralina Pro: ignorata.`);
      continue;
    }
    wanted.add(id);
  }
  // Ordine del catalogo, non ordine di spunta: stabile e uguale a quello che
  // l'operatore vede nella tab Categorie.
  const categories = allCategories.filter(c => wanted.has(c.id));
  return { status: 'ready', mode, categories, allCategories, issues };
}

/**
 * Whitelist per la RentalPage, nel contratto che quella pagina usa da
 * sempre: array VUOTO = nessun filtro.
 *
 * Attenzione: qui un errore di lettura restituisce comunque [] (nessun
 * filtro) e non "nascondi tutto". La RentalPage e' gia' vincolata alla
 * categoria della sua route (/supercar-luxury, /urban, ...): il gate vero
 * sulle categorie sono la pagina Flotta e il menu, che usano la resolution
 * completa e li' il fail-safe e' attivo. Far sparire i veicoli da una pagina
 * di categoria per un errore di rete romperebbe pagine che con la config
 * Flotta non c'entrano.
 */
export function rentalPageWhitelistFrom(res: FlottaResolution): string[] {
  if (res.status === 'error') return [];
  if (res.mode !== 'custom') return [];
  const out = new Set<string>();
  for (const c of res.categories) for (const a of categoryAliases(c.id)) out.add(a);
  return [...out];
}
