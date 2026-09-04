import { useEffect, useRef } from 'react';

/**
 * Rivelazione allo scroll.
 *
 * Lo stato di partenza (opacita' zero, leggero scostamento) sta nel CSS
 * `.reveal`; qui c'e' solo il momento in cui l'elemento entra in campo e
 * prende `is-in`. Un osservatore per elemento, disconnesso subito dopo:
 * niente listener sullo scroll, niente lavoro sul thread principale mentre
 * si scorre.
 *
 * Se l'utente ha chiesto meno movimento al sistema operativo l'elemento
 * viene mostrato subito: l'animazione non e' mai una condizione per leggere
 * il contenuto.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  /** Frazione visibile richiesta prima di rivelare. Default 0.18. */
  amount?: number;
  /** Ritardo in ms, per scaglionare piu' elementi vicini. */
  delay?: number;
  /** Rivela una sola volta (default) oppure a ogni rientro. */
  once?: boolean;
}) {
  const ref = useRef<T | null>(null);
  const { amount = 0.18, delay = 0, once = true } = options || {};

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (delay) el.style.setProperty('--reveal-delay', `${delay}ms`);

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in');
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-in');
            if (once) io.disconnect();
          } else if (!once) {
            el.classList.remove('is-in');
          }
        }
      },
      { threshold: amount, rootMargin: '0px 0px -8% 0px' }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [amount, delay, once]);

  return ref;
}
