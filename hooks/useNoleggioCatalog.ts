/**
 * useNoleggioCatalog — legge il catalogo pubblico Noleggio Mare/Aria dalla
 * tabella `noleggio_catalog` (solo elementi attivi, policy anon di sola
 * lettura). Tutto e' DINAMICO dall'admin: se il catalogo e' vuoto la pagina
 * e i link non compaiono.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export type NoleggioServiceType = 'boat_rental' | 'heli_rental' | 'stay_rental';

export interface TourDuration {
  minutes: number;
  price: number;          // EUR (intero) per persona
  label: string;
  description?: string;
  best_value?: boolean;
}

/** Una voce della galleria: foto o filmato caricati dal gestionale. */
export interface MediaCatalogo {
  url: string;
  tipo: 'image' | 'video';
}

export interface NoleggioCatalogItem {
  id: string;
  service_type: NoleggioServiceType;
  name: string;
  description: string | null;
  price_per_day: number; // centesimi EUR
  capacity: number | null;
  image_url: string | null;
  sort_order: number;
  tour_durations?: TourDuration[]; // opzioni durata (es. elicottero 20/40/60 min)
  /** Galleria ordinata (colonna `media`): foto e video. La prima foto e'
   *  anche `image_url`. Puo' mancare sulle schede vecchie. */
  media?: MediaCatalogo[] | null;
}

interface UseNoleggioCatalogResult {
  items: NoleggioCatalogItem[];
  loading: boolean;
  hasBoats: boolean;
  hasHelis: boolean;
  hasStays: boolean;
}

export function useNoleggioCatalog(serviceType?: NoleggioServiceType): UseNoleggioCatalogResult {
  const [items, setItems] = useState<NoleggioCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // La galleria (`media`) esiste dalla migration del 10/09/2026. Se una
        // base non l'avesse ancora, la richiesta con quella colonna fallisce:
        // in quel caso si rilegge senza, altrimenti un catalogo intero
        // sparirebbe dal sito per una colonna mancante.
        const leggi = (conMedia: boolean) => {
          const campi = 'id, service_type, name, description, price_per_day, capacity, image_url, sort_order, tour_durations'
            + (conMedia ? ', media' : '');
          let q = supabase
            .from('noleggio_catalog')
            .select(campi)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true });
          if (serviceType) q = q.eq('service_type', serviceType);
          return q;
        };
        let { data, error } = await leggi(true);
        if (error && /media/i.test(error.message || '')) {
          ({ data, error } = await leggi(false));
        }
        if (cancelled) return;
        // Tabella assente / nessun accesso => trattiamo come catalogo vuoto:
        // niente pagina, niente link (comportamento voluto).
        if (error) { setItems([]); }
        else setItems((data || []) as unknown as NoleggioCatalogItem[]);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [serviceType]);

  return {
    items,
    loading,
    hasBoats: items.some(i => i.service_type === 'boat_rental'),
    hasHelis: items.some(i => i.service_type === 'heli_rental'),
    hasStays: items.some(i => i.service_type === 'stay_rental'),
  };
}
