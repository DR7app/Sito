import { useEffect, useState } from 'react';
import { DEFAULT_ASPETTO, getAspettoCopy, type AspettoCopy } from '../utils/siteCopy';

/**
 * Il filmato di una pagina, scelto dal gestionale.
 *
 * 10/09/2026 — i filmati stavano scritti dentro le pagine (`/video-terra.mp4`
 * e compagnia): per cambiarne uno serviva il codice. Ora ognuno e' un campo di
 * Sito > Aspetto & Funzionalita' e questa e' l'unica lettura: una pagina chiede
 * la sua chiave e riceve indirizzo e poster gia' risolti.
 *
 * Parte dai valori di fabbrica e non aspetta la rete: il filmato si vede
 * subito, e se il gestionale ne ha uno diverso arriva un istante dopo. Cosi'
 * una configurazione lenta o irraggiungibile non lascia mai la pagina nera.
 */
export type ChiaveFilmato = 'terra' | 'mare' | 'aria' | 'soggiorni' | 'lavaggio';

export interface Filmato {
  src: string;
  poster?: string;
}

function leggi(aspetto: AspettoCopy, chiave: ChiaveFilmato): Filmato {
  const campi = aspetto as Record<string, unknown>;
  const src = String(campi[`video_${chiave}_url`] || '').trim();
  const poster = String(campi[`video_${chiave}_poster`] || '').trim();
  return {
    src: src || String((DEFAULT_ASPETTO as Record<string, unknown>)[`video_${chiave}_url`] || ''),
    poster: poster || undefined,
  };
}

export function useFilmato(chiave: ChiaveFilmato): Filmato {
  const [filmato, setFilmato] = useState<Filmato>(() => leggi(DEFAULT_ASPETTO, chiave));

  useEffect(() => {
    let annullato = false;
    getAspettoCopy()
      .then((a) => { if (!annullato) setFilmato(leggi(a, chiave)); })
      .catch(() => { /* restano i valori di fabbrica */ });
    return () => { annullato = true; };
  }, [chiave]);

  return filmato;
}

export default useFilmato;
