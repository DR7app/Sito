/**
 * flottaConfig — lettura della configurazione Flotta.
 *
 * Sottile per scelta: la regola sta tutta in `flottaRules.ts` (pura,
 * testabile senza rete); qui c'e' solo il collegamento con la riga
 * `centralina_pro_config`, letta una volta sola tramite la cache condivisa
 * di `siteCopy.ts` — non una richiesta per consumer.
 *
 * Punto unico di verita' per: pagina "La Nostra Flotta", menu, filtri delle
 * pagine noleggio. Nessun elenco di categorie va scritto a mano altrove.
 */
import { loadCentralinaConfigOnce } from './siteCopy';
import { resolveFlottaFromConfig, rentalPageWhitelistFrom } from './flottaRules';
import type { FlottaResolution } from './flottaRules';

export {
  CATEGORY_ALIASES,
  categoryAliases,
  resolveFlottaFromConfig,
  rentalPageWhitelistFrom,
} from './flottaRules';
export type { FlottaCategory, FlottaMode, FlottaResolution } from './flottaRules';

/** Legge la config e applica la regola. Non lancia mai. */
export async function resolveFlottaCategories(): Promise<FlottaResolution> {
  const { config, ok } = await loadCentralinaConfigOnce();
  return resolveFlottaFromConfig(config, ok);
}

/**
 * Whitelist per la RentalPage: array VUOTO = nessun filtro.
 * Vedi `rentalPageWhitelistFrom` per il perche' l'errore non nasconde tutto.
 */
export async function getRentalPageCategoryWhitelist(): Promise<string[]> {
  return rentalPageWhitelistFrom(await resolveFlottaCategories());
}
