/**
 * websiteBuilderRules.ts — le regole di scelta, senza rete.
 *
 * Separato da `websiteBuilder.ts` (che parla con Supabase) per lo stesso
 * motivo di `flottaRules.ts`: queste sono le decisioni che stabiliscono
 * COSA il sito mostra, e vanno provate senza dipendenze e senza rete.
 *
 * La regola piu' importante e' in `paginaPerPercorso`: su una rotta che il
 * sito gia' disegna, il builder subentra solo con `overrides_route`. E'
 * l'unica cosa che impedisce a una pubblicazione di far sparire una
 * pagina esistente.
 */

import type {
  WbSnapshot, WbSnapshotPage, WbTheme, WbOverlay, WbScript, WbLocale,
} from '../components/website/wbSchema';

// ─── Selettori ──────────────────────────────────────────────────────────────
function nellaFinestra(p: WbSnapshotPage, ora = Date.now()): boolean {
  if (p.scheduled_at && new Date(p.scheduled_at).getTime() > ora) return false;
  if (p.unpublish_at && new Date(p.unpublish_at).getTime() < ora) return false;
  return true;
}

/** Le pagine davvero visibili adesso. */
export function pagineVisibili(snap: WbSnapshot | null): WbSnapshotPage[] {
  if (!snap) return [];
  return (snap.pages || []).filter((p) => (p.status === 'published' || p.status === 'scheduled') && nellaFinestra(p));
}

function normalizza(path: string): string {
  if (!path) return '/';
  const senzaQuery = path.split('?')[0].split('#')[0];
  if (senzaQuery === '/') return '/';
  return senzaQuery.replace(/\/+$/, '') || '/';
}

/**
 * La pagina del builder per un indirizzo, se e solo se puo' servirla.
 *
 * `richiedeOverride` e' vero per le rotte che il sito gia' disegna con un
 * componente React: li' il builder subentra solo con l'interruttore
 * acceso. Per gli indirizzi nuovi (che oggi non esistono) l'interruttore
 * non serve: non c'e' niente da sostituire.
 */
export function paginaPerPercorso(
  snap: WbSnapshot | null,
  path: string,
  richiedeOverride: boolean,
): WbSnapshotPage | null {
  const cercato = normalizza(path);
  const candidate = pagineVisibili(snap).filter((p) => normalizza(p.slug) === cercato);
  const p = candidate[0];
  if (!p) return null;
  if (richiedeOverride && !p.overrides_route) return null;
  return p;
}

export function temaAttivo(snap: WbSnapshot | null): WbTheme | null {
  return snap?.theme || null;
}

export function impostazioniSito(snap: WbSnapshot | null): Record<string, unknown> {
  return (snap?.site?.settings as Record<string, unknown>) || {};
}

export function overlayAttivi(
  snap: WbSnapshot | null,
  kind: WbOverlay['kind'],
  slug: string,
  ora = Date.now(),
): WbOverlay[] {
  if (!snap) return [];
  const percorso = normalizza(slug);
  return (snap.overlays || [])
    .filter((o) => o.kind === kind)
    .filter((o) => o.status === 'published' || o.status === 'scheduled')
    .filter((o) => !o.starts_at || new Date(o.starts_at).getTime() <= ora)
    .filter((o) => !o.ends_at || new Date(o.ends_at).getTime() >= ora)
    .filter((o) => {
      const pagine = o.targeting?.pages || [];
      const escluse = o.targeting?.excludePages || [];
      if (escluse.map(normalizza).includes(percorso)) return false;
      if (!pagine.length) return true;
      return pagine.map(normalizza).includes(percorso);
    })
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

export function scriptAttivi(snap: WbSnapshot | null): WbScript[] {
  return snap?.scripts || [];
}

/** Il sito deve disegnare header e footer del builder? Default: no. */
export function usaHeaderBuilder(snap: WbSnapshot | null): boolean {
  return impostazioniSito(snap).use_builder_header === true && !!snap?.navigation?.header?.items?.length;
}

export function usaFooterBuilder(snap: WbSnapshot | null): boolean {
  return impostazioniSito(snap).use_builder_footer === true && !!snap?.navigation?.footer?.columns?.length;
}

export type { WbSnapshot, WbSnapshotPage, WbTheme, WbOverlay, WbScript, WbLocale };
