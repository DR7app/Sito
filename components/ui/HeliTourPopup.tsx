import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../supabaseClient';
import { useNoleggioCatalog, type NoleggioCatalogItem, type TourDuration } from '../../hooks/useNoleggioCatalog';
import TourBookingModal from './TourBookingModal';
import { useTranslation } from '../../hooks/useTranslation';

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
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items } = useNoleggioCatalog('heli_rental');
  const [tourItem, setTourItem] = useState<NoleggioCatalogItem | null>(null);
  const [open, setOpen] = useState(false);
  const [booking, setBooking] = useState(false);
  const [authPrompt, setAuthPrompt] = useState(false);
  const [selDuration, setSelDuration] = useState<TourDuration | null>(null);

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

  const onPrenota = (d: TourDuration | null) => {
    setSelDuration(d);
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
            // Backdrop = contenitore di scroll a tutto schermo. Su mobile il
            // pannello (immagine 9:16 + durate) può superare l'altezza utile:
            // senza scroll qui restava bloccato con la × fuori schermo.
            className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-black/70 backdrop-blur-sm"
          >
            <div
              className="min-h-full flex items-start sm:items-center justify-center p-4"
              onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
            >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative w-full max-w-[340px] my-4 bg-black border border-white/[0.12] rounded-2xl overflow-hidden"
            >
              <button
                type="button"
                onClick={close}
                aria-label={t({ it: "Chiudi", en: "Close" })}
                className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {tourItem.image_url ? (
                <img src={tourItem.image_url} alt={tourItem.name} className="w-full aspect-[9/16] max-h-[50dvh] object-cover" />
              ) : (
                <div className="w-full aspect-[9/16] max-h-[50dvh] bg-white/5 flex items-center justify-center text-gray-600">DR7</div>
              )}

              <div className="p-5">
                {tourItem.capacity != null && (
                  <div className="text-xs text-gray-400 mb-3 text-right">{t({ it: "Fino a", en: "Up to" })} {tourItem.capacity} {t({ it: "persone", en: "people" })}</div>
                )}
                {tourItem.tour_durations && tourItem.tour_durations.length > 0 ? (
                  <div className="space-y-2">
                    {tourItem.tour_durations.map((d, i) => (
                      <button
                        key={i}
                        onClick={() => onPrenota(d)}
                        className={`w-full text-left rounded-xl border p-3 transition-colors ${d.best_value ? 'border-white bg-white/10' : 'border-gray-700 hover:border-gray-500'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white font-semibold">
                            {d.label}{d.best_value && <span className="ml-2 text-xs text-yellow-400">★ {t({ it: "MIGLIOR VALORE", en: "BEST VALUE" })}</span>}
                          </span>
                          <span className="text-white font-bold">{eur(Math.round(d.price * 100))}<span className="text-xs text-gray-400">{t({ it: "/persona", en: "/person" })}</span></span>
                        </div>
                        {d.description && <p className="text-xs text-gray-400 mt-1">{d.description}</p>}
                      </button>
                    ))}
                    <p className="text-[11px] text-gray-500 pt-1 text-center">{t({ it: "Scegli la durata per prenotare", en: "Choose a duration to book" })}</p>
                  </div>
                ) : (
                  <>
                    {tourItem.price_per_day > 0 ? (
                      <div className="text-white font-semibold">{eur(tourItem.price_per_day)}<span className="text-xs text-gray-400">{t({ it: "/persona", en: "/person" })}</span></div>
                    ) : (
                      <div className="text-gray-300 text-sm font-medium">{t({ it: "Prezzo su richiesta", en: "Price on request" })}</div>
                    )}
                    <button
                      onClick={() => onPrenota(null)}
                      className="mt-4 w-full px-4 py-3 rounded-full bg-white text-black font-semibold hover:opacity-90 transition-opacity"
                    >
                      {t({ it: "Prenota il tour", en: "Book the tour" })}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {booking && tourItem && (
        <TourBookingModal
          item={tourItem}
          selectedDuration={selDuration}
          waHref={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Ciao DR7, vorrei prenotare l'elicottero: ${tourItem.name}${selDuration ? ` (${selDuration.label})` : ''}.`)}`}
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
            <h3 className="text-xl font-semibold text-white">{t({ it: "Accedi per prenotare", en: "Sign in to book" })}</h3>
            <p className="mt-2 text-sm text-gray-400">{t({ it: "Per prenotare il tour devi essere registrato e accedere al tuo account DR7.", en: "To book the tour you must be registered and signed in to your DR7 account." })}</p>
            <div className="mt-6 space-y-3">
              <button onClick={() => goAuth('/signin')} className="w-full px-4 py-3 rounded-full bg-white text-black font-semibold hover:opacity-90 transition-opacity">{t({ it: "Accedi", en: "Sign in" })}</button>
              <button onClick={() => goAuth('/signup')} className="w-full px-4 py-3 rounded-full bg-transparent border-2 border-white text-white font-semibold hover:bg-white hover:text-black transition-colors">{t({ it: "Registrati", en: "Sign up" })}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HeliTourPopup;
