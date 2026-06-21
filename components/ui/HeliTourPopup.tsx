import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../supabaseClient';
import { useNoleggioCatalog, type NoleggioCatalogItem } from '../../hooks/useNoleggioCatalog';
import TourBookingModal from './TourBookingModal';

const SESSION_KEY = 'dr7_heli_tour_popup_dismissed';
const CAR_POPUP_KEY = 'dr7_auto_booking_popup_dismissed';
const DELAY_MS = 6000; // 6s dopo l'arrivo in homepage.
const WHATSAPP_NUMBER = '393457905205';

function eur(cents: number): string {
  return (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

/**
 * HeliTourPopup
 * -------------
 * Popup promozionale in homepage che mostra l'ELICOTTERO con un tour
 * prenotabile (l'unico con una partenza programmata futura — "questo specifico
 * elicottero") e un CTA "Prenota il tour". Per prenotare bisogna essere loggati
 * (come ovunque): se non autenticato, mostra il popup Accedi/Registrati.
 * Stessa logica del popup auto: una sola apparizione per tab.
 */
const HeliTourPopup: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items } = useNoleggioCatalog('heli_rental');
  const [tourItem, setTourItem] = useState<NoleggioCatalogItem | null>(null);
  const [open, setOpen] = useState(false);
  const [booking, setBooking] = useState(false);
  const [authPrompt, setAuthPrompt] = useState(false);

  // L'elicottero "specifico" = quello con almeno una partenza tour programmata
  // futura (quindi realmente prenotabile online).
  useEffect(() => {
    if (!items.length) { setTourItem(null); return; }
    let cancelled = false;
    (async () => {
      const todayYmd = new Date().toLocaleDateString('en-CA');
      const { data } = await supabase
        .from('noleggio_tour_departures')
        .select('catalog_id')
        .eq('status', 'scheduled')
        .gte('departure_date', todayYmd);
      if (cancelled) return;
      const ids = new Set((data || []).map((r: { catalog_id: string }) => r.catalog_id));
      setTourItem(items.find(i => ids.has(i.id)) || null);
    })();
    return () => { cancelled = true; };
  }, [items]);

  useEffect(() => {
    if (location.pathname !== '/') return;
    if (!tourItem) return;
    try { if (sessionStorage.getItem(SESSION_KEY) === '1') return; } catch { /* ignore */ }
    const t = setTimeout(() => {
      setOpen(true);
      // Evita doppio popup: sopprime il popup auto "Prenota Ora" (auto) per
      // questa sessione, così non si accavallano.
      try { sessionStorage.setItem(CAR_POPUP_KEY, '1'); } catch { /* ignore */ }
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [location.pathname, tourItem]);

  const close = () => {
    setOpen(false);
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
  };

  const onPrenota = () => {
    if (!user) { setAuthPrompt(true); return; }
    setOpen(false);
    setBooking(true);
  };
  const goAuth = (path: '/signin' | '/signup') => {
    // IMPORTANTE: questo popup vive a livello App (fuori dalle Route), quindi
    // cambiare rotta NON lo smonta: va chiuso a mano, altrimenti l'overlay
    // resta sopra la pagina di accesso e "sembra che non succeda nulla".
    setAuthPrompt(false);
    setOpen(false);
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
    navigate(path, { state: { from: { pathname: '/noleggio-aria' } } });
  };

  return (
    <>
      <AnimatePresence>
        {open && tourItem && (
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
              className="relative w-full max-w-[340px] bg-black border border-white/[0.12] rounded-2xl overflow-hidden"
            >
              <button
                type="button"
                onClick={close}
                aria-label="Chiudi"
                className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {tourItem.image_url ? (
                <img src={tourItem.image_url} alt={tourItem.name} className="w-full aspect-[9/16] object-cover" />
              ) : (
                <div className="w-full aspect-[9/16] bg-white/5 flex items-center justify-center text-gray-600">DR7</div>
              )}

              <div className="p-5">
                <div className="flex items-center justify-between gap-2">
                  {tourItem.price_per_day > 0 ? (
                    <div className="text-white font-semibold">{eur(tourItem.price_per_day)}<span className="text-xs text-gray-400">/persona</span></div>
                  ) : (
                    <div className="text-gray-300 text-sm font-medium">Prezzo su richiesta</div>
                  )}
                  {tourItem.capacity != null && (
                    <div className="text-xs text-gray-400">Fino a {tourItem.capacity} persone</div>
                  )}
                </div>
                <button
                  onClick={onPrenota}
                  className="mt-4 w-full px-4 py-3 rounded-full bg-white text-black font-semibold hover:opacity-90 transition-opacity"
                >
                  Prenota il tour
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {booking && tourItem && (
        <TourBookingModal
          item={tourItem}
          waHref={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Ciao DR7, vorrei prenotare l'elicottero: ${tourItem.name}.`)}`}
          onClose={() => setBooking(false)}
        />
      )}

      {/* Popup: accesso richiesto per prenotare */}
      {authPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => setAuthPrompt(false)}>
          <div className="bg-black border border-gray-800 rounded-2xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end -mt-2 -mr-2">
              <button onClick={() => setAuthPrompt(false)} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <h3 className="text-xl font-semibold text-white">Accedi per prenotare</h3>
            <p className="mt-2 text-sm text-gray-400">Per prenotare il tour devi essere registrato e accedere al tuo account DR7.</p>
            <div className="mt-6 space-y-3">
              <button onClick={() => goAuth('/signin')} className="w-full px-4 py-3 rounded-full bg-white text-black font-semibold hover:opacity-90 transition-opacity">Accedi</button>
              <button onClick={() => goAuth('/signup')} className="w-full px-4 py-3 rounded-full bg-transparent border-2 border-white text-white font-semibold hover:bg-white hover:text-black transition-colors">Registrati</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HeliTourPopup;
