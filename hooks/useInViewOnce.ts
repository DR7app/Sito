import { useCallback, useEffect, useState } from 'react';

/**
 * Dice QUANDO un elemento entra in campo, una volta sola.
 *
 * `useReveal` fa una cosa simile ma parla al DOM: aggiunge una classe. Qui
 * serve invece un booleano da passare ai figli — i numeri che salgono da zero
 * devono partire tutti insieme quando la sezione entra, non uno per volta
 * quando entra la singola riga.
 *
 * Il riferimento e' una funzione, non un oggetto, e non e' un dettaglio: le
 * pagine che aspettano i testi dal gestionale mostrano prima un guscio vuoto,
 * quindi l'elemento da osservare nasce DOPO il primo giro. Un `useRef` resta
 * a mani vuote e l'osservatore non parte mai; cosi' invece l'osservatore si
 * attacca nel momento esatto in cui l'elemento compare.
 *
 * Un osservatore solo, staccato appena scatta: nessun lavoro mentre si
 * scorre, e niente seconda partenza se la sezione esce e rientra.
 *
 * Se l'utente ha chiesto meno movimento al sistema operativo il valore parte
 * gia' a `true`: chi legge vede subito il dato finale, senza animazione.
 */
export function useInViewOnce<T extends HTMLElement = HTMLDivElement>(amount = 0.25) {
  const [nodo, setNodo] = useState<T | null>(null);
  const [inView, setInView] = useState(false);

  const ref = useCallback((el: T | null) => setNodo(el), []);

  useEffect(() => {
    if (!nodo || inView) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        }
      },
      { threshold: amount, rootMargin: '0px 0px -8% 0px' }
    );

    io.observe(nodo);
    return () => io.disconnect();
  }, [nodo, inView, amount]);

  return [ref, inView] as const;
}
