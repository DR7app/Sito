import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import BookingSearchBox from './BookingSearchBox';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';

const SESSION_KEY = 'dr7_auto_booking_popup_dismissed';
const DELAY_MS = 8000; // 8 seconds after page mount on the homepage.

/**
 * AutoBookingPopup
 * ----------------
 * Surfaces the "Prenota Ora" search box automatically a few seconds after
 * the customer lands on the homepage. Designed as a soft prompt — the user
 * can dismiss it (X button or backdrop click) and continue browsing.
 *
 * Behaviour:
 *   • Only triggers on the homepage (`/`). Deep pages don't get interrupted.
 *   • Single appearance per browser tab — once dismissed it does NOT reopen
 *     for that session (sessionStorage flag).
 *   • Skipped entirely if the customer has already dismissed it.
 *   • Skipped when the search params already include pickup/return dates
 *     (the customer is mid-flow, no need to nag).
 */
const AutoBookingPopup: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (location.pathname !== '/') return;
    // Auth gate: il popup auto-pre-compila date ma il booking finale richiede
    // login. Se non autenticato non serve a niente — niente nag.
    if (!user) return;

    // Don't surface again if dismissed earlier this session.
    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') return;
    } catch { /* sessionStorage may be blocked — keep going */ }

    // Don't surface if the URL already carries booking params (link-in flow).
    const params = new URLSearchParams(window.location.search);
    if (params.get('pickup') || params.get('return') || params.get('pickupDate')) return;

    // Suppress this nag if the customer has manually opened "Prenota Ora"
    // from the header / side menu — both during the 8s wait and at fire time.
    // Without this, the customer types dates in the manual popup and the
    // auto-popup pops over on top at the 8s mark.
    let cancelled = false;
    const handleManualOpen = () => {
      cancelled = true;
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
    };
    window.addEventListener('dr7:prenota-ora:manual-opened', handleManualOpen);

    const t = setTimeout(() => {
      // Final check — if a manual popup mounted right before the timer fired
      // but didn't dispatch (older code path), DOM presence is the source of
      // truth.
      const manualOpen = document.querySelector('[data-prenota-ora-manual="true"]');
      if (cancelled || manualOpen) {
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
        return;
      }
      setOpen(true);
    }, DELAY_MS);

    return () => {
      clearTimeout(t);
      window.removeEventListener('dr7:prenota-ora:manual-opened', handleManualOpen);
    };
  }, [location.pathname, user]);

  const close = () => {
    setOpen(false);
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="relative w-full max-w-[420px] bg-[#1c1c1e]/95 backdrop-blur-2xl border border-white/[0.08] rounded-[20px] p-6"
          >
            <button
              type="button"
              onClick={close}
              aria-label={t({ it: "Chiudi", en: "Close" })}
              className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-[20px] font-semibold text-white text-center mb-1 tracking-tight">{t({ it: "Prenota Ora", en: "Book Now" })}</h3>
            <p className="text-xs text-white/60 text-center mb-5">{t({ it: "Inserisci date e luogo per vedere i veicoli disponibili", en: "Enter dates and location to see available vehicles" })}</p>
            <BookingSearchBox variant="popup" onClose={close} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AutoBookingPopup;
