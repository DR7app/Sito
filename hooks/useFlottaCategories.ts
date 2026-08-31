/**
 * useFlottaCategories — categorie veicolo VISIBILI sulla landing pubblica,
 * secondo la selezione fatta in admin > Sito > Flotta.
 *
 * La regola (loading / configurata / vuota di proposito / errore) sta tutta
 * in `utils/flottaConfig.ts`: questo hook e' solo il ponte verso React, cosi'
 * sito e menu non possono divergere. Vedi quel file per la semantica di
 * `mode` e per il fail-safe.
 *
 * Ogni categoria torna con `id`, `label` e `path = "/<id>"`, che corrisponde
 * alla route dinamica generata da App.tsx per ciascuna categoria di
 * Centralina Pro.
 *
 * Chi consuma questo hook NON deve mostrare tutto mentre `loading` e' true:
 * durante il caricamento `categories` e' vuoto apposta, per non far
 * comparire categorie che un attimo dopo spariscono.
 */
import { useEffect, useState } from 'react';
import { resolveFlottaCategories, type FlottaMode } from '../utils/flottaConfig';

export interface FlottaCategoryLink {
  id: string;
  label: string;
  path: string;
}

export interface UseFlottaCategories {
  categories: FlottaCategoryLink[];
  loading: boolean;
  /** 'loading' finche' la config non e' arrivata, poi 'ready' o 'error'. */
  status: 'loading' | 'ready' | 'error';
  /** Come e' stata risolta la visibilita' (null finche' si carica). */
  mode: FlottaMode | null;
  /** Anomalie della configurazione (id inesistenti, duplicati, formato). */
  issues: string[];
}

export function useFlottaCategories(): UseFlottaCategories {
  const [state, setState] = useState<UseFlottaCategories>({
    categories: [],
    loading: true,
    status: 'loading',
    mode: null,
    issues: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await resolveFlottaCategories();
      if (cancelled) return;
      if (import.meta.env.DEV && res.issues.length > 0) {
        console.warn('[useFlottaCategories] configurazione con anomalie:', res.issues);
      }
      setState({
        categories: res.categories.map(c => ({ id: c.id, label: c.label, path: `/${c.id}` })),
        loading: false,
        status: res.status,
        mode: res.mode,
        issues: res.issues,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
