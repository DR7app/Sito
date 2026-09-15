import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../../hooks/useTranslation';
import {
  getCatalogoPrevendite,
  getImpostazioniPrevendite,
  IMPOSTAZIONI_DEFAULT,
  type ImpostazioniPrevendite,
} from '../../utils/prevendite';

/**
 * Popup PREVENDITE DR7 — 14/09/2026.
 *
 * Testi e interruttore stanno nel gestionale (Prevendita e Promozioni > Popup
 * Sito): qui dentro non c'e' niente di scritto a mano che la direzione non
 * possa cambiare.
 *
 * Non compare mai: se e' spento, se non c'e' nemmeno una prevendita in
 * vendita, se il cliente e' gia' sulla pagina Prevendite, o se lo ha chiuso da
 * meno dei giorni impostati.
 */

const CHIAVE_CHIUSURA = 'dr7_popup_prevendite_chiuso';

const PrevenditePopup: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [impostazioni, setImpostazioni] = useState<ImpostazioniPrevendite>(IMPOSTAZIONI_DEFAULT);
  const [visibile, setVisibile] = useState(false);

  useEffect(() => {
    // Sulla pagina Prevendite e in checkout non ha senso: e' gia' li'.
    const percorsiEsclusi = ['/prevendite', '/payment', '/checkout', '/book/'];
    if (percorsiEsclusi.some(p => location.pathname.startsWith(p))) return;

    let annullato = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    Promise.all([getImpostazioniPrevendite(), getCatalogoPrevendite()]).then(([imp, catalogo]) => {
      if (annullato) return;
      setImpostazioni(imp);
      if (!imp.popup_attivo) return;

      const inVendita = catalogo.filter(p => p.posti_totali === null || p.posti_venduti < p.posti_totali);
      if (inVendita.length === 0) return;

      // Chi lo ha gia' chiuso non lo rivede per i giorni decisi dalla direzione.
      try {
        const chiusoIl = Number(localStorage.getItem(CHIAVE_CHIUSURA) || 0);
        const giorni = Number(imp.popup_giorni_ricomparsa) || 0;
        if (chiusoIl && giorni > 0 && Date.now() - chiusoIl < giorni * 86400000) return;
      } catch {
        // localStorage non disponibile (navigazione privata): si mostra.
      }

      // Un attimo di respiro: la pagina deve prima aprirsi.
      timer = setTimeout(() => { if (!annullato) setVisibile(true); }, 1800);
    });

    return () => { annullato = true; if (timer) clearTimeout(timer); };
  }, [location.pathname]);

  const chiudi = () => {
    setVisibile(false);
    try { localStorage.setItem(CHIAVE_CHIUSURA, String(Date.now())); } catch { /* ignora */ }
  };

  return (
    <AnimatePresence>
      {visibile && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={chiudi}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative bg-black border border-white/20 w-full max-w-md sm:rounded-2xl p-8 sm:p-10 text-center"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={chiudi}
              aria-label={t({ it: 'Chiudi', en: 'Close' })}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors text-sm"
            >
              {t({ it: 'CHIUDI', en: 'CLOSE' })}
            </button>

            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-[0.2em]">
              {impostazioni.popup_titolo}
            </h2>

            <p className="text-sm sm:text-base text-white/85 mt-5 leading-relaxed">
              {impostazioni.popup_sottotitolo}
            </p>

            <p className="text-sm text-white/60 mt-4 leading-relaxed">
              {impostazioni.popup_testo}
            </p>

            {impostazioni.popup_nota && (
              <p className="text-xs text-white/50 mt-4 uppercase tracking-[0.15em]">
                {impostazioni.popup_nota}
              </p>
            )}

            <button
              type="button"
              onClick={() => { chiudi(); navigate('/prevendite'); }}
              className="mt-8 w-full bg-white text-black py-4 font-bold text-sm tracking-[0.15em] hover:bg-gray-200 transition-colors"
            >
              {impostazioni.popup_cta}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PrevenditePopup;
