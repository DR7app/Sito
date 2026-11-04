/**
 * esperienzaFlotta — quale categoria della flotta corrisponde a una scheda
 * di "Vivi l'attesa in grande stile" (servizi `experience` del Catalogo
 * Lavaggio: utilitaria di cortesia, supercar, exotic, hypercar...).
 *
 * Nessun import, nessuna I/O: si passano il servizio e il catalogo
 * categorie di Centralina Pro gia' letti (vedi `flottaConfig.ts`).
 *
 * ── Il problema ──────────────────────────────────────────────────────────
 * Fino al 04/11/2026 la scelta del veicolo cercava `category ILIKE
 * '%supercar%'` sulla tabella `vehicles`: prendeva anche `supercar_elit`,
 * che in Centralina Pro e' la categoria "Ducato Maxi" (Ducato, Vito), e
 * ignorava che gli id storici non dicono piu' niente (l'id `aziendali` ha
 * etichetta "Supercar", `supercars` ha etichetta "Exotic Cars", ...).
 *
 * ── La regola ────────────────────────────────────────────────────────────
 * Conta l'ETICHETTA della categoria in Centralina Pro, mai l'id. Una
 * categoria corrisponde alla scheda quando tutte le parole significative
 * della sua etichetta compaiono nel nome della scheda (italiano o inglese).
 * Esempi con i dati di oggi:
 *   "DR7 SUPERCAR"                         -> "Supercar"
 *   "DR7 EXOTIC CAR"                       -> "Exotic Cars"
 *   "DR7 HYPERCAR"                         -> "Hypercar"
 *   "DR7 UTILITARIA DI CORTESIA" / "DR7 URBAN COURTESY DRIVE" -> "Urban"
 * Se nessuna categoria corrisponde, o due corrispondono a pari merito, il
 * risultato e' null: meglio nessun elenco che i veicoli sbagliati.
 * Rinominare una categoria o una scheda dal gestionale basta a spostare
 * l'abbinamento: nessun elenco di modelli o categorie e' scritto qui.
 */

export interface CategoriaFlotta {
  id: string;
  label: string;
}

export interface ServizioEsperienza {
  id: string;
  name?: string | null;
  nameEn?: string | null;
}

/** Parole che non distinguono una categoria dall'altra. */
const PAROLE_NEUTRE = new Set([
  'dr7', 'car', 'auto', 'di', 'da', 'del', 'della', 'the', 'drive',
  'courtesy', 'cortesia', 'experience', 'esperienza',
]);

/** Stessa parola in italiano e in inglese. */
const SINONIMI: Record<string, string> = {
  utilitaria: 'urban',
  utilitarie: 'urban',
  cittadina: 'urban',
};

function parole(testo: string | null | undefined): string[] {
  if (!testo) return [];
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    // "Cars" e "Car" sono la stessa parola.
    .map(p => (p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p))
    .map(p => SINONIMI[p] || p)
    .filter(p => !PAROLE_NEUTRE.has(p));
}

/**
 * La categoria della flotta che corrisponde alla scheda, o null se
 * l'abbinamento non e' certo.
 */
export function categoriaPerEsperienza(
  servizio: ServizioEsperienza | null | undefined,
  categorie: CategoriaFlotta[],
): CategoriaFlotta | null {
  if (!servizio) return null;
  const nome = new Set([...parole(servizio.name), ...parole(servizio.nameEn)]);
  if (nome.size === 0) return null;
  let migliore: CategoriaFlotta | null = null;
  let punteggio = 0;
  let pari = false;
  for (const c of categorie) {
    const p = [...new Set(parole(c.label))];
    if (p.length === 0 || !p.every(w => nome.has(w))) continue;
    if (p.length > punteggio) {
      migliore = c;
      punteggio = p.length;
      pari = false;
    } else if (p.length === punteggio) {
      pari = true;
    }
  }
  return pari ? null : migliore;
}

/** Riga minima di `vehicles` che serve per decidere se e' utilizzabile. */
export interface VeicoloFlotta {
  display_name: string | null;
  category: string | null;
  status: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Il veicolo puo' essere dato al cliente? Stessa regola del noleggio
 * (`hooks/useVehicles.ts`): 'available', oppure 'unavailable' con
 * `metadata.unavailable_until` gia' passato.
 */
export function veicoloUtilizzabile(v: VeicoloFlotta, adesso: Date = new Date()): boolean {
  if (v.status === 'available') return true;
  if (v.status !== 'unavailable') return false;
  const until = v.metadata?.unavailable_until;
  if (typeof until !== 'string' || !until) return false;
  const d = new Date(until);
  return !isNaN(d.getTime()) && d < adesso;
}

/**
 * Nomi dei modelli in flotta per una categoria (ids equivalenti compresi,
 * es. supercars/exotic), senza doppioni, nell'ordine ricevuto.
 */
export function modelliDellaCategoria(
  veicoli: VeicoloFlotta[],
  idsCategoria: string[],
  adesso: Date = new Date(),
): string[] {
  const ids = new Set(idsCategoria);
  const visti = new Set<string>();
  const out: string[] = [];
  for (const v of veicoli) {
    if (!v.category || !ids.has(v.category)) continue;
    if (!veicoloUtilizzabile(v, adesso)) continue;
    const nome = (v.display_name || '').replace(/\s+/g, ' ').trim();
    if (!nome) continue;
    const chiave = nome.toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    out.push(nome);
  }
  return out;
}
