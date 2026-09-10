import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * Il passaggio da una pagina all'altra: una lastra di marmo che sale, copre
 * per un istante e se ne va.
 *
 * 10/09/2026 — carta colori DR7: il marmo compare solo nei momenti
 * istituzionali (menu, transizioni, fondo pagina), cosi' quando appare vale
 * qualcosa. Qui e' la transizione.
 *
 * Regole di comportamento:
 *  - non compare al primo caricamento: si entra sulla pagina, non ci si passa;
 *  - non compare se cambia solo l'ancora (#privilege) o la query: non e' un
 *    cambio di pagina, e una lastra a ogni filtro sarebbe insopportabile;
 *  - chi ha chiesto meno movimento al sistema non la vede affatto.
 */
export default function TransizioneMarmo() {
  const { pathname } = useLocation();
  const menoMovimento = useReducedMotion();
  const primaVolta = useRef(true);
  const [attiva, setAttiva] = useState(false);

  useEffect(() => {
    if (primaVolta.current) { primaVolta.current = false; return; }
    if (menoMovimento) return;
    setAttiva(true);
    const t = setTimeout(() => setAttiva(false), 420);
    return () => clearTimeout(t);
  }, [pathname, menoMovimento]);

  return (
    <AnimatePresence>
      {attiva && (
        <motion.div
          key="transizione"
          aria-hidden="true"
          className="marmo pointer-events-none fixed inset-0 z-[120]"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.34, ease: [0.76, 0, 0.24, 1] }}
        />
      )}
    </AnimatePresence>
  );
}
