import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { useNavigate } from 'react-router-dom';
import { type VehicleCategory } from '../utils/vehicleClassification';
import { classifyVehicle as classifyWashVehicle } from '../utils/classifyWashVehicle';
import { lookupTarga, isValidItalianPlate, normalizePlate, type TargaResult } from '../utils/lookupTarga';
import { useCarWashServices } from '../hooks/useCarWashServices';
import SeatPlanPicker from '../components/ui/SeatPlanPicker';
import { seatLabel, isSeatPricedService } from '../utils/seatPlan';
import RiquadroCatalogo from '../components/ui/RiquadroCatalogo';
import SEOHead from '../components/seo/SEOHead';
import { getCarWashCopy, type CarWashCopy } from '../utils/siteCopy';
import { useContactInfo } from '../hooks/useContactInfo';

export interface WashService {
  id: string;
  name: string;
  nameEn: string;
  price: number;
  duration: string;
  description: string;
  descriptionEn: string;
  features: string[];
  featuresEn: string[];
  image?: string;
  priceUnit?: string;
  priceOptions?: { label: string; price: number }[];
}

// Alias for backward compatibility
export type Service = WashService;

interface CartItem {
  service: WashService;
  quantity: number;
  selectedOption?: { label: string; price: number };
  /** Sigle dei sedili scelti sulla pianta (solo servizi venduti a sedile).
   *  Quando c'e', `quantity` e' sempre `seats.length`. */
  seats?: string[];
}

/**
 * Servizi venduti a sedile: si riconoscono dal catalogo (unita' di prezzo o
 * nome), non da una lista di id scritta qui. Cosi' un nuovo servizio a
 * sedile aggiunto dall'admin apre la pianta senza toccare il codice.
 */
const isSeatService = (s: WashService): boolean => isSeatPricedService(s.name, s.priceUnit);

// COMBINED WASH SERVICES (Urban + Maxi paired) — UI scaffolding for the
// side-by-side comparison cards. Service data (price, features) comes
// from the DB via useCarWashServices(); only the comparison-card
// image + suffix→pairing rule is defined here.
interface CombinedWashService {
  id: string;
  name: string;
  nameEn: string;
  image: string;
  urban: WashService;
  maxi: WashService;
}

const COMBINED_TEMPLATES: { suffix: string; name: string; nameEn: string; image: string }[] = [
  { suffix: 'exterior',  name: 'PRIME EXTERIOR CLEAN', nameEn: 'PRIME EXTERIOR CLEAN', image: '/combined-exterior.jpeg' },
  { suffix: 'interior',  name: 'PRIME INTERIOR CLEAN', nameEn: 'PRIME INTERIOR CLEAN', image: '/combined-interior.jpeg' },
  { suffix: 'full',      name: 'PRIME FULL CLEAN',     nameEn: 'PRIME FULL CLEAN',     image: '/combined-full.jpeg' },
  { suffix: 'full-n2',   name: 'PRIME FULL CLEAN N2',  nameEn: 'PRIME FULL CLEAN N2',  image: '/combined-full-n2.jpeg' },
  { suffix: 'top-shine', name: 'PRIME TOP SHINE',      nameEn: 'PRIME TOP SHINE',      image: '/combined-topshine.jpeg' },
  { suffix: 'vip',       name: 'PRIME VIP',            nameEn: 'PRIME VIP',            image: '/combined-vip.jpeg' },
  { suffix: 'luxury',    name: 'PRIME LUXURY',         nameEn: 'PRIME LUXURY',         image: '/combined-luxury.jpeg' },
];

type MainTabType = 'lavaggio' | 'meccanica';
type LavaggioCategory = 'moto' | 'wash' | 'extra' | 'experience';
type MeccanicaCategory = 'tech';

// Manual wash-category override the customer can always set after a targa
// lookup. 'urban'/'maxi' drive the combined-card price tier; 'moto' routes to
// the Prime Moto services. This is the value persisted on the booking.
type WashOverrideCategory = 'urban' | 'maxi' | 'moto';

// Static Tailwind classes per override category (literals so JIT keeps them).
const WASH_OVERRIDE_OPTIONS: { id: WashOverrideCategory; label: string; selected: string; idle: string }[] = [
  { id: 'urban', label: 'PRIME URBAN', selected: 'bg-emerald-600/20 text-emerald-400 border-2 border-emerald-500', idle: 'bg-gray-800 text-gray-300 border border-gray-600 hover:border-emerald-500' },
  { id: 'maxi',  label: 'PRIME MAXI',  selected: 'bg-amber-600/20 text-amber-400 border-2 border-amber-500',       idle: 'bg-gray-800 text-gray-300 border border-gray-600 hover:border-amber-500' },
  { id: 'moto',  label: 'PRIME MOTO',  selected: 'bg-sky-600/20 text-sky-400 border-2 border-sky-500',             idle: 'bg-gray-800 text-gray-300 border border-gray-600 hover:border-sky-500' },
];

const LAVAGGIO_CATEGORIES = [
  { id: 'wash' as LavaggioCategory, name: 'LAVAGGIO', nameEn: 'CAR WASH' },
  { id: 'moto' as LavaggioCategory, name: 'PRIME MOTO EXPERIENCE', nameEn: 'PRIME MOTO EXPERIENCE' },
];

