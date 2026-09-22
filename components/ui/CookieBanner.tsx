import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';

const CookieBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const consent = localStorage.getItem('dr7-cookie-consent');
    if (consent === null) {
      // Delay showing the banner slightly to avoid layout shift on load
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleConsent = (consent: boolean) => {
    localStorage.setItem('dr7-cookie-consent', String(consent));
    const status = consent ? 'granted' : 'denied';
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        ad_storage: status,
        ad_user_data: status,
        ad_personalization: status,
        analytics_storage: status,
      });
    }
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Centered cookie popup */}
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="w-full max-w-lg"
              role="dialog"
              aria-live="polite"
              aria-label={t({ it: 'Consenso ai cookie', en: 'Cookie consent' })}
            >
            <div className="bg-[#181818] border border-white/10 p-8 md:p-10">
              {/* Welcome message */}
              <div className="text-center mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-wide mb-2">
                  {t({ it: "WELCOME TO DR7", en: "WELCOME TO DR7" })}
                </h1>
                <div className="w-16 h-0.5 bg-white mx-auto" />
              </div>

              {/* Cookie message */}
              <div className="text-center mb-8">
                <h2 className="text-base font-semibold text-white mb-4 uppercase tracking-wider">
                  {t({ it: "Privacy & Compliance Excellence", en: "Privacy & Compliance Excellence" })}
                </h2>
                <p className="text-sm text-white/80 leading-relaxed mb-4">
                  {t({ it: "DR7 adotta tecnologie avanzate per garantire un'esperienza di navigazione impeccabile, personalizzata e conforme ai più alti standard internazionali. Utilizziamo cookie per ottimizzare le performance del sito, migliorare i nostri servizi e analizzare il traffico in totale sicurezza.", en: "DR7 uses advanced technologies to ensure a flawless, personalised browsing experience that meets the highest international standards. We use cookies to optimise site performance, improve our services and analyse traffic in complete security." })}
                </p>
                <p className="text-sm text-white/80 leading-relaxed mb-4">
                  {t({ it: "Procedendo e cliccando \"Accetta\", confermi il tuo consenso all'utilizzo dei cookie come descritto nella nostra", en: "By proceeding and clicking \"Accept\", you consent to the use of cookies as described in our" })}{' '}
                  <Link to="/cookie-policy" className="text-white underline hover:text-white/90 transition-colors font-semibold">
                    {t({ it: "Cookie Policy", en: "Cookie Policy" })}
                  </Link>.
                </p>
                <p className="text-xs text-white/70 italic">
                  {t({ it: "Accedendo al sito, dichiari inoltre di avere più di 18 anni.", en: "By accessing the site, you also declare that you are over 18 years of age." })}
                </p>
              </div>

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => handleConsent(false)}
                  className="px-8 py-3 border border-white text-white text-sm font-semibold uppercase tracking-widest transition-all duration-300 hover:bg-white hover:text-black"
                  style={{ backgroundColor: 'transparent' }}
                >
                  {t({ it: "RIFIUTA", en: "DECLINE" })}
                </button>
                <button
                  onClick={() => handleConsent(true)}
                  className="px-8 py-3 border border-white text-sm font-semibold uppercase tracking-widest transition-all duration-300 hover:bg-transparent hover:text-white"
                  style={{ backgroundColor: 'white', color: 'black' }}
                >
                  {t({ it: "ACCETTA", en: "ACCEPT" })}
                </button>
              </div>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CookieBanner;
