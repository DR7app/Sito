import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Riporta in cima a ogni cambio di pagina — e, se l'indirizzo ha
 * un'ancora, va al punto invece che in cima.
 *
 * L'ancora prima non veniva guardata: `/membership#privilege` o
 * `/flotta#exotic` aprivano la pagina in testa e il lettore doveva
 * cercarsi la sezione a mano. Gli `id` erano gia' nel markup, mancava
 * solo chi li usasse.
 *
 * Il punto delicato e' il TEMPO: quasi tutte le pagine del sito
 * disegnano i loro testi solo dopo aver letto la Centralina Pro, quindi
 * al primo giro l'elemento non esiste ancora e uno scroll immediato non
 * troverebbe niente. Si riprova per un paio di secondi e poi si smette:
 * un'ancora sbagliata non deve lasciare la pagina a cercare per sempre.
 */
const ATTESA_MAX_MS = 2500;
const INTERVALLO_MS = 60;

const ScrollToTop: React.FC = () => {
  const { pathname, hash } = useLocation();
  const paginaPrecedente = useRef<string | null>(null);

  useEffect(() => {
    const cambioPagina = paginaPrecedente.current !== pathname;
    paginaPrecedente.current = pathname;

    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    // Arrivando da un'ALTRA pagina il browser tiene la vecchia posizione di
    // scorrimento: senza questo, per il tempo di attesa qui sotto si
    // vedrebbe il centro della pagina nuova e poi un salto. Se invece si
    // resta sulla stessa pagina (si e' cliccata la voce di menu mentre si
    // era gia' li'), non si torna in cima per non far rimbalzare la vista.
    if (cambioPagina) window.scrollTo({ top: 0, behavior: 'auto' });

    // `decodeURIComponent` perche' un id con accenti arriva percentificato.
    let id = hash.slice(1);
    try { id = decodeURIComponent(id); } catch { /* si tiene il grezzo */ }
    if (!id) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    let annullato = false;
    const scadenza = Date.now() + ATTESA_MAX_MS;

    const prova = () => {
      if (annullato) return;
      const bersaglio = document.getElementById(id);
      if (bersaglio) {
        // `scroll-mt-*` sull'elemento tiene conto della barra in alto:
        // scrollIntoView lo rispetta, un window.scrollTo calcolato a mano no.
        bersaglio.scrollIntoView({ behavior: 'auto', block: 'start' });
        return;
      }
      if (Date.now() < scadenza) {
        timer = window.setTimeout(prova, INTERVALLO_MS);
      }
      // Scaduto senza trovare (ancora sbagliata, o sezione spenta dal
      // gestionale): si resta dove si e'. Chi arriva da un'altra pagina la
      // vede dall'inizio, chi era gia' qui non viene spostato.
    };

    let timer = window.setTimeout(prova, 0);
    return () => { annullato = true; window.clearTimeout(timer); };
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