const MECCANICA_CATEGORIES = [
  { id: 'tech' as MeccanicaCategory, name: 'PRIME TECH SERVICE', nameEn: 'PRIME TECH SERVICE', subtitle: 'manodopera' },
];

const CarWashServicesPage: React.FC = () => {
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const contact = useContactInfo();
  const [copy, setCopy] = useState<CarWashCopy | null>(null);
  useEffect(() => {
    let cancelled = false;
    getCarWashCopy().then((c) => { if (!cancelled) setCopy(c); });
    return () => { cancelled = true; };
  }, []);
  // Helper for IT/EN switch with safe fallback while config loads.
  const cw = (it: keyof CarWashCopy, en: keyof CarWashCopy, fallback = ''): string => {
    if (!copy) return fallback;
    const k = lang === 'it' ? it : en;
    return (copy as Record<string, string>)[k as string] || fallback;
  };
  const [mainTab, setMainTab] = useState<MainTabType>('lavaggio');
  const [lavaggioCategory, setLavaggioCategory] = useState<LavaggioCategory>('wash');
  const [meccanicaCategory, setMeccanicaCategory] = useState<MeccanicaCategory>('tech');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  // Pianta sedili aperta: `index` valorizzato = si sta modificando una riga
  // gia' nel carrello, altrimenti si sta aggiungendo.
  const [seatPicker, setSeatPicker] = useState<
    { service: WashService; index: number | null; initial: string[]; fromUpsell: boolean } | null
  >(null);
  const [showUpsell, setShowUpsell] = useState(false);
  const [upsellStep, setUpsellStep] = useState<1 | 2>(1);
  const [upsellSelectedService, setUpsellSelectedService] = useState<WashService | null>(null);
  const [upsellAddedExtras, setUpsellAddedExtras] = useState<Set<string>>(new Set());
  const [detectedCategory, setDetectedCategory] = useState<VehicleCategory | null>(null);
  const [detectedModel, setDetectedModel] = useState<string | null>(null);

  // Single source of truth: admin Catalogo Lavaggio (car_wash_services table).
  // useCarWashServices() fetches once per page load with module-level cache.
  const dbServices = useCarWashServices();

  const liveUrban = dbServices.filter(s => s.category === 'urban');
  const liveMaxi = dbServices.filter(s => s.category === 'maxi');
  const liveExtra = dbServices.filter(s => s.category === 'extra');
  const liveMoto = dbServices.filter(s => s.category === 'moto');
  const liveExperience = dbServices.filter(s => s.category === 'experience');
  const liveTech = dbServices.filter(s => s.category === 'tech');

  // Combined cards pair URBAN+MAXI services that share the same suffix
  // (e.g. urban-exterior + maxi-exterior). If either side is missing in DB,
  // that combined card is skipped silently.
  const liveCombined: CombinedWashService[] = COMBINED_TEMPLATES
    .map(tpl => {
      const urban = liveUrban.find(s => s.id === `urban-${tpl.suffix}`);
      const maxi = liveMaxi.find(s => s.id === `maxi-${tpl.suffix}`);
      if (!urban || !maxi) return null;
      // 2026-07-24: l'immagine della card combinata viene dal Catalogo Lavaggio
      // (urban/maxi.image). Prima usava tpl.image hardcoded: cambiare la foto
      // dall'admin non aveva effetto. Fallback al template solo se il catalogo
      // non ha immagine.
      return { id: `combined-${tpl.suffix}`, name: tpl.name, nameEn: tpl.nameEn, image: urban.image || maxi.image || tpl.image, urban, maxi };
    })
    .filter((x): x is CombinedWashService => x !== null);

  // 2026-07-24: immagine "Absolute Detail" dal Catalogo Lavaggio se presente
  // (servizio con id/nome che contiene "absolute"), altrimenti fallback locale.
  const absoluteDetailService = dbServices.find(s => /absolute/i.test(s.id) || /absolute/i.test(s.name || '') || /absolute/i.test(s.nameEn || ''));
  const absoluteDetailImage = absoluteDetailService?.image;

  // Targa lookup state
  const [targaInput, setTargaInput] = useState('');
  const [targaLoading, setTargaLoading] = useState(false);
  const [targaError, setTargaError] = useState<string | null>(null);
  const [targaResult, setTargaResult] = useState<TargaResult | null>(null);
  const [targaManualCategory, setTargaManualCategory] = useState<VehicleCategory | null>(null);
  // Source of truth for the chosen wash category (auto-detected, but always
  // user-overridable to Urban/Maxi/Moto). Drives price + what is saved.
  const [washCategory, setWashCategory] = useState<WashOverrideCategory | null>(null);

  const handleTargaSearch = useCallback(async () => {
    const plate = normalizePlate(targaInput);
    if (!isValidItalianPlate(plate)) {
      setTargaError(lang === 'it' ? 'Targa non valida. Inserisci una targa italiana (es. EX117YA).' : 'Invalid plate. Enter an Italian plate (e.g. EX117YA).');
      return;
    }
    setTargaLoading(true);
    setTargaError(null);
    setTargaResult(null);
    setTargaManualCategory(null);
    setDetectedCategory(null);
    setDetectedModel(null);
    try {
      const result = await lookupTarga(plate);
      setTargaResult(result);
      // Deterministic Urban-vs-Maxi classification (brand+model+version+bodyType).
      const washClass = classifyWashVehicle({
        brand: result.carMake,
        model: result.carModel,
        version: result.version || result.description,
        bodyType: result.bodyType,
      });
      const makeModel = `${result.carMake} ${result.carModel}`.trim();
      const auto = washClass.toLowerCase() as VehicleCategory;
      setDetectedCategory(auto);
      setDetectedModel(makeModel || null);
      // Preselect the auto-detected tier; the customer can still override it.
      setWashCategory(auto);
    } catch (err: any) {
      setTargaError(err.message || (lang === 'it' ? 'Errore nella ricerca.' : 'Search error.'));
    } finally {
      setTargaLoading(false);
    }
  }, [targaInput, lang]);

  const clearTargaSearch = useCallback(() => {
    setTargaInput('');
    setTargaError(null);
    setTargaResult(null);
    setTargaManualCategory(null);
    setDetectedCategory(null);
    setDetectedModel(null);
    setWashCategory(null);
  }, []);

  // Apply a manual wash-category override (always available after a lookup).
  // 'urban'/'maxi' set the combined-card price tier; 'moto' clears the tier
  // and routes the customer to the Prime Moto services tab.
  const applyWashOverride = useCallback((cat: WashOverrideCategory) => {
    setWashCategory(cat);
    setTargaManualCategory(cat === 'moto' ? null : (cat as VehicleCategory));
    if (cat === 'moto') {
      setDetectedCategory(null);
      setMainTab('lavaggio');
      setLavaggioCategory('moto');
    } else {
      setDetectedCategory(cat as VehicleCategory);
      setLavaggioCategory('wash');
    }
  }, []);

  const getLavaggioServices = (category: LavaggioCategory): WashService[] => {
    switch (category) {
      case 'moto': return liveMoto;
      case 'extra': return liveExtra;
      case 'experience': return liveExperience;
      default: return [];
    }
  };

  const getMeccanicaServices = (category: MeccanicaCategory): WashService[] => {
    switch (category) {
      case 'tech': return liveTech;
      default: return [];
    }
  };

  const MAX_QTY_IDS = ['extra-seat-clean', 'extra-seat-protect', 'extra-child', 'extra-engine', 'extra-odor'];

  /**
   * Aggiunge o aggiorna la riga di un servizio a sedile. La quantita' non si
   * tocca a mano: e' il numero di sedili scelti sulla pianta.
   */
  const applySeatSelection = (
    service: WashService,
    index: number | null,
    seats: string[],
    fromUpsell: boolean,
  ) => {
    setCart(prev => {
      if (index != null && prev[index]) {
        const updated = [...prev];
        updated[index] = { ...updated[index], quantity: seats.length, seats };
        return updated;
      }
      const existing = prev.findIndex(i => i.service.id === service.id && !i.selectedOption);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], quantity: seats.length, seats };
        return updated;
      }
      return [...prev, { service, quantity: seats.length, seats }];
    });
    // Se la pianta e' stata aperta dall'upsell, la card deve passare a
    // "Aggiunto": il carrello e quella lista sono due stati separati.
    setUpsellAddedExtras(prev => new Set(prev).add(service.id));
    setSeatPicker(null);
    // Dall'upsell non si apre il carrello: la card passa gia' a "Aggiunto" e
    // il pannello finirebbe nascosto sotto l'overlay a tutto schermo.
    if (!fromUpsell) setShowCart(true);
  };

  const addToCart = (service: WashService, selectedOption?: { label: string; price: number }) => {
    // Servizio a sedile: prima si sceglie QUALE sedile sulla pianta.
    if (isSeatService(service)) {
      const existing = cart.findIndex(i => i.service.id === service.id && !i.selectedOption);
      setSeatPicker({ service, index: null, initial: existing >= 0 ? (cart[existing].seats || []) : [], fromUpsell: false });
      return;
    }
    setCart(prev => {
      const existingIndex = prev.findIndex(item =>
        item.service.id === service.id &&
        item.selectedOption?.label === selectedOption?.label
      );

      if (existingIndex >= 0) {
        const updated = [...prev];
        const maxQty = MAX_QTY_IDS.includes(service.id) ? 10 : 99;
        if (updated[existingIndex].quantity >= maxQty) return prev;
        updated[existingIndex].quantity += 1;
        return updated;
      }

      return [...prev, { service, quantity: 1, selectedOption }];
    });
    setShowCart(true);
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart(prev => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      const maxQty = MAX_QTY_IDS.includes(updated[index].service.id) ? 10 : 99;
      if (newQty > maxQty) return prev;
      updated[index].quantity = newQty;
      return updated;
    });
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => {
      const price = item.selectedOption?.price || item.service.price;
      return total + (price * item.quantity);
    }, 0);
  };

  const hasWashService = () => {
    return cart.some(item =>
      !item.service.id.startsWith('extra-') && !item.service.id.startsWith('tech-')
    );
  };

  const handleCombinedWashSelect = (service: WashService) => {
    // Add wash to cart WITHOUT opening cart sidebar
    setCart(prev => {
      const existingIndex = prev.findIndex(item =>
        item.service.id === service.id && !item.selectedOption
      );
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex].quantity += 1;
        return updated;
      }
      return [...prev, { service, quantity: 1 }];
    });
    // Open upsell overlay at step 1
    setUpsellSelectedService(service);
    setUpsellAddedExtras(new Set());
    setUpsellStep(1);
    setShowUpsell(true);
  };

  const handleUpsellToggleExtra = (extra: WashService, selectedOption?: { label: string; price: number }) => {
    const trackingKey = selectedOption ? `${extra.id}:${selectedOption.label}` : extra.id;
    const isCurrentlyAdded = upsellAddedExtras.has(trackingKey);
    // Servizio a sedile ancora da aggiungere: apri la pianta invece di
    // metterne uno solo nel carrello.
    if (!isCurrentlyAdded && !selectedOption && isSeatService(extra)) {
      const existing = cart.findIndex(i => i.service.id === extra.id && !i.selectedOption);
      setSeatPicker({ service: extra, index: null, initial: existing >= 0 ? (cart[existing].seats || []) : [], fromUpsell: true });
      return;
    }
    if (isCurrentlyAdded) {
      // Remove from cart
      setCart(prev => prev.filter(item =>
        !(item.service.id === extra.id && item.selectedOption?.label === selectedOption?.label)
      ));
      setUpsellAddedExtras(prev => {
        const next = new Set(prev);
        next.delete(trackingKey);
        return next;
      });
    } else {
      // For priceOptions services, remove any previous option of the same service first
      if (selectedOption) {
        setCart(prev => prev.filter(item => item.service.id !== extra.id));
        setUpsellAddedExtras(prev => {
          const next = new Set(prev);
          // Remove all keys for this service
          for (const key of next) {
            if (key.startsWith(extra.id + ':')) next.delete(key);
          }
          next.add(trackingKey);
          return next;
        });
        setCart(prev => [...prev, { service: extra, quantity: 1, selectedOption }]);
      } else {
        setCart(prev => [...prev, { service: extra, quantity: 1 }]);
        setUpsellAddedExtras(prev => new Set(prev).add(trackingKey));
      }
    }
  };

  const handleNextUpsellStep = () => {
    if (upsellStep === 1) {
      setUpsellStep(2);
    } else {
      setShowUpsell(false);
      setShowCart(true);
    }
  };

  const handleReviewCart = () => {
    setShowUpsell(false);
    setShowCart(true);
  };

  const handleSkipUpsell = () => {
    if (upsellStep === 1) {
      setUpsellStep(2);
    } else {
      setShowUpsell(false);
    }
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;

    // Check if extra care services are selected without a main wash
    const hasExtraCare = cart.some(item => item.service.id.startsWith('extra-'));
    if (hasExtraCare && !hasWashService()) {
      alert(lang === 'it'
        ? 'I servizi Extra Care richiedono la selezione di un lavaggio principale.'
        : 'Extra Care services require selecting a main wash service.');
      return;
    }

    navigate('/car-wash-booking', {
      state: {
        cartItems: cart.map(item => ({
          serviceId: item.service.id,
          serviceName: lang === 'it' ? item.service.name : item.service.nameEn,
          price: item.selectedOption?.price || item.service.price,
          quantity: item.quantity,
          option: item.selectedOption?.label,
          ...(item.seats ? { seats: item.seats } : {})
        })),
        total: getCartTotal(),
        ...(targaResult ? {
          customerVehicle: {
            plate: targaResult.plate,
            carMake: targaResult.carMake,
            carModel: targaResult.carModel,
            description: targaResult.description,
            registrationYear: targaResult.registrationYear,
            fuelType: targaResult.fuelType,
            // The (possibly overridden) wash category — Urban / Maxi / Moto.
            category: washCategory || detectedCategory || targaManualCategory,
          }
        } : {})
      }
    });
  };

  const currentServices = mainTab === 'lavaggio'
    ? getLavaggioServices(lavaggioCategory)
    : getMeccanicaServices(meccanicaCategory);

  const currentCategories = mainTab === 'lavaggio' ? LAVAGGIO_CATEGORIES : MECCANICA_CATEGORIES;
  const activeCategory = mainTab === 'lavaggio' ? lavaggioCategory : meccanicaCategory;

  return (
    <div className="min-h-screen bg-black pt-32 pb-32">
      <SEOHead
        title={lang === 'it' ? 'Autolavaggio Premium Sardegna | Detailing & Cura di Lusso | DR7 Lavaggio & Meccanica' : 'Premium Car Wash Sardinia | Detailing & Luxury Care | DR7 Car Wash & Mechanics'}
        description={lang === 'it' ? 'Autolavaggio professionale, detailing premium, trattamento ceramico e protezione vernice a Cagliari, Sardegna. Pacchetti lavaggio urban e maxi. DR7 Lavaggio & Meccanica.' : 'Professional car wash, premium detailing, ceramic coating and paint protection in Cagliari, Sardinia. Urban and maxi wash packages. DR7 Car Wash & Mechanics.'}
        canonical="/prime-wash"
        jsonLd={{ '@type': 'AutoWash', name: 'DR7 Lavaggio & Meccanica', url: 'https://dr7.app/prime-wash', address: { '@type': 'PostalAddress', addressLocality: 'Cagliari', addressRegion: 'CA', addressCountry: 'IT' }, priceRange: '$$' }}
      />

      {/* Hero banner — Servizi: Lavaggio & Meccanica */}
      <div className="container mx-auto px-4 mb-8">
        <div className="relative max-w-5xl mx-auto rounded-2xl overflow-hidden border border-white/10">
          {/* 06/09/2026 — la fotografia si vede intera.
              Prima era schiacciata in una fascia alta 160px (224 da schermo
              grande) con `object-cover`: di un'immagine 3:2 restava una
              striscia centrale, tagliata sopra e sotto. Ora tiene il suo
              rapporto nativo e il riquadro si adatta a lei. */}
          <img src="/servizi-lavaggio.jpeg" alt="" loading="lazy" decoding="async" className="block h-auto w-full" />
          {/* Il velo scuro copre solo la parte bassa: serve a rendere
              leggibile il titolo, non a spegnere la fotografia. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-end p-5 md:p-7 pt-24">
            <div>
              <p className="text-[11px] tracking-[0.3em] uppercase text-[#C8A24A]">{t({ it: "Servizi", en: "Services" })}</p>
              <h1 className="text-2xl md:text-3xl font-bold text-white">{t({ it: "Lavaggio & Meccanica", en: "Car Wash & Mechanics" })}</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Mandatory Targa Entry — shown FIRST before any services */}
      <div className="container mx-auto px-4 mb-8">
        <div className="max-w-lg mx-auto">
          <label className="block text-white text-lg font-bold mb-2 text-center">
            {cw('plate_label_it', 'plate_label_en', 'Inserisci la targa del tuo veicolo')}
          </label>
          <p className="block text-gray-400 text-sm mb-4 text-center">
            {cw('plate_helper_it', 'plate_helper_en', 'Per continuare, inserisci la targa.')}
          </p>

          {/* Targa Search */}
          <div className="flex gap-2">
            <input
              id="targa-search-input"
              type="text"
              value={targaInput}
              onChange={(e) => setTargaInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
              onKeyDown={(e) => { if (e.key === 'Enter' && isValidItalianPlate(targaInput)) handleTargaSearch(); }}
              placeholder={cw('plate_placeholder_it', 'plate_placeholder_en', 'es. EX117YA')}
              className="flex-1 bg-gray-900/80 border border-gray-700 rounded-full px-5 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors text-center font-mono tracking-widest uppercase"
              maxLength={8}
            />
            <button
              onClick={handleTargaSearch}
              disabled={!isValidItalianPlate(targaInput) || targaLoading}
              className={`px-6 py-3 font-bold text-sm transition-all duration-200 ${
                isValidItalianPlate(targaInput) && !targaLoading
                  ? 'bg-white text-black hover:bg-gray-200'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {targaLoading
                ? cw('plate_searching_it', 'plate_searching_en', 'Cercando...')
                : cw('plate_search_it', 'plate_search_en', 'Cerca')
              }
            </button>
          </div>

          {/* Targa Error — plate not found, manual category pick (Urban/Maxi/Moto) */}
          {targaError && !targaResult && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 text-center"
            >
              <p className="text-red-400 text-sm mb-2">{targaError}</p>
              <p className="text-gray-400 text-xs mb-2">
                {cw('plate_manual_prompt_it', 'plate_manual_prompt_en', 'Seleziona manualmente la categoria:')}
              </p>
              <div className="flex justify-center gap-2">
                {WASH_OVERRIDE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => applyWashOverride(opt.id)}
                    className={`px-4 py-1.5 text-xs font-bold transition-all ${
                      washCategory === opt.id ? opt.selected : opt.idle
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Targa Result — always-available manual override (Urban / Maxi / Moto).
              The auto-detected tier is preselected; tapping any button overrides
              it and is what drives the displayed price and the saved booking. */}
          {targaResult && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 text-center"
            >
              <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                <span className="inline-block px-3 py-1 text-xs font-bold bg-gray-700/60 text-white border border-gray-600">
                  {targaResult.plate}
                </span>
                {detectedModel && (
                  <span className="text-gray-400 text-xs">{detectedModel}</span>
                )}
              </div>
              <p className="text-gray-400 text-xs mb-2">
                {cw('plate_manual_prompt_it', 'plate_manual_prompt_en', 'Seleziona manualmente la categoria:')}
              </p>
              <div className="flex justify-center gap-2">
                {WASH_OVERRIDE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => applyWashOverride(opt.id)}
                    className={`px-4 py-1.5 text-xs font-bold transition-all ${
                      washCategory === opt.id ? opt.selected : opt.idle
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-gray-500 text-xs mt-1.5">{targaResult.description}</p>
              <button
                onClick={clearTargaSearch}
                className="block mx-auto mt-1 text-gray-500 hover:text-white text-xs transition-colors"
              >
                {cw('plate_change_it', 'plate_change_en', 'Cambia veicolo')}
              </button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Tabs + Categories + Services — shown once a wash category is chosen
          (auto-detected or manually overridden to Urban / Maxi / Moto). */}
      {washCategory && (<>
      {/* Main Tab Navigation: LAVAGGIO | MECCANICA */}
      <div className="container mx-auto px-4 mb-6">
        <div className="flex justify-center gap-4">
          <button
            onClick={() => setMainTab('lavaggio')}
            className={`px-8 py-3 font-bold text-lg transition-all duration-300 ${
              mainTab === 'lavaggio'
                ? 'bg-white text-black'
                : 'bg-transparent text-white border-2 border-white hover:bg-white/10'
            }`}
          >
            LAVAGGIO
          </button>
          <button
            onClick={() => setMainTab('meccanica')}
            className={`px-8 py-3 font-bold text-lg transition-all duration-300 ${
              mainTab === 'meccanica'
                ? 'bg-white text-black'
                : 'bg-transparent text-white border-2 border-white hover:bg-white/10'
            }`}
          >
            MECCANICA
          </button>
        </div>
      </div>

      {/* Category Navigation */}
      <div className="container mx-auto px-4 mb-8">
        <div className="flex flex-wrap justify-center gap-2">
          {currentCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => mainTab === 'lavaggio'
                ? setLavaggioCategory(cat.id as LavaggioCategory)
                : setMeccanicaCategory(cat.id as MeccanicaCategory)
              }
              className={`px-4 py-2 font-bold text-xs sm:text-sm transition-all duration-300 ${
                activeCategory === cat.id
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-900/50 text-white border border-gray-700 hover:border-white'
              }`}
            >
              <span>{lang === 'it' ? cat.name : cat.nameEn}</span>
              {cat.subtitle && (
                <span className="hidden sm:inline text-[10px] ml-1 opacity-70">({cat.subtitle})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Services Grid */}
      <div className="container mx-auto px-6">
        {/* Combined Wash Cards */}
        {mainTab === 'lavaggio' && lavaggioCategory === 'wash' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {liveCombined.map((combo) => {
                const autoService = detectedCategory === 'urban' ? combo.urban : detectedCategory === 'maxi' ? combo.maxi : null;
                const lowestPrice = Math.min(combo.urban.price, combo.maxi.price);
                const formatPrice = (p: number) => p % 1 === 0 ? `${p}` : p.toFixed(2);
                return (
                  <motion.div
                    key={combo.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg overflow-hidden group transition-all duration-300 hover:border-white/50 hover:shadow-2xl hover:shadow-white/10 flex flex-col"
                  >
                    <RiquadroCatalogo
                      src={autoService?.image || combo.image}
                      alt={lang === 'it' ? (autoService?.name || combo.name) : (autoService?.nameEn || combo.nameEn)}
                    />
                    <div className="p-4">
                      {autoService ? (
                        <button
                          onClick={() => handleCombinedWashSelect(autoService)}
                          className="w-full bg-white text-black px-3 py-2 font-semibold text-sm hover:bg-gray-200 transition-all duration-300"
                        >
                          €{formatPrice(autoService.price)}
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            const searchInput = document.getElementById('targa-search-input');
                            if (searchInput) {
                              searchInput.focus();
                              searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }}
                          className="w-full bg-transparent border-2 border-white text-white px-3 py-2 font-semibold text-sm hover:bg-white hover:text-black transition-all duration-300"
                        >
                          {lang === 'it' ? 'da' : 'from'} €{formatPrice(lowestPrice)}
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {/* ABSOLUTE DETAIL — preventivo only, same card style as others */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg overflow-hidden group transition-all duration-300 hover:border-white/50 hover:shadow-2xl hover:shadow-white/10 flex flex-col"
              >
                <RiquadroCatalogo
                  src={absoluteDetailImage}
                  fallback="/absolute-detail.jpeg"
                  alt="Prime Absolute Detail"
                />
                <div className="p-4">
                  {targaResult && washCategory ? (
                    <a
                      href={`${contact.whatsapp_url}?text=${encodeURIComponent(
                        `Ciao, vorrei richiedere un preventivo per il servizio PRIME ABSOLUTE DETAIL.\nVeicolo: ${targaResult.carMake} ${targaResult.carModel} (${targaResult.plate}) – ${washCategory.toUpperCase()}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center bg-white text-black px-3 py-2 font-semibold text-sm hover:bg-gray-200 transition-all duration-300"
                    >
                      Su preventivo
                    </a>
                  ) : (
                    <button
                      onClick={() => {
                        const searchInput = document.getElementById('targa-search-input');
                        if (searchInput) {
                          searchInput.focus();
                          searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      className="w-full bg-transparent border-2 border-white text-white px-3 py-2 font-semibold text-sm hover:bg-white hover:text-black transition-all duration-300"
                    >
                      Su preventivo
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        ) : (
          /* Standard single-service cards */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {currentServices.map((service, index) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg overflow-hidden group transition-all duration-300 hover:border-white/50 hover:shadow-2xl hover:shadow-white/10 flex flex-col"
              >
                {/* Service Image - full image display */}
                <div className="relative">
                  <RiquadroCatalogo
                    src={service.image}
                    fallback="/luxurywash.jpeg"
                    alt={lang === 'it' ? service.name : service.nameEn}
                  />
                  {/* Single-price: overlay button at bottom */}
                  {!service.priceOptions && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
                      <button
                        onClick={() => addToCart(service)}
                        className="w-full bg-black/50 border-2 border-white text-white px-6 py-2 font-semibold text-sm hover:bg-white hover:text-black transition-all duration-300"
                      >
                        {cw('add_to_cart_it', 'add_to_cart_en', 'AGGIUNGI AL CARRELLO')}
                      </button>
                    </div>
                  )}
                </div>
                {/* Multi-price options: below the image */}
                {service.priceOptions && (
                  <div className="p-4 space-y-2">
                    {service.priceOptions.map((option) => (
                      <button
                        key={option.label}
                        onClick={() => addToCart(service, option)}
                        className="w-full flex justify-between items-center bg-transparent border-2 border-white text-white px-6 py-2 font-semibold text-sm hover:bg-white hover:text-black transition-all duration-300"
                      >
                        <span>{option.label}</span>
                        <span>€{option.price.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
      </>)}

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setShowCart(true)}
          className="fixed bottom-6 right-6 bg-white text-black px-6 py-4 font-bold shadow-2xl flex items-center gap-3 z-40 hover:bg-gray-200 transition-colors"
        >
          {/* Pastiglia del contatore: sta dentro un bottone BIANCO, quindi resta
              nera piena invece di lasciar passare il marmo. */}
          <span className="bg-dr7-obsidian text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">
            {cart.reduce((sum, item) => sum + item.quantity, 0)}
          </span>
          <span>€{getCartTotal().toFixed(2)}</span>
        </motion.button>
      )}

      {/* Cart Sidebar */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCart(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-black/90 backdrop-blur-xl border-l border-gray-800 z-50 flex flex-col"
            >
              <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">
                  {cw('cart_title_it', 'cart_title_en', 'Il tuo carrello')}
                </h2>
                <button onClick={() => setShowCart(false)} className="text-gray-400 hover:text-white text-2xl">
                  &times;
                </button>
              </div>

              <div className="flex-grow overflow-y-auto p-6 space-y-4">
                {cart.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">
                    {cw('cart_empty_it', 'cart_empty_en', 'Il carrello è vuoto')}
                  </p>
                ) : (
                  cart.map((item, index) => (
                    <div key={`${item.service.id}-${item.selectedOption?.label || ''}-${index}`} className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-bold text-white text-sm">
                            {lang === 'it' ? item.service.name : item.service.nameEn}
                          </h4>
                          {item.selectedOption && (
                            <span className="text-gray-400 text-xs">{item.selectedOption.label}</span>
                          )}
                        </div>
                        <button onClick={() => removeFromCart(index)} className="text-red-500 hover:text-red-400 text-sm">
                          {cw('cart_remove_it', 'cart_remove_en', 'Rimuovi')}
                        </button>
                      </div>
                      {item.seats && item.seats.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {item.seats.map(id => (
                            <span key={id} className="px-2 py-0.5 bg-white/10 border border-gray-700 text-gray-200 text-[11px]">
                              {seatLabel(id, lang)}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        {item.seats ? (
                          // Servizio a sedile: la quantita' e' il numero di
                          // sedili scelti, si cambia solo dalla pianta.
                          <button
                            onClick={() => setSeatPicker({ service: item.service, index, initial: item.seats || [], fromUpsell: false })}
                            className="text-xs px-3 py-1.5 border border-gray-600 text-white hover:bg-gray-800 transition-colors"
                          >
                            {lang === 'it' ? 'Modifica sedili' : 'Edit seats'}
                          </button>
                        ) : (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => updateQuantity(index, -1)}
                              className="w-8 h-8 border border-gray-600 text-white hover:bg-gray-800"
                            >
                              -
                            </button>
                            <span className="text-white font-bold">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(index, 1)}
                              className="w-8 h-8 border border-gray-600 text-white hover:bg-gray-800"
                            >
                              +
                            </button>
                          </div>
                        )}
                        <span className="text-white font-bold">
                          €{((item.selectedOption?.price || item.service.price) * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-6 border-t border-gray-800">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-lg text-white">{cw('cart_total_it', 'cart_total_en', 'Totale')}</span>
                    <span className="text-2xl font-bold text-white">€{getCartTotal().toFixed(2)}</span>
                  </div>
                  <button
                    onClick={handleCheckout}
                    className="w-full bg-white text-black py-4 font-bold text-lg hover:bg-gray-200 transition-colors"
                  >
                    {cw('cart_checkout_it', 'cart_checkout_en', 'PROCEDI')}
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Pianta sedili — servizi venduti a sedile (PRIME SEAT CLEAN/PROTECT).
          z-[100]: deve stare sopra il carrello e sopra l'overlay upsell. */}
      {seatPicker && (
        <SeatPlanPicker
          serviceName={lang === 'it' ? seatPicker.service.name : seatPicker.service.nameEn}
          unitPrice={seatPicker.service.price}
          initialSeats={seatPicker.initial}
          onConfirm={seats => applySeatSelection(seatPicker.service, seatPicker.index, seats, seatPicker.fromUpsell)}
          onClose={() => setSeatPicker(null)}
        />
      )}

      {/* Extra Care Upsell Overlay */}
      <AnimatePresence>
        {showUpsell && upsellSelectedService && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl overflow-y-auto"
          >
            {/* Sticky header */}
            <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-md border-b border-gray-800">
              <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-white font-bold text-sm truncate">
                    {lang === 'it' ? upsellSelectedService.name : upsellSelectedService.nameEn}
                  </span>
                  <span className="text-gray-400 text-sm flex-shrink-0">
                    €{upsellSelectedService.price % 1 === 0 ? upsellSelectedService.price : upsellSelectedService.price.toFixed(2)}
                  </span>
                </div>
                <button
                  onClick={handleReviewCart}
                  className="bg-white text-black px-5 py-2 font-bold text-sm hover:bg-gray-200 transition-colors flex-shrink-0"
                >
                  {cw('upsell_review_cart_it', 'upsell_review_cart_en', 'Rivedi carrello')}
                </button>
              </div>
            </div>

            {/* Step indicator */}
            <div className="container mx-auto px-4 pt-6 pb-2 flex justify-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-colors ${upsellStep === 1 ? 'bg-white' : 'bg-gray-600'}`} />
              <div className={`w-2 h-2 rounded-full transition-colors ${upsellStep === 2 ? 'bg-white' : 'bg-gray-600'}`} />
            </div>

            {/* Confirmation section */}
            <div className="container mx-auto px-4 pt-6 pb-8 text-center">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              {upsellStep === 1 ? (
                <>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                    {cw('upsell_step1_title_it', 'upsell_step1_title_en', 'Completa il tuo lavaggio')}
                  </h2>
                  <p className="text-gray-400 text-base max-w-md mx-auto">
                    {cw('upsell_step1_text_it', 'upsell_step1_text_en', 'Aggiungi un servizio Extra Care.')}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                    {cw('upsell_step2_title_it', 'upsell_step2_title_en', "Vivi l'attesa in grande stile")}
                  </h2>
                  <p className="text-gray-400 text-base max-w-md mx-auto">
                    {cw('upsell_step2_text_it', 'upsell_step2_text_en', "Guida un'auto di cortesia mentre il tuo veicolo viene trattato.")}
                  </p>
                </>
              )}
            </div>

            {/* Step 1: Extra Care grid */}
            {upsellStep === 1 && (
              <div className="container mx-auto px-4 pb-8">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {liveExtra.map((extra) => {
                    const isAdded = upsellAddedExtras.has(extra.id);
                    return (
                      <motion.div
                        key={extra.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden flex flex-col"
                      >
                        <RiquadroCatalogo
                          src={extra.image}
                          fallback="/luxurywash.jpeg"
                          larghezza={500}
                          alt={lang === 'it' ? extra.name : extra.nameEn}
                        />
                        <div className="p-3 flex flex-col flex-grow">
                          <h3 className="text-white font-bold text-xs leading-tight mb-1">
                            {lang === 'it' ? extra.name : extra.nameEn}
                          </h3>
                          <p className="text-gray-400 text-[11px] leading-snug line-clamp-2 mb-2 flex-grow">
                            {lang === 'it' ? extra.description : extra.descriptionEn}
                          </p>
                          <div className="flex items-center justify-between mt-auto">
                            <span className="text-white font-bold text-sm">
                              €{extra.price % 1 === 0 ? extra.price : extra.price.toFixed(2)}
                              {extra.priceUnit && (
                                <span className="text-gray-500 text-[10px] font-normal ml-1">{extra.priceUnit}</span>
                              )}
                            </span>
                            <button
                              onClick={() => handleUpsellToggleExtra(extra)}
                              className={`px-3 py-1.5 font-semibold text-xs transition-all duration-300 ${
                                isAdded
                                  ? 'bg-green-600 text-white hover:bg-red-500'
                                  : 'bg-white text-black hover:bg-gray-200'
                              }`}
                            >
                              {isAdded
                                ? cw('upsell_added_it', 'upsell_added_en', 'Aggiunto ✓')
                                : cw('upsell_add_it', 'upsell_add_en', 'Aggiungi')
                              }
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Experience services */}
            {upsellStep === 2 && (
              <div className="container mx-auto px-4 pb-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
                  {liveExperience.map((exp) => {
                    const addedOptionKey = Array.from(upsellAddedExtras).find(key => key.startsWith(exp.id + ':'));
                    const addedOptionLabel = addedOptionKey ? addedOptionKey.split(':')[1] : null;
                    return (
                      <motion.div
                        key={exp.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden flex flex-col"
                      >
                        <RiquadroCatalogo
                          src={exp.image}
                          fallback="/luxurywash.jpeg"
                          larghezza={500}
                          alt={lang === 'it' ? exp.name : exp.nameEn}
                        />
                        <div className="p-3">
                          <div className="flex gap-1.5 justify-center flex-wrap">
                            {exp.priceOptions?.map((option) => {
                              const isSelected = addedOptionLabel === option.label;
                              return (
                                <button
                                  key={option.label}
                                  onClick={() => handleUpsellToggleExtra(exp, option)}
                                  className={`px-3 py-1.5 font-semibold text-xs transition-all duration-300 ${
                                    isSelected
                                      ? 'bg-green-600 text-white hover:bg-red-500'
                                      : 'border border-white/40 text-white hover:bg-white hover:text-black'
                                  }`}
                                >
                                  {isSelected ? `${option.label} ✓` : `${option.label} · €${option.price % 1 === 0 ? option.price : option.price.toFixed(2)}`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom CTA */}
            <div className="container mx-auto px-4 pb-12">
              <div className="max-w-md mx-auto text-center space-y-4">
                <button
                  onClick={handleNextUpsellStep}
                  className="w-full bg-white text-black py-4 font-bold text-lg hover:bg-gray-200 transition-colors"
                >
                  {upsellStep === 1
                    ? (lang === 'it' ? 'Continua' : 'Continue')
                    : `${lang === 'it' ? 'Rivedi carrello' : 'Review Cart'} — €${getCartTotal().toFixed(2)}`
                  }
                </button>
                <button
                  onClick={handleSkipUpsell}
                  className="text-gray-400 hover:text-white text-sm font-medium transition-colors"
                >
                  {lang === 'it' ? 'Salta' : 'Skip'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// SERVICES, URBAN_SERVICES, MAXI_SERVICES, EXTRA_CARE_SERVICES,
// EXPERIENCE_SERVICES, TECH_SERVICES, MOTO_SERVICES exports rimossi.
// Fonte unica: admin Catalogo Lavaggio (car_wash_services table) via
// `useCarWashServices()` hook. Importa il hook nei consumer.

export default CarWashServicesPage;
