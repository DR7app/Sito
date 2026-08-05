import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { RENTAL_CATEGORIES, AIRPORTS as DEFAULT_AIRPORTS, PICKUP_LOCATIONS as DEFAULT_PICKUP_LOCATIONS } from '../constants';
import { getYachtFleet, getJetFleet } from '../utils/getAviationFleet';
import { getAirports, getPickupLocations } from '../utils/getLocations';
import type { RentalItem } from '../types';
import RentalCard from '../components/ui/RentalCard';
import { useTranslation } from '../hooks/useTranslation';
import { useBooking } from '../hooks/useBooking';
import { motion, AnimatePresence } from 'framer-motion';
import { useVerification } from '../hooks/useVerification';
import { useVehicles } from '../hooks/useVehicles';
import { useAuth } from '../hooks/useAuth';
import SEOHead from '../components/seo/SEOHead';
import RentalSearchBar, { type SearchParams } from '../components/ui/RentalSearchBar';
import RentalFilters from '../components/ui/RentalFilters';
import { useSearchAvailability } from '../hooks/useSearchAvailability';
import { getFlottaVisibleCategoryIds } from '../utils/siteCopy';

interface RentalPageProps {
  categoryId: 'cars' | 'urban-cars' | 'corporate-fleet' | 'yachts' | 'villas' | 'jets' | 'helicopters';
}

const JetSearchPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  const [tripType, setTripType] = useState<'one-way' | 'round-trip'>('one-way');
  const [departure, setDeparture] = useState<{ iata: string, name: string, city: string } | null>(null);
  const [arrival, setArrival] = useState<{ iata: string, name: string, city: string } | null>(null);
  const [departureDate, setDepartureDate] = useState(today);
  const [returnDate, setReturnDate] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [petsAllowed, setPetsAllowed] = useState(false);
  const [smokingAllowed, setSmokingAllowed] = useState(false);
  const [airports, setAirports] = useState(DEFAULT_AIRPORTS);
  useEffect(() => { let c = false; getAirports().then(a => { if (!c) setAirports(a); }); return () => { c = true; }; }, []);

  const handleSearch = () => {
    if (!departure || !arrival) return;

    const params = new URLSearchParams();
    params.append('tripType', tripType);
    params.append('departure', departure.iata);
    params.append('arrival', arrival.iata);
    params.append('departureDate', departureDate);
    if (tripType === 'round-trip' && returnDate) {
      params.append('returnDate', returnDate);
    }
    params.append('passengers', String(passengers));
    params.append('pets', String(petsAllowed));
    params.append('smoking', String(smokingAllowed));

    navigate(`/jets/search?${params.toString()}`);
  };

  const AirportAutocomplete: React.FC<{
    value: { iata: string, name: string, city: string } | null;
    onSelect: (airport: { iata: string, name: string, city: string }) => void;
    placeholder: string;
  }> = ({ value, onSelect, placeholder }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<typeof airports>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
      if (value) {
        setQuery(`${value.city} (${value.iata})`);
      } else {
        setQuery('');
      }
    }, [value]);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (inputRef.current && !inputRef.current.contains(event.target as Node) &&
          suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
          setShowSuggestions(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = e.target.value;
      setQuery(newQuery);
      if (newQuery.length > 1) {
        const filtered = airports.filter(airport =>
          airport.name.toLowerCase().includes(newQuery.toLowerCase()) ||
          airport.city.toLowerCase().includes(newQuery.toLowerCase()) ||
          airport.iata.toLowerCase().includes(newQuery.toLowerCase())
        );
        setSuggestions(filtered);
        setShowSuggestions(true);
      } else {
        setShowSuggestions(false);
      }
    };

    const handleSelectSuggestion = (airport: typeof airports[0]) => {
      onSelect(airport);
      setShowSuggestions(false);
    };

    return (
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => query.length > 1 && setShowSuggestions(true)}
          placeholder={placeholder}
          className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-white focus:border-white transition"
        />
        <AnimatePresence>
          {showSuggestions && suggestions.length > 0 && (
            <motion.ul
              ref={suggestionsRef}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute z-10 w-full mt-1 bg-gray-900 border border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto"
            >
              {suggestions.map(airport => (
                <li
                  key={airport.iata}
                  onClick={() => handleSelectSuggestion(airport)}
                  className="px-4 py-2 text-white hover:bg-gray-800 cursor-pointer"
                >
                  {airport.name} ({airport.iata}) - {airport.city}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="pt-32 pb-24 bg-black min-h-screen">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <h1 className="text-5xl md:text-6xl font-bold text-white">
              {t('Find_your_private_jet')}
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-10 max-w-5xl mx-auto bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6"
          >
            <div className="flex border-b border-gray-700 mb-6">
              <button onClick={() => setTripType('one-way')} className={`px-4 py-2 text-sm font-semibold ${tripType === 'one-way' ? 'text-white border-b-2 border-white' : 'text-gray-400'}`}>{t('One_Way')}</button>
              <button onClick={() => setTripType('round-trip')} className={`px-4 py-2 text-sm font-semibold ${tripType === 'round-trip' ? 'text-white border-b-2 border-white' : 'text-gray-400'}`}>{t('Round_Trip')}</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div className="lg:col-span-2">
                <label className="text-sm text-gray-400 block mb-2">{t('Departure')}</label>
                <AirportAutocomplete value={departure} onSelect={setDeparture} placeholder={t('Select_airport')} />
              </div>
              <div className="lg:col-span-2">
                <label className="text-sm text-gray-400 block mb-2">{t('Arrival')}</label>
                <AirportAutocomplete value={arrival} onSelect={setArrival} placeholder={t('Select_airport')} />
              </div>
              <div className="lg:col-span-1">
                <button onClick={handleSearch} className="w-full bg-white text-black font-bold py-3 px-4 rounded-md hover:bg-gray-200 transition-colors flex items-center justify-center">
                  {t('Search')}
                </button>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-2">{t('Departure_Date')}</label>
                <input type="date" value={departureDate} onChange={e => setDepartureDate(e.target.value)} min={today} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" />
              </div>
              <AnimatePresence>
                {tripType === 'round-trip' && (
                  <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="overflow-hidden">
                    <label className="text-sm text-gray-400 block mb-2">{t('Return_Date')}</label>
                    <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} min={departureDate || today} disabled={!departureDate} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" />
                  </motion.div>
                )}
              </AnimatePresence>
              <div>
                <label className="text-sm text-gray-400 block mb-2">{t('Passengers')}</label>
                <input type="number" value={passengers} onChange={e => setPassengers(Math.max(1, parseInt(e.target.value, 10)))} min="1" className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" />
              </div>
              <div className="col-span-full mt-4 flex items-center space-x-6">
                <label className="flex items-center space-x-2 cursor-pointer text-sm text-gray-300">
                  <input type="checkbox" checked={petsAllowed} onChange={e => setPetsAllowed(e.target.checked)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-white focus:ring-white" />
                  <span>{t('Pets_Allowed')}</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer text-sm text-gray-300">
                  <input type="checkbox" checked={smokingAllowed} onChange={e => setSmokingAllowed(e.target.checked)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-white focus:ring-white" />
                  <span>{t('Smoking_Allowed')}</span>
                </label>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </motion.div>
  );
};


// Extracted vehicle results to avoid IIFE in JSX
const VehicleResults: React.FC<{
  categoryData: RentalItem[]
  categoryId: string
  hasSearched: boolean
  availabilityResults: Map<string, any>
  selectedCategories: string[]
  maxBudget: number | null
  sortBy: string
  preDays: number
  handleBook: (item: RentalItem) => void
  setSortBy: (s: string) => void
  setMaxBudget: (b: number | null) => void
  setSelectedCategories: (c: string[]) => void
  categoryLabels?: Record<string, string>
}> = ({ categoryData, categoryId, hasSearched, availabilityResults, selectedCategories, maxBudget, sortBy, preDays, handleBook, setSortBy, setMaxBudget, setSelectedCategories, categoryLabels }) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Categorie configurate visibili in Sito > Flotta. Array vuoto = mostra
  // tutto (default). Array popolato = whitelist di category id.
  const [flottaVisible, setFlottaVisible] = React.useState<string[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = await getFlottaVisibleCategoryIds();
      if (!cancelled) setFlottaVisible(ids);
    })();
    return () => { cancelled = true; };
  }, []);

  const displayData = useMemo(() => {
    let data = [...categoryData];

    // Filtro Sito > Flotta: se l'admin ha definito una whitelist di
    // categorie visibili, nascondo i veicoli che non vi appartengono.
    if (flottaVisible && flottaVisible.length > 0) {
      const allowed = new Set(flottaVisible);
      data = data.filter(item => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemCat = (item as any).category;
        const r = availabilityResults.get(item.id);
        const cat = r?.categoryId || itemCat;
        return cat ? allowed.has(cat) : true;
      });
    }

    if (hasSearched && availabilityResults.size > 0) {
      data = data.filter(item => {
        if (!item.available || item.bookingDisabled) return false;
        const r = availabilityResults.get(item.id);
        return r ? r.available : false;
      });
    }

    if (selectedCategories.length > 0 && hasSearched) {
      data = data.filter(item => {
        const r = availabilityResults.get(item.id);
        return r ? selectedCategories.includes(r.categoryId) : true;
      });
    }

    if (maxBudget !== null && hasSearched) {
      data = data.filter(item => {
        const r = availabilityResults.get(item.id);
        return r ? r.totalPrice <= maxBudget : true;
      });
    }

    if (sortBy !== 'default' && hasSearched) {
      data.sort((a, b) => {
        const pa = availabilityResults.get(a.id)?.totalPrice || 0;
        const pb = availabilityResults.get(b.id)?.totalPrice || 0;
        return sortBy === 'price-asc' ? pa - pb : pb - pa;
      });
    }

    return data;
  }, [categoryData, hasSearched, availabilityResults, selectedCategories, maxBudget, sortBy, flottaVisible]);

  const availableCategories = useMemo(() => {
    if (!hasSearched || availabilityResults.size === 0) return [];
    // Use ALL available vehicles (not filtered displayData) so category buttons don't disappear
    const allAvailable = categoryData.filter(item => {
      if (!item.available || item.bookingDisabled) return false;
      const r = availabilityResults.get(item.id);
      return r?.available;
    });
    // Chip filter usa categoryId (categoria DB Centralina Pro) cosi' le
    // nuove categorie create dall'admin compaiono come chip senza
    // modifiche al codice.
    const cats = [...new Set(allAvailable.map(item => availabilityResults.get(item.id)?.categoryId).filter(Boolean) as string[])];
    // Sito > Flotta: applico whitelist anche ai chip categoria.
    if (flottaVisible && flottaVisible.length > 0) {
      const allowed = new Set(flottaVisible);
      return cats.filter(c => allowed.has(c));
    }
    return cats;
  }, [categoryData, hasSearched, availabilityResults, flottaVisible]);

  return (
    <>
      {hasSearched && (
        <RentalFilters
          sortBy={sortBy}
          onSortChange={setSortBy}
          maxBudget={maxBudget}
          onBudgetChange={setMaxBudget}
          categories={availableCategories}
          selectedCategories={selectedCategories}
          onCategoryChange={setSelectedCategories}
          totalResults={displayData.length}
          categoryLabels={categoryLabels}
        />
      )}

      {displayData.length === 0 ? (
        <div className="text-center text-gray-400 mt-12 py-16">
          {hasSearched
            ? <p className="text-lg">{t({ it: "Nessun veicolo disponibile per le date selezionate.", en: "No vehicles available for the selected dates." })}</p>
            : <p>{t({ it: "Nessun veicolo trovato in questa categoria.", en: "No vehicles found in this category." })}</p>
          }
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-4">
          {displayData.map(item => {
            const searchResult = hasSearched ? availabilityResults.get(item.id) : null;
            // item.pricePerDay.eur is populated by useVehicles from Centralina Pro
            // per-vehicle base_price (prezzoDinamico.dynamic.base_prices[vehicle.id]),
            // falling back to category tariffe. No hardcoded price.
            const vehicleDayPrice = item.pricePerDay?.eur;
            const marketingPrice = (categoryId === 'cars' || categoryId === 'urban-cars' || categoryId === 'corporate-fleet')
              ? vehicleDayPrice : undefined;
            const marketingTooltip = categoryId === 'urban-cars' ? 'Disponibile con formula long rent' : undefined;
            const dailyRate = vehicleDayPrice || 0;
            const itemTotalPrice = searchResult ? searchResult.totalPrice
              : (preDays > 0 && dailyRate ? Math.round(dailyRate * preDays) : undefined);
            const itemDays = searchResult ? searchResult.days : (preDays || undefined);

            return (
              <RentalCard
                key={item.id}
                item={item}
                onBook={handleBook}
                marketingPrice={marketingPrice}
                marketingTooltip={marketingTooltip}
                categoryId={categoryId}
                totalPrice={itemTotalPrice}
                totalDays={itemDays}
                hidePrice={!user || (!hasSearched && (categoryId === 'cars' || categoryId === 'corporate-fleet'))}
                hideBookButton={!user || (!hasSearched && (categoryId === 'cars' || categoryId === 'corporate-fleet'))}
                availableFrom={searchResult?.availableFrom || null}
              />
            );
          })}
        </div>
      )}
    </>
  );
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTHS_BY_LANG: Record<string, string[]> = {
  it: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** Format a YYYY-MM-DD + HH:MM pair as "06 Apr 2026, 10:00" in the active language. */
function formatShortDateTime(date: string, time: string, lang: string): string {
  if (!date || !time) return '';
  const [year, month, day] = date.split('-');
  const monthLabel = (MONTHS_BY_LANG[lang] ?? MONTHS_BY_LANG.it)[parseInt(month, 10) - 1] ?? month;
  return `${day} ${monthLabel} ${year}, ${time}`;
}

/** Map a URL location param to a wizard-compatible DEFAULT_PICKUP_LOCATIONS id */
function resolveLocationId(param: string | null): string {
  if (!param) return DEFAULT_PICKUP_LOCATIONS[0].id;
  const match = DEFAULT_PICKUP_LOCATIONS.find(l => l.id === param);
  return match ? match.id : DEFAULT_PICKUP_LOCATIONS[0].id;
}

const AVAILABLE_TIMES = [
  '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00',
];

// ─── SearchBar component ─────────────────────────────────────────────────────

interface SearchBarState {
  pickupDate: string;
  pickupTime: string;
  returnDate: string;
  returnTime: string;
  pickupLoc: string;
  pickupLocLabel: string;
  returnLoc: string;
  returnLocLabel: string;
  // 2026-07-12: indirizzo + km consegna/ritiro a domicilio (Consegna = ritiro
  // auto al cliente; Ritiro = riconsegna auto). Km × €/km = costo consegna.
  deliveryPickupVia?: string;
  deliveryPickupNumero?: string;
  deliveryPickupCap?: string;
  deliveryPickupCitta?: string;
  deliveryPickupProvincia?: string;
  deliveryPickupKm?: number;
  deliveryReturnVia?: string;
  deliveryReturnNumero?: string;
  deliveryReturnCap?: string;
  deliveryReturnCitta?: string;
  deliveryReturnProvincia?: string;
  deliveryReturnKm?: number;
}

interface ModificaBarProps {
  initial: SearchBarState;
  onUpdate: (next: SearchBarState) => void;
}

const ModificaBar: React.FC<ModificaBarProps> = ({ initial, onUpdate }) => {
  const { t, lang, getTranslated } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<SearchBarState>(initial);
  const [pickupLocs, setPickupLocs] = useState(DEFAULT_PICKUP_LOCATIONS);
  useEffect(() => { let c = false; getPickupLocations().then(l => { if (!c) setPickupLocs(l); }); return () => { c = true; }; }, []);

  // Keep draft in sync when initial changes (e.g. URL navigation)
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const handleSave = () => {
    // Basic validation: pickup must be before return
    if (draft.pickupDate > draft.returnDate ||
      (draft.pickupDate === draft.returnDate && draft.pickupTime >= draft.returnTime)) {
      return; // silently ignore invalid ranges (inputs will show natural browser validation)
    }
    onUpdate(draft);
    setExpanded(false);
  };

  const set = (key: keyof SearchBarState) => (value: string) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  const inputClass = 'bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-white transition-colors w-full';
  const labelClass = 'text-xs text-gray-400 mb-1 block';

  return (
    <div className="sticky top-20 z-30 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
      <div className="container mx-auto px-6">
        {/* ── Collapsed summary row ── */}
        {!expanded && (
          <div className="flex items-center gap-4 py-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-gray-300 min-w-0">
              <span className="text-gray-500 shrink-0">{t({ it: "Ritiro", en: "Pick-up" })}</span>
              <span className="text-white font-medium truncate">
                {formatShortDateTime(initial.pickupDate, initial.pickupTime, lang)}
              </span>
              {initial.pickupLocLabel && (
                <span className="text-gray-500 truncate hidden sm:inline">— {initial.pickupLocLabel}</span>
              )}
            </div>
            <span className="text-gray-600 hidden sm:block">→</span>
            <div className="flex items-center gap-2 text-sm text-gray-300 min-w-0">
              <span className="text-gray-500 shrink-0">{t({ it: "Riconsegna", en: "Drop-off" })}</span>
              <span className="text-white font-medium truncate">
                {formatShortDateTime(initial.returnDate, initial.returnTime, lang)}
              </span>
              {initial.returnLocLabel && (
                <span className="text-gray-500 truncate hidden sm:inline">— {initial.returnLocLabel}</span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <span className="px-3 py-1 bg-white/10 rounded-full text-xs text-gray-300 hidden sm:inline">
                {(() => {
                  const baseDays = Math.max(1, Math.ceil((new Date(initial.returnDate).getTime() - new Date(initial.pickupDate).getTime()) / (1000 * 60 * 60 * 24)));
                  const [pH, pM] = initial.pickupTime.split(':').map(Number);
                  const [rH, rM] = initial.returnTime.split(':').map(Number);
                  const diff = (pH * 60 + pM) - (rH * 60 + rM);
                  const days = diff < 90 ? baseDays + 1 : baseDays;
                  return `${days} ${days === 1 ? 'giorno' : 'giorni'}`;
                })()}
              </span>
              <button
                onClick={() => setExpanded(true)}
                className="text-sm font-semibold text-white border border-white rounded-full px-4 py-1.5 hover:bg-white hover:text-black transition-colors"
              >
                Modifica
              </button>
            </div>
          </div>
        )}

        {/* ── Expanded edit row ── */}
        {expanded && (
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Ritiro date + time */}
              <div>
                <label className={labelClass}>{t({ it: "Ritiro — data", en: "Pick-up — date" })}</label>
                <input
                  type="date"
                  value={draft.pickupDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => set('pickupDate')(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t({ it: "Ritiro — ora", en: "Pick-up — time" })}</label>
                <select value={draft.pickupTime} onChange={e => set('pickupTime')(e.target.value)} className={inputClass}>
                  {AVAILABLE_TIMES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {/* Riconsegna date + time */}
              <div>
                <label className={labelClass}>{t({ it: "Riconsegna — data", en: "Drop-off — date" })}</label>
                <input
                  type="date"
                  value={draft.returnDate}
                  min={draft.pickupDate || new Date().toISOString().split('T')[0]}
                  onChange={e => set('returnDate')(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t({ it: "Riconsegna — ora", en: "Drop-off — time" })}</label>
                <select value={draft.returnTime} onChange={e => set('returnTime')(e.target.value)} className={inputClass}>
                  {AVAILABLE_TIMES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Location selects — only show if there are multiple pickup locations */}
            {pickupLocs.length > 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{t({ it: "Luogo Ritiro", en: "Pick-up location" })}</label>
                  <select value={draft.pickupLoc} onChange={e => {
                    const loc = pickupLocs.find(l => l.id === e.target.value);
                    setDraft(prev => ({
                      ...prev,
                      pickupLoc: e.target.value,
                      pickupLocLabel: loc?.label ? getTranslated(loc.label) : e.target.value,
                    }));
                  }} className={inputClass}>
                    {pickupLocs.map(l => (
                      <option key={l.id} value={l.id}>{getTranslated(l.label)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{t({ it: "Luogo Riconsegna", en: "Drop-off location" })}</label>
                  <select value={draft.returnLoc} onChange={e => {
                    const loc = pickupLocs.find(l => l.id === e.target.value);
                    setDraft(prev => ({
                      ...prev,
                      returnLoc: e.target.value,
                      returnLocLabel: loc?.label ? getTranslated(loc.label) : e.target.value,
                    }));
                  }} className={inputClass}>
                    {pickupLocs.map(l => (
                      <option key={l.id} value={l.id}>{getTranslated(l.label)}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* 2026-07-12: se il luogo è "Consegna a domicilio" l'indirizzo + km
                si inseriscono QUI (il prezzo consegna è km × €/km). I dati sono
                portati nel wizard, quindi il cliente non li reinserisce. */}
            {draft.pickupLoc === 'home_delivery' && (
              <div className="mt-3 p-3 rounded-lg border border-gray-700 bg-gray-800/40 space-y-2">
                <p className="text-xs text-amber-400 font-semibold">{t({ it: "Indirizzo consegna auto (a domicilio)", en: "Car delivery address (to your address)" })}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputClass} placeholder={t({ it: "Via *", en: "Street *" })} value={draft.deliveryPickupVia || ''} onChange={e => setDraft(p => ({ ...p, deliveryPickupVia: e.target.value }))} />
                  <input className={inputClass} placeholder={t({ it: "N. civico *", en: "Street no. *" })} value={draft.deliveryPickupNumero || ''} onChange={e => setDraft(p => ({ ...p, deliveryPickupNumero: e.target.value }))} />
                  <input className={inputClass} placeholder={t({ it: "CAP *", en: "Postcode *" })} value={draft.deliveryPickupCap || ''} onChange={e => setDraft(p => ({ ...p, deliveryPickupCap: e.target.value }))} />
                  <input className={inputClass} placeholder={t({ it: "Città *", en: "City *" })} value={draft.deliveryPickupCitta || ''} onChange={e => setDraft(p => ({ ...p, deliveryPickupCitta: e.target.value }))} />
                  <input className={inputClass} placeholder={t({ it: "Provincia *", en: "Province *" })} value={draft.deliveryPickupProvincia || ''} onChange={e => setDraft(p => ({ ...p, deliveryPickupProvincia: e.target.value }))} />
                  <input className={inputClass} type="number" min={1} placeholder={t({ it: "Km dalla sede *", en: "Km from our office *" })} value={draft.deliveryPickupKm ?? ''} onChange={e => setDraft(p => ({ ...p, deliveryPickupKm: e.target.value ? parseInt(e.target.value) : undefined }))} />
                </div>
                {(draft.deliveryPickupKm ?? 0) > 0 && (
                  <p className="text-xs text-white">{t({ it: "Costo consegna:", en: "Delivery cost:" })} {draft.deliveryPickupKm} km — {t({ it: "la tariffa €/km DR7 viene applicata al passo successivo.", en: "the DR7 €/km rate is applied at the next step." })}</p>
                )}
              </div>
            )}
            {draft.returnLoc === 'home_delivery' && (
              <div className="mt-3 p-3 rounded-lg border border-gray-700 bg-gray-800/40 space-y-2">
                <p className="text-xs text-amber-400 font-semibold">{t({ it: "Indirizzo ritiro/riconsegna auto (a domicilio)", en: "Car collection/drop-off address (at your address)" })}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputClass} placeholder={t({ it: "Via *", en: "Street *" })} value={draft.deliveryReturnVia || ''} onChange={e => setDraft(p => ({ ...p, deliveryReturnVia: e.target.value }))} />
                  <input className={inputClass} placeholder={t({ it: "N. civico *", en: "Street no. *" })} value={draft.deliveryReturnNumero || ''} onChange={e => setDraft(p => ({ ...p, deliveryReturnNumero: e.target.value }))} />
                  <input className={inputClass} placeholder={t({ it: "CAP *", en: "Postcode *" })} value={draft.deliveryReturnCap || ''} onChange={e => setDraft(p => ({ ...p, deliveryReturnCap: e.target.value }))} />
                  <input className={inputClass} placeholder={t({ it: "Città *", en: "City *" })} value={draft.deliveryReturnCitta || ''} onChange={e => setDraft(p => ({ ...p, deliveryReturnCitta: e.target.value }))} />
                  <input className={inputClass} placeholder={t({ it: "Provincia *", en: "Province *" })} value={draft.deliveryReturnProvincia || ''} onChange={e => setDraft(p => ({ ...p, deliveryReturnProvincia: e.target.value }))} />
                  <input className={inputClass} type="number" min={1} placeholder={t({ it: "Km dalla sede *", en: "Km from our office *" })} value={draft.deliveryReturnKm ?? ''} onChange={e => setDraft(p => ({ ...p, deliveryReturnKm: e.target.value ? parseInt(e.target.value) : undefined }))} />
                </div>
                {(draft.deliveryReturnKm ?? 0) > 0 && (
                  <p className="text-xs text-white">{t({ it: "Costo ritiro:", en: "Collection cost:" })} {draft.deliveryReturnKm} km — {t({ it: "la tariffa €/km DR7 viene applicata al passo successivo.", en: "the DR7 €/km rate is applied at the next step." })}</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                className="bg-white text-black font-bold text-sm px-6 py-2.5 rounded-full hover:bg-gray-200 transition-colors"
              >
                {t({ it: "Aggiorna", en: "Update" })}
              </button>
              <button
                onClick={() => { setDraft(initial); setExpanded(false); }}
                className="text-gray-400 hover:text-white text-sm transition-colors"
              >
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── RentalPage ──────────────────────────────────────────────────────────────

const RentalPage: React.FC<RentalPageProps> = ({ categoryId }) => {
  // Live pickup locations from Sito CMS — fall back to constants until loaded.
  const [pickupLocs, setPickupLocs] = useState(DEFAULT_PICKUP_LOCATIONS);
  useEffect(() => { let c = false; getPickupLocations().then(l => { if (!c) setPickupLocs(l); }); return () => { c = true; }; }, []);

  const { t, getTranslated } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openBooking, openCarWizard, setInitialSearchDates } = useBooking();
  const { checkVerificationAndProceed } = useVerification();
  const { user } = useAuth();

  // Search & filter state
  const [searchData, setSearchData] = useState<SearchParams | null>(null);
  const [sortBy, setSortBy] = useState('default');
  const [maxBudget, setMaxBudget] = useState<number | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Etichette delle categorie veicolo lette dalla Centralina Pro: cosi'
  // i chip filtro mostrano "Hypercar", "Supercar Elite", ecc. invece
  // dell'id grezzo. Aggiornare una categoria in admin si riflette al
  // prossimo refresh del sito.
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('centralina_pro_config')
      .select('config')
      .eq('id', 'main')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cats = ((data?.config as any) || {}).categories;
        if (Array.isArray(cats)) {
          const map: Record<string, string> = {};
          for (const c of cats as Array<{ id?: string; label?: string }>) {
            if (c?.id && c.label) map[c.id] = c.label;
          }
          setCategoryLabels(map);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Read pre-selected dates from Prenota Ora popup
  const prePickup = searchParams.get('pickup');
  const preReturn = searchParams.get('return');
  const preDays = useMemo(() => {
    if (!prePickup || !preReturn) return 0;
    const diff = new Date(preReturn).getTime() - new Date(prePickup).getTime();
    if (isNaN(diff)) return 0;
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [prePickup, preReturn]);

  // ── Read URL search params ──────────────────────────────────────────────
  // Pagine NON-veicolo: yachts/villas/jets/helicopters usano dati statici da
  // RENTAL_CATEGORIES. Tutte le altre categorie (3 legacy + qualunque nuova
  // creata in Centralina Pro) sono trattate come veicolari → fetch da DB.
  const NON_VEHICLE_ROUTES = new Set(['yachts', 'villas', 'jets', 'helicopters'])
  const isVehicleCategory = !NON_VEHICLE_ROUTES.has(categoryId);

  const urlPickupDate = searchParams.get('pickup') ?? '';
  const urlPickupTime = searchParams.get('pickupTime') ?? '';
  const urlReturnDate = searchParams.get('return') ?? '';
  const urlReturnTime = searchParams.get('returnTime') ?? '';
  const urlPickupLoc = searchParams.get('pickupLoc') ?? '';
  const urlPickupLocLabel = searchParams.get('pickupLocLabel') ?? '';
  const urlReturnLoc = searchParams.get('returnLoc') ?? '';
  const urlReturnLocLabel = searchParams.get('returnLocLabel') ?? '';

  const hasSearchParams = isVehicleCategory && !!(urlPickupDate && urlReturnDate);

  // State that drives both the bar display and the wizard pre-fill
  const [barState, setBarState] = useState<SearchBarState>(() => ({
    pickupDate: urlPickupDate,
    pickupTime: urlPickupTime || '10:00',
    returnDate: urlReturnDate,
    returnTime: urlReturnTime || '10:00',
    pickupLoc: urlPickupLoc || pickupLocs[0].id,
    pickupLocLabel: urlPickupLocLabel,
    returnLoc: urlReturnLoc || pickupLocs[0].id,
    returnLocLabel: urlReturnLocLabel,
  }));

  // Re-sync barState whenever URL params change. Without this, opening the
  // Prenota Ora popup again while already on /supercar-luxury would update
  // the URL (via navigate) but barState would stay stuck on its initial
  // mount values — making the user re-enter dates.
  useEffect(() => {
    setBarState(prev => ({
      ...prev,
      pickupDate: urlPickupDate || prev.pickupDate,
      pickupTime: urlPickupTime || prev.pickupTime,
      returnDate: urlReturnDate || prev.returnDate,
      returnTime: urlReturnTime || prev.returnTime,
      pickupLoc: urlPickupLoc || prev.pickupLoc,
      pickupLocLabel: urlPickupLocLabel || prev.pickupLocLabel,
      returnLoc: urlReturnLoc || prev.returnLoc,
      returnLocLabel: urlReturnLocLabel || prev.returnLocLabel,
    }));
  }, [urlPickupDate, urlPickupTime, urlReturnDate, urlReturnTime, urlPickupLoc, urlPickupLocLabel, urlReturnLoc, urlReturnLocLabel]);

  // Sync context so the wizard initializes with these dates
  useEffect(() => {
    if (!hasSearchParams) {
      setInitialSearchDates(null);
      return;
    }
    setInitialSearchDates({
      pickupDate: barState.pickupDate,
      pickupTime: barState.pickupTime,
      returnDate: barState.returnDate,
      returnTime: barState.returnTime,
      pickupLocation: resolveLocationId(barState.pickupLoc),
      returnLocation: resolveLocationId(barState.returnLoc),
      // 2026-07-12: porta l'indirizzo + km consegna/ritiro inseriti nella barra
      // di modifica cosi' il wizard li prefilla e calcola subito il prezzo km×€.
      deliveryPickupVia: barState.deliveryPickupVia,
      deliveryPickupNumero: barState.deliveryPickupNumero,
      deliveryPickupCap: barState.deliveryPickupCap,
      deliveryPickupCitta: barState.deliveryPickupCitta,
      deliveryPickupProvincia: barState.deliveryPickupProvincia,
      deliveryPickupKm: barState.deliveryPickupKm,
      deliveryReturnVia: barState.deliveryReturnVia,
      deliveryReturnNumero: barState.deliveryReturnNumero,
      deliveryReturnCap: barState.deliveryReturnCap,
      deliveryReturnCitta: barState.deliveryReturnCitta,
      deliveryReturnProvincia: barState.deliveryReturnProvincia,
      deliveryReturnKm: barState.deliveryReturnKm,
    });
  }, [barState, hasSearchParams, setInitialSearchDates]);

  // Clean up context dates when leaving the page
  useEffect(() => {
    return () => { setInitialSearchDates(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBarUpdate = (next: SearchBarState) => {
    setBarState(next);
    // Update URL to reflect the new search
    const params = new URLSearchParams(searchParams);
    params.set('pickup', next.pickupDate);
    params.set('pickupTime', next.pickupTime);
    params.set('return', next.returnDate);
    params.set('returnTime', next.returnTime);
    if (next.pickupLoc) params.set('pickupLoc', next.pickupLoc);
    if (next.pickupLocLabel) params.set('pickupLocLabel', next.pickupLocLabel);
    if (next.returnLoc) params.set('returnLoc', next.returnLoc);
    if (next.returnLocLabel) params.set('returnLocLabel', next.returnLocLabel);
    setSearchParams(params, { replace: true });

    // Re-run availability search with updated dates
    const updatedSearch = {
      pickupLocation: next.pickupLoc || 'dr7_office',
      returnLocation: next.returnLoc || next.pickupLoc || 'dr7_office',
      pickupDate: next.pickupDate,
      pickupTime: next.pickupTime,
      returnDate: next.returnDate,
      returnTime: next.returnTime,
    };
    setSearchData(updatedSearch);
    const searchPool = allVehicles.length > 0 ? allVehicles : (vehicleCategory ? fetchedVehicles : (category?.data || []));
    if (searchPool.length > 0) {
      runSearch(searchPool, updatedSearch);
    }
  };

  // Mappa categoryId di route → category id sul DB.
  // 1. Mappature LEGACY mantenute per retrocompatibilita' (route URL → category nel DB).
  // 2. Per qualunque altro categoryId (incluse le NUOVE categorie create
  //    dall'admin in Centralina Pro), usiamo direttamente la stringa
  //    cosi' /<category-id> mostra i veicoli con quel category id sul DB.
  const LEGACY_ROUTE_TO_DB: Record<string, string> = {
    'cars': 'exotic',
    'urban-cars': 'urban',
    'corporate-fleet': 'aziendali',
  };
  const vehicleCategory = isVehicleCategory
    ? (LEGACY_ROUTE_TO_DB[categoryId] || categoryId)
    : undefined;

  // Fetch vehicles for this category (default display)
  const { vehicles: fetchedVehicles, loading: vehiclesLoading, error: vehiclesError, usingCache } = useVehicles(vehicleCategory);

  // Fetch ALL vehicles (for cross-category search)
  const { vehicles: allVehicles, loading: allVehiclesLoading } = useVehicles(undefined);

  // Availability search hook
  const { results: availabilityResults, isSearching, hasSearched, search: runSearch } = useSearchAvailability(categoryId);

  const handleSearch = (params: SearchParams) => {
    setSearchData(params);
    const searchPool = allVehicles.length > 0 ? allVehicles : (vehicleCategory ? fetchedVehicles : (category?.data || []));
    if (searchPool.length > 0) {
      runSearch(searchPool, params);
    }
  };

  // Auto-search when coming from Prenota Ora (URL has pickup/return params)
  const prePickupTime = searchParams.get('pickupTime') || '10:30';
  const preReturnTime = searchParams.get('returnTime') || '09:00';
  const prePickupLoc = searchParams.get('pickupLoc') || 'dr7_office';
  const preReturnLoc = searchParams.get('returnLoc') || prePickupLoc;

  useEffect(() => {
    if (prePickup && preReturn && allVehicles.length > 0 && !hasSearched && !isSearching) {
      const autoSearchParams = {
        pickupLocation: prePickupLoc,
        returnLocation: preReturnLoc,
        pickupDate: prePickup,
        pickupTime: prePickupTime,
        returnDate: preReturn,
        returnTime: preReturnTime,
      };
      setSearchData(autoSearchParams);
      runSearch(allVehicles, autoSearchParams);
    }
  }, [prePickup, preReturn, allVehicles.length, hasSearched, isSearching]);

  // ── Auto-open wizard from preventivo link ──────────────────────────────
  const preventivoId = searchParams.get('preventivo');
  const preventivoCodeParam = searchParams.get('codice') || '';
  // 2026-05-21: ?edit=1 from MyPreventivi "Modifica" button. Tells the
  // wizard to stay on step 1 and update the existing preventivo on save
  // (instead of creating a new one).
  const editMode = searchParams.get('edit') === '1';
  const [preventivoHandled, setPreventivoHandled] = useState(false);

  useEffect(() => {
    if (!preventivoId || preventivoHandled || allVehicles.length === 0) return;
    setPreventivoHandled(true);

    (async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        // Try loading from preventivi table first
        let preventivo: any = null;
        if (token) {
          const res = await fetch('/.netlify/functions/get-my-preventivi', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            preventivo = (data.preventivi || []).find((p: any) => p.id === preventivoId);
          }
        }

        // Fallback: try loading from bookings table (No Cauzione requests are stored there)
        if (!preventivo) {
          const { data: bookingData } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', preventivoId)
            .maybeSingle();
          if (bookingData) {
            preventivo = {
              vehicle_id: bookingData.vehicle_id,
              vehicle_name: bookingData.vehicle_name,
              pickup_date: bookingData.pickup_date,
              dropoff_date: bookingData.dropoff_date,
              pickup_location: bookingData.pickup_location,
              dropoff_location: bookingData.dropoff_location,
              insurance_option: bookingData.insurance_option || bookingData.booking_details?.insuranceOption,
              total_final: bookingData.price_total / 100,
              id: bookingData.id,
              source: bookingData.booking_details?.no_cauzione_request ? 'website_no_cauzione' : 'booking',
              extras_detail: bookingData.booking_details,
            };
          }
        }

        if (!preventivo) return;

        // Find matching vehicle
        const matchedVehicle = allVehicles.find((v: RentalItem) => {
          const vId = v.id.replace('car-', '');
          return vId === preventivo.vehicle_id || v.vehicleIds?.includes(preventivo.vehicle_id);
        });
        if (!matchedVehicle) return;

        // Set dates from preventivo
        const pickup = new Date(preventivo.pickup_date);
        const dropoff = new Date(preventivo.dropoff_date);
        const pickupDate = pickup.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
        const pickupTime = pickup.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
        const returnDate = dropoff.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
        const returnTime = dropoff.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

        // For refused No Cauzione: DON'T set no_deposit — customer books with normal cauzione
        const isRefusedNoCauzione = preventivo.source === 'website_no_cauzione';
        let depositOpt: string | undefined;
        if (!isRefusedNoCauzione && preventivo.extras_detail?.include_no_cauzione) {
          depositOpt = 'no_deposit';
        }

        setInitialSearchDates({
          pickupDate,
          pickupTime,
          returnDate,
          returnTime,
          pickupLocation: preventivo.pickup_location || 'dr7_office',
          returnLocation: preventivo.dropoff_location || 'dr7_office',
          insuranceOption: preventivo.insurance_option || undefined,
          depositOption: depositOpt,
          unlimitedKm: preventivo.unlimited_km || preventivo.extras_detail?.include_unlimited_km || undefined,
          dr7Flex: preventivo.extras_detail?.flex || preventivo.extras_detail?.include_dr7_flex || false,
          secondDriver: preventivo.extras_detail?.include_second_driver || false,
          experienceServices: preventivo.extras_detail?.experience_services || {},
          // Pacchetti KM (es. "Pacchetto 300 km"): ripristinati esattamente
          // come scelti al momento del preventivo. Accettiamo entrambe le
          // chiavi (snake_case e camelCase) perche' i preventivi vecchi
          // erano stati salvati con la variante camelCase.
          kmPackageType: preventivo.extras_detail?.km_package_type
            || preventivo.extras_detail?.kmPackageType
            || undefined,
          kmPackages: preventivo.extras_detail?.km_packages
            || preventivo.extras_detail?.kmPackages
            || undefined,
          preventivoId: preventivo.id,
          preventivoTotal: preventivo.total_final,
          discountCode: preventivoCodeParam || undefined,
          editMode,
        });

        // Open the wizard
        openCarWizard(matchedVehicle, categoryId);

        // Clean URL
        const params = new URLSearchParams(searchParams);
        params.delete('preventivo');
        params.delete('codice');
        setSearchParams(params, { replace: true });
      } catch (err) {
        console.error('Error loading preventivo:', err);
      }
    })();
  }, [preventivoId, allVehicles.length, preventivoHandled]);

  // Chrome-specific debug hint (dev-only)
  const [showChromeDebugHint, setShowChromeDebugHint] = useState(false);

  useEffect(() => {
    // Only show in development mode when there's an error
    if (import.meta.env.DEV && vehiclesError) {
      const ua = navigator.userAgent;
      const isChrome = /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor);
      setShowChromeDebugHint(isChrome);
    } else {
      setShowChromeDebugHint(false);
    }
  }, [vehiclesError]);


  // Get the category metadata (id/label/icon) from static data.
  const category = RENTAL_CATEGORIES.find(cat => cat.id === categoryId);

  // Aviation/marine items come from Sito CMS (centralina_pro_config.site_copy.aviationMarine).
  const [yachtFleet, setYachtFleet] = useState<RentalItem[]>([]);
  const [jetFleet, setJetFleet] = useState<RentalItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (categoryId === 'yachts') getYachtFleet().then(f => { if (!cancelled) setYachtFleet(f); });
    if (categoryId === 'jets' || categoryId === 'helicopters') getJetFleet().then(f => { if (!cancelled) setJetFleet(f); });
    return () => { cancelled = true; };
  }, [categoryId]);

  // Multi-categoria per la landing "La Nostra Flotta" (/supercar-luxury):
  // l'admin in Sito > Flotta seleziona piu' categorie da mostrare insieme
  // (es. supercars + hypercar + elite). useVehicles(vehicleCategory) fetcha
  // SOLO la categoria di route ('exotic'), quindi qui usiamo allVehicles
  // (tutte le categorie) filtrato sui visible_category_ids del flotta config.
  // Quando la lista flotta e' vuota o contiene 1 sola categoria (uguale a
  // quella di route), comportamento legacy: fetchedVehicles.
  const [flottaIdsForFetch, setFlottaIdsForFetch] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = await getFlottaVisibleCategoryIds();
      if (!cancelled) setFlottaIdsForFetch(ids);
    })();
    return () => { cancelled = true; };
  }, []);

  const useFlottaMultiCategory = (
    categoryId === 'cars'
    && Array.isArray(flottaIdsForFetch)
    && flottaIdsForFetch.length > 0
  );

  // Use fetched vehicles for car categories, admin fleet for aviation/marine, otherwise static.
  const categoryData = useFlottaMultiCategory
    ? allVehicles.filter(v => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cat = (v as any).category || (v as any).categoryId;
        return cat ? flottaIdsForFetch!.includes(cat) : false;
      })
    : vehicleCategory
      ? fetchedVehicles
      : categoryId === 'yachts'
        ? yachtFleet
        : (categoryId === 'jets' || categoryId === 'helicopters')
          ? jetFleet
          : (category?.data || []);

  const handleBook = (item: RentalItem) => {
    if (['jets', 'helicopters'].includes(categoryId)) {
      navigate(`/book/${categoryId}/${item.id}`);
      return;
    }
    if (categoryId === 'yachts' || categoryId === 'villas') {
      openBooking(item, categoryId as 'yachts' | 'villas');
      return;
    }
    // Tutte le altre categorie noleggio (cars / urban-cars / corporate-fleet
    // + categorie dinamiche da Centralina Pro: Hypercar / Suv Luxury / ecc.)
    // passano per il CarBookingWizard. Niente vecchio BookingModal.
    openCarWizard(item, categoryId);
  };

  if (categoryId === 'jets' || categoryId === 'helicopters') {
    return (
      <div className="pt-32 pb-24 bg-black">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
              DR7 Aviation Division
            </h1>
            <p className="text-xl text-gray-400 mb-8">
              {t({ it: "Jet Privati ed Elicotteri su Misura", en: "Bespoke Private Jets and Helicopters" })}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Jet Booking */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-8 hover:border-white transition-colors"
            >
              <h2 className="text-3xl font-bold text-white mb-4 text-center">
                {t({ it: "Jet Privati", en: "Private Jets" })}
              </h2>
              <p className="text-gray-400 mb-6 text-center">
                {t({ it: "Voli a lungo raggio, business e viaggi intercontinentali", en: "Long-haul, business and intercontinental flights" })}
              </p>
              <div className="space-y-3 mb-8">
                <div className="flex items-center text-gray-300">

                  <span>{t({ it: "Voli nazionali ed internazionali", en: "Domestic and international flights" })}</span>
                </div>
                <div className="flex items-center text-gray-300">

                  <span>{t({ it: "Capacità fino a 20 passeggeri", en: "Capacity for up to 20 passengers" })}</span>
                </div>
                <div className="flex items-center text-gray-300">

                  <span>{t({ it: "Massimo comfort e privacy", en: "Maximum comfort and privacy" })}</span>
                </div>
              </div>
              <button
                onClick={() => window.open('https://wa.me/393457905205?text=' + encodeURIComponent('Ciao, vorrei richiedere un preventivo per un Jet Privato.'), '_blank')}
                className="w-full bg-white text-black px-6 py-4 rounded-full font-bold uppercase tracking-wider text-sm hover:bg-gray-200 transition-all duration-300 transform hover:scale-105"
              >
                {t({ it: "Richiedi Preventivo Jet", en: "Request a Jet Quote" })}
              </button>
            </motion.div>

            {/* Helicopter Booking */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-8 hover:border-white transition-colors"
            >
              <div className="text-6xl mb-6 text-center"></div>
              <h2 className="text-3xl font-bold text-white mb-4 text-center">
                {t({ it: "Elicotteri", en: "Helicopters" })}
              </h2>
              <p className="text-gray-400 mb-6 text-center">
                {t({ it: "Voli brevi, trasferimenti veloci e operazioni speciali", en: "Short flights, fast transfers and special operations" })}
              </p>
              <div className="space-y-3 mb-8">
                <div className="flex items-center text-gray-300">

                  <span>{t({ it: "Accesso a luoghi difficili da raggiungere", en: "Access to hard-to-reach locations" })}</span>
                </div>
                <div className="flex items-center text-gray-300">

                  <span>{t({ it: "Trasferimenti rapidi da/per aeroporti", en: "Fast transfers to and from airports" })}</span>
                </div>
                <div className="flex items-center text-gray-300">

                  <span>{t({ it: "Tour panoramici ed eventi speciali", en: "Scenic tours and special events" })}</span>
                </div>
              </div>
              <button
                onClick={() => window.open('https://wa.me/393457905205?text=' + encodeURIComponent('Ciao, vorrei richiedere un preventivo per un Elicottero.'), '_blank')}
                className="w-full bg-white text-black px-6 py-4 rounded-full font-bold uppercase tracking-wider text-sm hover:bg-gray-200 transition-all duration-300 transform hover:scale-105"
              >
                {t({ it: "Richiedi Preventivo Elicottero", en: "Request a Helicopter Quote" })}
              </button>
            </motion.div>
          </div>

          {/* Additional Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="mt-16 text-center"
          >
            <p className="text-gray-400 text-lg mb-4">
              {t({ it: "Non sei sicuro di quale servizio scegliere?", en: "Not sure which service to choose?" })}
            </p>
            <button
              onClick={() => navigate('/aviation-quote')}
              className="bg-gray-800 text-white px-8 py-3 rounded-full font-semibold hover:bg-gray-700 transition-colors"
            >
              {t({ it: "Contattaci per una Consulenza Gratuita", en: "Contact us for a Free Consultation" })}
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // Niente metadata statici? OK se siamo su una nuova categoria veicolare
  // creata in Centralina Pro: in quel caso ci affidiamo a fetchedVehicles
  // (filtrato dalla useVehicles hook) e mostriamo la lista senza la card
  // hero hardcoded. Mostriamo "Category not found" solo se la rotta non e'
  // veicolare e non c'e' nemmeno metadata statici.
  if (!category && !isVehicleCategory) {
    return <div className="pt-32 text-center text-white">{t('Category_not_found')}</div>;
  }

  const seoConfig: Record<string, { title: string; description: string; canonical: string; jsonLd?: Record<string, any> }> = {
    cars: {
      title: 'Luxury Car Rental Sardinia | Ferrari, Lamborghini, Porsche | DR7',
      description: 'Rent Ferrari, Lamborghini, Porsche, and premium supercars in Sardinia. Short-term & long-term luxury car rental with delivery. DR7 Supercar Division.',
      canonical: '/supercar-luxury',
      jsonLd: { '@type': 'AutoRental', name: 'DR7 Supercar Division', url: 'https://dr7.app/supercar-luxury', areaServed: { '@type': 'State', name: 'Sardegna' } },
    },
    'urban-cars': {
      title: 'Affordable Car Rental Sardinia | Urban Cars | DR7',
      description: 'Affordable urban car rental in Sardinia. City cars, compact SUVs, and practical vehicles for daily commutes and weekend trips. DR7 Urban Division.',
      canonical: '/urban',
      jsonLd: { '@type': 'AutoRental', name: 'DR7 Urban Division', url: 'https://dr7.app/urban', areaServed: { '@type': 'State', name: 'Sardegna' } },
    },
  };

  const seo = seoConfig[categoryId];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {seo && (
        <SEOHead
          title={seo.title}
          description={seo.description}
          canonical={seo.canonical}
          jsonLd={seo.jsonLd}
        />
      )}
      {/* Modifica search bar — only shown for vehicle categories with URL params */}
      {hasSearchParams && (
        <ModificaBar initial={barState} onUpdate={handleBarUpdate} />
      )}
      <div className="pt-32 pb-24 bg-black">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >

          </motion.div>

          {/* Search summary removed — ModificaBar already shows dates + Modifica button */}

          {/* Yacht Service - Quote Request Form */}
          {categoryId === 'yachts' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center justify-center py-12"
            >
              <div className="w-full max-w-3xl mx-auto px-4">
                <div className="text-center mb-8">
                  <h2 className="text-3xl md:text-4xl font-serif text-white tracking-wide">{t({ it: "Richiedi il tuo preventivo nautico", en: "Request your boat charter quote" })}</h2>
                  <p className="text-base md:text-lg text-white/70 mt-3">{t({ it: "Compila il form in modo preciso. Riceverai una proposta personalizzata in base alla disponibilità.", en: "Fill in the form accurately. You will receive a tailored proposal based on availability." })}</p>
                </div>

                <div className="bg-white rounded-2xl p-6 md:p-10 shadow-2xl">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      const get = (k: string) => fd.get(k)?.toString() || '';
                      let msg = 'Richiesta preventivo nautico:\n\n';
                      msg += `Data inizio: ${get('startDate')} ore ${get('startTime')}\n`;
                      msg += `Data fine: ${get('endDate')} ore ${get('endTime')}\n`;
                      msg += `Porto partenza: ${get('departurePort')}\n`;
                      msg += `Porto rientro: ${get('returnPort')}\n`;
                      msg += `Paese: ${get('country')}\n`;
                      msg += `N. ospiti: ${get('guests')}\n`;
                      msg += `Tipo imbarcazione: ${get('boatType')}\n`;
                      msg += `Lunghezza: ${get('minLength')}m - ${get('maxLength')}m\n`;
                      msg += `Budget: €${get('minPrice')} - €${get('maxPrice')}`;
                      window.open(`https://wa.me/393457905205?text=${encodeURIComponent(msg)}`, '_blank');
                    }}
                    className="space-y-5"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Data inizio", en: "Start date" })}</label>
                        <input type="date" name="startDate" required className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Ora inizio", en: "Start time" })}</label>
                        <input type="time" name="startTime" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Data fine", en: "End date" })}</label>
                        <input type="date" name="endDate" required className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Ora fine", en: "End time" })}</label>
                        <input type="time" name="endTime" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Zona / Porto di partenza", en: "Area / Departure port" })}</label>
                        <input type="text" name="departurePort" placeholder={t({ it: "Es. Porto Cervo, Cagliari, Olbia", en: "e.g. Porto Cervo, Cagliari, Olbia" })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Zona / Porto di rientro", en: "Area / Return port" })}</label>
                        <input type="text" name="returnPort" placeholder={t({ it: "Es. stesso porto o altro porto", en: "e.g. same port or a different port" })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Paese", en: "Country" })}</label>
                        <select name="country" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                          <option value="">{t({ it: "Seleziona", en: "Select" })}</option>
                          <option value="Italia">{t({ it: "Italia", en: "Italy" })}</option>
                          <option value="Francia">{t({ it: "Francia", en: "France" })}</option>
                          <option value="Spagna">{t({ it: "Spagna", en: "Spain" })}</option>
                          <option value="Grecia">{t({ it: "Grecia", en: "Greece" })}</option>
                          <option value="Croazia">{t({ it: "Croazia", en: "Croatia" })}</option>
                          <option value="Montenegro">Montenegro</option>
                          <option value="Altro">{t({ it: "Altro", en: "Other" })}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "N. ospiti", en: "No. of guests" })}</label>
                        <input type="number" name="guests" min="1" placeholder="" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Tipo imbarcazione", en: "Boat type" })}</label>
                        <select name="boatType" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                          <option value="">{t({ it: "Seleziona", en: "Select" })}</option>
                          <option value="Barca a vela">{t({ it: "Barca a vela", en: "Sailing boat" })}</option>
                          <option value="Catamarano">{t({ it: "Catamarano", en: "Catamaran" })}</option>
                          <option value="Motoryacht">Motoryacht</option>
                          <option value="Gommone">{t({ it: "Gommone", en: "RIB / dinghy" })}</option>
                          <option value="Superyacht">Superyacht</option>
                          <option value="Altro">{t({ it: "Altro", en: "Other" })}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Lunghezza minima (m)", en: "Minimum length (m)" })}</label>
                        <input type="number" name="minLength" min="1" placeholder={t({ it: "Es. 8", en: "e.g. 8" })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Prezzo minimo (€)", en: "Minimum price (€)" })}</label>
                        <input type="number" name="minPrice" min="0" placeholder={t({ it: "Es. 500", en: "e.g. 500" })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Lunghezza massima (m)", en: "Maximum length (m)" })}</label>
                        <input type="number" name="maxLength" min="1" placeholder={t({ it: "Es. 30", en: "e.g. 30" })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Prezzo minimo (€)", en: "Minimum price (€)" })}</label>
                        <input type="number" name="minPriceDup" min="0" placeholder={t({ it: "Es. 500", en: "e.g. 500" })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-1">{t({ it: "Prezzo massimo (€)", en: "Maximum price (€)" })}</label>
                        <input type="number" name="maxPrice" min="0" placeholder={t({ it: "Es. 10,000", en: "e.g. 10,000" })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                    </div>

                    <div className="pt-4">
                      <button
                        type="submit"
                        className="w-full flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#1ebe57] text-white text-lg font-bold py-4 rounded-xl transition-colors duration-200 shadow-lg"
                      >
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        {t({ it: "CHIEDI PREVENTIVO", en: "REQUEST A QUOTE" })}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </motion.div>
          )}

          {/* Yachts: only show the quote form, no vehicle cards */}
          {categoryId === 'yachts' ? null : (<>
          {/* Chrome-specific debug hint (dev-only) */}
          {showChromeDebugHint && (
            <div className="mb-4 bg-blue-900/20 border border-blue-500/50 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <svg className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-blue-200 text-sm font-medium">
                      Dev Note: Chrome Connection Issue Detected
                    </p>
                    <p className="text-blue-300/70 text-xs mt-1">
                      If Chrome fails but Safari works, try: <strong>incognito mode</strong> or <strong>disable browser extensions</strong>. This is a known Chrome HTTP/2 protocol issue with Supabase.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowChromeDebugHint(false)}
                  className="text-blue-300/70 hover:text-blue-200 text-sm flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Non-blocking error/cache banner - shows above vehicles, never blocks them */}
          {(vehiclesError || usingCache) && !vehiclesLoading && (
            <div className="mb-6 bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <svg className="h-5 w-5 text-yellow-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-yellow-200 text-sm font-medium">
                      {usingCache
                        ? t({ it: 'Veicoli da cache — problema di connessione rilevato', en: 'Showing cached vehicles — connection issue detected' })
                        : t({ it: 'Problema di connessione temporaneo — mostriamo gli ultimi veicoli noti', en: 'Temporary connection issue — showing last known vehicles' })}
                    </p>
                    <p className="text-yellow-300/70 text-xs mt-0.5">
                      {t({ it: 'I veicoli potrebbero non riflettere la disponibilità in tempo reale. Riprova per aggiornare.', en: 'Vehicles may not reflect real-time availability. Retry to refresh.' })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 text-sm font-medium rounded-lg transition-colors flex-shrink-0"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {vehiclesLoading || isSearching ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden animate-pulse">
                  <div className="h-64 bg-gray-800"></div>
                  <div className="p-6 space-y-4">
                    <div className="h-6 bg-gray-800 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-800 rounded w-1/2"></div>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-800 rounded"></div>
                      <div className="h-3 bg-gray-800 rounded w-5/6"></div>
                    </div>
                    <div className="h-10 bg-gray-800 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <VehicleResults
              categoryData={hasSearched && allVehicles.length > 0 ? allVehicles : categoryData}
              categoryId={categoryId}
              hasSearched={hasSearched}
              availabilityResults={availabilityResults}
              selectedCategories={selectedCategories}
              maxBudget={maxBudget}
              sortBy={sortBy}
              preDays={preDays}
              handleBook={handleBook}
              setSortBy={setSortBy}
              setMaxBudget={setMaxBudget}
              setSelectedCategories={setSelectedCategories}
              categoryLabels={categoryLabels}
            />
          )}
          </>)}
          </div>

      </div>
    </motion.div>
  );
};

export default RentalPage;
