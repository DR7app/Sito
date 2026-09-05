/**
 * NoleggioServicePage — pagina pubblica DINAMICA per Noleggio Mare (barche)
 * e Noleggio Aria (elicotteri). Legge `noleggio_catalog` (solo attivi) via
 * useNoleggioCatalog. Se il catalogo e' vuoto NON mostra nulla. Ogni scheda ha
 * "Richiedi Preventivo" che apre WhatsApp con l'operatore per concordare
 * disponibilita' e preventivo (no booking/pagamento online).
 */
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNoleggioCatalog, type NoleggioServiceType, type NoleggioCatalogItem } from '../hooks/useNoleggioCatalog';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../supabaseClient';
import TourBookingModal from '../components/ui/TourBookingModal';
import { useTranslation } from '../hooks/useTranslation';

const WHATSAPP_NUMBER = '393457905205';

interface Bilingual { it: string; en: string }

interface NoleggioServicePageProps {
  serviceType: NoleggioServiceType;
  title: Bilingual;    // "Noleggio Mare" / "Sea Rentals"
  subtitle: Bilingual; // tagline
  asset: Bilingual;    // "la barca" / "the boat"
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

export default function NoleggioServicePage({ serviceType, title, subtitle, asset }: NoleggioServicePageProps) {
  const { t, getTranslated } = useTranslation();
  const { items, loading } = useNoleggioCatalog(serviceType);

  // Quali tour (catalog item) hanno almeno una partenza programmata futura:
  // per quelli mostriamo "Prenota il tour" (data->orario->posti->pagamento),
  // gli altri restano su "Richiedi Preventivo" via WhatsApp.
  const [tourItemIds, setTourItemIds] = useState<Set<string>>(new Set());
  const [openTour, setOpenTour] = useState<NoleggioCatalogItem | null>(null);
  // Modalita' sito impostata dall'admin (Interruttori ON/OFF): 'preventivo' =
  // solo richiesta preventivo via WhatsApp; 'bookable' = tour prenotabili online.
  // Default 'bookable' per non cambiare il comportamento esistente.
  const [bookingMode, setBookingMode] = useState<'preventivo' | 'bookable'>('bookable');
  // Per prenotare un tour bisogna essere loggati (come ovunque sul sito). Se non
  // loggato, "Prenota il tour" apre un popup che invita ad accedere/registrarsi.
  const [authPrompt, setAuthPrompt] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const goAuth = (path: '/signin' | '/signup') => {
    setAuthPrompt(false);
    navigate(path, { state: { from: { pathname: location.pathname } } });
  };
  const handlePrenotaTour = (item: NoleggioCatalogItem) => {
    if (!user) { setAuthPrompt(true); return; }
    setOpenTour(item);
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const todayYmd = new Date().toLocaleDateString('en-CA');
      const { data } = await supabase
        .from('noleggio_tour_departures')
        .select('catalog_id')
        .eq('status', 'scheduled')
        .gte('departure_date', todayYmd);
      if (cancelled) return;
      setTourItemIds(new Set((data || []).map((r: { catalog_id: string }) => r.catalog_id)));
    })();
    return () => { cancelled = true; };
  }, [items.length]);

  // Legge la modalita' sito dal business corrispondente in centralina_pro_config.
  useEffect(() => {
    let cancelled = false;
    const row =
      serviceType === 'boat_rental' ? 'business_mare' :
      serviceType === 'heli_rental' ? 'business_aria' :
      serviceType === 'stay_rental' ? 'business_soggiorni' : null;
    if (!row) return;
    (async () => {
      const { data } = await supabase
        .from('centralina_pro_config')
        .select('config')
        .eq('id', row)
        .maybeSingle();
      if (cancelled) return;
      const mode = (data?.config as { booking_mode?: string } | null)?.booking_mode;
      setBookingMode(mode === 'preventivo' ? 'preventivo' : 'bookable');
    })();
    return () => { cancelled = true; };
  }, [serviceType]);

  // Catalogo vuoto => la pagina non mostra nulla (richiesta esplicita).
  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-dr7-gold border-t-transparent animate-spin" />
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <div className="bg-black text-white min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 pb-20">
        <header className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-light tracking-tight">{getTranslated(title)}</h1>
          <p className="mt-3 text-gray-400 max-w-2xl mx-auto">{getTranslated(subtitle)}</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map(item => {
            const message =
              `Ciao DR7, vorrei richiedere un preventivo per ${asset.it}: ${item.name}. ` +
              `Potete inviarmi disponibilità e preventivo?`;
            const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
            return (
              <div key={item.id} className="bg-black/70 border border-gray-800 rounded-lg overflow-hidden group transition-all duration-300 hover:border-white/50 hover:shadow-2xl hover:shadow-white/10 flex flex-col">
                <div className="relative overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full aspect-[9/16] object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full aspect-[9/16] bg-white/5 flex items-center justify-center text-gray-600 text-sm">DR7</div>
                  )}
                </div>
                <div className="px-6 pt-6 pb-4 flex flex-col flex-1">
                  <div className="flex items-start gap-3">
                    {item.price_per_day > 0 ? (
                      <div className="text-white font-semibold whitespace-nowrap">{eur(item.price_per_day)}<span className="text-xs text-gray-400">{t({ it: "/giorno", en: "/day" })}</span></div>
                    ) : (
                      <div className="text-gray-300 font-medium text-sm whitespace-nowrap">{t({ it: "Prezzo su richiesta", en: "Price on request" })}</div>
                    )}
                  </div>
                  {item.capacity != null && (
                    <div className="mt-1 text-xs text-gray-400">{t({ it: "Fino a", en: "Up to" })} {item.capacity} {t({ it: "persone", en: "people" })}</div>
                  )}
                  <div className="flex-1" />
                  {bookingMode === 'bookable' && tourItemIds.has(item.id) ? (
                    <button
                      onClick={() => handlePrenotaTour(item)}
                      className="mt-5 inline-flex items-center justify-center gap-2 w-full px-4 py-3 bg-white text-black font-semibold transition-all duration-300 hover:opacity-90"
                    >
                      {t({ it: "Prenota il tour", en: "Book the tour" })}
                    </button>
                  ) : (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center justify-center gap-2 w-full px-4 py-3 bg-transparent border-2 border-white text-white font-semibold transition-all duration-300 hover:bg-white hover:text-black"
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.728-.979zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z"/></svg>
                      {t({ it: "Richiedi Preventivo", en: "Request a Quote" })}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-gray-500">
          {t({ it: 'Disponibilità e preventivo si concordano direttamente con il nostro operatore via WhatsApp.', en: 'Availability and pricing are agreed directly with our operator on WhatsApp.' })}
        </p>
      </div>

      {openTour && (
        <TourBookingModal
          item={openTour}
          waHref={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Ciao DR7, vorrei prenotare ${asset.it}: ${openTour.name}.`)}`}
          onClose={() => setOpenTour(null)}
        />
      )}

      {/* Popup: accesso richiesto per prenotare il tour */}
      {authPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => setAuthPrompt(false)}>
          <div className="bg-black/85 backdrop-blur-sm border border-gray-800 rounded-2xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end -mt-2 -mr-2">
              <button onClick={() => setAuthPrompt(false)} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <h3 className="text-xl font-semibold text-white">{t({ it: "Accedi per prenotare", en: "Sign in to book" })}</h3>
            <p className="mt-2 text-sm text-gray-400">
              {t({ it: 'Per prenotare il tour devi essere registrato e accedere al tuo account DR7.', en: 'To book the tour you must be registered and signed in to your DR7 account.' })}
            </p>
            <div className="mt-6 space-y-3">
              <button
                onClick={() => goAuth('/signin')}
                className="w-full px-4 py-3 bg-white text-black font-semibold hover:opacity-90 transition-opacity"
              >
                {t({ it: "Accedi", en: "Sign in" })}
              </button>
              <button
                onClick={() => goAuth('/signup')}
                className="w-full px-4 py-3 bg-transparent border-2 border-white text-white font-semibold hover:bg-white hover:text-black transition-colors"
              >
                {t({ it: "Registrati", en: "Sign up" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
