import { useEffect, useState } from 'react';
import { DEFAULT_ASPETTO, getAspettoCopy, type AspettoCopy } from '../utils/siteCopy';

/**
 * Sito > Aspetto & Funzionalita', letto da un componente.
 *
 * Parte dai valori di fabbrica e non aspetta la rete, come `useFilmato`: la
 * pagina si disegna subito con le immagini di sempre e, se il gestionale ne
 * ha scelte altre, arrivano un istante dopo.
 */
export function useAspetto(): Required<AspettoCopy> {
  const [aspetto, setAspetto] = useState<Required<AspettoCopy>>(DEFAULT_ASPETTO);
  useEffect(() => {
    let annullato = false;
    getAspettoCopy()
      .then((a) => { if (!annullato) setAspetto(a); })
      .catch(() => { /* restano i valori di fabbrica */ });
    return () => { annullato = true; };
  }, []);
  return aspetto;
}

export default useAspetto;
