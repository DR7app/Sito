import { useEffect } from 'react';
import { getAspettoCopy, DEFAULT_TEMA_FONT, DEFAULT_TEMA_RAGGIO } from '../../utils/siteCopy';

/**
 * Applica il tema scelto in Sito > Aspetto.
 *
 * Scrive VARIABILI CSS sulla radice del documento, non classi. E' l'unico modo
 * che funziona in tutti e due i progetti: una classe Tailwind costruita da un
 * valore letto a runtime non verrebbe generata da nessuna delle due build, e
 * arriverebbe in pagina senza fare niente. Le variabili invece sono lette dal
 * foglio di stile che gia' c'e' (styles/index.css), dove ogni token e' gia'
 * scritto come `var(--...)`.
 *
 * Non tocca il DOM finche' la configurazione non arriva: fino a quel momento
 * valgono i valori di progetto scritti nel CSS, che sono gli stessi dei
 * default. Nessun lampo di colore all'apertura.
 */

/** rgba dal colore del testo: i filetti seguono l'inchiostro, non restano avorio. */
function alfa(hex: string, a: number): string {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return `rgba(246, 243, 237, ${a})`;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const TemaVars = () => {
  useEffect(() => {
    let annullato = false;
    getAspettoCopy().then((a) => {
      if (annullato) return;
      const r = document.documentElement.style;

      r.setProperty('--c-obsidian', a.tema_bg);
      r.setProperty('--c-graphite', a.tema_surface);
      r.setProperty('--c-ivory', a.tema_ink);
      r.setProperty('--c-mineral', a.tema_muted);
      r.setProperty('--c-metal', a.tema_accent);
      // I filetti sono l'inchiostro molto trasparente: se cambia il testo
      // devono cambiare anche loro, altrimenti su fondo chiaro spariscono.
      r.setProperty('--line', alfa(a.tema_ink, 0.12));
      r.setProperty('--line-strong', alfa(a.tema_ink, 0.26));

      const font = DEFAULT_TEMA_FONT[a.tema_font] || DEFAULT_TEMA_FONT['bodoni-jost'];
      r.setProperty('--f-display', font.display);
      r.setProperty('--f-ui', font.ui);
      if (font.google) {
        const id = 'tema-font';
        let link = document.getElementById(id) as HTMLLinkElement | null;
        if (!link) {
          link = document.createElement('link');
          link.id = id;
          link.rel = 'stylesheet';
          document.head.appendChild(link);
        }
        const href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
        if (link.href !== href) link.href = href;
      }

      const raggio = DEFAULT_TEMA_RAGGIO[a.tema_raggio] || DEFAULT_TEMA_RAGGIO.morbido;
      r.setProperty('--r-xs', raggio.xs);
      r.setProperty('--r-sm', raggio.sm);
      r.setProperty('--r-md', raggio.md);
    });
    return () => { annullato = true; };
  }, []);

  return null;
};

export default TemaVars;
