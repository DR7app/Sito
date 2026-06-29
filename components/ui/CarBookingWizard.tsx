import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../../hooks/useTranslation';
import { Link } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { calculateMultiDayPrice, calculateIncludedKmFromConfig } from '../../utils/multiDayPricing';
import { invalidateVehicleCache } from '../../hooks/useVehicles';
import { addCredits } from '../../utils/creditWallet';
import { useAuth } from '../../hooks/useAuth';
import { useBooking } from '../../hooks/useBooking';
import { supabase } from '../../supabaseClient';
import { PICKUP_LOCATIONS as DEFAULT_PICKUP_LOCATIONS, RETURN_LOCATIONS as DEFAULT_RETURN_LOCATIONS } from '../../constants';

const LOYAL_CUSTOMER_THRESHOLD = 3;
import { getPickupLocations, getReturnLocations } from '../../utils/getLocations';
import type { Booking, RentalItem, DriverTier, TierClassification, PaymentMode } from '../../types';
import { classifyDriverTier } from '../../utils/tierClassification';
import DocumentUploader from './DocumentUploader';
import CompilaButton from './CompilaButton';
import AddressAutocomplete from './AddressAutocomplete';
import CalendarPicker from './CalendarPicker';
import {
  getUnlimitedKmOptions,
  calculateUnlimitedKmPrice,
  recommendKmPackage,
  isPremiumVehicle,
  isDucatoVehicle,
  isUrbanVehicle
} from '../../data/kmPricingData';
import { checkVehicleAvailability, checkVehiclePartialUnavailability, checkGroupedVehicleAvailability, safeDate, getLateReturnGraceMinutes } from '../../utils/bookingValidation';
import { getUserCreditBalance, deductCredits, hasSufficientBalance } from '../../utils/creditWallet';
import { calculateDiscountedPrice, getMembershipTierName } from '../../utils/membershipDiscounts';
import { roundToTwoDecimals, eurosToCents } from '../../utils/pricing';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { useCarWashServices } from '../../hooks/useCarWashServices';
import type { WashService } from '../../pages/CarWashServicesPage';
import { classifyVehicle as classifyWashVehicle } from '../../utils/classifyWashVehicle';
import { lookupTarga, isValidItalianPlate, normalizePlate, type TargaResult } from '../../utils/lookupTarga';
import CalcolaCFButton from './CalcolaCFButton';
import { useCentralinaProOverlay } from '../../hooks/useCentralinaProConfig';
import { getPickupTimesForDateString, getReturnTimesForDateString } from '../../utils/noleggioHours';

// Filter out dummy/placeholder names from auth profiles (e.g. "No Name", "User", "Test")
const DUMMY_NAMES = ['no name', 'no-name', 'noname', 'user', 'test', 'unknown', 'n/a', 'none', 'cliente'];
const isRealName = (name: string | null | undefined): string => {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  if (DUMMY_NAMES.includes(trimmed.toLowerCase())) return '';
  return trimmed;
};

// UPSELL_EXTRAS now derived inside the component from the live DB catalog
// (see `upsellExtras` in the component body). Cortesia is excluded as before.

const FUNCTIONS_BASE =
  import.meta.env.VITE_FUNCTIONS_BASE ??
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:8888'
    : window.location.origin);

// Nexi payment integration

type KaskoTier = 'KASKO' | 'KASKO_BLACK' | 'KASKO_SIGNATURE';

// Helper function to determine vehicle type
// Helper function to determine vehicle type
// Map vehicle type → deposit category key as stored in
// configOverlay.depositOptions.byCategory. The hook keys these by Pro names
// ('supercars' / 'urban' / 'aziendali'), so we return those — and also try
// the legacy DB names ('exotic') as a fallback inside pickDepositOptions.
function vTypeToDepositCategory(vType: 'UTILITARIA' | 'FURGONE' | 'V_CLASS' | 'SUPERCAR'): string {
  if (vType === 'SUPERCAR') return 'supercars'
  if (vType === 'UTILITARIA') return 'urban'
  return 'aziendali' // FURGONE / V_CLASS
}

// Pick deposit options for a vehicle: prefer the per-category set from
// admin Centralina, fall back to the legacy flat tier keys when the
// category override isn't configured.
//
// 2026-05-14: aggiunto rawCategory come PRIMA priorita\'. Senza, le
// categorie nuove create dall'admin in Centralina Pro (es. "Hypercar
// Elite", "Suv Luxury", ecc.) fallivano lookup perche\' getVehicleType
// le bucketizza in 4 tipi fissi -> sempre SUPERCAR/cauzione esotic.
// Ora si controlla direttamente l'id categoria DB; se non c'e\' override
// specifico, fallback al vType legacy.
/**
 * 2026-05-17: Centralized pacchetti KM lookup. Resolves the pacchetti list
 * for a vehicle category with full fallback chain:
 *   1) raw vehicle category id
 *   2) supercars <-> exotic alias (legacy DB mapping)
 *   3) any non-empty pacchetti list (universal fallback so a single
 *      Centralina Pro setup applies to ALL premium cars without per-category
 *      duplication — Porsche 911 etc. were silently missing pacchetti when
 *      their category id didn't match the Pro key).
 *
 * Returns [] when no pacchetti are configured anywhere in Centralina Pro.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvePacchetti(rawCat: string | undefined | null, byCat: Record<string, any[]> | undefined | null): any[] {
  if (!byCat) return []
  const cat = String(rawCat || '').toLowerCase().trim()
  // 2026-05-22 FIX: STRICT — solo alias supercars<->exotic. Niente
  // fallback a categorie diverse. Prima un Fiat Panda (urban) senza
  // pacchetti km configurati cadeva sul primo array non vuoto
  // (supercars) → mostrava i pacchetti supercar a €720/€1262/€42598
  // sulla scheda Panda. Adesso: se la categoria del veicolo non ha
  // pacchetti configurati in Centralina Pro, ritorna [] e l'UI
  // semplicemente non mostra l'opzione pacchetti km.
  const aliases = (cat === 'supercars' || cat === 'supercar') ? ['supercars', 'exotic', 'supercar']
                : cat === 'exotic' ? ['exotic', 'supercars', 'supercar']
                : cat ? [cat]
                : []
  for (const k of aliases) {
    const v = byCat[k]
    if (Array.isArray(v) && v.length > 0) return v
  }
  return []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickDepositOptions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configOverlay: any,
  vType: 'UTILITARIA' | 'FURGONE' | 'V_CLASS' | 'SUPERCAR' | undefined,
  depKey: 'TIER_1_RESIDENT' | 'TIER_2_RESIDENT' | 'TIER_1_NON_RESIDENT' | 'TIER_2_NON_RESIDENT',
  rawCategory?: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  const dOpts = configOverlay?.depositOptions
  if (!dOpts) return []

  const lookup = (key: string): any[] => {
    // PRIORITY 1: raw category id from the vehicle's DB row. Catches
    // categorie create dall'admin in Centralina Pro che non sono nei
    // 4 bucket legacy.
    if (rawCategory && typeof rawCategory === 'string') {
      const id = rawCategory.toLowerCase().trim()
      if (id) {
        // Alias supercars<->exotic per coerenza con configLookup.
        const aliases = (id === 'supercars' || id === 'supercar') ? ['supercars', 'exotic', 'supercar']
                      : id === 'exotic' ? ['exotic', 'supercars', 'supercar']
                      : (id === 'supercar' ? ['supercar', 'supercars', 'exotic'] : [id])
        for (const k of aliases) {
          const byCat = dOpts.byCategory?.[k]
          const fromCat = byCat?.[key]
          if (Array.isArray(fromCat) && fromCat.length > 0) return fromCat
        }
      }
    }

    // PRIORITY 2: bucketed vType (legacy 4-way mapping). Mantiene il
    // comportamento storico per veicoli senza categoria DB.
    if (vType) {
      const cat = vTypeToDepositCategory(vType)
      const candidates = [cat]
      if (cat === 'supercars') candidates.push('exotic')
      if (cat === 'aziendali') candidates.push('furgone')
      for (const k of candidates) {
        const byCat = dOpts.byCategory?.[k]
        const fromCat = byCat?.[key]
        if (Array.isArray(fromCat) && fromCat.length > 0) return fromCat
      }
    }

    // PRIORITY 3: flat tier key (legacy default)
    return dOpts[key] || []
  }

  const primary = lookup(depKey)
  // SAFETY: se la cauzione non-residente non è configurata in Centralina Pro
  // (lista vuota), ripiega su quella residente così la prenotazione non si
  // rompe (mostra le opzioni residente invece di un elenco vuoto). L'admin può
  // poi configurare le opzioni non-residente in Centralina Pro > Cauzioni.
  if ((!primary || primary.length === 0) && depKey.includes('NON_RESIDENT')) {
    return lookup(depKey.replace('NON_RESIDENT', 'RESIDENT'))
  }
  return primary || []
}

function getVehicleType(item: RentalItem, categoryContext?: string): 'UTILITARIA' | 'FURGONE' | 'V_CLASS' | 'SUPERCAR' {
  if (!item || !item.name) return 'SUPERCAR';

  // Robust Context-Based Classification
  if (categoryContext === 'urban-cars') return 'UTILITARIA';
  if (categoryContext === 'corporate-fleet') {
    const name = item.name.toLowerCase();
    if (name.includes('ducato') || name.includes('furgone')) return 'FURGONE';
    if (name.includes('vito') || name.includes('v class') || name.includes('v-class') || name.includes('classe v')) return 'V_CLASS';
    return 'UTILITARIA'; // Fallback for corporate fleet
  }

  // PRIMARY signal: vehicle.category from DB (set by admin in Centralina Pro
  // Categorie & Veicoli). This bypasses brittle name parsing — if the admin
  // tags a vehicle as 'aziendali', it's aziendali regardless of its name.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbCat = String(((item as any).category ?? '')).toLowerCase().trim();
  if (dbCat === 'aziendali' || dbCat === 'furgone') {
    const n = item.name.toLowerCase();
    if (n.includes('vito') || n.includes('v class') || n.includes('v-class') || n.includes('classe v')) return 'V_CLASS';
    return 'FURGONE';
  }
  if (dbCat === 'urban' || dbCat === 'utilitaria') return 'UTILITARIA';
  if (dbCat === 'exotic' || dbCat === 'supercar' || dbCat === 'supercars') return 'SUPERCAR';

  // Name-based fallback only when DB category is missing.
  const name = item.name.toLowerCase();
  const id = item.id ? item.id.toLowerCase() : '';

  if (id.startsWith('urban-car-') || name.includes('polo') || name.includes('utilitaria') || name.includes('clio') || name.includes('captur') || name.includes('panda') || name.includes('500') || name.includes('smart') || name.includes('twingo') || name.includes('ypsilon')) return 'UTILITARIA';
  if (name.includes('ducato') || name.includes('furgone')) return 'FURGONE';
  if (name.includes('vito') || name.includes('v class') || name.includes('v-class') || name.includes('classe v')) return 'V_CLASS';
  return 'SUPERCAR'; // Default to supercar for luxury cars
}

const calculateAgeFromDDMMYYYY = (dateString: string): number => {
  if (!dateString) return 0;

  // Support both YYYY-MM-DD (date input) and DD/MM/YYYY (legacy)
  let birthDate: Date;
  if (dateString.includes('/')) {
    // DD/MM/YYYY format
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) return 0;
    const [d, m, y] = dateString.split('/');
    const day = parseInt(d, 10);
    const month = parseInt(m, 10) - 1;
    const year = parseInt(y, 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return 0;
    birthDate = new Date(year, month, day);
    if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month || birthDate.getDate() !== day) return 0;
  } else {
    // YYYY-MM-DD format (from date input)
    birthDate = safeDate(dateString);
    if (isNaN(birthDate.getTime())) return 0;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const diffM = today.getMonth() - birthDate.getMonth();
  if (diffM < 0 || (diffM === 0 && today.getDate() < birthDate.getDate())) age--;
  return age < 0 ? 0 : age;
};

const calculateYearsSince = (dateString: string): number => {
  if (!dateString) return 0;
  const sinceDate = safeDate(dateString);
  if (isNaN(sinceDate.getTime())) return 0;

  const today = new Date();
  let years = today.getFullYear() - sinceDate.getFullYear();
  const diffM = today.getMonth() - sinceDate.getMonth();
  if (diffM < 0 || (diffM === 0 && today.getDate() < sinceDate.getDate())) years--;
  return years < 0 ? 0 : years;
};

const createItalyDateTime = (dateStr: string, timeStr: string) => {
  if (!dateStr || !timeStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = (timeStr || '10:30').split(':').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) return new Date();
  const checkDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const italyFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    hour12: false
  });
  const italyNoonHour = parseInt(italyFormatter.format(checkDate));
  const italyOffset = italyNoonHour - 12;
  return new Date(Date.UTC(year, month - 1, day, hours - italyOffset, minutes, 0, 0));
};

// === Km inclusi per durata ===
// 1gg=100, 2gg=180, 3gg=240, 4gg=280, 5gg=300, dal 5° giorno in poi +60/giorno
// calculateIncludedKm is now driven by admin config via calculateIncludedKmFromConfig.
// The inline wrapper is kept for backward compat; receives config at call site.
const calculateIncludedKm = (days: number, kmConfig?: { table: Record<string, number>; extra_per_day: number } | null) => {
  return calculateIncludedKmFromConfig(days, kmConfig);
};

interface CarBookingWizardProps {
  item: RentalItem;
  categoryContext?: string;
  onBookingComplete: (booking: Booking) => void;
  onClose: () => void;
}

const CarBookingWizard: React.FC<CarBookingWizardProps> = ({ item, categoryContext, onBookingComplete, onClose }) => {
  const { t, getTranslated } = useTranslation();
  const { currency } = useCurrency();
  const { user, loading: authLoading } = useAuth();
  const { initialSearchDates } = useBooking();
  const [pickupLocs, setPickupLocs] = useState(DEFAULT_PICKUP_LOCATIONS);
  const [returnLocs, setReturnLocs] = useState(DEFAULT_RETURN_LOCATIONS);
  useEffect(() => {
    let c = false;
    Promise.all([getPickupLocations(), getReturnLocations()]).then(([p, r]) => {
      if (c) return;
      setPickupLocs(p);
      setReturnLocs(r);
    });
    return () => { c = true; };
  }, []);

  // Determine vehicle type
  const vehicleType = useMemo(() => getVehicleType(item, categoryContext), [item, categoryContext]);
  const isUrbanOrCorporate = vehicleType === 'UTILITARIA' || vehicleType === 'FURGONE' || vehicleType === 'V_CLASS';

  // Urban/Corporate fleet availability deadline (removed — no longer restricted)
  const UTILITARIE_MAX_DATE = '2027-12-31';
  const isUtilitaria = vehicleType === 'UTILITARIA';
  const [showMaxDatePopup, setShowMaxDatePopup] = useState(false);

  // Check if booking was initiated from search (Prenota Ora)
  const isFromSearch = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return !!(params.get('pickup') && params.get('return'));
  }, []);

  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingPreventivo, setIsSavingPreventivo] = useState(false);
  const [preventivoSaved, setPreventivoSaved] = useState(false);
  const [showNoCauzionePopup, setShowNoCauzionePopup] = useState(false);
  const [noCauzioneRequested, setNoCauzioneRequested] = useState(false);
  const [noCauzioneSending, setNoCauzioneSending] = useState(false);
  const [noCauzioneSaved, setNoCauzioneSaved] = useState(false);
  const [showVehicleDepositPopup, setShowVehicleDepositPopup] = useState(false);
  const [vehicleDepositLibretto, setVehicleDepositLibretto] = useState<File | null>(null);
  const [vehicleDepositLibrettoVerso, setVehicleDepositLibrettoVerso] = useState<File | null>(null);
  const [vehicleDepositTarga, setVehicleDepositTarga] = useState('');
  const [vehicleDepositLoading, setVehicleDepositLoading] = useState(false);
  const [vehicleDepositError, setVehicleDepositError] = useState<string | null>(null);
  const [vehicleDepositVerified, setVehicleDepositVerified] = useState(false);
  const [vehicleDepositInfo, setVehicleDepositInfo] = useState<string | null>(null);
  const [vehicleDepositIsOwner, setVehicleDepositIsOwner] = useState(true);
  const [vehicleDepositOwner, setVehicleDepositOwner] = useState({
    nome: '', cognome: '', codiceFiscale: '', dataNascita: '', luogoNascita: '',
    indirizzo: '', citta: '', cap: '', provincia: '', telefono: '', email: '',
  });
  // Provincia di residenza del cliente loggato (da customers_extended via
  // getResidencyZone). Serve a determinare la cauzione residente/non-residente:
  // residente SOLO se provincia CA o SU (come admin getResidenceStatus); tutto
  // il resto (altre province IT, estero 'EE') = non residente. Vuoto = residente
  // (default sicuro, non sovra-addebita chi non ha la provincia in profilo).
  const [customerProvinciaResidenza, setCustomerProvinciaResidenza] = useState<string>('');
  // ISO country code (lowercase) dell'indirizzo di residenza scelto dall'elenco.
  // Serve SOLO a non bloccare i clienti esteri (il CAP italiano a 5 cifre non si
  // applica fuori dall'Italia). NON cambia la cauzione: quella resta gestita da
  // Centralina Pro / provincia profilo come prima.
  const [residenzaCountryCode, setResidenzaCountryCode] = useState<string>('');
  const today = useMemo(() => {
    // Get today's date in Italy timezone (Europe/Rome)
    const italyDate = new Date().toLocaleString('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
    return italyDate.split(',')[0]; // Returns YYYY-MM-DD format
  }, []);

  const [formData, setFormData] = useState(() => {
    // Read pre-filled values from URL params (set by Prenota Ora popup)
    const urlParams = new URLSearchParams(window.location.search);
    const hasSearchParams = !!(urlParams.get('pickup') && urlParams.get('return'));
    const prefillPickup = urlParams.get('pickup') || today;
    const prefillReturn = urlParams.get('return') || (() => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y = parseInt(tomorrow.toLocaleString('en-GB', { timeZone: 'Europe/Rome', year: 'numeric' }));
      const m = parseInt(tomorrow.toLocaleString('en-GB', { timeZone: 'Europe/Rome', month: '2-digit' }));
      const d = parseInt(tomorrow.toLocaleString('en-GB', { timeZone: 'Europe/Rome', day: '2-digit' }));
      return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    })();
    const prefillPickupTime = urlParams.get('pickupTime') || '10:30';
    const prefillReturnTime = urlParams.get('returnTime') || '09:00';
    const prefillPickupLoc = urlParams.get('pickupLoc') || DEFAULT_PICKUP_LOCATIONS[0].id;
    const prefillReturnLoc = urlParams.get('returnLoc') || DEFAULT_PICKUP_LOCATIONS[0].id;
    const prefillPickupLocLabel = urlParams.get('pickupLocLabel') || '';
    const prefillReturnLocLabel = urlParams.get('returnLocLabel') || '';

    return {
      // Step 1
      pickupLocation: prefillPickupLoc,
      returnLocation: prefillReturnLoc,
      pickupDate: prefillPickup,
      pickupTime: prefillPickupTime,
      returnDate: prefillReturn,
      returnTime: prefillReturnTime,

      // Step 2
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      birthDate: '',
      sesso: '',
      luogoNascita: '',
      provinciaNascita: '',
      codiceFiscale: '',
      residenza: '',
      licenseNumber: '',
      licenseIssueDate: '',
      licenseImage: null, // File or dataURL
      idImage: null,
      address: '',
      city: '',
      confirmsInformation: false,

      addSecondDriver: false,
      secondDriver: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        birthDate: '',
        licenseNumber: '',
        licenseIssueDate: '',
        licenseExpiryDate: '',
        countryOfIssue: '',
        licenseImage: null as File | string | null,
        idImage: null as File | string | null,
      },

      // Step 3
      insuranceOption: 'KASKO_BASE', // Default to Kasko Base
      depositOption: '' as string, // deposit option id from configOverlay.depositOptions
      extras: [] as string[],
      // 2026-05-16: aggiunto valore dinamico `pacchetto:${id}` per i
      // pacchetti KM extra acquistabili (configurati in Centralina Pro
      // per categoria). String dinamica → tipo widened a `string` per
      // accettare l'id del pacchetto runtime.
      kmPackageType: 'none' as 'none' | 'unlimited' | '50km' | string,
      // 2026-05-16: pacchetti KM CUMULATIVI. Mappa pkgId → quantita'.
      // Quando >= 1 entry ha qty > 0, kmPackageType e' implicito 'none'
      // (i pacchetti NON sostituiscono i km inclusi: si SOMMANO). E'
      // mutuamente esclusivo con kmPackageType='unlimited' (illimitati).
      kmPackages: {} as Record<string, number>,
      kmPackageDistance: 100,
      expectedKm: 0,
      usageZone: '' as 'CAGLIARI_SUD' | 'FUORI_ZONA' | '',
      // New tier-based fields
      selectedExperiences: {} as Record<string, number>, // { serviceId: quantity }
      dr7Flex: false,
      paymentMode: 'full' as PaymentMode,

      // Delivery — structured address fields
      deliveryAddress: '', // legacy
      deliveryPickupVia: '', deliveryPickupNumero: '', deliveryPickupCap: '', deliveryPickupCitta: '', deliveryPickupProvincia: '', deliveryPickupKm: 0,
      deliveryReturnVia: '', deliveryReturnNumero: '', deliveryReturnCap: '', deliveryReturnCitta: '', deliveryReturnProvincia: '', deliveryReturnKm: 0,

      // Vehicle assignment (set by availability check)
      selectedVehicleId: '' as string,

      // Step 4
      paymentMethod: 'nexi' as 'nexi' | 'credit',
      agreesToTerms: false,
      agreesToPrivacy: false,
      confirmsDocuments: false,
    };
  });

  // Apply URL-derived search dates on first mount + auto-adjust for availableFrom
  useEffect(() => {
    if (!initialSearchDates) return;

    // Calculate adjusted pickup time from availableFrom
    let adjustedPickupTime = initialSearchDates.pickupTime;
    const availFrom = (item as any)?._availableFrom;
    if (availFrom && typeof availFrom === 'string') {
      try {
        const availDate = new Date(availFrom);
        const availTime = availDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Rome' });
        const [h, m] = availTime.split(':').map(Number);
        const roundedMin = m <= 0 ? '00' : m <= 30 ? '30' : '00';
        const roundedHour = m > 30 ? h + 1 : h;
        const roundedTime = `${String(roundedHour).padStart(2, '0')}:${roundedMin}`;
        if (roundedTime > adjustedPickupTime) {
          adjustedPickupTime = roundedTime;
          console.log(`[availableFrom] Auto-adjusted pickup time: ${initialSearchDates.pickupTime} → ${roundedTime}`);
        }
      } catch { /* ignore parse errors */ }
    }

    setFormData(prev => ({
      ...prev,
      pickupDate: initialSearchDates.pickupDate,
      pickupTime: adjustedPickupTime,
      returnDate: initialSearchDates.returnDate,
      returnTime: initialSearchDates.returnTime,
      pickupLocation: initialSearchDates.pickupLocation,
      returnLocation: initialSearchDates.returnLocation,
      // Pre-fill from preventivo
      ...(initialSearchDates.insuranceOption ? { insuranceOption: initialSearchDates.insuranceOption } : {}),
      ...(initialSearchDates.depositOption ? { depositOption: initialSearchDates.depositOption } : {}),
      ...(initialSearchDates.unlimitedKm ? { kmPackageType: 'unlimited' as const } : {}),
      // Pacchetti KM ripristinati dal preventivo. Se kmPackages e' un oggetto
      // con almeno una qty > 0, il wizard pre-seleziona quei pacchetti (es.
      // Pacchetto 300 km). kmPackageType viene allineato a 'none' quando ci
      // sono pacchetti specifici (mutuamente esclusivo con 'unlimited').
      ...(initialSearchDates.kmPackages && Object.values(initialSearchDates.kmPackages).some(q => (q || 0) > 0)
        ? { kmPackages: initialSearchDates.kmPackages, kmPackageType: 'none' as const }
        : {}),
      ...(initialSearchDates.kmPackageType && !initialSearchDates.unlimitedKm
        ? { kmPackageType: initialSearchDates.kmPackageType }
        : {}),
      ...(initialSearchDates.dr7Flex ? { dr7Flex: true } : {}),
      ...(initialSearchDates.secondDriver ? { addSecondDriver: true } : {}),
      ...(initialSearchDates.experienceServices ? { selectedExperiences: initialSearchDates.experienceServices } : {}),
    }));
    // Set noCauzioneRequested if preventivo was a no_deposit request
    if (initialSearchDates.depositOption === 'no_deposit') {
      setNoCauzioneRequested(true);
    }
    // Auto-fill discount code from preventivo link (e.g. refused No Cauzione with 5% code)
    if (initialSearchDates.discountCode) {
      setDiscountCode(initialSearchDates.discountCode);
      // Auto-validate after a short delay to let form state settle
      setTimeout(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
          // Resolve serviceType from the page's category context, NOT a hardcoded
          // 'noleggio'. Otherwise codes restricted to a single sub-category
          // (e.g. scope=['supercar']) would slip through under the broader
          // 'noleggio' label and silently apply on Utilitarie / Aziendali.
          const autoServiceType = categoryContext === 'cars' ? 'supercar'
            : categoryContext === 'urban-cars' ? 'utilitarie'
            : categoryContext === 'corporate-fleet' ? 'aziendali'
            : 'noleggio';
          const response = await fetch('/.netlify/functions/validate-discount-code', {
            method: 'POST',
            headers,
            body: JSON.stringify({ code: initialSearchDates.discountCode, serviceType: autoServiceType })
          });
          const result = await response.json();
          if (response.ok && result.valid) {
            const data = { ...result, ...(result.discountCode || {}) };
            const amt = data.value_amount ?? data.discount_amount ?? data.rental_credit ?? 0;
            const type = (data.value_type === 'percentage' || data.discount_type === 'percentage') ? 'percentage' as const : 'fixed' as const;
            setAppliedDiscount({ code: initialSearchDates.discountCode!.toUpperCase(), amount: amt, type, code_type: data.code_type || 'marketing' });
            setDiscountCodeValid(true);
          }
        } catch { /* validation will happen when user reaches step 4 */ }
      }, 500);
    }
    // If coming from a preventivo, skip directly to checkout (Step 4).
    // 2026-05-21: when in EDIT mode (customer pressed "Modifica" on
    // MyPreventivi), stay on step 1 so they can change dates/insurance/
    // packages from the start. Otherwise default behavior (jump to step 4
    // = "Prenota Ora" flow).
    if (initialSearchDates.preventivoId && !initialSearchDates.editMode) {
      setTimeout(() => setStep(4), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount only

  // Auto-adjust pickup time from availableFrom (works even without initialSearchDates)
  useEffect(() => {
    const availFrom = (item as any)?._availableFrom;
    if (!availFrom || typeof availFrom !== 'string') return;
    try {
      const availDate = new Date(availFrom);
      const availTime = availDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Rome' });
      const [h, m] = availTime.split(':').map(Number);
      const rMin = m <= 0 ? '00' : m <= 30 ? '30' : '00';
      const rHour = m > 30 ? h + 1 : h;
      const adjusted = `${String(rHour).padStart(2, '0')}:${rMin}`;
      // Use setTimeout to run after initialSearchDates useEffect
      setTimeout(() => {
        setFormData(prev => {
          if (adjusted > prev.pickupTime) {
            console.log(`[availableFrom] Adjusted pickup: ${prev.pickupTime} → ${adjusted}`);
            return { ...prev, pickupTime: adjusted };
          }
          return prev;
        });
      }, 200);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tier classification state
  const [driverTierInfo, setDriverTierInfo] = useState<TierClassification | null>(null);
  const driverTier: DriverTier | null = driverTierInfo?.tier || null;

  // --- Centralina Pro is the ONLY pricing source ---
  // No legacy fallback: every price comes from the admin Centralina Pro tab.
  const { overlay: configOverlay, snapshot: proSnapshot } = useCentralinaProOverlay();

  // ──────────────────────────────────────────────────────────────────
  // Every pricing value below comes STRICTLY from Centralina Pro.
  // No hardcoded fallback: if a field is empty in Pro, the wizard
  // shows 0 / empty list so the gap is visible and the admin can fix it.
  // Aziendali category in Pro drives both Furgone (Ducato) and NCC (V_CLASS).
  // ──────────────────────────────────────────────────────────────────
  const ACTIVE_INSURANCE_BY_TIER = useMemo(() => {
    return {
      TIER_1: configOverlay?.insuranceTier1 ?? [],
      TIER_2: configOverlay?.insuranceTier2 ?? [],
    };
  }, [configOverlay]);

  const getInsuranceForVehicle = useMemo(() => {
    return (vType: string, _tier: string) => {
      // PRIORITY 1: per-category insurance from admin Centralina Pro.
      // Catches ogni categoria nuova creata dall'admin (Hypercar Elite,
      // Suv Luxury, ecc.) — il bucket nuovo viene caricato in
      // configOverlay.insuranceByCategory[catId].
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawCat = String(((item as any).category ?? '')).toLowerCase().trim()
      if (rawCat && configOverlay?.insuranceByCategory) {
        const aliases = (rawCat === 'supercars' || rawCat === 'supercar') ? ['supercars', 'exotic', 'supercar']
                      : rawCat === 'exotic' ? ['exotic', 'supercars', 'supercar']
                      : (rawCat === 'supercar' ? ['supercar', 'supercars', 'exotic'] : [rawCat])
        for (const k of aliases) {
          const bucket = configOverlay.insuranceByCategory[k]
          if (!bucket) continue
          const tierOpts = bucket[_tier as 'TIER_1' | 'TIER_2']
          if (Array.isArray(tierOpts) && tierOpts.length > 0) return tierOpts
          if (Array.isArray(bucket._all_tiers) && bucket._all_tiers.length > 0) return bucket._all_tiers
        }
      }
      // PRIORITY 2: legacy bucketed lookup
      const urbanOpts = configOverlay?.urbanInsurance ?? [];
      const furgoneOpts = configOverlay?.furgoneInsurance ?? [];
      if (vType === 'UTILITARIA') return urbanOpts;
      if (vType === 'FURGONE' || vType === 'V_CLASS') return furgoneOpts;
      return ACTIVE_INSURANCE_BY_TIER[_tier as 'TIER_1' | 'TIER_2'] || [];
    };
  }, [configOverlay, ACTIVE_INSURANCE_BY_TIER, item]);

  // Se l'assicurazione selezionata non e' valida per la categoria del veicolo
  // (es. il default KASKO_BASE su Urban/Fiat Panda, che in Centralina Pro ha
  // solo RCA/Base), ripiega sulla prima opzione VALIDA della categoria (RCA se
  // presente). Tutto da Centralina Pro: niente "Kasko Base" forzato su Urban.
  useEffect(() => {
    const activeTier = (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2';
    const opts = getInsuranceForVehicle(vehicleType, activeTier);
    if (!Array.isArray(opts) || opts.length === 0) return;
    const valid = opts.some((o: { id?: string }) => o.id === formData.insuranceOption);
    if (!valid) {
      const fallback = opts.find((o: { id?: string }) => o.id === 'RCA')?.id || opts[0]?.id;
      if (fallback) setFormData(prev => ({ ...prev, insuranceOption: fallback }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleType, driverTier, configOverlay, formData.insuranceOption]);

  const ACTIVE_TIER_PRICING = useMemo(() => {
    return configOverlay?.tierPricing ?? {
      TIER_1: { unlimitedKmPerDay: 0, secondDriverPerDay: 0, lavaggio: 0 },
      TIER_2: { unlimitedKmPerDay: 0, secondDriverPerDay: 0, lavaggio: 0 },
    };
  }, [configOverlay]);

  // Cauzione residente vs non-residente (dipende dall'indirizzo del cliente).
  // Regola business identica all'admin (sardegnaProvince.RESIDENT_PROVINCE_CODES):
  // residente SOLO con provincia di residenza CA o SU. Qualsiasi altra provincia
  // o l'estero ('EE') = non residente → si applica la cauzione non-residente
  // (più alta, solo carta) configurata in Centralina Pro. Provincia vuota/ignota
  // = residente (default sicuro, mantiene lo status quo per chi non ha la provincia).
  const RESIDENT_PROVINCE_CODES = ['CA', 'SU'];
  const isNonResidentCustomer = (() => {
    const prov = (customerProvinciaResidenza || '').toUpperCase().trim();
    if (!prov) return false;
    return !RESIDENT_PROVINCE_CODES.includes(prov);
  })();
  const residencySuffix: 'RESIDENT' | 'NON_RESIDENT' = isNonResidentCustomer ? 'NON_RESIDENT' : 'RESIDENT';

  // Read the no_deposit surcharge per day from Centralina Pro. The Pro overlay stores
  // it per deposit option (surchargePerDay), NOT as a global field. Look it up from the
  // active tier's deposit list (Fascia A or B, resident).
  // Source of truth: Centralina Pro. NO hardcoded fallbacks.
  // If Pro doesn't define no_deposit, the popup shows 0 — the admin must add the option.
  const ACTIVE_NO_DEPOSIT_SURCHARGE = (() => {
    const activeTier = (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2';
    const depKey = `${activeTier}_${residencySuffix}` as 'TIER_1_RESIDENT' | 'TIER_2_RESIDENT' | 'TIER_1_NON_RESIDENT' | 'TIER_2_NON_RESIDENT';
    const pools = [
      pickDepositOptions(configOverlay, vehicleType, depKey, (item as any).category),
      pickDepositOptions(configOverlay, vehicleType, 'TIER_2_RESIDENT', (item as any).category),
      pickDepositOptions(configOverlay, vehicleType, 'TIER_1_RESIDENT', (item as any).category),
    ].filter(arr => Array.isArray(arr) && arr.length > 0) as Array<Array<{ id?: string; surchargePerDay?: number }>>;
    for (const pool of pools) {
      const hit = pool.find(o => o?.id === 'no_deposit');
      if (typeof hit?.surchargePerDay === 'number' && hit.surchargePerDay > 0) return hit.surchargePerDay;
    }
    return configOverlay?.noDepositSurchargePerDay ?? 0;
  })();
  // €/km consegna a domicilio: prezzo PER CATEGORIA dalla Centralina Pro
  // (delivery.by_category), non più il flat. Alias supercars<->exotic.
  // Fallback al flat solo se la categoria non è configurata.
  const ACTIVE_DELIVERY_PRICE_PER_KM = (() => {
    const cat = String((item as { category?: string }).category || '').toLowerCase().trim();
    const byCat = configOverlay?.deliveryPriceByCategory || {};
    const aliases = cat === 'supercars' ? ['supercars', 'exotic']
      : cat === 'exotic' ? ['exotic', 'supercars']
      : cat ? [cat] : [];
    for (const k of aliases) {
      if (typeof byCat[k] === 'number' && byCat[k] > 0) return byCat[k];
    }
    return configOverlay?.deliveryPricePerKm ?? 0;
  })();
  // ACTIVE_DR7_FLEX rimosso — DR7 Flex ora è in EXPERIENCE_SERVICES.
  const ACTIVE_EXPERIENCE_SERVICES = configOverlay?.experienceServices ?? [];

  // DR7 FLEX (noleggio): cancellazione fino al giorno stesso del servizio, 90% in
  // DR7 Wallet, 1 spostamento gratuito. Da quando DR7 Flex è un Experience
  // Service (id Centralina, spesso NON contiene "dr7flex"), il booking salvava
  // dr7_flex=false e in "Le mie prenotazioni" il pulsante "Cancella" non
  // compariva. Qui rileviamo il Flex tra gli experience selezionati per ID O
  // NOME e salviamo un booleano affidabile su booking_details.dr7_flex.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDr7FlexService = (svc: any): boolean => {
    const hay = `${svc?.id || ''} ${svc?.name || ''}`.toLowerCase();
    return hay.includes('dr7 flex') || hay.includes('dr7flex') || hay.includes('dr7-flex') || (hay.includes('dr7') && hay.includes('flex'));
  };
  const dr7FlexEffective = useMemo(() => {
    if (formData.dr7Flex) return true;
    return Object.entries(formData.selectedExperiences || {}).some(([svcId, qty]) => {
      if (!(Number(qty) > 0)) return false;
      const svc = (ACTIVE_EXPERIENCE_SERVICES as Array<{ id: string; name?: string }>).find(s => s.id === svcId);
      return isDr7FlexService(svc || { id: svcId });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.dr7Flex, formData.selectedExperiences, ACTIVE_EXPERIENCE_SERVICES]);
  // Utilitaria/Aziendali deposit displayed in riepilogo — first real (non-zero)
  // amount from Pro's urban deposit options. Falls back to 0 if Pro empty.
  const ACTIVE_UTILITARIA_DEPOSIT = (() => {
    const activeTier = (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2';
    const depKey = `${activeTier}_${residencySuffix}` as 'TIER_1_RESIDENT' | 'TIER_2_RESIDENT' | 'TIER_1_NON_RESIDENT' | 'TIER_2_NON_RESIDENT';
    const opts = pickDepositOptions(configOverlay, 'UTILITARIA', depKey) as Array<{ amount?: number }>;
    const real = opts.find(o => typeof o.amount === 'number' && o.amount > 0);
    return real?.amount ?? 0;
  })();

  // Live Prime Wash catalog from admin (car_wash_services). Replaces the
  // old hardcoded URBAN_SERVICES/MAXI_SERVICES/EXTRA_CARE_SERVICES/
  // EXPERIENCE_SERVICES imports. Single source of truth = Catalogo Lavaggio.
  const washServices = useCarWashServices();
  const upsellUrbanServices = useMemo(
    () => washServices.filter(s => s.category === 'urban'),
    [washServices]
  );
  const upsellMaxiServices = useMemo(
    () => washServices.filter(s => s.category === 'maxi'),
    [washServices]
  );
  const upsellExtras = useMemo(
    () => washServices.filter(s =>
      (s.category === 'extra' || s.category === 'experience') && s.id !== 'extra-courtesy'
    ),
    [washServices]
  );

  const ACTIVE_RENTAL_DAY_RATES = configOverlay?.rentalDayRates ?? null;
  const ACTIVE_KM_INCLUDED = configOverlay?.kmIncluded ?? null;
  const ACTIVE_KM_INCLUDED_AZIENDALI = configOverlay?.kmIncludedAziendali ?? null;
  // Per-category lookup helpers. Read by raw vehicle.category id from
  // Centralina Pro (Hypercar / Suv Luxury / new categories included);
  // fall back to bucketed legacy maps and finally the _global default.
  const getKmIncludedForVehicle = (rawCategory: string | null | undefined, vType: 'UTILITARIA' | 'FURGONE' | 'V_CLASS' | 'SUPERCAR' | undefined) => {
    const byCat = configOverlay?.kmIncludedByCategory
    if (rawCategory && byCat) {
      const id = String(rawCategory).toLowerCase().trim()
      if (id) {
        const aliases = (id === 'supercars' || id === 'supercar') ? ['supercars', 'exotic', 'supercar']
                      : id === 'exotic' ? ['exotic', 'supercars', 'supercar']
                      : (id === 'supercar' ? ['supercar', 'supercars', 'exotic'] : [id])
        for (const k of aliases) {
          const hit = byCat[k]
          if (!hit) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((hit as any).unlimited === true) return null
          return hit as { table: Record<string, number>; extra_per_day: number }
        }
      }
    }
    if (vType === 'FURGONE' || vType === 'V_CLASS') {
      return ACTIVE_KM_INCLUDED_AZIENDALI || ACTIVE_KM_INCLUDED
    }
    return ACTIVE_KM_INCLUDED
  }
  const getSforoForVehicle = (rawCategory: string | null | undefined): number => {
    const byCat = configOverlay?.sforoByCategory
    if (rawCategory && byCat) {
      const id = String(rawCategory).toLowerCase().trim()
      if (id) {
        const aliases = (id === 'supercars' || id === 'supercar') ? ['supercars', 'exotic', 'supercar']
                      : id === 'exotic' ? ['exotic', 'supercars', 'supercar']
                      : (id === 'supercar' ? ['supercar', 'supercars', 'exotic'] : [id])
        for (const k of aliases) {
          const v = byCat[k]
          if (typeof v === 'number' && v > 0) return v
        }
      }
    }
    return configOverlay?.sforoPerKm ?? 0
  }
  const ACTIVE_SFORO_PER_KM = getSforoForVehicle((item as any).category);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedInsurance, setExpandedInsurance] = useState<string | null>(null);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [partialUnavailabilityWarning, setPartialUnavailabilityWarning] = useState<string | null>(null);
  const [shortSlotWarning, setShortSlotWarning] = useState<string | null>(null); // Warning for short availability slots
  const [availableVehicleName, setAvailableVehicleName] = useState<string | null>(null);
  const [usageZoneError, setUsageZoneError] = useState<string | null>(null);


  // Wash upsell state
  const [showWashUpsell, setShowWashUpsell] = useState(false);
  const [selectedUpsellWash, setSelectedUpsellWash] = useState<WashService | null>(null);
  const [selectedUpsellExtras, setSelectedUpsellExtras] = useState<WashService[]>([]);
  const [upsellCarInput, setUpsellCarInput] = useState('');
  const [upsellCarCategory, setUpsellCarCategory] = useState<'urban' | 'maxi' | null>(null);
  const [upsellCarModel, setUpsellCarModel] = useState<string | null>(null);

  // Subscription upsell state
  const [showSubscriptionUpsell, setShowSubscriptionUpsell] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<'monthly' | 'annual' | null>(null);

  // Wash upsell targa state
  const [upsellTargaInput, setUpsellTargaInput] = useState('');
  const [upsellTargaLoading, setUpsellTargaLoading] = useState(false);
  const [upsellTargaError, setUpsellTargaError] = useState<string | null>(null);
  const [upsellTargaResult, setUpsellTargaResult] = useState<TargaResult | null>(null);
  const [upsellTargaManualCategory, setUpsellTargaManualCategory] = useState<'urban' | 'maxi' | null>(null);

  // Single source of truth for availability
  const [earliestAvailability, setEarliestAvailability] = useState<{
    isAvailable: boolean;
    earliestAvailableDate?: string;
    earliestAvailableTime?: string;
    earliestAvailableDatetime?: string;
  } | null>(null);


  // Availability windows for gap detection
  interface AvailabilityWindow {
    start: string; // ISO timestamp
    end: string;
  }
  const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<AvailabilityWindow | null>(null);
  const [isLoadingWindows, setIsLoadingWindows] = useState(false);
  const [hasBusyPeriods, setHasBusyPeriods] = useState(false); // Track if there are actual bookings

  // Delivery distance calculation
  const [deliveryInfo, setDeliveryInfo] = useState<{
    distanceKm: number
    roundTripKm: number
    deliveryFee: number
    durationText: string
    destinationAddress: string
  } | null>(null)
  const [isCalculatingDelivery, setIsCalculatingDelivery] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  // Dynamic pricing from revenue_config (admin-controlled)
  const [dynamicPricing, setDynamicPricing] = useState<{
    enabled: boolean
    mode?: string
    finalDailyRateEur?: number
    finalTotalEur?: number
    rentalDays?: number
    selectedBaseRateEur?: number
    breakdown?: { label: string; coeff: number; description: string }[]
    minPrice?: number | null
    maxPrice?: number | null
  } | null>(null)

  // Compute max bookable pickup date from availability windows
  // If there's a block (e.g., vehicle unavailable from March 16), the last free window's end becomes the max date
  const maxBookableDate = useMemo(() => {
    if (availabilityWindows.length === 0 || !hasBusyPeriods) return undefined;
    // Find the last free window — its end is the latest possible return
    const lastWindow = availabilityWindows[availabilityWindows.length - 1];
    const lastEnd = new Date(lastWindow.end);
    // Max pickup = lastEnd - 1 day (minimum 1-day rental)
    const maxPickup = new Date(lastEnd);
    maxPickup.setDate(maxPickup.getDate() - 1);
    return maxPickup.toISOString().split('T')[0];
  }, [availabilityWindows, hasBusyPeriods]);

  // Max return date from availability windows
  const maxReturnDate = useMemo(() => {
    if (availabilityWindows.length === 0 || !hasBusyPeriods) return undefined;
    const lastWindow = availabilityWindows[availabilityWindows.length - 1];
    return new Date(lastWindow.end).toISOString().split('T')[0];
  }, [availabilityWindows, hasBusyPeriods]);

  // Credit wallet state
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);

  // Customer loyalty state (for deposit calculation)
  const [customerRentalCount, setCustomerRentalCount] = useState<number>(0);
  const [isLoyalCustomer, setIsLoyalCustomer] = useState<boolean>(false);
  // Coefficient breakdown toggle for the recap — same UX pattern as admin's
  // ReservationsTab "Mostra dettagli" link.
  const [coeffExpanded, setCoeffExpanded] = useState<boolean>(false);

  // Nexi payment state
  const [paymentError, setPaymentError] = useState<string | null>(null);
  // FIX 5: WhatsApp fallback URL — shown as button if popup is blocked
  const [whatsAppFallbackUrl, setWhatsAppFallbackUrl] = useState<string | null>(null);
  const openWhatsApp = (url: string) => {
    const win = window.open(url, '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      // Popup was blocked — store URL for fallback button
      setWhatsAppFallbackUrl(url);
    }
  };

  // Birthday discount code state
  const [discountCode, setDiscountCode] = useState<string>('');
  const [discountCodeError, setDiscountCodeError] = useState<string | null>(null);
  const [discountCodeValid, setDiscountCodeValid] = useState<boolean>(false);
  const [isValidatingCode, setIsValidatingCode] = useState<boolean>(false);
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    amount: number;
    type: 'rental' | 'car_wash' | 'fixed' | 'percentage';
    code_type?: 'birthday' | 'marketing' | 'codice_sconto' | 'gift_card';
  } | null>(null);

  // Camera
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isSubmittingRef = useRef(false);
  // FIX 6: Anti-race ref for availability checks — only the latest request updates state
  const availabilityRequestIdRef = useRef(0);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      if (step > 1) {
        setStep(step - 1);
        window.history.pushState(null, '', window.location.href);
      } else {
        onClose();
      }
    };

    // Push initial state to enable back button handling
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [step, onClose]);

  // Auto-set km package based on vehicle type — only if not pre-set from preventivo
  useEffect(() => {
    setFormData(prev => {
      // Don't override if already set from preventivo (e.g., 'unlimited' from saved quote)
      if (prev.kmPackageType === 'unlimited' || prev.kmPackageType === '50km') return prev;
      const vType = getVehicleType(item, categoryContext);
      if (vType === 'SUPERCAR') {
        return { ...prev, kmPackageType: 'none' };
      } else {
        const isUrban = isUrbanVehicle(item.name);
        return { ...prev, kmPackageType: isUrban ? 'unlimited' : 'none' };
      }
    });
  }, [item.name, categoryContext]);

  // Health ping (helps detect wrong FUNCTIONS_BASE early)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithTimeout(`${FUNCTIONS_BASE}/.netlify/functions/health`, { method: 'GET' });
        if (!res.ok) console.warn('Functions health not OK:', res.status, res.statusText);
        else console.log('Functions health: OK');
      } catch (e) {
        console.error('Functions not reachable at', FUNCTIONS_BASE, e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch availability windows for gap detection
  useEffect(() => {
    const fetchAvailabilityWindows = async () => {
      // Only fetch if we have vehicle IDs
      const vehicleIds = item.vehicleIds || (item.id ? [item.id.replace('car-', '')] : []);
      if (vehicleIds.length === 0) return;

      setIsLoadingWindows(true);
      try {
        const response = await fetchWithTimeout(`${FUNCTIONS_BASE}/.netlify/functions/getAvailabilityWindows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicleIds,
            vehiclePlates: (item as any).plates || [],
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
          })
        });

        if (response.ok) {
          const data = await response.json();

          // Filter out same-day availability windows that start after office hours
          const now = new Date();
          const filteredWindows = (data.freeWindows || []).filter(window => {
            const windowStart = new Date(window.start);

            // Check if window starts today
            const isToday = windowStart.toDateString() === now.toDateString();

            if (!isToday) {
              // Future dates are always valid
              return true;
            }

            // For same-day windows, check if start time is after office hours
            const hour = windowStart.getHours();
            const minute = windowStart.getMinutes();
            const timeInMinutes = hour * 60 + minute;

            // Office closing time: 19:00 (last pickup time)
            const officeClosingTime = 19 * 60; // 19:00

            // If same-day availability starts after office hours, exclude it
            // (it will show as next-day availability instead)
            if (timeInMinutes > officeClosingTime) {
              return false;
            }

            return true;
          });

          setAvailabilityWindows(filteredWindows);
          // Only show blue box if there are actual busy periods (not just "fully available")
          const busyIntervals = data.busyIntervals || [];
          setHasBusyPeriods(busyIntervals.length > 0);
          console.log('Fetched availability windows:', data);
          console.log('Filtered windows (excluded after-hours same-day):', filteredWindows);
          console.log('Has busy periods:', busyIntervals.length > 0);
        } else {
          console.error('Failed to fetch availability windows:', response.status);
        }
      } catch (error) {
        console.error('Error fetching availability windows:', error);
      } finally {
        setIsLoadingWindows(false);
      }
    };

    fetchAvailabilityWindows();
  }, [item.id, item.vehicleIds]);

  // Fetch dynamic pricing from revenue_config when dates change
  useEffect(() => {
    const fetchDynamicPrice = async () => {
      if (!formData.pickupDate || !formData.returnDate) return;

      // Get the vehicle ID to query (use selectedVehicleId, or first of vehicleIds, or derive from item.id)
      const vehicleId = formData.selectedVehicleId
        || (item.vehicleIds && item.vehicleIds[0])
        || item.id?.replace('car-', '');

      if (!vehicleId) return;

      const pickupISO = `${formData.pickupDate}T${formData.pickupTime || '10:00'}`;
      const dropoffISO = `${formData.returnDate}T${formData.returnTime || '10:00'}`;

      try {
        const res = await fetchWithTimeout('/.netlify/functions/calculate-dynamic-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicle_id: vehicleId,
            pickup_date: pickupISO,
            dropoff_date: dropoffISO,
          }),
        }, 8000);

        if (res.ok) {
          const data = await res.json();
          setDynamicPricing(data);
        } else {
          setDynamicPricing(null);
        }
      } catch (err) {
        console.warn('Dynamic pricing fetch failed, using fallback:', err);
        setDynamicPricing(null);
      }
    };

    const timeoutId = setTimeout(fetchDynamicPrice, 300);
    return () => clearTimeout(timeoutId);
  }, [formData.pickupDate, formData.returnDate, formData.pickupTime, formData.returnTime, formData.selectedVehicleId, item.id, item.vehicleIds]);

  // Calculate delivery distance when address changes
  useEffect(() => {
    const isDeliveryPickup = formData.pickupLocation === 'home_delivery';
    const isDeliveryReturn = formData.returnLocation === 'home_delivery';

    if (!isDeliveryPickup && !isDeliveryReturn) {
      setDeliveryInfo(null);
      setDeliveryError(null);
      return;
    }

    const address = formData.deliveryAddress?.trim();
    if (!address || address.length < 5) {
      setDeliveryInfo(null);
      return;
    }

    setIsCalculatingDelivery(true);
    setDeliveryError(null);

    const timeoutId = setTimeout(async () => {
      try {
        // 2026-05-29: passa la category del veicolo cosi' la fn legge
        // delivery.by_category[<category>] (prezzo €/km dedicato per
        // questa categoria). Fallback al flat se non configurato.
        const itemCategory = String((item as { category?: string }).category || '').toLowerCase().trim() || undefined
        const res = await fetchWithTimeout('/.netlify/functions/calculate-delivery-distance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, category: itemCategory }),
        }, 10000);

        if (res.ok) {
          const data = await res.json();
          // If only one direction is delivery, halve the round-trip (one-way delivery)
          const bothDirections = isDeliveryPickup && isDeliveryReturn;
          const adjustedFee = bothDirections ? data.deliveryFee : Math.ceil(data.deliveryFee / 2);
          const adjustedKm = bothDirections ? data.roundTripKm : data.distanceKm;
          setDeliveryInfo({
            ...data,
            roundTripKm: adjustedKm,
            deliveryFee: adjustedFee,
          });
          setDeliveryError(null);
        } else {
          const err = await res.json();
          setDeliveryError(err.error || 'Errore nel calcolo della distanza');
          setDeliveryInfo(null);
        }
      } catch (err) {
        console.warn('Delivery distance calculation failed:', err);
        setDeliveryError('Impossibile calcolare la distanza. Riprova.');
        setDeliveryInfo(null);
      } finally {
        setIsCalculatingDelivery(false);
      }
    }, 800); // Debounce 800ms for address typing

    return () => clearTimeout(timeoutId);
  }, [formData.deliveryAddress, formData.pickupLocation, formData.returnLocation]);

  // Fetch credit balance with safe fallback
  useEffect(() => {
    const fetchBalance = async () => {
      if (user?.id) {
        setIsLoadingBalance(true);
        try {
          const balance = await getUserCreditBalance(user.id);
          setCreditBalance(balance);
        } catch (error) {
          // Enhanced error logging with full diagnostics
          const ua = navigator.userAgent;
          const isChrome = /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor);
          const isSafari = /Safari/.test(ua) && /Apple Computer/.test(navigator.vendor);

          console.error('Error fetching credit balance (detailed diagnostics):', {
            // Request info
            requestUrl: '[credit balance endpoint]',
            userId: user.id,

            // Error details
            errorMessage: (error as Error).message,
            errorName: (error as Error).name,
            errorStack: (error as Error).stack,

            // Network info
            networkOnline: navigator.onLine,

            // Browser info
            browser: isChrome ? 'Chrome' : isSafari ? 'Safari' : 'Other',
            userAgent: ua,

            // Timestamp
            timestamp: new Date().toISOString(),

            // Error type indicators
            possibleHTTP2Error: (error as Error).message?.includes('HTTP2') || (error as Error).message?.includes('ERR_'),
          });
          // Safe default: set balance to 0 if fetch fails
          setCreditBalance(0);
        } finally {
          setIsLoadingBalance(false);
        }
      }
    };

    fetchBalance();
  }, [user]);

  // Fetch customer rental count for loyalty determination
  useEffect(() => {
    const fetchRentalCount = async () => {
      const email = user?.email || formData.email;
      if (!email) {
        return;
      }

      try {
        // Count completed car rentals for loyalty deposit waiver
        const { count, error } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('customer_email', email)
          .eq('status', 'completed')
          .eq('vehicle_type', 'car');

        if (!error && count !== null) {
          setCustomerRentalCount(count);
          setIsLoyalCustomer(count >= LOYAL_CUSTOMER_THRESHOLD);
        }

        // Also check admin-set status from customers_extended
        if (user?.id) {
          const { data: custExt } = await supabase
            .from('customers_extended')
            .select('status')
            .eq('user_id', user.id)
            .maybeSingle();
          if (custExt?.status === 'elite' || custExt?.status === 'member') {
            setIsLoyalCustomer(true);
          }
        }
      } catch (error) {
        console.error('Error fetching rental count:', error);
        setCustomerRentalCount(0);
        setIsLoyalCustomer(false);
      }
    };

    fetchRentalCount();
  }, [user?.email, formData.email]);

  // Usage zone validation removed - pricing is now based on usage zone selection only
  // Users can freely select CAGLIARI_SUD (resident pricing) or FUORI_ZONA (non-resident pricing)



  // Helper function to get day of week without timezone issues

  // Initialize dates from first availability window
  // DISABLED - was auto-resetting dates, confusing users
  /*
  useEffect(() => {
    if (availabilityWindows.length > 0) {
      const firstWindow = availabilityWindows[0];
      const start = new Date(firstWindow.start);
      const end = new Date(Math.min(
        new Date(firstWindow.end).getTime(),
        start.getTime() + 24 * 60 * 60 * 1000 // Default to +1 day
      ));

      // Only set if not already set or if current dates are invalid
      if (!formData.pickupDate || formData.pickupDate < start.toISOString().split('T')[0]) {
        setFormData(prev => ({
          ...prev,
          pickupDate: start.toISOString().split('T')[0],
          pickupTime: start.toTimeString().slice(0, 5),
          returnDate: end.toISOString().split('T')[0],
          returnTime: end.toTimeString().slice(0, 5)
        }));
      }
    }
  }, [availabilityWindows]);
  */

  // Validate return date is after pickup date
  // DISABLED - was auto-adjusting, confusing users
  /*
  useEffect(() => {
    if (formData.pickupDate && formData.returnDate && formData.pickupTime && formData.returnTime) {
      const pickup = new Date(`${formData.pickupDate}T${formData.pickupTime}`);
      const returnDt = new Date(`${formData.returnDate}T${formData.returnTime}`);

      if (returnDt <= pickup) {
        // Auto-fix: set return to pickup + 1 day
        const nextDay = new Date(pickup);
        nextDay.setDate(nextDay.getDate() + 1);
        setFormData(prev => ({
          ...prev,
          returnDate: nextDay.toISOString().split('T')[0],
          returnTime: formData.pickupTime
        }));
      }
    }
  }, [formData.pickupDate, formData.pickupTime, formData.returnDate, formData.returnTime]);
  */

  // Validate dates are within availability windows
  // DISABLED - was auto-adjusting dates, confusing users
  /*
  useEffect(() => {
    if (availabilityWindows.length === 0) return;
    if (!formData.pickupDate || !formData.returnDate) return;

    const pickup = new Date(`${formData.pickupDate}T${formData.pickupTime || '10:00'}`);
    const returnDt = new Date(`${formData.returnDate}T${formData.returnTime || '10:00'}`);

    // Find window that contains pickup
    const window = availabilityWindows.find(w => {
      const start = new Date(w.start);
      const end = new Date(w.end);
      return pickup >= start && pickup <= end;
    });

    if (!window) {
      // Pickup is outside all windows - auto-adjust to first window
      const firstWindow = availabilityWindows[0];
      const windowStart = new Date(firstWindow.start);
      setFormData(prev => ({
        ...prev,
        pickupDate: windowStart.toISOString().split('T')[0],
        pickupTime: windowStart.toTimeString().slice(0, 5)
      }));
      return;
    }

    // Check if return is in same window
    const windowEnd = new Date(window.end);
    if (returnDt > windowEnd) {
      // Return exceeds window - cap it at window end
      setFormData(prev => ({
        ...prev,
        returnDate: windowEnd.toISOString().split('T')[0],
        returnTime: windowEnd.toTimeString().slice(0, 5)
      }));
    }
  }, [formData.pickupDate, formData.pickupTime, formData.returnDate, formData.returnTime, availabilityWindows]);
  */

  const getDayOfWeek = (dateString: string): number => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getDay();
  };

  // === Horaires de retrait admissibles (pas de dimanche) ===

  // === HOLIDAY LOGIC ===
  const ITALIAN_HOLIDAYS = [
    '01-01', '06-01', '25-04', '01-05', '02-06', '15-08', '01-11', '08-12', '25-12', '26-12', // Fixed
    '2024-03-31', '2024-04-01', // Easter 2024
    '2025-04-20', '2025-04-21', // Easter 2025
    '2026-04-05', '2026-04-06', // Easter 2026
    '2026-01-02', '2026-01-03', // Office Closed for New Year 2026
  ];

  const isHoliday = (dateString: string): boolean => {
    if (!dateString) return false;
    const [year, month, day] = dateString.split('-');
    const formattedDate = `${day}-${month}`;
    const fullDate = dateString; // YYYY-MM-DD
    return ITALIAN_HOLIDAYS.includes(formattedDate) || ITALIAN_HOLIDAYS.includes(fullDate);
  };

  const getValidPickupTimes = (date: string): string[] => {
    if (isHoliday(date)) return []; // Block Holidays
    // Office-hour windows + slot granularity come from Centralina Pro
    // (Orari Noleggio); helper closes Sundays via config (default Dom CHIUSO).
    const times: string[] = getPickupTimesForDateString(date);
    if (times.length === 0) return [];

    const selectedDate = safeDate(date);
    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();

    let filteredTimes = times;
    if (isToday) {
      const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
      const minTimeInMinutes = currentTimeInMinutes + 60; // 1 hour buffer
      filteredTimes = times.filter(time => {
        const [hours, minutes] = time.split(':').map(Number);
        return (hours * 60 + minutes) >= minTimeInMinutes;
      });
    }

    return filteredTimes;
  };

  const getValidReturnTimes = (date: string): string[] => {
    if (isHoliday(date)) return []; // Block Holidays
    // Office-hour windows + slot granularity come from Centralina Pro
    // (Orari Noleggio); helper closes Sundays via config (default Dom CHIUSO).
    const times: string[] = getReturnTimesForDateString(date);
    if (times.length === 0) return [];

    // Filter out past times if today
    const selectedDate = safeDate(date);
    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();

    let filteredTimes = times;
    if (isToday) {
      const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
      filteredTimes = times.filter(time => {
        const [hours, minutes] = time.split(':').map(Number);
        return (hours * 60 + minutes) >= currentTimeInMinutes;
      });
    }

    // If no pickup date/time set, return empty array
    // User must select pickup before selecting return
    if (!formData.pickupDate || !formData.pickupTime) {
      return [];
    }

    // Server-side conflict check (checkVehicleAvailability) handles real conflicts
    // Allow all valid return times based on office hours
    const pickup = new Date(`${formData.pickupDate}T${formData.pickupTime}`);

    // 1 rental day = 22h30 → return time capped at pickupTime - 1h30
    // EXCEPTION: Saturday returns (Friday pickup) — Saturday has limited hours,
    // so allow all available Saturday return times even if < 22h30
    const returnDayOfWeek = getDayOfWeek(date);
    const isSaturdayReturn = returnDayOfWeek === 6;

    const [pickupH, pickupM] = formData.pickupTime.split(':').map(Number);
    const maxReturnMinutes = (pickupH * 60 + pickupM) - 90; // pickup time - 1h30

    // Check if this is a single-day rental (return = pickup + 1 day)
    const pickupDateObj = new Date(formData.pickupDate);
    const returnDateObj = new Date(date);
    pickupDateObj.setHours(0, 0, 0, 0);
    returnDateObj.setHours(0, 0, 0, 0);
    const daysDiff = Math.round((returnDateObj.getTime() - pickupDateObj.getTime()) / (1000 * 60 * 60 * 24));
    const isMinimumRental = daysDiff <= 1;

    return filteredTimes.filter(time => {
      const [hours, minutes] = time.split(':').map(Number);
      const returnDt = new Date(date);
      returnDt.setHours(hours, minutes, 0, 0);
      const timeInMinutes = hours * 60 + minutes;

      // Must be after pickup datetime
      if (returnDt <= pickup) return false;

      // Saturday return: allow all office-hour times (no 22h30 restriction)
      if (isSaturdayReturn) return true;

      // Only apply the 22h30 cap (pickupTime - 1h30) for minimum 1-day rentals
      // For multi-day rentals, allow any valid office-hour return time
      if (isMinimumRental) {
        return maxReturnMinutes < 0 || timeInMinutes <= maxReturnMinutes;
      }

      return true;
    });
  };

  const [hasStoredDocs, setHasStoredDocs] = useState<{ licensePath: string | null; idPath: string | null }>({ licensePath: null, idPath: null });
  const [checkingDocs, setCheckingDocs] = useState(false);

  // Check for existing documents in storage
  useEffect(() => {
    const checkDocs = async () => {
      if (!user?.id) return;
      setCheckingDocs(true);
      try {
        // Check License bucket: driver-licenses
        // List files in the user folder
        const { data: licenseFiles } = await supabase.storage.from('driver-licenses').list(user.id);
        const validLicense = licenseFiles && licenseFiles.length > 0 ? licenseFiles.find(f => f.name !== '.emptyFolderPlaceholder') : null;
        const licensePath = validLicense ? `${user.id}/${validLicense.name}` : null;

        // Check ID bucket: carta-identita
        const { data: idFiles } = await supabase.storage.from('carta-identita').list(user.id);
        const validId = idFiles && idFiles.length > 0 ? idFiles.find(f => f.name !== '.emptyFolderPlaceholder') : null;
        const idPath = validId ? `${user.id}/${validId.name}` : null;

        setHasStoredDocs({ licensePath, idPath });
        console.log('Document check:', { licensePath, idPath });
      } catch (err) {
        console.error('Error checking documents:', err);
      } finally {
        setCheckingDocs(false);
      }
    };

    checkDocs();
  }, [user?.id]);

  // AUTOFILL USER DATA FROM PROFILE with safe fallback
  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.id) return;

      try {
        // Fetch customer data via Netlify Function (with auth token)
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const fetchHeaders: Record<string, string> = {};
        if (authSession?.access_token) {
          fetchHeaders['Authorization'] = `Bearer ${authSession.access_token}`;
        }
        const response = await fetch(`/.netlify/functions/getResidencyZone?user_id=${user.id}`, { headers: fetchHeaders });
        const customerData = response.ok ? await response.json() : null;
        const error = !response.ok ? new Error(`HTTP ${response.status}`) : null;

        if (error || !customerData) {
          if (error) {
            // Enhanced error logging with full diagnostics
            const ua = navigator.userAgent;
            const isChrome = /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor);
            const isSafari = /Safari/.test(ua) && /Apple Computer/.test(navigator.vendor);

            console.warn('Unable to fetch customer data from customers_extended (detailed diagnostics):', {
              // Request info
              requestUrl: '[customers_extended endpoint]',
              userId: user.id,

              // Error details
              errorMessage: error.message,
              errorName: error.name,
              errorCode: error.code,
              errorDetails: error.details,
              errorHint: error.hint,
              errorStack: error.stack,

              // Network info
              networkOnline: navigator.onLine,

              // Browser info
              browser: isChrome ? 'Chrome' : isSafari ? 'Safari' : 'Other',
              userAgent: ua,

              // Timestamp
              timestamp: new Date().toISOString(),

              // Error type indicators
              possibleHTTP2Error: error.message?.includes('HTTP2') || error.message?.includes('ERR_'),
              possibleCORS: error.message?.includes('CORS') || error.message?.includes('blocked'),
            });
          }
          // If no extended profile, at least try to fill basic info from Auth Context if available
          const realName1 = isRealName(user.fullName);
          setFormData(prev => ({
            ...prev,
            firstName: prev.firstName || (realName1 ? realName1.split(' ')[0] : ''),
            lastName: prev.lastName || (realName1 ? realName1.split(' ').slice(1).join(' ') : ''),
            email: prev.email || user.email || '',
            phone: prev.phone || user.phone || ''
          }));
          return;
        }

        // Autofill form with extended data
        const realName2 = isRealName(user.fullName);
        setFormData(prev => ({
          ...prev,
          firstName: customerData.nome || prev.firstName || (realName2 ? realName2.split(' ')[0] : ''),
          lastName: customerData.cognome || prev.lastName || (realName2 ? realName2.split(' ').slice(1).join(' ') : ''),
          email: customerData.email || prev.email || user.email || '',
          phone: customerData.telefono || prev.phone || user.phone || '',
          birthDate: customerData.data_nascita || prev.birthDate,
          codiceFiscale: customerData.codice_fiscale || prev.codiceFiscale,
          residenza: customerData.indirizzo || prev.residenza,
          // License fields from metadata
          licenseNumber: customerData.metadata?.numero_patente || prev.licenseNumber,
          licenseIssueDate: customerData.metadata?.patente_data_rilascio || prev.licenseIssueDate,
        }));

        // Cattura la provincia di residenza dal profilo per determinare la
        // cauzione residente/non-residente (residente solo se CA o SU).
        setCustomerProvinciaResidenza(
          String(customerData.provincia_residenza || customerData.provincia || '').toUpperCase().trim()
        );

        console.log('Autofilled form with user profile data');

      } catch (err) {
        // Enhanced error logging with full diagnostics
        const ua = navigator.userAgent;
        const isChrome = /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor);
        const isSafari = /Safari/.test(ua) && /Apple Computer/.test(navigator.vendor);

        console.error('Error autofilling user data (detailed diagnostics):', {
          // Request info
          requestUrl: '[customers_extended endpoint]',
          userId: user.id,

          // Error details
          errorMessage: (err as Error).message,
          errorName: (err as Error).name,
          errorStack: (err as Error).stack,

          // Network info
          networkOnline: navigator.onLine,

          // Browser info
          browser: isChrome ? 'Chrome' : isSafari ? 'Safari' : 'Other',
          userAgent: ua,

          // Timestamp
          timestamp: new Date().toISOString(),

          // Error type indicators
          possibleHTTP2Error: (err as Error).message?.includes('HTTP2') || (err as Error).message?.includes('ERR_'),
        });
        // Continue with basic auth data even if extended profile fails
        const realName3 = isRealName(user.fullName);
        setFormData(prev => ({
          ...prev,
          firstName: prev.firstName || (realName3 ? realName3.split(' ')[0] : ''),
          lastName: prev.lastName || (realName3 ? realName3.split(' ').slice(1).join(' ') : ''),
          email: prev.email || user.email || '',
          phone: prev.phone || user.phone || ''
        }));
      }
    };

    fetchUserData();
  }, [user?.id, user?.email, user?.fullName, user?.phone]);


  // Nexi initialization not needed here

  // Camera stream binding
  useEffect(() => {
    if (isCameraOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [isCameraOpen, cameraStream]);

  // Return time auto-calculation: default to pickupTime - 1h30 (22h30 = 1 day)
  // Snaps to nearest valid return slot if calculated time is outside valid slots
  useEffect(() => {
    if (formData.pickupTime && formData.pickupDate && formData.returnDate) {
      // Calculate ideal return time: pickup - 1h30
      const [hours, minutes] = formData.pickupTime.split(':').map(Number);
      const tempDate = new Date(2000, 0, 1, hours, minutes);
      tempDate.setHours(tempDate.getHours() - 1);
      tempDate.setMinutes(tempDate.getMinutes() - 30);
      const idealReturn = `${String(tempDate.getHours()).padStart(2, '0')}:${String(tempDate.getMinutes()).padStart(2, '0')}`;

      // Get valid return times for the return date
      const validTimes = getValidReturnTimes(formData.returnDate);
      if (validTimes.length === 0) {
        // No valid times available — clear the return time
        setFormData(prev => ({ ...prev, returnTime: '' }));
        return;
      }

      // If ideal time is in valid slots, use it
      if (validTimes.includes(idealReturn)) {
        setFormData(prev => ({ ...prev, returnTime: idealReturn }));
      } else {
        // Snap to nearest valid slot that's <= ideal time, or first available
        const idealMinutes = tempDate.getHours() * 60 + tempDate.getMinutes();
        const closest = validTimes.reduce((best, time) => {
          const [h, m] = time.split(':').map(Number);
          const tMin = h * 60 + m;
          const [bh, bm] = best.split(':').map(Number);
          const bMin = bh * 60 + bm;
          // Prefer times <= ideal, closest to ideal
          if (tMin <= idealMinutes && (bMin > idealMinutes || tMin > bMin)) return time;
          if (bMin > idealMinutes && tMin < bMin) return time;
          return best;
        }, validTimes[0]);
        setFormData(prev => ({ ...prev, returnTime: closest }));
      }
    }
  }, [formData.pickupTime, formData.pickupDate, formData.returnDate, availabilityWindows]);

  // Classify driver tier when age/license changes
  useEffect(() => {
    if (formData.birthDate && formData.licenseIssueDate) {
      const age = calculateAgeFromDDMMYYYY(formData.birthDate);
      const years = calculateYearsSince(formData.licenseIssueDate);
      if (age > 0 && years >= 0) {
        const classification = classifyDriverTier(age, years);
        setDriverTierInfo(classification);
        // Reset insurance and tier-restricted options when tier changes
        setFormData(prev => ({
          ...prev,
          insuranceOption: 'KASKO_BASE',
          depositOption: '',
          // DR7 Flex available for both Fascia A and Fascia B (admin
          // confirmed the option must be visible for TIER_1 too).
        }));
      }
    }
  }, [formData.birthDate, formData.licenseIssueDate]);

  // Check vehicle availability when dates change
  useEffect(() => {
    const checkAvailability = async () => {
      // 2026-05-17 BUG FIX: prima saltavamo la check quando isFromSearch=true
      // assumendo che la homepage avesse gia' verificato. MA: la homepage
      // poteva avere dati stale (admin crea booking fra la search e il
      // click "Prenota Ora") e SOPRATTUTTO la homepage non sempre catch
      // bookings admin (vehicle_id null / plate diverso). Risultato:
      // wizard mostrava Step 1 vuoto, cliente cliccava Continua, finiva
      // a Step 4 e poteva prenotare auto gia' occupata. Ora ricontrolliamo
      // SEMPRE qui — failed-CLOSED garantito.
      // FIX 6: Anti-race — each invocation gets a unique ID; only the latest updates state
      const requestId = ++availabilityRequestIdRef.current;
      const isStale = () => requestId !== availabilityRequestIdRef.current;
      if (!item || !formData.pickupDate || !formData.returnDate || !formData.pickupTime || !formData.returnTime) {
        setAvailabilityError(null);
        setPartialUnavailabilityWarning(null);
        setShortSlotWarning(null);
        return;
      }

      setIsCheckingAvailability(true);
      setAvailabilityError(null);
      setPartialUnavailabilityWarning(null);
      setShortSlotWarning(null);

      try {
        const pickupDateTime = createItalyDateTime(formData.pickupDate, formData.pickupTime).toISOString();
        const dropoffDateTime = createItalyDateTime(formData.returnDate, formData.returnTime).toISOString();

        // Check if this is a grouped vehicle (multiple vehicles displayed as one)
        const isGroupedVehicle = item.displayNames && item.displayNames.length > 1;
        let conflicts: any[] = [];
        let availableVehicle: string | undefined;

        if (isGroupedVehicle) {
          // Construct array of vehicle objects {name, id} from the item's stored IDs and displayNames
          // We assume item.vehicleIds and item.displayNames are aligned by index
          const vehicleObjects = (item.vehicleIds || []).map((id: string, index: number) => ({
            id,
            name: item.displayNames?.[index] || item.name, // fallback to main name if specific name missing
            plate: (item as any).plates?.[index] || undefined // targa for precise matching
          }));

          // Check availability for all vehicles in the group
          const groupResult = await checkGroupedVehicleAvailability(
            vehicleObjects,
            pickupDateTime,
            dropoffDateTime
          );

          if (groupResult.isAvailable) {
            // Store the available vehicle name AND ID for booking creation
            availableVehicle = groupResult.availableVehicleName;
            setAvailableVehicleName(availableVehicle || null);
            // We also need to store the available vehicle ID to use in the booking!
            // We'll store it in a state or ref.
            // Since availableVehicleName is used in the hook, let's update how we store "availableVehicle"
            // For now, we'll just ensure we can access it later during handleBooking
            // We can store it in a hidden form field or state
            if (groupResult.availableVehicleId) {
              setFormData(prev => ({ ...prev, selectedVehicleId: groupResult.availableVehicleId }));
            }
            conflicts = [];
          } else {
            conflicts = groupResult.conflicts || [];
          }
        } else {
          // Regular single vehicle check
          // Extract ID from item.id (format "car-UUID")
          const specificId = item.id.replace('car-', '');
          conflicts = await checkVehicleAvailability(item.name, pickupDateTime, dropoffDateTime, specificId);
          setAvailableVehicleName(null);
          setFormData(prev => ({ ...prev, selectedVehicleId: specificId }));
        }


        // FIX 6: Ignore stale responses
        if (isStale()) return;

        if (conflicts.length > 0) {
          const conflictEnd = new Date(conflicts[0].dropoff_date);
          const availableFromStr = conflicts[0]._availableFrom;

          if (availableFromStr) {
            // Same-day return — auto-adjust pickup time and show info
            const availFrom = new Date(availableFromStr);
            const availTimeFormatted = availFrom.toLocaleTimeString('it-IT', {
              hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Rome'
            });
            // Round up to next 30-min slot
            const [ah, am] = availTimeFormatted.split(':').map(Number);
            const rMin = am <= 0 ? '00' : am <= 30 ? '30' : '00';
            const rHour = am > 30 ? ah + 1 : ah;
            const adjustedTime = `${String(rHour).padStart(2, '0')}:${rMin}`;

            // Auto-set pickup time
            setFormData(prev => ({ ...prev, pickupTime: adjustedTime }));
            setAvailabilityError(null);
            setPartialUnavailabilityWarning(
              `Questo veicolo sarà disponibile dalle ${adjustedTime}. L'orario di ritiro è stato aggiornato automaticamente.`
            );
          } else {
            const conflictEndFormatted = conflictEnd.toLocaleDateString('it-IT', {
              day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome'
            });
            const conflictTimeFormatted = conflictEnd.toLocaleTimeString('it-IT', {
              hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'
            });
            setAvailabilityError(
              `Veicolo non disponibile per le date selezionate. Già prenotato fino al ${conflictEndFormatted} alle ${conflictTimeFormatted}.`
            );
            setIsCheckingAvailability(false);
            return;
          }
        }

        // Check for partial-day unavailability (e.g., at mechanic)
        const vehicleNameToCheck = availableVehicle || item.name;
        const partialInfo = await checkVehiclePartialUnavailability(
          vehicleNameToCheck,
          formData.pickupDate,
          formData.pickupTime
        );

        if (partialInfo.isPartiallyUnavailable && partialInfo.availableAfter) {
          setPartialUnavailabilityWarning(
            `Attenzione: questo veicolo sara disponibile dopo le ${partialInfo.availableAfter}.`
          );
        }

        // Check for next booking — "must return by" message
        const nextStart = (conflicts as any)?._nextBookingStart;
        if (nextStart && !partialUnavailabilityWarning) {
          const mustReturnBy = new Date(nextStart);
          const mustReturnDate = mustReturnBy.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' });
          const mustReturnTime = mustReturnBy.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
          // Only show if the next booking is within 3 days of requested return
          const daysDiff = (mustReturnBy.getTime() - new Date(dropoffDateTime).getTime()) / (1000 * 60 * 60 * 24);
          if (daysDiff < 3) {
            setPartialUnavailabilityWarning(
              `Questo veicolo ha una prenotazione successiva. Riconsegna entro il ${mustReturnDate} alle ${mustReturnTime} o prima.`
            );
          }
        }

      } catch (error) {
        console.error('Error checking availability:', error);
        // Don't block the user if there's an error checking availability
      } finally {
        setIsCheckingAvailability(false);
      }
    };

    // Debounce the availability check
    const timeoutId = setTimeout(checkAvailability, 500);
    return () => clearTimeout(timeoutId);
  }, [item, formData.pickupDate, formData.returnDate, formData.pickupTime, formData.returnTime]);

  // === Calculs tarifaires / durée / km inclus ===
  const {
    duration, rentalCost, insuranceCost, extrasCost, kmPackageCost, pickupFee, dropoffFee, subtotal, taxes, total, includedKm,
    driverAge, licenseYears, youngDriverFee, recentLicenseFee, secondDriverFee, recommendedKm,
    membershipDiscount, membershipTier, originalTotal, finalTotal,
    carWashFee, noDepositSurcharge,
    effectivePricePerDay,
    lavaggioFee, experienceCost, flexCost, supercarDepositSurcharge, deliveryFee,
    extraDayApplied,
    listSubtotal, hasDynamicDiscount, dynamicDiscountPct,
    uncappedSubtotal, clampHit, clampLimitDaily, clampLimitTotal
  } = useMemo(() => {
    const zero = {
      duration: { days: 0, hours: 0 }, rentalCost: 0, insuranceCost: 0, extrasCost: 0, kmPackageCost: 0, pickupFee: 0, dropoffFee: 0, subtotal: 0, taxes: 0, total: 0, includedKm: 0, driverAge: 0, licenseYears: 0, youngDriverFee: 0, recentLicenseFee: 0, secondDriverFee: 0, recommendedKm: null, membershipDiscount: 0, membershipTier: null, originalTotal: 0, finalTotal: 0,
      carWashFee: 0, noDepositSurcharge: 0,
      effectivePricePerDay: 0,
      lavaggioFee: 0, experienceCost: 0, flexCost: 0, supercarDepositSurcharge: 0, deliveryFee: 0,
      extraDayApplied: false,
      listSubtotal: 0, hasDynamicDiscount: false, dynamicDiscountPct: 0,
      uncappedSubtotal: 0, clampHit: null as 'min' | 'max' | null, clampLimitDaily: null as number | null, clampLimitTotal: null as number | null
    };
    if (!item) return zero;

    const pricePerDay = item.pricePerDay?.[currency] || 0;

    let billingDays = 0;
    let days = 0;
    let hours = 0;
    let extraDay = false;
    if (formData.pickupDate && formData.returnDate) {
      const pickup = safeDate(`${formData.pickupDate}T${formData.pickupTime || '10:30'}`);
      const ret = safeDate(`${formData.returnDate}T${formData.returnTime || '09:00'}`);
      if (!isNaN(pickup.getTime()) && !isNaN(ret.getTime()) && pickup < ret) {
        // Updated Logic: User requested "Dal 6 al 8 sono 2 giorni... even if it is 22:30"
        // This implies strict calendar day difference: (Return Date - Pickup Date) in days.
        // We calculate this by normalizing both to midnight or simply taking the difference in days.

        const diffTime = Math.abs(ret.getTime() - pickup.getTime());
        const standardHours = diffTime / (1000 * 60 * 60);

        // Calendar Day Logic (Midnight to Midnight)
        const pDate = new Date(pickup); pDate.setHours(0, 0, 0, 0);
        const rDate = new Date(ret); rDate.setHours(0, 0, 0, 0);
        const diffDaysCalendar = Math.round((rDate.getTime() - pDate.getTime()) / (1000 * 60 * 60 * 24));

        // Unified Duration & Billing Logic
        // Ensures that if price is for 4 days, display says "4 days"
        billingDays = Math.max(1, diffDaysCalendar);

        // BUSINESS RULE — late-return grace before pickup time:
        // l'auto deve rientrare almeno X minuti prima dell'orario di ritiro
        // sul giorno di riconsegna; altrimenti +1 giorno di addebito.
        // X e' configurabile in admin > Centralina Pro > Automazioni > Grace
        // ritardo riconsegna (default 90 = 1h30).
        const pickupMinutes = pickup.getHours() * 60 + pickup.getMinutes();
        const returnMinutes = ret.getHours() * 60 + ret.getMinutes();
        const graceThreshold = pickupMinutes - getLateReturnGraceMinutes();
        if (diffDaysCalendar > 0 && returnMinutes > graceThreshold) {
          billingDays += 1;
          extraDay = true;
        }

        days = billingDays;
        hours = Math.floor(standardHours % 24);

        if (billingDays < 1) billingDays = 1;
      }
    }


    const billingDaysCalc = billingDays < 1 ? 1 : billingDays;

    // --- RENTAL COST ---
    let calculatedRentalCost = billingDays * pricePerDay;

    // 2026-05-17: il sito applica il base price dinamico ogniqualvolta il
    // revenue engine e' enabled (no piu' requirement su mode='auto_apply').
    // Mode 'suggestion' era pensato per dare al PREVENTIVI ADMIN una vista
    // suggerita senza auto-applicare, ma sul sito coefficienti vanno sempre
    // applicati altrimenti i prezzi mostrati al cliente sono fuori sync con
    // la Centralina Pro.
    if (dynamicPricing?.enabled && dynamicPricing.selectedBaseRateEur) {
      // Dynamic pricing: use base rate here, coefficient applied to FULL TOTAL later
      calculatedRentalCost = dynamicPricing.selectedBaseRateEur * billingDaysCalc;
    } else {
      // Centralina Pro per-vehicle override wins over category multi-day table
      const rawVehicleId = (item as any).vehicleIds?.[0] || (item.id ? String(item.id).replace('car-', '') : '');
      const perVehiclePrices = (proSnapshot as any)?.prezzoDinamico?.dynamic?.base_prices || {};
      const rawOverride = perVehiclePrices[rawVehicleId];
      const overridePrice = typeof rawOverride === 'number' ? rawOverride
        : typeof rawOverride === 'string' ? parseFloat(rawOverride) : NaN;
      if (!isNaN(overridePrice) && overridePrice > 0) {
        calculatedRentalCost = billingDaysCalc * overridePrice;
      } else {
        const vType = getVehicleType(item, categoryContext);
        calculatedRentalCost = calculateMultiDayPrice(vType, billingDaysCalc, pricePerDay, undefined, ACTIVE_RENTAL_DAY_RATES);
      }
    }


    // --- INSURANCE COST (tier-conditional) ---
    const vType = getVehicleType(item, categoryContext);
    const activeTierForCalc: 'TIER_1' | 'TIER_2' = (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2';
    const tierPricingForCalc = ACTIVE_TIER_PRICING[activeTierForCalc];

    // Find selected insurance option from Centralina (category-specific)
    const allInsuranceOpts = getInsuranceForVehicle(vType, activeTierForCalc);
    const selectedInsOpt = allInsuranceOpts.find(o => o.id === formData.insuranceOption);
    const insuranceDailyPrice = selectedInsOpt?.dailyPrice || 0;
    let calculatedInsuranceCost = roundToTwoDecimals(insuranceDailyPrice * billingDaysCalc);

    // Extras list (formData.extras) only carries DR7 Club subscription ids today,
    // which are billed separately. No per-day extras to sum here.
    const calculatedExtrasCost = 0;

    const calculatedDriverAge = calculateAgeFromDDMMYYYY(formData.birthDate);
    const calculatedLicenseYears = calculateYearsSince(formData.licenseIssueDate);

    // --- SECOND DRIVER FEE (tier-conditional) ---
    // 2026-05-23: modalita' admin-editabile da Centralina Pro > Servizi.
    // 'flat' (default) = una tantum, 'per_day' = × giorni di noleggio.
    // Fix 2026-05-25: il nome reale dello snapshot Centralina Pro in
    // questo componente e' `proSnapshot` (vedi useCentralinaProOverlay
    // a riga ~563), non `rentalConfig`. La typo causava ReferenceError
    // dentro la useMemo del riepilogo prezzo, bloccando l'apertura del
    // wizard di prenotazione su tutto il sito.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdMode = ((proSnapshot as any)?.servizi?.second_driver_billing as 'flat' | 'per_day' | undefined) || 'flat';
    const calculatedSecondDriverFee = formData.addSecondDriver
      ? (sdMode === 'flat'
          ? roundToTwoDecimals(tierPricingForCalc.secondDriverPerDay)
          : roundToTwoDecimals(tierPricingForCalc.secondDriverPerDay * billingDaysCalc))
      : 0;

    // Young driver / recent license fees removed (handled by tier pricing)
    const calculatedYoungDriverFee = 0;
    const calculatedRecentLicenseFee = 0;

    // --- LAVAGGIO (pulizia finale) — price from Centralina Pro (servizi.lavaggio.fee)
    const calculatedLavaggioFee = tierPricingForCalc.lavaggio;

    // --- KM PACKAGE ---
    let calculatedKmPackageCost = 0;
    let calculatedIncludedKm: number;
    if (formData.kmPackageType === 'unlimited') {
      calculatedIncludedKm = 9999;
      // PRIORITY: prezzo km illimitati per categoria raw (Hypercar Elite,
      // Suv Luxury, ecc.) da Centralina Pro. Cade su bucket legacy
      // (SUPERCAR/FURGONE/URBAN) solo se mancante.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawCat = String(((item as any).category ?? '')).toLowerCase().trim()
      const byCatPrice = (() => {
        const byCat = configOverlay?.unlimitedKmByCategory
        if (!rawCat || !byCat) return 0
        const aliases = (rawCat === 'supercars' || rawCat === 'supercar') ? ['supercars', 'exotic', 'supercar']
                      : rawCat === 'exotic' ? ['exotic', 'supercars', 'supercar']
                      : (rawCat === 'supercar' ? ['supercar', 'supercars', 'exotic'] : [rawCat])
        const tier = activeTierForCalc
        for (const k of aliases) {
          const v = byCat[k]?.[tier]
          if (typeof v === 'number' && v > 0) return v
        }
        return 0
      })()
      if (byCatPrice > 0) {
        calculatedKmPackageCost = roundToTwoDecimals(byCatPrice * billingDaysCalc);
      } else if (vType === 'SUPERCAR') {
        calculatedKmPackageCost = roundToTwoDecimals(tierPricingForCalc.unlimitedKmPerDay * billingDaysCalc);
      } else if (isUrbanVehicle(item.name)) {
        const urbanPrice = configOverlay?.kmPackagePrices?.unlimitedUrbanPerDay ?? 0;
        if (urbanPrice > 0) {
          calculatedKmPackageCost = roundToTwoDecimals(urbanPrice * billingDaysCalc);
        }
      } else if (vType === 'FURGONE' || vType === 'V_CLASS') {
        const aziendaliPrice = configOverlay?.kmPackagePrices?.unlimitedFurgonePerDay ?? 0;
        calculatedKmPackageCost = roundToTwoDecimals(aziendaliPrice * billingDaysCalc);
      } else {
        const aziendaliPrice = configOverlay?.kmPackagePrices?.unlimitedFurgonePerDay ?? 0;
        calculatedKmPackageCost = roundToTwoDecimals(aziendaliPrice * billingDaysCalc);
      }
    } else if (formData.kmPackages && Object.values(formData.kmPackages).some(q => (q || 0) > 0)) {
      // 2026-05-17: Pacchetti KM cumulativi via helper centralizzato
      // resolvePacchetti — risolve la categoria del veicolo con alias
      // supercars/exotic/supercar e fallback universale (cosi' Porsche
      // 911 & co. con categoria custom prendono comunque i pacchetti
      // configurati per la categoria principale).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawCat = String(((item as any).category ?? '')).toLowerCase().trim()
      const pkgs = resolvePacchetti(rawCat, configOverlay?.pacchettiByCategory)
      let pkgKmTotal = 0
      let pkgCostTotal = 0
      for (const pkg of pkgs) {
        const qty = formData.kmPackages?.[pkg.id] || 0
        if (qty <= 0) continue
        const cap = pkg.is_quantity_buyable ? Math.max(1, Number(pkg.max_quantity) || 2) : 1
        const q = Math.max(0, Math.min(cap, qty))
        pkgKmTotal += pkg.km * q
        pkgCostTotal += pkg.price * q
      }
      const kmTable = getKmIncludedForVehicle((item as any).category, vType);
      // 2026-05-22: se kmTable === null la categoria ha km_included.unlimited=true
      // → la base e' illimitata (9999), i pacchetti vengono solo aggiunti come pricing.
      calculatedIncludedKm = kmTable === null ? 9999 : calculateIncludedKm(billingDaysCalc, kmTable) + pkgKmTotal;
      calculatedKmPackageCost = roundToTwoDecimals(pkgCostTotal);
    } else {
      // Default "km inclusi": legge da Centralina Pro per categoria raw
      // (Hypercar / Suv Luxury / nuove categorie incluse). Cade su
      // bucket legacy (Aziendali / Supercars) e poi _global.
      const kmTable = getKmIncludedForVehicle((item as any).category, vType);
      // 2026-05-22: kmTable === null = categoria con km_included.unlimited=true
      // (urban). includedKm deve restare 9999 anche con kmPackageType='none'
      // altrimenti l'etichetta "Illimitati" sparisce al primo click.
      calculatedIncludedKm = kmTable === null ? 9999 : calculateIncludedKm(billingDaysCalc, kmTable);
    }

    const calculatedRecommendedKm = recommendKmPackage(formData.expectedKm, item.name, billingDays);
    // --- DELIVERY FEE (consegna a domicilio) — separate pickup + return ---
    const isDeliveryPickup = formData.pickupLocation === 'home_delivery';
    const isDeliveryReturn = formData.returnLocation === 'home_delivery';
    // Each direction = one-way fee (km × €/km). No ×2 — DR7 already travels for the rental.
    const pickupDeliveryFee = isDeliveryPickup && formData.deliveryPickupKm > 0
      ? roundToTwoDecimals(formData.deliveryPickupKm * ACTIVE_DELIVERY_PRICE_PER_KM) : 0;
    const returnDeliveryFee = isDeliveryReturn && formData.deliveryReturnKm > 0
      ? roundToTwoDecimals(formData.deliveryReturnKm * ACTIVE_DELIVERY_PRICE_PER_KM) : 0;
    const calculatedDeliveryFee = pickupDeliveryFee + returnDeliveryFee;

    const calculatedPickupFee = 0;
    const calculatedDropoffFee = 0;

    // --- EXPERIENCE SERVICES ---
    let calculatedExperienceCost = 0;
    for (const [svcId, qty] of Object.entries(formData.selectedExperiences)) {
      if (qty <= 0) continue;
      const svc = ACTIVE_EXPERIENCE_SERVICES.find(s => s.id === svcId);
      if (!svc) continue;
      if (svc.unit === 'per_day') {
        calculatedExperienceCost += roundToTwoDecimals(svc.price * billingDaysCalc * qty);
      } else {
        calculatedExperienceCost += roundToTwoDecimals(svc.price * qty);
      }
    }

    // --- DR7 FLEX ---
    // DR7 Flex addon rimosso — il costo viene ora applicato come servizio
    // dentro experienceCost. Manteniamo flexCost = 0 per compat con i tipi
    // di state esistenti, da rimuovere completamente in un prossimo passo.
    const calculatedFlexCost = 0;

    // Car wash included in price - no additional fee
    let carWashFee = 0;

    let calculatedSubtotal = calculatedRentalCost + calculatedInsuranceCost + calculatedExtrasCost +
      calculatedKmPackageCost + calculatedSecondDriverFee + calculatedLavaggioFee +
      calculatedExperienceCost + calculatedFlexCost +
      calculatedPickupFee + calculatedDropoffFee + calculatedDeliveryFee + carWashFee;

    // --- DEPOSIT SURCHARGES ---
    const vTypeForDeposit = getVehicleType(item, categoryContext);
    const isUrbanForDeposit = vTypeForDeposit === 'UTILITARIA' || vTypeForDeposit === 'FURGONE' || vTypeForDeposit === 'V_CLASS';

    const urbanNoDepositSurcharge = 0; // Micro Cauzione removed

    // Deposit surcharges from Centralina (no_deposit = €49/day, vehicle_deposit = €20/day, etc.)
    let supercarDepositSurcharge = 0;
    if (formData.depositOption) {
      const depositCfgKey = `${activeTierForCalc}_${residencySuffix}` as 'TIER_1_RESIDENT' | 'TIER_2_RESIDENT' | 'TIER_1_NON_RESIDENT' | 'TIER_2_NON_RESIDENT';
      const depOpts = pickDepositOptions(configOverlay, getVehicleType(item, categoryContext), depositCfgKey, (item as any).category);
      const selectedDep = depOpts.find((d: { id: string }) => d.id === formData.depositOption);
      if (selectedDep?.surchargePerDay) {
        supercarDepositSurcharge = roundToTwoDecimals(selectedDep.surchargePerDay * billingDaysCalc);
      }
    }

    const calculatedNoDepositSurcharge = urbanNoDepositSurcharge + supercarDepositSurcharge;
    calculatedSubtotal = calculatedSubtotal + calculatedNoDepositSurcharge;

    // --- DYNAMIC PRICING: apply combined coefficient to FULL TOTAL ---
    // Experience services AND location fees (consegna a domicilio + pickup
    // surcharge) are EXCLUDED from the coefficient and the per-vehicle min/max
    // clamp. Location fees cover km/transport costs that don't scale with
    // demand — they pass through at list price, same rule as Experience.
    // 2026-05-18: anche No Cauzione / deposit surcharge passa a listino —
    // e' un supplemento fisso per la scelta della cauzione, non deve scalare
    // col coefficiente dinamico ne' essere mangiato dal clamp max (prima
    // aggiungeva solo pochi euro invece dei €49 × giorni attesi).
    const listSubtotal = calculatedSubtotal; // total before coefficients
    const locationFees = calculatedDeliveryFee + calculatedPickupFee + calculatedDropoffFee;
    // 2026-05-25: TUTTI i toggle di Centralina Pro > Automazioni >
    // Inclusione coefficiente ora rispettati. Prima 4 toggle su 7
    // erano hardcoded a false e ignorati — l'admin si lamentava che
    // "il toggle non fa niente". Adesso ogni toggle si comporta
    // davvero: ON = voce dentro al subtotale clamp-eligible (×
    // coefficiente), OFF = voce sommata a listino dopo.
    // Note:
    //  - dr7_flex: calculatedFlexCost = 0 sul sito (DR7 Flex e\' in
    //    experience_services), quindi il toggle e\' un no-op tecnico
    //    ma rispettato per coerenza
    //  - cauzione_veicoli: nessuna fee separata sul sito (la
    //    cauzione e\' un deposito, non un addebito), niente da
    //    includere/escludere — toggle no-op ma rispettato
    //  - unlimited_km: usato quando kmPackageType === 'unlimited'
    //    (cliente sceglie KM Illimitati). I pacchetti acquistati a
    //    pacchetto seguono coefficient_km_packages.
    const ci = configOverlay?.coefficientInclusion;
    const includeInsurance     = ci?.insurance        ?? true;
    const includeLavaggio      = ci?.lavaggio         ?? true;
    const includeNoCauzione    = ci?.no_cauzione      ?? true;
    const includeSecondDriver  = ci?.second_driver    ?? true;
    const includeDr7Flex       = ci?.dr7_flex         ?? true;
    // 2026-05-27: km_packages e unlimited_km ora hanno toggle separati.
    // calculatedKmPackageCost contiene il costo per ENTRAMBI i casi
    // (unlimited oppure pacchetti) ma a runtime solo uno e' attivo,
    // quindi scegliamo il flag in base a kmPackageType.
    const includeKmPackages    = ci?.km_packages      ?? false;
    const includeUnlimitedKm   = ci?.unlimited_km     ?? false;
    const includeKmAmount      = formData.kmPackageType === 'unlimited' ? includeUnlimitedKm : includeKmPackages;
    // 2026-05-27: nuovi toggle (default false = sempre a listino come storico).
    const includeExperience    = ci?.experience       ?? false;
    const includeDelivery      = ci?.delivery         ?? false;
    const includePickup        = ci?.pickup           ?? false;
    // Costruisce il "subtotale clamp-eligible" sommando SOLO le voci
    // che il toggle dice di includere nel coefficiente. Le altre
    // vengono aggiunte dopo, intatte.
    let subtotalForCoeff = calculatedRentalCost; // rental SEMPRE sotto coefficiente
    if (includeInsurance)    subtotalForCoeff += calculatedInsuranceCost;
    if (includeLavaggio)     subtotalForCoeff += calculatedLavaggioFee;
    if (includeNoCauzione)   subtotalForCoeff += calculatedNoDepositSurcharge;
    if (includeSecondDriver) subtotalForCoeff += calculatedSecondDriverFee;
    if (includeDr7Flex)      subtotalForCoeff += calculatedFlexCost;
    if (includeKmAmount)     subtotalForCoeff += calculatedKmPackageCost;
    // 2026-05-27: experience/consegna/ritiro ora toggle-driven.
    if (includeExperience)   subtotalForCoeff += calculatedExperienceCost;
    if (includeDelivery)     subtotalForCoeff += calculatedDeliveryFee;
    if (includePickup)       subtotalForCoeff += (calculatedPickupFee + calculatedDropoffFee);
    subtotalForCoeff += calculatedExtrasCost; // extras generici inclusi
    const passThroughExtras = calculatedSubtotal - subtotalForCoeff;
    // Compatibilita\' con il resto del codice qui sotto (clamp + uncapped + hard floor)
    const subtotalNoExperience = subtotalForCoeff;
    // 2026-05-17: applica coefficienti dinamici quando l'engine e' enabled,
    // indipendentemente da mode. La mode 'suggestion' resta per la Preventivi
    // Admin (mostra il suggerimento senza forzarlo) ma sul sito coefficienti
    // si applicano sempre — altrimenti il cliente vede il listino raw e
    // direzione lamenta che "i coefficienti non funzionano".
    const hasDynamicCoeffs = dynamicPricing?.enabled && dynamicPricing.breakdown && dynamicPricing.breakdown.length > 0;
    const combinedCoeff = hasDynamicCoeffs
      ? (dynamicPricing!.breakdown!.reduce((acc, b) => acc * b.coeff, 1))
      : 1;
    const hasDynamicDiscount = hasDynamicCoeffs && Math.abs(combinedCoeff - 1) > 0.001;

    // Uncapped subtotal after coefficients (used for the "real price" display).
    // Pass-through extras (km/cauzione/dr7-flex disabilitati dal toggle,
    // Experience, location fees) restano a listino.
    const uncappedSubtotal = roundToTwoDecimals(subtotalNoExperience * combinedCoeff + passThroughExtras);
    let clampHit: 'min' | 'max' | null = null;
    let clampLimitDaily: number | null = null;

    // Applica il coefficient + clamp min/max al subtotale clamp-eligible.
    // BUG FIX 2026-05-15: usa ELSE IF cosi' UNA SOLA clamp fa fire per render.
    // Prima entrambe giravano in sequenza: max abbassava sotto min, poi min
    // rialzava → clampHit finiva 'min' (LABEL SBAGLIATA: messaggio "Min
    // Raggiunto" mentre in realta' era max ad aver tagliato il prezzo).
    // Adesso: solo una clamp/banner, label corretta.
    const minDaily = typeof dynamicPricing?.minPrice === 'number' ? dynamicPricing.minPrice : null;
    const maxDaily = typeof dynamicPricing?.maxPrice === 'number' ? dynamicPricing.maxPrice : null;
    const daysForClamp = Math.max(1, billingDaysCalc);
    const maxTotal = maxDaily != null ? maxDaily * daysForClamp : null;
    const minTotal = minDaily != null ? minDaily * daysForClamp : null;
    let afterCoeffNoExp = subtotalNoExperience * combinedCoeff;
    if (maxTotal != null && afterCoeffNoExp > maxTotal + 0.5) {
      afterCoeffNoExp = maxTotal;
      clampHit = 'max';
      clampLimitDaily = maxDaily;
    } else if (minTotal != null && afterCoeffNoExp < minTotal - 0.5) {
      afterCoeffNoExp = minTotal;
      clampHit = 'min';
      clampLimitDaily = minDaily;
    }
    // 2026-05-18: HARD FLOOR rimosso. Era pensato come rete di
    // sicurezza quando Centralina min_price era vuoto, ma scavalcava
    // anche quando l'admin aveva configurato un min_daily corretto
    // (caso A45S: min €389/g configurato → admin clampava a €389,
    // sito clampava al floor €433.42, disallineamento). Il min_total
    // del clamp Centralina (sopra) e\' l'unica protezione: se admin
    // non lo configura, il sito puo\' scendere — e\' una scelta business.
    calculatedSubtotal = roundToTwoDecimals(afterCoeffNoExp + passThroughExtras);

    const calculatedTaxes = 0;
    const calculatedTotal = calculatedSubtotal;

    const discountInfo = calculateDiscountedPrice(calculatedTotal, user, 'car_rental');
    const membershipTierName = getMembershipTierName(user);

    return {
      duration: { days, hours },
      rentalCost: calculatedRentalCost,
      insuranceCost: calculatedInsuranceCost,
      extrasCost: calculatedExtrasCost,
      kmPackageCost: calculatedKmPackageCost,
      pickupFee: calculatedPickupFee,
      dropoffFee: calculatedDropoffFee,
      subtotal: calculatedSubtotal,
      taxes: calculatedTaxes,
      total: calculatedTotal,
      includedKm: calculatedIncludedKm,
      driverAge: calculatedDriverAge,
      licenseYears: calculatedLicenseYears,
      youngDriverFee: calculatedYoungDriverFee,
      recentLicenseFee: calculatedRecentLicenseFee,
      secondDriverFee: calculatedSecondDriverFee,
      recommendedKm: calculatedRecommendedKm,
      membershipDiscount: discountInfo.discountAmount,
      membershipTier: membershipTierName,
      originalTotal: discountInfo.originalPrice,
      finalTotal: discountInfo.finalPrice,
      carWashFee,
      noDepositSurcharge: calculatedNoDepositSurcharge,
      effectivePricePerDay: pricePerDay,
      // New fields
      lavaggioFee: calculatedLavaggioFee,
      experienceCost: calculatedExperienceCost,
      flexCost: calculatedFlexCost,
      supercarDepositSurcharge,
      deliveryFee: calculatedDeliveryFee,
      extraDayApplied: extraDay,
      // Prezzo barrato (DoYouItaly style)
      listSubtotal,
      combinedCoeff,
      hasDynamicDiscount,
      dynamicDiscountPct: hasDynamicDiscount ? Math.round((1 - combinedCoeff) * 100) : 0,
      // Clamp indicators for the price summary UI
      uncappedSubtotal,
      clampHit,
      clampLimitDaily,
      clampLimitTotal: clampLimitDaily != null ? clampLimitDaily * Math.max(1, billingDaysCalc) : null,
    };
  }, [
    formData.pickupDate, formData.pickupTime, formData.returnDate, formData.returnTime,
    formData.insuranceOption, formData.extras, formData.birthDate, formData.licenseIssueDate, formData.addSecondDriver,
    formData.kmPackageType, formData.kmPackageDistance, formData.expectedKm,
    formData.email, formData.usageZone, formData.depositOption,
    formData.selectedExperiences, formData.dr7Flex, formData.pickupLocation, formData.returnLocation,
    formData.deliveryPickupKm, formData.deliveryReturnKm,
    item, currency, user, isUrbanOrCorporate, categoryContext, driverTier, dynamicPricing,
    ACTIVE_RENTAL_DAY_RATES, ACTIVE_KM_INCLUDED, ACTIVE_KM_INCLUDED_AZIENDALI, configOverlay,
    residencySuffix
  ]);

  // Online booking discount REMOVED — no automatic discount
  const onlineDiscountAmount = 0;
  const finalTotalWithOnlineDiscount = finalTotal;

  // Calculate discount code amount
  const discountAmount = useMemo(() => {
    if (!appliedDiscount) return 0;

    if (appliedDiscount.type === 'percentage') {
      return Math.min(finalTotal * (appliedDiscount.amount / 100), finalTotal);
    } else {
      // Fixed amount: €150 means €150, capped at subtotal only
      return Math.min(appliedDiscount.amount, finalTotal);
    }
  }, [appliedDiscount, finalTotal, vehicleType]);

  const finalPriceWithBirthdayDiscount = Math.max(0, finalTotalWithOnlineDiscount - discountAmount);

  // Wash upsell cost (-10% on selected wash service + extras)
  const washUpsellCost = selectedUpsellWash ? roundToTwoDecimals(selectedUpsellWash.price * 0.90) : 0;
  const extrasUpsellCost = selectedUpsellExtras.reduce((sum, svc) => sum + roundToTwoDecimals(svc.price * 0.90), 0);
  const totalWashUpsellCost = roundToTwoDecimals(washUpsellCost + extrasUpsellCost);
  const grandTotal = finalPriceWithBirthdayDiscount + totalWashUpsellCost;

  // Calculate dynamic wallet credit for subscription upsell
  // Based on ~8-12% of booking total, rounded to look natural (not generic)
  const subscriptionWalletCredit = useMemo(() => {
    const base = grandTotal || finalTotal || 0;
    return Math.round(base * 0.04 * 100) / 100; // 4% of total
  }, [finalTotal, grandTotal]);

  // Forcer horaires valides et pas de dimanche
  useEffect(() => {
    const validTimes = getValidPickupTimes(formData.pickupDate);
    if (validTimes.length > 0 && !validTimes.includes(formData.pickupTime)) {
      setFormData(prev => ({ ...prev, pickupTime: validTimes[0] }));
    } else if (validTimes.length === 0 && formData.pickupTime) {
      setFormData(prev => ({ ...prev, pickupTime: '' }));
    }
  }, [formData.pickupDate]);


  // Auto-set usage zone based on vehicle type
  useEffect(() => {
    const vType = getVehicleType(item, categoryContext);
    if (vType !== 'SUPERCAR' || formData.kmPackageType === '50km') {
      if (formData.usageZone !== 'FUORI_ZONA') {
        setFormData(prev => ({ ...prev, usageZone: 'FUORI_ZONA' }));
      }
    }
  }, [formData.usageZone, formData.kmPackageType, item, categoryContext]);

  // Pre-fill Personal Data for logged-in users
  useEffect(() => {
    let updates: any = {};

    // 1. Pre-fill Personal Data (Fast Track) for ANY logged-in user
    if (user && !formData.firstName && !formData.lastName) {
      const realName = isRealName(user.fullName);
      const nameParts = realName ? realName.split(' ') : [];
      const first = nameParts.length > 0 ? nameParts[0] : '';
      const last = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      updates.firstName = first;
      updates.lastName = last;
      updates.phone = user.phone || '';
      updates.email = user.email || '';
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      setFormData(prev => ({ ...prev, ...updates }));
    }
  }, [user, formData.firstName, formData.lastName, formData.email, formData.insuranceOption, formData.kmPackageType, formData.usageZone]);




  const formatPrice = (price: number) =>
    new Intl.NumberFormat(currency === 'eur' ? 'it-IT' : 'en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2
    }).format(price);

  const formatDeposit = (price: number) =>
    new Intl.NumberFormat(currency === 'eur' ? 'it-IT' : 'en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price).replace(/\./g, ' ');

  // Calculate deposit based on customer loyalty, license years, age, residency, and vehicle type
  const getDeposit = () => {
    // No deposit option = always €0
    if (formData.depositOption === 'no_deposit') return 0;

    const vType = getVehicleType(item, categoryContext);
    const isUtilitaria = vType === 'UTILITARIA' || vType === 'FURGONE' || vType === 'V_CLASS';

    // Special client = always €0
    

    // Utilitaria/Furgone: use same tier-based deposit as supercars
    // All deposit options from Centralina now (no more hardcoded with_deposit)
    //
    // No membership-based €0 override — DR7 has never had a "cauzione gratis
    // per cliente fidelizzato / Gold / Platinum" policy. The customer always
    // pays the cauzione they pick. Removed the previous code that returned 0
    // for memberTier='gold'/'platinum' and isLoyalCustomer.

    // Supercars: use tier-based deposit options (always RESIDENT since distinction removed).
    // Centralina Pro stores options under `${tier}_RESIDENT` (e.g. 'TIER_2_RESIDENT'),
    // so without the suffix the lookup returned [] and getDeposit silently
    // fell through to the DEFAULT card amount — meaning the customer's actual
    // pick (card €2000, cash €4999, vehicle deposit, etc.) was thrown away
    // before being shown in the riepilogo or written to the booking.
    const activeTier = (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2';
    const depositKey = `${activeTier}_${residencySuffix}`;
    const depOptions = pickDepositOptions(configOverlay, getVehicleType(item, categoryContext), depositKey as 'TIER_1_RESIDENT' | 'TIER_2_RESIDENT' | 'TIER_1_NON_RESIDENT' | 'TIER_2_NON_RESIDENT', (item as any).category);
    const selectedDep = depOptions.find(d => d.id === formData.depositOption);

    if (selectedDep) {
      return selectedDep.amount; // The fixed deposit amount (€0 for no_deposit/vehicle, €1000/€2000 for card, €4999 for cash)
    }

    // Fallback: if no deposit option selected yet, show Pro's first option for this tier.
    return depOptions[0]?.amount ?? 0;
  };

  // Handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const isCheckbox = type === 'checkbox';
    const isFile = type === 'file';

    if (name === 'pickupDate') {
      const currentDate = new Date().toISOString().split('T')[0];
      if (value < currentDate) {
        setErrors(prev => ({ ...prev, pickupDate: "Non puoi selezionare una data passata." }));
        return; // Don't update the form data
      }
      const dayOfWeek = getDayOfWeek(value);
      if (dayOfWeek === 0) {
        setErrors(prev => ({ ...prev, pickupDate: "Siamo chiusi la domenica. Seleziona un altro giorno per il ritiro." }));
      } else {
        setErrors(prev => ({ ...prev, pickupDate: "" }));
      }
    }

    const [, secondDriverField] = name.split('.');
    if (secondDriverField) {
      setFormData(prev => ({
        ...prev,
        secondDriver: {
          ...prev.secondDriver,
          [secondDriverField]: isFile ? (e.target as HTMLInputElement).files?.[0] || null : (isCheckbox ? (e.target as HTMLInputElement).checked : value),
        }
      }));
      // Clear second driver field error
      const errorKey = `secondDriver.${secondDriverField}`;
      if (errors[errorKey]) setErrors(prev => ({ ...prev, [errorKey]: '' }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: isCheckbox ? (e.target as HTMLInputElement).checked : (isFile ? (e.target as HTMLInputElement).files?.[0] || null : value)
      }));
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));

    // When pickup time changes, auto-set return time to pickup time - 1h30
    if (name === 'pickupTime') {
      const [h, m] = value.split(':').map(Number);
      const retMinutes = Math.max(0, (h * 60 + m) - 90);
      const retH = String(Math.floor(retMinutes / 60)).padStart(2, '0');
      const retM = String(retMinutes % 60).padStart(2, '0');
      setFormData(prev => ({ ...prev, returnTime: `${retH}:${retM}` }));
    }

    // Immediate Sunday check when return date is selected
    if (name === 'returnDate' && value) {
      const dayOfWeek = getDayOfWeek(value);
      if (dayOfWeek === 0) {
        setErrors(prev => ({ ...prev, returnDate: "Siamo chiusi la domenica. Seleziona un altro giorno per la riconsegna." }));
      } else {
        setErrors(prev => ({ ...prev, returnDate: '' }));
      }
    }

    // Clear generic date error (duration, min rental) if any date/time field changes
    if (['pickupDate', 'pickupTime', 'returnDate', 'returnTime'].includes(name) && errors.date) {
      setErrors(prev => ({ ...prev, date: '' }));
    }
  };

  // Camera helpers
  const handleUseCameraClick = async () => {
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraStream(stream);
        setIsCameraOpen(true);
      } catch (err) {
        console.error("Camera access denied:", err);
        alert("Camera access was denied. Please check your browser settings.");
      }
    } else {
      alert("Your browser does not support camera access.");
    }
  };
  const handleCloseCamera = () => {
    if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
    setCameraStream(null);
    setIsCameraOpen(false);
  };
  const handleTakePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setFormData(prev => ({ ...prev, licenseImage: dataUrl }));
        setErrors(prev => ({ ...prev, licenseImage: '' }));
      }
      handleCloseCamera();
    }
  };

  // ---------- Pure dataURL → Blob (no fetch on data URLs) ----------
  const dataURLToBlob = (dataUrl: string): Blob => {
    const parts = dataUrl.split(',');
    if (parts.length !== 2) throw new Error('Invalid data URL.');
    const mime = parts[0].match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const binary = atob(parts[1]);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };

  // Upload (File or dataURL) via Netlify function to handle CORS
  const uploadToBucket = async (bucket: string, userId: string, fileOrDataUrl: File | string | null, prefix: string): Promise<string> => {
    if (!fileOrDataUrl) {
      throw new Error("No file provided for upload.");
    }

    try {
      let fileToUpload: Blob;
      let fileName: string;

      if (typeof fileOrDataUrl === 'string') {
        fileToUpload = dataURLToBlob(fileOrDataUrl);
        fileName = `${prefix}_${Date.now()}.jpg`;
      } else {
        fileToUpload = fileOrDataUrl;
        fileName = fileOrDataUrl.name;
      }

      const body = new FormData();
      body.append('file', fileToUpload, fileName);
      body.append('bucket', bucket);
      body.append('userId', userId);
      body.append('prefix', prefix);

      // Get auth token for authenticated upload
      const { data: { session } } = await supabase.auth.getSession();
      const uploadHeaders: Record<string, string> = {};
      if (session?.access_token) {
        uploadHeaders['Authorization'] = `Bearer ${session.access_token}`;
      }

      let uploadPath: string | null = null;

      // Try Netlify function first
      try {
        const response = await fetchWithTimeout(`${FUNCTIONS_BASE}/.netlify/functions/upload-file`, {
          method: 'POST',
          headers: uploadHeaders,
          body,
        });

        if (response.ok) {
          const result = await response.json();
          if (result.path) {
            uploadPath = result.path;
          }
        } else {
          const errorData = await response.json().catch(() => ({ error: `Server error: ${response.status}` }));
          console.warn('Netlify upload failed, trying direct Supabase upload:', errorData);
        }
      } catch (netlifyErr) {
        console.warn('Netlify upload error, trying direct Supabase upload:', netlifyErr);
      }

      // Fallback: upload directly via Supabase client
      if (!uploadPath) {
        const directPath = `${userId}/${prefix}_${Date.now()}.${fileName.split('.').pop() || 'jpg'}`;
        const { error: directErr } = await supabase.storage
          .from(bucket)
          .upload(directPath, fileToUpload, {
            contentType: fileToUpload.type || 'image/jpeg',
            upsert: true,
          });

        if (directErr) {
          console.error('Direct Supabase upload also failed:', directErr);
          throw new Error(directErr.message || 'Upload failed');
        }
        uploadPath = directPath;
        console.log('Direct Supabase upload succeeded:', directPath);
      }

      return uploadPath;

    } catch (e: any) {
      console.error(`Upload failed for ${prefix}:`, e);
      throw new Error(e.message || 'Unknown upload error');
    }
  };

  const validateStep = () => {
    const newErrors: Record<string, string> = {};
    if (step === 1) {
      // When coming from search, dates/locations are already validated — skip step 1 validation
      if (isFromSearch) {
        setErrors({});
        return true;
      }
      if (!formData.pickupDate || formData.pickupDate.trim() === '') {
        newErrors.pickupDate = "La data di ritiro è obbligatoria.";
      }
      if (!formData.returnDate || formData.returnDate.trim() === '') {
        newErrors.returnDate = "La data di riconsegna è obbligatoria.";
      }
      // Block urban/corporate vehicles after March 25
      if (isUtilitaria && formData.returnDate > UTILITARIE_MAX_DATE) {
        setShowMaxDatePopup(true);
        return false;
      }
      if (isUtilitaria && formData.pickupDate > UTILITARIE_MAX_DATE) {
        setShowMaxDatePopup(true);
        return false;
      }

      if (formData.pickupDate && formData.returnDate) {
        const pickup = new Date(`${formData.pickupDate}T${formData.pickupTime}`);
        const returnD = new Date(`${formData.returnDate}T${formData.returnTime}`);
        const diffMs = returnD.getTime() - pickup.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        // 1 rental day = 22h30 (22.5 hours)
        // EXCEPTION 1: Friday pickup → Saturday return is always valid
        //   (Saturday has limited hours, so rental will naturally be < 22h30)
        // EXCEPTION 2: Same-day booking (e.g. 10:30 → 16:30) is allowed
        //   and billed as 1 day. Customers can rent for a few hours within
        //   the same calendar day.
        const dayLength = 22.5;
        const rentalDays = diffHours / dayLength;
        const pickupDayOfWeek = getDayOfWeek(formData.pickupDate);
        const returnDayOfWeek = getDayOfWeek(formData.returnDate);
        const isFridayToSaturday = pickupDayOfWeek === 5 && returnDayOfWeek === 6;
        const isSameDay = formData.returnDate === formData.pickupDate;

        // Reject only when the return is strictly BEFORE the pickup date,
        // or when chronologically the return time is at/before pickup time.
        if (formData.returnDate < formData.pickupDate) {
          newErrors.date = "La data di riconsegna non può essere precedente al ritiro.";
        } else if (diffMs <= 0) {
          newErrors.date = "L'ora di riconsegna deve essere successiva al ritiro.";
        } else if (rentalDays < 0.99 && !isFridayToSaturday && !isSameDay) {
          // Check if this is a constrained availability window
          let isConstrainedSlot = false;

          if (availabilityWindows.length > 0 && hasBusyPeriods) {
            const pickupWindow = availabilityWindows.find(w => {
              const start = new Date(w.start);
              const end = new Date(w.end);
              return pickup >= start && pickup <= end;
            });

            if (pickupWindow) {
              const windowStart = new Date(pickupWindow.start);
              const windowEnd = new Date(pickupWindow.end);
              const windowDurationHours = (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60);

              if (windowDurationHours < 24) {
                isConstrainedSlot = true;
                const startStr = windowStart.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                const endStr = windowEnd.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                const startDateStr = windowStart.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
                const endDateStr = windowEnd.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
                setShortSlotWarning(
                  `Attenzione: questo veicolo è disponibile solo per questo slot ridotto (${startDateStr} ${startStr} → ${endDateStr} ${endStr}).`
                );
              }
            }
          }

          if (!isConstrainedSlot) {
            newErrors.date = "Il noleggio minimo è di 1 giorno (22h30).";
            setShortSlotWarning(null);
          }
        } else {
          setShortSlotWarning(null);
        }

        // Check minimum rental duration of 2 hours for airport drop-offs
        const isAirportDropoff = formData.returnLocation === 'cagliari_airport';
        if (isAirportDropoff && diffHours < 2) {
          newErrors.returnTime = "Per la riconsegna in aeroporto, la durata minima del noleggio è di 2 ore.";
        }

        // Check Sunday drop-off (CLOSED)
        // returnDayOfWeek already declared above
        if (returnDayOfWeek === 0) { // Sunday = 0
          newErrors.returnDate = "Siamo chiusi la domenica. Seleziona un altro giorno per la riconsegna.";
        }

        // Check Saturday drop-off time limits
        if (returnDayOfWeek === 6) { // Saturday = 6
          const returnHour = parseInt(formData.returnTime.split(':')[0]);
          const returnMinutes = parseInt(formData.returnTime.split(':')[1]);
          const returnTimeInMinutes = returnHour * 60 + returnMinutes;

          if (isAirportDropoff) {
            // Airport: maximum 11:00
            if (returnTimeInMinutes > 11 * 60) {
              newErrors.returnTime = "Il sabato, la riconsegna in aeroporto deve essere entro le 11:00.";
            }
          } else {
            // Office Saturday: 09:00–15:00 single window (no afternoon return)
            if (returnTimeInMinutes < 9 * 60 || returnTimeInMinutes > 15 * 60) {
              newErrors.returnTime = "Il sabato, la riconsegna in ufficio è dalle 09:00 alle 15:00.";
            }
          }
        }

        // Server-side availability check (checkVehicleAvailability) handles conflict detection
      }
      if (formData.pickupDate && getDayOfWeek(formData.pickupDate) === 0) {
        newErrors.pickupDate = "Siamo chiusi la domenica. Seleziona un altro giorno per il ritiro.";
      }

      // Availability error is shown as a warning near date inputs (line ~3966).
      // Do NOT hard-block here — the user can still see the warning and decide.

      // Delivery address validation
      if (formData.pickupLocation === 'home_delivery') {
        if (!formData.deliveryPickupVia?.trim()) newErrors.deliveryPickupVia = "Via obbligatoria.";
        if (!formData.deliveryPickupNumero?.trim()) newErrors.deliveryPickupNumero = "Numero civico obbligatorio.";
        if (!formData.deliveryPickupCap?.trim()) newErrors.deliveryPickupCap = "CAP obbligatorio.";
        if (!formData.deliveryPickupCitta?.trim()) newErrors.deliveryPickupCitta = "Città obbligatoria.";
        if (!formData.deliveryPickupProvincia?.trim()) newErrors.deliveryPickupProvincia = "Provincia obbligatoria.";
        if (!formData.deliveryPickupKm || formData.deliveryPickupKm <= 0) newErrors.deliveryPickupKm = "Inserisci la distanza in km.";
      }
      if (formData.returnLocation === 'home_delivery') {
        if (!formData.deliveryReturnVia?.trim()) newErrors.deliveryReturnVia = "Via obbligatoria.";
        if (!formData.deliveryReturnNumero?.trim()) newErrors.deliveryReturnNumero = "Numero civico obbligatorio.";
        if (!formData.deliveryReturnCap?.trim()) newErrors.deliveryReturnCap = "CAP obbligatorio.";
        if (!formData.deliveryReturnCitta?.trim()) newErrors.deliveryReturnCitta = "Città obbligatoria.";
        if (!formData.deliveryReturnProvincia?.trim()) newErrors.deliveryReturnProvincia = "Provincia obbligatoria.";
        if (!formData.deliveryReturnKm || formData.deliveryReturnKm <= 0) newErrors.deliveryReturnKm = "Inserisci la distanza in km.";
      }
    }
    if (step === 2) {
      const ly = calculateYearsSince(formData.licenseIssueDate);
      if (!formData.firstName) newErrors.firstName = "Il nome è obbligatorio.";
      if (!formData.lastName) newErrors.lastName = "Il cognome è obbligatorio.";
      if (!formData.email) newErrors.email = "L'email è obbligatoria.";
      if (!formData.phone) newErrors.phone = "Il telefono è obbligatorio.";
      // Il codice fiscale è italiano: non richiederlo a chi ha la residenza
      // all'estero (indirizzo selezionato fuori dall'Italia).
      const isForeignResidence = !!residenzaCountryCode && residenzaCountryCode !== 'it';
      if (!formData.codiceFiscale && !isForeignResidence) newErrors.codiceFiscale = "Il codice fiscale è obbligatorio per la fatturazione.";
      // Residenza must be a COMPLETE Italian address — the SDI rejects
      // (scarta) the fattura without a valid CAP + city. Either the
      // customer picked a Nominatim suggestion (always well-formatted) OR
      // they typed it manually; in both cases the final string must
      // contain:
      //   - a 5-digit CAP (Italian postal code)
      //   - a house number (a separate digit token, not just the CAP)
      //   - a street name (at least one 3+ letter word)
      //   - reasonable length (>= 12 chars, common minimum for "Via X 1, 09100 Y")
      // Stricter on what matters for the fattura (CAP + city/street + reasonable
      // length); permissive on house number — Nominatim suggestions don't
      // always include one (e.g. "Via Roma, 09100 Cagliari, Sardegna") and
      // requiring it was rejecting valid dropdown picks.
      const residenzaTrim = (formData.residenza || formData.address || '').trim();
      // Indirizzo estero scelto dall'elenco: niente CAP italiano a 5 cifre
      // (il codice postale estero arriva già con la selezione).
      const isForeignAddress = !!residenzaCountryCode && residenzaCountryCode !== 'it';
      const hasCap = /\b\d{5}\b/.test(residenzaTrim);
      const hasStreetWord = /[A-Za-zÀ-ÿ]{3,}/.test(residenzaTrim);
      const longEnough = residenzaTrim.length >= 10;
      if (!residenzaTrim || !longEnough || !hasStreetWord) {
        newErrors.residenza = "Seleziona l'indirizzo dall'elenco (necessario per la fattura).";
      } else if (!isForeignAddress && !hasCap) {
        newErrors.residenza = "Seleziona l'indirizzo dall'elenco (include il CAP, necessario per la fattura).";
      }
      if (!formData.birthDate) {
        newErrors.birthDate = "La data di nascita è obbligatoria.";
      } else {
        // Age verification - must be at least 18 years old
        const driverAge = calculateAgeFromDDMMYYYY(formData.birthDate);
        if (driverAge < 18) {
          newErrors.birthDate = "Devi avere almeno 18 anni per noleggiare un veicolo.";
        }
      }
      if (!formData.licenseNumber) newErrors.licenseNumber = "Il numero di patente è obbligatorio.";
      if (!formData.licenseIssueDate) newErrors.licenseIssueDate = "La data di rilascio della patente è obbligatoria.";

      // Validate images ONLY if not already stored
      if (!formData.licenseImage && !hasStoredDocs.licensePath) {
        newErrors.licenseImage = "La foto della patente è obbligatoria.";
      }
      if (!formData.idImage && !hasStoredDocs.idPath) {
        newErrors.idImage = "La foto del documento d'identità è obbligatoria.";
      }

      if (!formData.confirmsInformation) newErrors.confirmsInformation = "Devi confermare che le informazioni sono corrette.";

      // Tier classification check — block if BLOCKED
      if (driverTierInfo?.tier === 'BLOCKED') {
        newErrors.tierBlocked = driverTierInfo.reason;
      }

      // License requirements: 3 years minimum, 5 years for BMW M4
      const isBMW_M4 = item.name?.includes('BMW M4') || item.name?.includes('M4 Competition');
      const requiredYears = isBMW_M4 ? 5 : 3;

      if (ly < requiredYears) {
        newErrors.licenseIssueDate = isBMW_M4
          ? "Per la BMW M4 è richiesta una patente con almeno 5 anni di anzianità."
          : "È richiesta una patente con almeno 3 anni di anzianità.";
      }

      // Second driver validation — mandatory when checkbox is checked
      if (formData.addSecondDriver) {
        const sd = formData.secondDriver;
        if (!sd.firstName.trim()) newErrors['secondDriver.firstName'] = "Nome obbligatorio.";
        if (!sd.lastName.trim()) newErrors['secondDriver.lastName'] = "Cognome obbligatorio.";
        if (!sd.email.trim()) newErrors['secondDriver.email'] = "Email obbligatoria.";
        if (!sd.phone.trim()) newErrors['secondDriver.phone'] = "Telefono obbligatorio.";
        if (!sd.birthDate) {
          newErrors['secondDriver.birthDate'] = "Data di nascita obbligatoria.";
        } else {
          const sdAge = calculateAgeFromDDMMYYYY(sd.birthDate);
          if (sdAge < 18) newErrors['secondDriver.birthDate'] = "Il secondo conducente deve avere almeno 18 anni.";
        }
        if (!sd.licenseNumber.trim()) newErrors['secondDriver.licenseNumber'] = "Numero patente obbligatorio.";
        if (!sd.licenseIssueDate) {
          newErrors['secondDriver.licenseIssueDate'] = "Data rilascio patente obbligatoria.";
        } else {
          const sdLicenseYears = calculateYearsSince(sd.licenseIssueDate);
          if (sdLicenseYears < requiredYears) {
            newErrors['secondDriver.licenseIssueDate'] = isBMW_M4
              ? "Per la BMW M4 è richiesta una patente con almeno 5 anni di anzianità."
              : "È richiesta una patente con almeno 3 anni di anzianità.";
          }
        }
        if (!sd.licenseExpiryDate) {
          newErrors['secondDriver.licenseExpiryDate'] = "La data di scadenza della patente è obbligatoria.";
        } else {
          const today = new Date().toISOString().split('T')[0];
          if (sd.licenseExpiryDate < today) {
            newErrors['secondDriver.licenseExpiryDate'] = "La patente è scaduta.";
          }
        }
        if (!sd.countryOfIssue) newErrors['secondDriver.countryOfIssue'] = "Il paese di rilascio è obbligatorio.";
        if (!sd.licenseImage) newErrors['secondDriver.licenseImage'] = "Patente secondo conducente obbligatoria.";
        if (!sd.idImage) newErrors['secondDriver.idImage'] = "Documento secondo conducente obbligatorio.";
      }
    }
    if (step === 3) {
      const membershipTier = getMembershipTierName(user);
      const skipsCauzione = membershipTier === 'gold' || membershipTier === 'platinum';
      if (!skipsCauzione) {
        const vTypeForDep = getVehicleType(item, categoryContext);
        const activeTierForDep = driverTier || 'TIER_2';
        const insOpts = getInsuranceForVehicle(vTypeForDep, activeTierForDep);
        const rcaOpt = insOpts.find((o: any) => o.id === 'RCA');
        const insIsRCA = formData.insuranceOption === 'RCA';
        const mandatoryRcaDeposit = insIsRCA && (rcaOpt?.mandatoryDeposit || 0) > 0;
        if (!mandatoryRcaDeposit && !formData.depositOption) {
          newErrors.depositOption = "Seleziona un'opzione per la cauzione.";
        }
      }
    }
    if (step === 4) {
      if (!formData.confirmsDocuments) {
        newErrors.confirmsDocuments = "Devi confermare che i documenti sono corretti.";
      }
      if (!formData.agreesToTerms) {
        newErrors.agreesToTerms = "Devi accettare i termini e le condizioni.";
      }
      if (!formData.agreesToPrivacy) {
        newErrors.agreesToPrivacy = "Devi accettare l'informativa sulla privacy.";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * FIX 3: finalizeBooking is the CANONICAL booking insert path (Stripe/card flow).
   * The credit wallet path in handleSubmit replicates this payload intentionally
   * because it needs atomic RPC. Both paths must stay in sync.
   * TODO: extract buildBookingPayload() helper when wizard is refactored.
   */
  const finalizeBooking = async (paymentIntentId?: string) => {
    if (!user) {
      setErrors(prev => ({ ...prev, form: "You must be logged in to book." }));
      setIsProcessing(false);
      return;
    }

    if (!formData.pickupDate || !formData.returnDate) {
      setErrors(prev => ({ ...prev, form: "Pickup and return dates are required." }));
      setIsProcessing(false);
      return;
    }

    // FIX 4: Re-check availability immediately before insert to close the race window
    // 2026-05-17 BUG FIX: failed-closed. Se checkVehicleAvailability ritorna
    // un sentinel _checkFailed=true (function 500 / timeout / network)
    // BLOCCHIAMO il booking invece di proseguire — altrimenti il cliente
    // poteva prenotare un'auto gia' occupata quando la verifica falliva.
    try {
      const pickupDT = createItalyDateTime(formData.pickupDate, formData.pickupTime).toISOString();
      const dropoffDT = createItalyDateTime(formData.returnDate, formData.returnTime).toISOString();
      const specificId = formData.selectedVehicleId || item.id.replace('car-', '');
      const preInsertConflicts = await checkVehicleAvailability(item.name, pickupDT, dropoffDT, specificId);
      if (preInsertConflicts.length > 0) {
        const first = preInsertConflicts[0] as { _checkFailed?: boolean; availableFrom?: string; _availableFrom?: string }
        if (first?._checkFailed) {
          setErrors(prev => ({ ...prev, form: 'Impossibile verificare la disponibilità in questo momento. Riprova fra qualche secondo.' }));
          setIsProcessing(false);
          return;
        }
        // Check if there's an availableFrom time we can suggest
        const availFrom = first?.availableFrom || first?._availableFrom;
        if (availFrom) {
          const availTime = new Date(availFrom).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Rome' });
          setErrors(prev => ({ ...prev, form: `Il veicolo non è disponibile a quest\'orario. Disponibile dalle ${availTime}.` }));
        } else {
          setErrors(prev => ({ ...prev, form: 'Il veicolo è stato appena prenotato da un altro utente. Seleziona date diverse.' }));
        }
        setIsProcessing(false);
        return;
      }
    } catch (e) {
      // Anche un'eccezione qui blocca il booking: meglio errore inviato al
      // cliente che booking-fantasma su auto gia' occupata.
      console.warn('[finalizeBooking] Pre-insert availability re-check failed:', e);
      setErrors(prev => ({ ...prev, form: 'Impossibile verificare la disponibilità. Riprova fra qualche secondo.' }));
      setIsProcessing(false);
      return;
    }

    try {
      // Upload secure documents or use existing — non-blocking fallback to stored docs
      let licenseImageUrl = null;
      let idImageUrl = null;

      // License Logic
      if (formData.licenseImage) {
        try {
          licenseImageUrl = await uploadToBucket('driver-licenses', user.id, formData.licenseImage, 'license');
        } catch (uploadErr) {
          console.warn('License upload failed, using stored path:', uploadErr);
          licenseImageUrl = hasStoredDocs.licensePath || 'upload_pending';
        }
      } else if (hasStoredDocs.licensePath) {
        licenseImageUrl = hasStoredDocs.licensePath;
      }

      // ID Logic
      if (formData.idImage) {
        try {
        idImageUrl = await uploadToBucket('carta-identita', user.id, formData.idImage, 'id'); // Note: changed bucket from 'driver-ids' to 'carta-identita' to match AdminPage?
        } catch (uploadErr) {
          console.warn('ID upload failed, using stored path:', uploadErr);
          idImageUrl = hasStoredDocs.idPath || 'upload_pending';
        }
      } else if (hasStoredDocs.idPath) {
        idImageUrl = hasStoredDocs.idPath;
      }

      // Fallback? If null, backend might reject or just store null.
      // Validation ensures we have one or the other.

      const { days, hours } = duration;

      console.log('FormData dates:', {
        pickup_date: formData.pickupDate,
        pickup_time: formData.pickupTime,
        dropoff_date: formData.returnDate,
        dropoff_time: formData.returnTime,
      });

      // Ensure dates are valid before creating booking
      if (!formData.pickupDate || !formData.returnDate) {
        throw new Error('Dates invalides. Veuillez sélectionner les dates de ritiro et riconsegna.');
      }

      console.log('DEBUG - Form data before booking:', {
        pickupDate: formData.pickupDate,
        pickupTime: formData.pickupTime,
        returnDate: formData.returnDate,
        returnTime: formData.returnTime
      });

      // Create pickup and dropoff dates in Europe/Rome timezone
      const pickupDateTime = createItalyDateTime(formData.pickupDate, formData.pickupTime);
      const dropoffDateTime = createItalyDateTime(formData.returnDate, formData.returnTime);

      // Resolve customer data with fallback to user object
      const rFirstName = formData.firstName || (user.fullName?.split(' ')[0]) || '';
      const rLastName = formData.lastName || (user.fullName?.split(' ').slice(1).join(' ')) || '';
      const rFullName = `${rFirstName} ${rLastName}`.trim() || user.fullName || 'Cliente';
      const rEmail = formData.email || user.email || '';
      const rPhone = formData.phone || (user as any).phone || '';

      const bookingData = {
        user_id: user.id,
        vehicle_type: item.type || 'car',
        vehicle_name: availableVehicleName || item.name, // Use specific vehicle from group if available
        vehicle_image_url: item.image,
        pickup_date: pickupDateTime.toISOString(),
        dropoff_date: dropoffDateTime.toISOString(),
        pickup_location: formData.pickupLocation,
        dropoff_location: formData.returnLocation,
        delivery_address: formData.deliveryAddress || null,
        delivery_distance_km: deliveryInfo?.roundTripKm || null,
        delivery_fee: deliveryFee || null,
        price_total: eurosToCents(grandTotal),
        currency: currency.toUpperCase(),
        status: 'pending',
        payment_status: paymentIntentId || formData.paymentMethod === 'credit' ? 'succeeded' : 'pending',
        payment_method: formData.paymentMethod,
        stripe_payment_intent_id: paymentIntentId || null,
        booked_at: new Date().toISOString(),
        booking_usage_zone: formData.usageZone || null,
        vehicle_id: formData.selectedVehicleId || item.vehicleIds?.[0] || item.id?.replace('car-', '') || null,
        vehicle_plate: (() => {
          // Try selected vehicle first
          if (formData.selectedVehicleId && item.vehicleIds && Array.isArray((item as any).plates)) {
            const idx = item.vehicleIds.indexOf(formData.selectedVehicleId);
            if (idx >= 0 && (item as any).plates[idx]) return (item as any).plates[idx];
          }
          // Fallback: first plate or item-level plate
          if ((item as any).plates?.[0]) return (item as any).plates[0];
          if ((item as any).plate) return (item as any).plate;
          return null;
        })(),
        deposit_amount: getDeposit(),
        // insurance_option stored in booking_details.insuranceOption (not a top-level column)
        customer_name: rFullName,
        customer_email: rEmail,
        customer_phone: rPhone,
        booking_details: {
          customer: {
            fullName: rFullName,
            firstName: rFirstName,
            lastName: rLastName,
            email: rEmail,
            phone: rPhone,
            birthDate: formData.birthDate,
            age: driverAge,
            codiceFiscale: formData.codiceFiscale,
            sesso: formData.sesso,
            luogoNascita: formData.luogoNascita,
            provinciaNascita: formData.provinciaNascita,
            residenza: formData.residenza,
            licenseNumber: formData.licenseNumber,
            licenseIssueDate: formData.licenseIssueDate,
            licenseYears: licenseYears,
            address: formData.address,
          },
          secondDriver: formData.addSecondDriver ? {
            fullName: `${formData.secondDriver.firstName} ${formData.secondDriver.lastName}`,
            firstName: formData.secondDriver.firstName,
            lastName: formData.secondDriver.lastName,
            email: formData.secondDriver.email,
            phone: formData.secondDriver.phone,
            birthDate: formData.secondDriver.birthDate,
            licenseNumber: formData.secondDriver.licenseNumber,
            licenseIssueDate: formData.secondDriver.licenseIssueDate,
            licenseExpiryDate: formData.secondDriver.licenseExpiryDate,
            countryOfIssue: formData.secondDriver.countryOfIssue,
          } : null,
          duration: `${days} days`,
          insuranceOption: formData.insuranceOption,
          insuranceLabel: (() => { const opts = getInsuranceForVehicle(getVehicleType(item, categoryContext), (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2'); return opts.find(o => o.id === formData.insuranceOption)?.name || formData.insuranceOption?.replace(/_/g, ' '); })(),
          extras: formData.extras,
          kmPackage: {
            type: includedKm >= 9999 ? 'unlimited' : (formData.kmPackageType === 'unlimited' ? 'unlimited' : 'included'),
            distance: (formData.kmPackageType === 'unlimited' || includedKm >= 9999) ? 'unlimited' : `${includedKm} km`,
            cost: kmPackageCost,
            includedKm: includedKm,
            isPremium: isPremiumVehicle(item.name)
          },
          depositOption: formData.depositOption,
          noDepositSurcharge: noDepositSurcharge,
          ...(formData.depositOption === 'vehicle_deposit' ? {
            vehicleDeposit: {
              targa: vehicleDepositTarga,
              vehicleInfo: vehicleDepositInfo,
              isOwner: vehicleDepositIsOwner,
              ...(!vehicleDepositIsOwner ? { owner: vehicleDepositOwner } : {}),
            }
          } : {}),
          // Tier-based booking fields
          driver_tier: driverTier,
          insurance_cost: insuranceCost,
          second_driver_fee: secondDriverFee,
          lavaggio_fee: lavaggioFee,
          km_cost: kmPackageCost,
          experience_services: formData.selectedExperiences,
          experience_cost: experienceCost,
          dr7_flex: dr7FlexEffective,
          flex_cost: flexCost,
          deposit_surcharge: noDepositSurcharge,
          vehicle_id: formData.selectedVehicleId,
          driverLicenseImage: licenseImageUrl,
          driverIdImage: idImageUrl,
          ...(selectedUpsellWash || selectedUpsellExtras.length > 0 ? { washUpsell: {
            ...(selectedUpsellWash ? {
              serviceId: selectedUpsellWash.id,
              serviceName: selectedUpsellWash.name,
              originalPrice: selectedUpsellWash.price,
              discountedPrice: washUpsellCost,
            } : {}),
            discountPercent: 10,
            customerCarModel: upsellCarInput,
            carCategory: upsellCarCategory,
            ...(upsellTargaResult ? { customerPlate: upsellTargaResult.plate } : {}),
            washUpsellExtras: selectedUpsellExtras.map(svc => ({
              serviceId: svc.id, serviceName: svc.name,
              originalPrice: svc.price, discountedPrice: roundToTwoDecimals(svc.price * 0.90),
            })),
            totalCost: totalWashUpsellCost,
          }} : {}),
        }
      };

      const { data, error } = await supabase.from('bookings').insert(bookingData).select().single();

      if (error) {
        console.error('DB insert error details:', error);
        throw new Error(`DB insert failed: ${error.message}`);
      }

      if (data) {
        // Upsert customer into customers_extended (find by user_id, don't duplicate)
        if (user?.id) {
          supabase.from('customers_extended')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle()
            .then(({ data: existing }) => {
              const customerRecord: Record<string, any> = {
                nome: formData.firstName,
                cognome: formData.lastName,
                email: formData.email,
                telefono: formData.phone,
                codice_fiscale: formData.codiceFiscale,
                indirizzo: formData.residenza,
                tipo_cliente: 'persona_fisica',
                source: 'website_booking',
              };
              if (formData.birthDate) customerRecord.data_nascita = formData.birthDate;
              if (formData.sesso) customerRecord.sesso = formData.sesso;
              if (formData.luogoNascita) customerRecord.luogo_nascita = formData.luogoNascita;
              if (formData.provinciaNascita) customerRecord.provincia_nascita = formData.provinciaNascita;

              if (existing?.id) {
                // Update existing record
                supabase.from('customers_extended').update(customerRecord).eq('id', existing.id)
                  .then(() => console.log('[booking] customers_extended updated'))
                  .catch(e => console.error('[booking] customers_extended update error:', e));
              } else {
                // Insert new record with user_id
                supabase.from('customers_extended').insert({ ...customerRecord, user_id: user.id })
                  .then(() => console.log('[booking] customers_extended created'))
                  .catch(e => console.error('[booking] customers_extended insert error:', e));
              }
            }).catch(e => console.error('[booking] customers_extended lookup error:', e));
        }

        // Sync cauzione record so the deposit lands in Cauzioni → Da
        // Incassare. Mirrors the wallet path; runs for any non-zero
        // deposit regardless of payment method.
        const insertDeposit = Number(data.deposit_amount || bookingData.deposit_amount || 0);
        if (insertDeposit > 0) {
          fetchWithTimeout(`${FUNCTIONS_BASE}/.netlify/functions/sync-booking-cauzione`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingId: data.id,
              customerId: data.user_id,
              vehicleId: data.vehicle_id,
              returnDate: data.dropoff_date,
              depositAmount: insertDeposit,
              paymentMethod: data.payment_method || bookingData.payment_method || 'carta',
              depositPaid: data.payment_status === 'paid' || data.payment_status === 'succeeded',
              depositStatus: 'da_incassare',
            }),
          }).catch(cauzErr => console.error('[booking] Cauzione sync error:', cauzErr));
        }

        // Send email confirmation
        fetchWithTimeout(`${FUNCTIONS_BASE}/.netlify/functions/send-booking-confirmation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking: data }),
        }).catch(emailError => console.error('Failed to send confirmation email:', emailError));

        // Send WhatsApp notification to admin
        fetchWithTimeout(`${FUNCTIONS_BASE}/.netlify/functions/send-whatsapp-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking: data }),
        }).catch(whatsappError => console.error('Failed to send WhatsApp notification:', whatsappError));

        // Send WhatsApp confirmation to CUSTOMER (uses system_messages template)
        const custPhone = formData.phone || data.customer_phone;
        if (custPhone) {
          fetchWithTimeout(`${FUNCTIONS_BASE}/.netlify/functions/send-whatsapp-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking: { ...data, payment_status: data.payment_status || 'succeeded' }, customPhone: custPhone }),
          }).catch(e => console.error('Failed to send customer WhatsApp:', e));
        }

        // Note: Google Calendar event is created automatically by send-booking-confirmation function

        // Generate WhatsApp prefilled message for customer
        const bookingId = data.id.substring(0, 8).toUpperCase();
        const vehicleName = data.vehicle_name;
        const pickupDate = new Date(data.pickup_date);
        const dropoffDate = new Date(data.dropoff_date);
        const customerName = `${formData.firstName} ${formData.lastName}`;
        const customerPhone = formData.phone;
        const totalPrice = (data.price_total / 100).toFixed(2);
        const insuranceOption = data.insurance_option || data.booking_details?.insuranceOption || 'Nessuna';

        const whatsappMessage = `Ciao! Ho appena completato una prenotazione sul vostro sito.\n\n` +
          `*Dettagli Prenotazione*\n` +
          `*ID:* DR7-${bookingId}\n` +
          `*Nome:* ${customerName}\n` +
          `*Telefono:* ${customerPhone}\n` +
          `*Veicolo:* ${vehicleName}\n` +
          `*Data Ritiro:* ${pickupDate.toLocaleDateString('it-IT')} alle ${pickupDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}\n` +
          `*Data Riconsegna:* ${dropoffDate.toLocaleDateString('it-IT')} alle ${dropoffDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}\n` +
          `*Luogo Ritiro:* ${data.pickup_location}\n` +
          `*Assicurazione:* ${insuranceOption}\n` +
          (selectedUpsellWash ? `*Lavaggio Auto:* ${selectedUpsellWash.name} (€${washUpsellCost.toFixed(2)}) - ${upsellCarInput}\n` : '') +
          (selectedUpsellExtras.length > 0 ? `*Servizi Aggiuntivi:* ${selectedUpsellExtras.map(s => `${s.name} (€${roundToTwoDecimals(s.price * 0.90).toFixed(2)})`).join(', ')}\n` : '') +
          `*Totale:* €${totalPrice}\n\n` +
          `Grazie!`;

        // WhatsApp sent automatically via Netlify functions — no manual window needed
      }

      // Auto-generate contract + fattura via admin webhook (bypasses auth)
      fetchWithTimeout('https://platform.dr7ai.com/.netlify/functions/post-booking-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: data.id }),
      }).then(res => res.ok ? console.log('[booking] Contract + fattura webhook OK') : console.error('[booking] Webhook failed:', res.status))
        .catch(e => console.error('[booking] Webhook error:', e));

      // Mark birthday discount code as used
      if (appliedDiscount && data.id) {
        await markDiscountCodeAsUsed(data.id);
      }

      // DR7 Club cashback is granted server-side by nexi-callback.js once
      // the Nexi payment is actually confirmed. Tier-based % is read from
      // Centralina Pro (centralina_pro_config.dr7_club.tiers). Don't
      // duplicate the logic here — premature client-side grant would
      // award cashback for payments that may fail or be abandoned.

      // DR7 Club subscription — activate after card payment (fee is included in total)
      const hasClubSubNexi = formData.extras.some(e => e.startsWith('subscription_'));
      if (hasClubSubNexi && user?.id) {
        const isAnnual = formData.extras.includes('subscription_annual');
        const clubPrice = isAnnual ? 39 : 4.90;
        const expiresAt = new Date();
        if (isAnnual) expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        else expiresAt.setMonth(expiresAt.getMonth() + 1);
        try {
          await supabase.from('dr7_club_subscriptions').insert({
            user_id: user.id, plan: isAnnual ? 'annual' : 'monthly',
            status: 'active', price: clubPrice,
            started_at: new Date().toISOString(), expires_at: expiresAt.toISOString(),
          });
          const { addCredits } = await import('../../utils/creditWallet');
          await addCredits(user.id, 10, 'DR7 Club — Bonus iscrizione €10', data.id, 'club_signup_bonus');
          console.log(`[DR7 Club] Activated after Nexi payment for ${user.email}`);
        } catch (clubErr) {
          console.error('[DR7 Club] Activation error (non-blocking):', clubErr);
        }
      }

      // FIX 2: Invalidate vehicle cache so availability is fresh after booking
      invalidateVehicleCache();

      onBookingComplete(data);
      setIsProcessing(false);

    } catch (e: any) {
      setErrors(prev => ({ ...prev, form: `Booking failed: ${e.message}` }));
      setIsProcessing(false);
    }
  };

  // Validate discount code (supports both birthday codes and marketing codes)
  const validateDiscountCode = async () => {
    if (!discountCode.trim()) {
      setDiscountCodeError('Inserisci un codice sconto');
      return;
    }

    // Check if user is logged in
    if (!user) {
      setDiscountCodeError('Devi effettuare il login per utilizzare un codice sconto');
      return;
    }

    setIsValidatingCode(true);
    setDiscountCodeError(null);

    // Determine service type for scope validation
    let serviceType = 'noleggio';
    if (categoryContext === 'cars') {
      serviceType = 'supercar';
    } else if (categoryContext === 'urban-cars') {
      serviceType = 'utilitarie';
    } else if (categoryContext === 'corporate-fleet') {
      serviceType = 'aziendali';
    }

    try {
      // Call the admin API to validate the code with service context
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const response = await fetch('/.netlify/functions/validate-discount-code', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'validate',
          code: discountCode.trim().toUpperCase(),
          serviceType: serviceType,
          orderTotal: Math.round(finalTotalWithOnlineDiscount * 100)
        })
      });

      const rawResult = await response.json();

      if (!response.ok || !rawResult.valid) {
        setDiscountCodeError(rawResult.message || rawResult.error || 'Codice non valido');
        setDiscountCodeValid(false);
        setAppliedDiscount(null);
        return;
      }

      // The API may return discount data nested in discountCode or at top level
      const result = { ...rawResult, ...(rawResult.discountCode || {}) };

      // Check if rental credit is already used (for birthday codes)
      if (result.code_type === 'birthday' && result.rental_used) {
        setDiscountCodeError('Il credito noleggio di questo codice è già stato utilizzato');
        setDiscountCodeValid(false);
        setAppliedDiscount(null);
        return;
      }

      // For birthday codes ONLY: verify the logged-in user matches the code's customer
      // Marketing codes (from admin generator) can be used by anyone
      // Skip check if no customer_email/customer_phone is set on the code (admin didn't restrict it)
      if (result.code_type === 'birthday' && (result.customer_email || result.customer_phone)) {
        const userEmail = user.email?.toLowerCase().trim();
        const userPhone = user.phone?.replace(/[\s\-\+]/g, '');
        const codeCustomerPhone = result.customer_phone?.replace(/[\s\-\+]/g, '');

        // Check if user's email or phone matches the code's customer
        const emailMatch = userEmail && result.customer_email && userEmail === result.customer_email.toLowerCase().trim();
        const phoneMatch = userPhone && codeCustomerPhone && (
          userPhone === codeCustomerPhone ||
          userPhone.endsWith(codeCustomerPhone.slice(-9)) ||
          codeCustomerPhone.endsWith(userPhone.slice(-9))
        );

        if (!emailMatch && !phoneMatch) {
          setDiscountCodeError('Questo codice sconto è riservato a un altro cliente. Verifica di aver effettuato il login con lo stesso account.');
          setDiscountCodeValid(false);
          setAppliedDiscount(null);
          return;
        }
      }

      // Code is valid - apply the discount
      // Use value_type/value_amount for all codes, with rental_credit as fallback for birthday codes
      let discountAmount = 0;
      let discountType: 'fixed' | 'percentage' | 'rental' = 'fixed';

      if (result.value_type && result.value_amount != null) {
        // Prefer explicit value_type and value_amount (works for all code types).
        // Postgres NUMERIC arrives as string from supabase-js — coerce to Number
        // so the math + the message text both render predictably.
        discountType = result.value_type; // 'fixed' or 'percentage'
        discountAmount = Number(result.value_amount) || 0;
      } else if (result.rental_credit) {
        // Fallback for birthday codes that only have rental_credit
        discountType = 'fixed';
        discountAmount = Number(result.rental_credit) || 0;
      }

      setDiscountCodeValid(true);
      setAppliedDiscount({
        code: result.code,
        amount: discountAmount,
        type: discountType,
        code_type: result.code_type || 'marketing'
      });
      setDiscountCodeError(null);

    } catch (error: any) {
      console.error('Error validating discount code:', error);
      setDiscountCodeError('Errore nella verifica del codice');
      setDiscountCodeValid(false);
    } finally {
      setIsValidatingCode(false);
    }
  };

  // Remove applied discount
  const removeDiscount = () => {
    setDiscountCode('');
    setDiscountCodeValid(false);
    setAppliedDiscount(null);
    setDiscountCodeError(null);
  };

  // Mark discount code as used after successful booking
  const markDiscountCodeAsUsed = async (bookingId: string) => {
    if (!appliedDiscount?.code) return;

    // Determine service type
    let serviceType = 'noleggio';
    if (categoryContext === 'cars') {
      serviceType = 'supercar';
    } else if (categoryContext === 'urban-cars') {
      serviceType = 'utilitarie';
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      await fetch('/.netlify/functions/validate-discount-code', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'apply_rental',
          code: appliedDiscount.code,
          booking_id: bookingId,
          service_type: serviceType
        })
      });
      console.log('Discount code marked as used:', appliedDiscount.code);
    } catch (error) {
      console.error('Error marking discount code as used:', error);
    }
  };

  // ── SAVE PREVENTIVO (quote) instead of booking ──
  const handleSavePreventivo = async () => {
    if (!user || !item || isSavingPreventivo) return;
    // Guard: bloccare il save se nessuna assicurazione e' selezionata
    // (cosi' non finisce nessun preventivo con "N/A" salvato). Il wizard
    // ha gia' un default 'KASKO_BASE' su mount, quindi questo guard
    // scatta solo se qualcosa azzera lo stato.
    if (!formData.insuranceOption) {
      alert('Seleziona un\'assicurazione prima di salvare il preventivo.');
      return;
    }
    setIsSavingPreventivo(true);
    try {
      const pickupISO = `${formData.pickupDate}T${formData.pickupTime || '10:30'}:00`;
      const dropoffISO = `${formData.returnDate}T${formData.returnTime || '09:00'}:00`;

      const resolvedVehicleId = formData.selectedVehicleId || item.vehicleIds?.[0] || item.id.replace('car-', '');
      // Risolvi label assicurazione al salvataggio cosi' MyPreventivi
      // non deve piu' indovinarla via overlay (e funziona anche per categorie
      // custom).
      const insOptId = formData.insuranceOption
      const insLabel = (() => {
        const vType = getVehicleType(item, categoryContext)
        const activeTier = (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2'
        const opts = getInsuranceForVehicle(vType, activeTier)
        return opts.find((o: { id?: string; name?: string }) => o.id === insOptId)?.name || ''
      })()
      const payload = {
        vehicle_id: resolvedVehicleId,
        vehicle_name: item.name,
        vehicle_plate: (item as any).plate || '',
        vehicle_category: (item as any).category || 'exotic',
        pickup_date: pickupISO,
        dropoff_date: dropoffISO,
        rental_days: duration.days,
        pickup_location: formData.pickupLocation || 'dr7_office',
        dropoff_location: formData.returnLocation || formData.pickupLocation || 'dr7_office',
        base_daily_rate: effectivePricePerDay,
        insurance_option: insOptId,
        insurance_label: insLabel,
        insurance_daily_price: insuranceCost / Math.max(duration.days, 1),
        insurance_total: insuranceCost,
        km_limit: (() => {
          // When customer picked the "unlimited" option, store the canonical sentinel
          // so admin summary and edit modal both agree.
          if (formData.kmPackageType === 'unlimited') return 'Illimitati';
          // 2026-05-21 BUG FIX: includedKm gia' INCLUDE pkgKmTotal (cfr.
          // pricing useMemo line ~1945: calculatedIncludedKm = base + pkgKmTotal).
          // Prima qui sommavamo i pacchetti UN'ALTRA VOLTA → km_limit
          // doppio-conteggiato (Massimo: includedKm=300=100+200 day 2, +200
          // extra dei pacchetti = 500 salvato invece di 300 reale).
          // Adesso usiamo direttamente includedKm che riflette gia' il
          // recap "Totale KM" visibile al cliente.
          return Number(formData.kmLimit) || Number(includedKm) || 0;
        })(),
        unlimited_km: formData.kmPackageType === 'unlimited',
        km_overage_fee: ACTIVE_SFORO_PER_KM,
        unlimited_km_daily: formData.kmPackageType === 'unlimited' ? (kmPackageCost / Math.max(duration.days, 1)) : 0,
        unlimited_km_total: formData.kmPackageType === 'unlimited' ? kmPackageCost : 0,
        // 2026-05-16: Pacchetti KM acquistati (lista cumulativa).
        // Persistito su booking_details così contratto + fattura + email
        // hanno l'elenco completo. Backward-compat: se UN solo pacchetto
        // selezionato, popoliamo anche `km_package` (singolare) col primo
        // elemento per i lettori che leggevano il vecchio campo.
        km_packages: (() => {
          if (!formData.kmPackages || Object.keys(formData.kmPackages).length === 0) return []
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawCat = String(((item as any).category ?? '')).toLowerCase().trim()
          const pkgs = resolvePacchetti(rawCat, configOverlay?.pacchettiByCategory)
          const out: Array<{ id: string; label: string; km: number; sconto_pct: number; price: number; quantity: number; total_km: number; total_price: number }> = []
          for (const pkg of pkgs) {
            const qty = formData.kmPackages?.[pkg.id] || 0
            if (qty <= 0) continue
            const cap = pkg.is_quantity_buyable ? Math.max(1, Number(pkg.max_quantity) || 2) : 1
            const q = Math.max(0, Math.min(cap, qty))
            if (q > 0) {
              out.push({
                id: pkg.id,
                label: pkg.label,
                km: pkg.km,
                sconto_pct: pkg.sconto_pct,
                price: pkg.price,
                quantity: q,
                total_km: pkg.km * q,
                total_price: Math.round(pkg.price * q * 100) / 100,
              })
            }
          }
          return out
        })(),
        // Backward-compat field (singolare): primo pacchetto selezionato,
        // o null se nessuno/multipli.
        km_package: (() => {
          const list = formData.kmPackages
          if (!list) return null
          const ids = Object.keys(list).filter(id => (list[id] || 0) > 0)
          if (ids.length !== 1) return null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawCat = String(((item as any).category ?? '')).toLowerCase().trim()
          const pkgs = resolvePacchetti(rawCat, configOverlay?.pacchettiByCategory)
          const found = pkgs.find(p => p.id === ids[0])
          if (!found) return null
          const qty = list[ids[0]]
          return {
            id: found.id, label: found.label, km: found.km, sconto_pct: found.sconto_pct,
            price: found.price, quantity: qty, total_km: found.km * qty, total_price: Math.round(found.price * qty * 100) / 100,
          }
        })(),
        second_driver_daily: secondDriverFee / Math.max(duration.days, 1),
        second_driver_total: secondDriverFee,
        no_cauzione_daily: noDepositSurcharge,
        no_cauzione_total: noDepositSurcharge * duration.days,
        lavaggio_fee: lavaggioFee,
        delivery_fee: deliveryFee,
        pickup_fee: pickupFee,
        subtotal: grandTotal,
        sconto: membershipDiscount,
        sconto_note: membershipTier ? `Sconto ${membershipTier}` : '',
        total_final: grandTotal,
        deposit_amount: getDeposit(),
        driver_tier: driverTier || 'TIER_2',
        customer_name: `${formData.firstName} ${formData.lastName}`.trim(),
        customer_phone: formData.phone,
        extras_detail: {
          experience_services: formData.experienceServices,
          flex: formData.dr7Flex,
          wash_upsell: formData.washUpsellAccepted,
          // Salviamo la scelta esatta dei pacchetti km (es. Pacchetto 300 km)
          // cosi' su Prenota Ora il wizard la ripristina E l'admin la vede
          // nella legenda del preventivo. Snake_case per essere consistenti
          // con il resto dello schema admin (extras.km_packages e' la chiave
          // letta da PreventiviTab + dai template Pro {km_package}).
          km_package_type: formData.kmPackageType,
          km_packages: formData.kmPackages,
          // Alias camelCase per backwards compat — i preventivi vecchi salvati
          // con questi nomi continuano a essere letti.
          kmPackageType: formData.kmPackageType,
          kmPackages: formData.kmPackages,
        },
        notes: noCauzioneRequested ? 'Richiesta formula senza cauzione' : '',
        no_cauzione_request: noCauzioneRequested && formData.depositOption === 'no_deposit',
      };

      // 2026-05-21: in edit mode, tell the backend to UPDATE the existing
      // preventivo instead of creating a new one. replacePreventivoId is
      // honored only if the row is owned by the current user AND not yet
      // converted to a booking (server-side checks).
      const payloadWithReplace = (initialSearchDates?.editMode && initialSearchDates?.preventivoId)
        ? { ...payload, replacePreventivoId: initialSearchDates.preventivoId }
        : payload;

      const res = await fetch('/.netlify/functions/create-website-preventivo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify(payloadWithReplace),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Errore salvataggio preventivo');
      }

      setPreventivoSaved(true);
    } catch (err: any) {
      console.error('Preventivo save error:', err);
      alert('Errore: ' + (err.message || 'Riprova'));
    } finally {
      setIsSavingPreventivo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);
    console.log("handleSubmit called", { paymentMethod: formData.paymentMethod, step, userId: user?.id });
    if (!validateStep() || !item) return;

    // Ref-based guard: prevents double-tap/double-click even if state hasn't updated yet
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsProcessing(true);

    // Safety timeout: auto-reset after 120 seconds (enough for slow networks + Nexi redirect)
    const safetyTimer = setTimeout(() => {
      isSubmittingRef.current = false;
      setIsProcessing(false);
      setPaymentError('Timeout — riprova il pagamento.');
    }, 120000);

    try {

    // Normalize paymentMethod — guard against null/undefined/unsupported values
    // Default declared in formData initializer is 'nexi'; fallback to it if corrupted
    const SUPPORTED_PAYMENT_METHODS = ['credit', 'nexi'] as const;
    type SupportedPaymentMethod = typeof SUPPORTED_PAYMENT_METHODS[number];
    const rawPaymentMethod = formData.paymentMethod;
    const normalizedPaymentMethod: SupportedPaymentMethod =
      SUPPORTED_PAYMENT_METHODS.includes(rawPaymentMethod as SupportedPaymentMethod)
        ? (rawPaymentMethod as SupportedPaymentMethod)
        : 'nexi';

    if (!SUPPORTED_PAYMENT_METHODS.includes(rawPaymentMethod as SupportedPaymentMethod)) {
      console.warn('[handleSubmit] paymentMethod non supportato:', rawPaymentMethod, '— fallback a nexi');
    }

    // SAFETY NET: Re-validate critical customer fields before ANY booking
    const customerName = `${formData.firstName} ${formData.lastName}`.trim();
    if (!customerName || !formData.firstName.trim() || !formData.lastName.trim()) {
      clearTimeout(safetyTimer);
      setPaymentError('Nome e cognome sono obbligatori. Torna allo Step 2 e compila i campi.');
      isSubmittingRef.current = false;
      setIsProcessing(false);
      return;
    }
    if (!formData.email.trim()) {
      clearTimeout(safetyTimer);
      setPaymentError('Email obbligatoria. Torna allo Step 2 e compila il campo.');
      isSubmittingRef.current = false;
      setIsProcessing(false);
      return;
    }

    // CRITICAL: block booking if Centralina config hasn't loaded.
    // Without tierPricing, extras (km illimitati, secondo guidatore, lavaggio)
    // silently fall back to €0 → sotto-prezzo del booking. Meglio bloccare
    // che fatturare meno.
    if (!configOverlay?.tierPricing) {
      clearTimeout(safetyTimer);
      setPaymentError('Configurazione prezzi non ancora caricata. Ricarica la pagina e riprova.');
      console.error('[handleSubmit] BLOCKED: configOverlay.tierPricing missing — refuse to book to avoid underpricing');
      isSubmittingRef.current = false;
      setIsProcessing(false);
      return;
    }

    // Credit wallet requires login
    if (normalizedPaymentMethod === 'credit' && !user?.id) {
      clearTimeout(safetyTimer);
      setPaymentError('Devi effettuare il login per procedere.');
      isSubmittingRef.current = false;
      setIsProcessing(false);
      return;
    }

    // Check sufficient balance only for credit wallet payments
    // Note: DR7 Club subscription is NOT included in grandTotal — it's charged separately
    if (normalizedPaymentMethod === 'credit') {
      const hasBalance = await hasSufficientBalance(user.id, grandTotal);
      if (!hasBalance) {
        clearTimeout(safetyTimer);
        setPaymentError(`Credito insufficiente. Saldo attuale: €${creditBalance.toFixed(2)}, Richiesto: €${grandTotal.toFixed(2)}`);
        isSubmittingRef.current = false;
        setIsProcessing(false);
        return;
      }
    }

    if (normalizedPaymentMethod === 'credit') {
      try {
        // 0. Ensure vehicle ID and plate are resolved
        if (!formData.selectedVehicleId && item.vehicleIds?.length) {
          setFormData(prev => ({ ...prev, selectedVehicleId: item.vehicleIds![0] }));
          formData.selectedVehicleId = item.vehicleIds[0];
        }

        // 1. Prepare Documents (Upload if needed — non-blocking fallback)
        let licenseImageUrl = null;
        let idImageUrl = null;

        if (formData.licenseImage) {
          try { licenseImageUrl = await uploadToBucket('driver-licenses', user.id, formData.licenseImage, 'license'); }
          catch { licenseImageUrl = hasStoredDocs.licensePath || 'upload_pending'; }
        } else if (hasStoredDocs.licensePath) {
          licenseImageUrl = hasStoredDocs.licensePath;
        }

        if (formData.idImage) {
          try { idImageUrl = await uploadToBucket('carta-identita', user.id, formData.idImage, 'id'); }
          catch { idImageUrl = hasStoredDocs.idPath || 'upload_pending'; }
        } else if (hasStoredDocs.idPath) {
          idImageUrl = hasStoredDocs.idPath;
        }

        // 2. Prepare Payload (Replicating finalizeBooking logic)
        const pickupDateTime = createItalyDateTime(formData.pickupDate, formData.pickupTime);
        const dropoffDateTime = createItalyDateTime(formData.returnDate, formData.returnTime);
        const { days } = duration;

        const bookingPayload = {
          user_id: user.id,
          vehicle_type: item.type || 'car',
          vehicle_name: availableVehicleName || item.name,
          vehicle_image_url: item.image,
          pickup_date: pickupDateTime.toISOString(),
          dropoff_date: dropoffDateTime.toISOString(),
          pickup_location: formData.pickupLocation,
          dropoff_location: formData.returnLocation,
          delivery_address: formData.deliveryAddress || null,
          delivery_distance_km: deliveryInfo?.roundTripKm || null,
          delivery_fee: deliveryFee || null,
          price_total: eurosToCents(grandTotal),
          currency: currency.toUpperCase(),
          booking_source: 'website',
          customer_name: `${formData.firstName} ${formData.lastName}`,
          customer_email: formData.email,
          customer_phone: formData.phone,
          deposit_amount: getDeposit(),
          vehicle_id: formData.selectedVehicleId || item.vehicleIds?.[0] || item.id?.replace('car-', '') || null,
          vehicle_plate: (() => {
          const vid = formData.selectedVehicleId || item.vehicleIds?.[0] || '';
          if (!vid || !item.vehicleIds || !Array.isArray((item as any).plates)) return (item as any).plates?.[0] || null;
          const idx = item.vehicleIds.indexOf(vid);
          return idx >= 0 ? (item as any).plates[idx] || null : (item as any).plates?.[0] || null;
        })(),
          service_type: 'car_rental',
          booking_usage_zone: formData.usageZone || null,
          booking_details: {
            customer: {
              fullName: `${formData.firstName} ${formData.lastName}`,
              firstName: formData.firstName,
              lastName: formData.lastName,
              email: formData.email,
              phone: formData.phone,
              birthDate: formData.birthDate,
              age: driverAge,
              codiceFiscale: formData.codiceFiscale,
              residenza: formData.residenza,
              licenseNumber: formData.licenseNumber,
              licenseIssueDate: formData.licenseIssueDate,
              licenseYears: licenseYears,
              address: formData.address,
              },
            secondDriver: formData.addSecondDriver ? {
              fullName: `${formData.secondDriver.firstName} ${formData.secondDriver.lastName}`,
              firstName: formData.secondDriver.firstName,
              lastName: formData.secondDriver.lastName,
              email: formData.secondDriver.email,
              phone: formData.secondDriver.phone,
              birthDate: formData.secondDriver.birthDate,
              licenseNumber: formData.secondDriver.licenseNumber,
              licenseIssueDate: formData.secondDriver.licenseIssueDate,
              licenseExpiryDate: formData.secondDriver.licenseExpiryDate,
              countryOfIssue: formData.secondDriver.countryOfIssue,
            } : null,
            duration: `${days} days`,
            insuranceOption: formData.insuranceOption,
            insuranceLabel: (() => { const opts = getInsuranceForVehicle(getVehicleType(item, categoryContext), (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2'); return opts.find(o => o.id === formData.insuranceOption)?.name || formData.insuranceOption?.replace(/_/g, ' '); })(),
            extras: formData.extras,
            kmPackage: {
              type: (formData.kmPackageType === 'unlimited' || includedKm >= 9999) ? 'unlimited' : 'included',
              distance: (formData.kmPackageType === 'unlimited' || includedKm >= 9999) ? 'unlimited' : `${includedKm} km`,
              cost: kmPackageCost,
              includedKm: includedKm,
              isPremium: isPremiumVehicle(item.name)
            },
            depositOption: formData.depositOption,
            noDepositSurcharge: noDepositSurcharge,
            driver_tier: driverTier,
            insurance_cost: insuranceCost,
            second_driver_fee: secondDriverFee,
            lavaggio_fee: lavaggioFee,
            km_cost: kmPackageCost,
            experience_services: formData.selectedExperiences,
            experience_cost: experienceCost,
            dr7_flex: dr7FlexEffective,
            flex_cost: flexCost,
            driverLicenseImage: licenseImageUrl,
            driverIdImage: idImageUrl,
            ...(selectedUpsellWash || selectedUpsellExtras.length > 0 ? { washUpsell: {
              ...(selectedUpsellWash ? {
                serviceId: selectedUpsellWash.id,
                serviceName: selectedUpsellWash.name,
                originalPrice: selectedUpsellWash.price,
                discountedPrice: washUpsellCost,
              } : {}),
              discountPercent: 10,
              customerCarModel: upsellCarInput,
              carCategory: upsellCarCategory,
              washUpsellExtras: selectedUpsellExtras.map(svc => ({
                serviceId: svc.id, serviceName: svc.name,
                originalPrice: svc.price, discountedPrice: roundToTwoDecimals(svc.price * 0.90),
              })),
              totalCost: totalWashUpsellCost,
            }} : {}),
          }
        };

        // 3. Call Atomic RPC
        console.log("Starting credit booking RPC call...", { user: user.id, amount: Math.round(grandTotal * 100), vehicle: item.name });
        const { data, error } = await supabase.rpc('book_with_credits', {
          p_user_id: user.id,
          p_amount_cents: eurosToCents(grandTotal),
          p_vehicle_name: item.name,
          p_booking_payload: bookingPayload
        });
        console.log("RPC returned:", { data, error });

        if (error) {
          console.error("RPC Error:", error);
          setPaymentError(error.message);
          setIsProcessing(false);
          // Attempt Refund logic if needed? 
          // RPC handles rollback internally, so no manual refund needed!
          return;
        }

        if (data && data.success) {
          console.log("Booking successful! Payload:", data);
          // 4. Success Notifications
          // We need a 'full' booking object for the notification functions, similar to what 'insert' returns.
          // The RPC returns { success: true, booking_id: '...', new_balance: ... }
          // We can reconstruct the necessary fields or better yet, fetch the booking?
          // Fetching adds latency but ensures accuracy.
          // OR we just use the payload + id.

          const bookingData = {
            id: data.booking_id,
            created_at: new Date().toISOString(),
            ...bookingPayload,
            booking_details: bookingPayload.booking_details, // ensure accessible
            // Flat fields for notification scripts might be expected
            pickup_location: bookingPayload.pickup_location,
            vehicle_name: bookingPayload.vehicle_name,
            price_total: bookingPayload.price_total,
            pickup_date: bookingPayload.pickup_date,
            dropoff_date: bookingPayload.dropoff_date
          };

          // Construct the full booking object with the ID from RPC
          const finalBookingData = {
            ...bookingPayload,
            id: data.booking_id, // Important: Use ID from RPC response
            created_at: new Date().toISOString(),
            status: 'confirmed',
            payment_status: 'succeeded'
          };

          console.log("Calling onBookingComplete...", finalBookingData);

          // Upsert customer into customers_extended (find by user_id, don't duplicate)
          if (user?.id) {
            supabase.from('customers_extended')
              .select('id')
              .eq('user_id', user.id)
              .maybeSingle()
              .then(({ data: existing }) => {
                const customerRecord: Record<string, any> = {
                  nome: formData.firstName,
                  cognome: formData.lastName,
                  email: formData.email,
                  telefono: formData.phone,
                  codice_fiscale: formData.codiceFiscale,
                  indirizzo: formData.residenza,
                  tipo_cliente: 'persona_fisica',
                  source: 'website_booking',
                };
                if (formData.birthDate) customerRecord.data_nascita = formData.birthDate;
                if (formData.sesso) customerRecord.sesso = formData.sesso;
                if (formData.luogoNascita) customerRecord.luogo_nascita = formData.luogoNascita;
                if (formData.provinciaNascita) customerRecord.provincia_nascita = formData.provinciaNascita;

                if (existing?.id) {
                  supabase.from('customers_extended').update(customerRecord).eq('id', existing.id)
                    .then(() => console.log('[credit-booking] customers_extended updated'))
                    .catch(e => console.error('[credit-booking] customers_extended update error:', e));
                } else {
                  supabase.from('customers_extended').insert({ ...customerRecord, user_id: user.id })
                    .then(() => console.log('[credit-booking] customers_extended created'))
                    .catch(e => console.error('[credit-booking] customers_extended insert error:', e));
                }
              }).catch(e => console.error('[credit-booking] customers_extended lookup error:', e));
          }

          // Sync cauzione record so the deposit lands in Cauzioni → Da
          // Incassare. Wallet bookings still need a cauzione tracked for
          // the return-of-vehicle flow even though the rental itself
          // was paid from credits.
          const walletDeposit = Number(bookingPayload.deposit_amount || 0);
          if (walletDeposit > 0) {
            fetch(`${FUNCTIONS_BASE}/.netlify/functions/sync-booking-cauzione`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bookingId: data.booking_id,
                customerId: bookingPayload.user_id,
                vehicleId: bookingPayload.vehicle_id,
                returnDate: bookingPayload.dropoff_date,
                depositAmount: walletDeposit,
                paymentMethod: 'credit_wallet',
                depositPaid: false,
                depositStatus: 'da_incassare',
              }),
            }).catch(e => console.error('[credit-booking] Cauzione sync error:', e));
          }

          // Fire-and-forget notifications (no abort signal — page may navigate away)
          fetch(`${FUNCTIONS_BASE}/.netlify/functions/send-booking-confirmation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking: finalBookingData }),
          }).catch(e => console.error('Email error', e));

          fetch(`${FUNCTIONS_BASE}/.netlify/functions/send-whatsapp-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking: finalBookingData }),
          }).catch(e => console.error('WhatsApp admin error', e));

          const custPhone = formData.phone?.replace(/[\s\-\+()]/g, '') || '';
          if (custPhone) {
            fetch(`${FUNCTIONS_BASE}/.netlify/functions/send-whatsapp-notification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ booking: finalBookingData, customPhone: custPhone }),
            }).catch(e => console.error('WhatsApp customer error', e));
          }

          fetch('https://platform.dr7ai.com/.netlify/functions/post-booking-webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId: data.booking_id }),
          }).then(res => res.ok ? console.log('[credit-booking] Webhook OK') : console.error('[credit-booking] Webhook failed:', res.status))
            .catch(e => console.error('[credit-booking] Webhook error:', e));

          // NB: no cashback on wallet-credit bookings — cashback is card-only.

          // DR7 Club subscription — activate + send payment link
          const hasClubSub = formData.extras.some(e => e.startsWith('subscription_'));
          if (hasClubSub && user?.id) {
            const isAnnual = formData.extras.includes('subscription_annual');
            const clubPrice = isAnnual ? 39 : 4.90;
            const clubLabel = isAnnual ? 'DR7 Club Annuale' : 'DR7 Club Mensile';
            const expiresAt = new Date();
            if (isAnnual) expiresAt.setFullYear(expiresAt.getFullYear() + 1);
            else expiresAt.setMonth(expiresAt.getMonth() + 1);
            try {
              // Activate subscription
              await supabase.from('dr7_club_subscriptions').insert({
                user_id: user.id, plan: isAnnual ? 'annual' : 'monthly',
                status: 'active', price: clubPrice,
                started_at: new Date().toISOString(), expires_at: expiresAt.toISOString(),
              });
              // Signup bonus €10
              const { addCredits } = await import('../../utils/creditWallet');
              await addCredits(user.id, 10, 'DR7 Club — Bonus iscrizione €10', data.booking_id, 'club_signup_bonus');
              // Send Nexi payment link for the Club fee
              await fetch('https://platform.dr7ai.com/.netlify/functions/nexi-pay-by-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  amount: clubPrice,
                  description: `${clubLabel} — ${formData.firstName} ${formData.lastName}`,
                  customerEmail: user.email || formData.email,
                  expirationHours: 48,
                }),
              });
              console.log(`[DR7 Club] Activated + Nexi link sent for ${user.email}`);
            } catch (clubErr) {
              console.error('[DR7 Club] Activation error (non-blocking):', clubErr);
            }
          }

          // Mark birthday discount code as used
          if (appliedDiscount) {
            try {
              await markDiscountCodeAsUsed(data.booking_id);
            } catch (discountErr) {
              console.error('Failed to mark discount code as used:', discountErr);
            }
          }

          // FIX 2: Invalidate vehicle cache after successful booking
          invalidateVehicleCache();
          // Completed - Pass the full object with ID so UI can redirect
          onBookingComplete(finalBookingData);

          // WhatsApp Customer Message
          const bookingId = data.booking_id.substring(0, 8).toUpperCase();
          const customerName = `${formData.firstName} ${formData.lastName}`;
          const customerPhone = formData.phone;
          const totalPrice = grandTotal.toFixed(2);

          const whatsappMessage = `Ciao! Ho appena completato una prenotazione con Credito DR7.\n\n` +
            `*Dettagli Prenotazione*\n` +
            `*ID:* DR7-${bookingId}\n` +
            `*Nome:* ${customerName}\n` +
            `*Telefono:* ${customerPhone}\n` +
            `*Veicolo:* ${item.name}\n` +
            `*Ritiro:* ${formData.pickupDate} ${formData.pickupTime}\n` +
            (selectedUpsellWash ? `*Lavaggio Auto:* ${selectedUpsellWash.name} (€${washUpsellCost.toFixed(2)}) - ${upsellCarInput}\n` : '') +
          (selectedUpsellExtras.length > 0 ? `*Servizi Aggiuntivi:* ${selectedUpsellExtras.map(s => `${s.name} (€${roundToTwoDecimals(s.price * 0.90).toFixed(2)})`).join(', ')}\n` : '') +
            `*Totale:* €${totalPrice}\n\n` +
            `Grazie!`;

          // WhatsApp sent automatically via Netlify functions — no manual window needed

          // CRITICAL: Reset processing state after successful booking
          console.log("Resetting processing state to false");
          setIsProcessing(false);
        } else {
          // RPC returned but success was not true
          console.warn("RPC returned success: false", data);
          setPaymentError(data?.message || "Prenotazione fallita. Riprova o contatta il supporto.");
          setIsProcessing(false);
        }

      } catch (err: any) {
        console.error("Catch Error during booking:", err);
        setPaymentError(err.message || "Errore sconosciuto durante la prenotazione.");
        setIsProcessing(false);
      }
    } else if (normalizedPaymentMethod === 'nexi') {
      setPaymentError(null);
      setIsProcessing(true);

      try {
        // user.id is preferred but not strictly required for Nexi (booking data has customer info)

        // 1. Prepare standardized booking payload
        const { days } = duration;

        // Ensure dates are parsed as Italy/Europe time
        const pickupDateTime = createItalyDateTime(formData.pickupDate, formData.pickupTime);
        const dropoffDateTime = createItalyDateTime(formData.returnDate, formData.returnTime);

        // 2026-05-17 BIG BUG FIX: prima il ramo Nexi NON faceva il re-check
        // di disponibilita' immediatamente prima dell'insert (a differenza
        // del ramo Credit Wallet / finalizeBooking). Risultato: il cliente
        // che pagava con carta poteva prenotare un'auto gia' presa, anche
        // se la check del wizard l'aveva marcata non disponibile.
        // Replichiamo qui lo stesso gate failed-CLOSED del finalizeBooking.
        try {
          const pickupDT = pickupDateTime.toISOString();
          const dropoffDT = dropoffDateTime.toISOString();
          const specificId = formData.selectedVehicleId || item.id.replace('car-', '');
          const preNexiConflicts = await checkVehicleAvailability(item.name, pickupDT, dropoffDT, specificId);
          if (preNexiConflicts.length > 0) {
            const first = preNexiConflicts[0] as { _checkFailed?: boolean; availableFrom?: string; _availableFrom?: string }
            if (first?._checkFailed) {
              setPaymentError('Impossibile verificare la disponibilità in questo momento. Riprova fra qualche secondo.')
              setIsProcessing(false)
              return
            }
            const availFrom = first?.availableFrom || first?._availableFrom
            if (availFrom) {
              const availTime = new Date(availFrom).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Rome' })
              setPaymentError(`Il veicolo non è disponibile a quest'orario. Disponibile dalle ${availTime}.`)
            } else {
              setPaymentError('Il veicolo è stato appena prenotato da un altro utente. Seleziona date diverse.')
            }
            setIsProcessing(false)
            return
          }
        } catch (e) {
          console.warn('[Nexi flow] Pre-insert availability re-check failed:', e)
          setPaymentError('Impossibile verificare la disponibilità. Riprova fra qualche secondo.')
          setIsProcessing(false)
          return
        }

        // Upload documents if needed (reusing logic from standard flow if separated, 
        // but here we might need to duplicate or extract upload logic. 
        // For safety, let's assume images are already uploaded or we call a helper.
        // Actually, the main handleBooking function logic above handles uploads.
        // But wait, the original code had `finalizeBooking` separate from `handleBooking`?
        // No, `handleBooking` called `stripe.confirmCardPayment` then `finalizeBooking`.
        // We need to SAVE the booking as 'pending' first, then redirect.

        // Let's implement the "Save Pending Record" pattern directly here.

        // 1a. Upload Images (non-blocking fallback if upload fails)
        let licenseImageUrl = null;
        let idImageUrl = null;
        const userId = user?.id || 'guest';
        if (formData.licenseImage) {
          try { licenseImageUrl = await uploadToBucket('driver-licenses', userId, formData.licenseImage, 'license'); }
          catch { licenseImageUrl = hasStoredDocs.licensePath || 'upload_pending'; }
        } else if (hasStoredDocs.licensePath) {
          licenseImageUrl = hasStoredDocs.licensePath;
        }
        if (formData.idImage) {
          try { idImageUrl = await uploadToBucket('carta-identita', userId, formData.idImage, 'id'); }
          catch { idImageUrl = hasStoredDocs.idPath || 'upload_pending'; }
        } else if (hasStoredDocs.idPath) {
          idImageUrl = hasStoredDocs.idPath;
        }

        const vehicleName = availableVehicleName || item.name;

        // 2. Generate Nexi Order ID BEFORE insert
        const nexiOrderId = `DR7${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        // 3. Resolve customer data with fallback to user object
        const nFirstName = formData.firstName || (user?.fullName?.split(' ')[0]) || '';
        const nLastName = formData.lastName || (user?.fullName?.split(' ').slice(1).join(' ')) || '';
        const nFullName = `${nFirstName} ${nLastName}`.trim() || user?.fullName || 'Cliente';
        const nEmail = formData.email || user?.email || '';
        const nPhone = formData.phone || (user as any)?.phone || '';

        // 4. Insert Pending Booking (only confirmed columns + extras in booking_details JSONB)
        const bookingData: Record<string, any> = {
          user_id: user?.id || null,
          vehicle_type: item.type || 'car',
          vehicle_name: vehicleName,
          pickup_date: pickupDateTime.toISOString(),
          dropoff_date: dropoffDateTime.toISOString(),
          pickup_location: formData.pickupLocation,
          dropoff_location: formData.returnLocation,
          delivery_address: formData.deliveryAddress || null,
          delivery_distance_km: deliveryInfo?.roundTripKm || null,
          delivery_fee: deliveryFee || null,
          price_total: eurosToCents(grandTotal), // Store in cents
          currency: 'EUR',
          status: 'pending',
          payment_status: 'pending',
          payment_method: 'nexi',
          booked_at: new Date().toISOString(),
          vehicle_id: formData.selectedVehicleId || null,
          vehicle_plate: (() => {
          if (!formData.selectedVehicleId || !item.vehicleIds || !Array.isArray((item as any).plates)) return null;
          const idx = item.vehicleIds.indexOf(formData.selectedVehicleId);
          return idx >= 0 ? (item as any).plates[idx] || null : null;
        })(),
          customer_name: nFullName,
          customer_email: nEmail,
          customer_phone: nPhone,
          booking_details: {
            nexi_order_id: nexiOrderId,
            vehicle_image_url: item.image,
            vehicle_id: formData.selectedVehicleId || null,
            vehicle_plate: (() => {
          if (!formData.selectedVehicleId || !item.vehicleIds || !Array.isArray((item as any).plates)) return null;
          const idx = item.vehicleIds.indexOf(formData.selectedVehicleId);
          return idx >= 0 ? (item as any).plates[idx] || null : null;
        })(),
            // insurance_option stored in booking_details.insuranceOption (not a top-level column)
            deposit_amount: getDeposit(),
            booking_usage_zone: formData.usageZone || null,
            customer: {
              fullName: nFullName,
              firstName: nFirstName,
              lastName: nLastName,
              email: nEmail,
              phone: nPhone,
              birthDate: formData.birthDate,
              age: driverAge,
              codiceFiscale: formData.codiceFiscale,
              residenza: formData.residenza,
              licenseNumber: formData.licenseNumber,
              licenseIssueDate: formData.licenseIssueDate,
              licenseYears: licenseYears,
              address: formData.address,
              },
            secondDriver: formData.addSecondDriver ? {
              fullName: `${formData.secondDriver.firstName} ${formData.secondDriver.lastName}`,
              firstName: formData.secondDriver.firstName,
              lastName: formData.secondDriver.lastName,
              email: formData.secondDriver.email,
              phone: formData.secondDriver.phone,
              birthDate: formData.secondDriver.birthDate,
              licenseNumber: formData.secondDriver.licenseNumber,
              licenseIssueDate: formData.secondDriver.licenseIssueDate,
              licenseExpiryDate: formData.secondDriver.licenseExpiryDate,
              countryOfIssue: formData.secondDriver.countryOfIssue,
            } : null,
            duration: `${days} days`,
            insuranceOption: formData.insuranceOption,
            insuranceLabel: (() => { const opts = getInsuranceForVehicle(getVehicleType(item, categoryContext), (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2'); return opts.find(o => o.id === formData.insuranceOption)?.name || formData.insuranceOption?.replace(/_/g, ' '); })(),
            extras: formData.extras,
            kmPackage: {
              type: (formData.kmPackageType === 'unlimited' || includedKm >= 9999) ? 'unlimited' : recommendedKm.type,
              distance: (formData.kmPackageType === 'unlimited' || includedKm >= 9999) ? 'unlimited' : recommendedKm.value || `${includedKm} km`,
              cost: kmPackageCost,
              includedKm: includedKm,
              isPremium: isPremiumVehicle(item.name)
            },
            depositOption: formData.depositOption,
            noDepositSurcharge: noDepositSurcharge,
            driver_tier: driverTier,
            insurance_cost: insuranceCost,
            second_driver_fee: secondDriverFee,
            lavaggio_fee: lavaggioFee,
            km_cost: kmPackageCost,
            experience_services: formData.selectedExperiences,
            experience_cost: experienceCost,
            dr7_flex: dr7FlexEffective,
            flex_cost: flexCost,
            driverLicenseImage: licenseImageUrl,
            driverIdImage: idImageUrl,
            ...(selectedUpsellWash || selectedUpsellExtras.length > 0 ? { washUpsell: {
              ...(selectedUpsellWash ? {
                serviceId: selectedUpsellWash.id,
                serviceName: selectedUpsellWash.name,
                originalPrice: selectedUpsellWash.price,
                discountedPrice: washUpsellCost,
              } : {}),
              discountPercent: 10,
              customerCarModel: upsellCarInput,
              carCategory: upsellCarCategory,
              washUpsellExtras: selectedUpsellExtras.map(svc => ({
                serviceId: svc.id, serviceName: svc.name,
                originalPrice: svc.price, discountedPrice: roundToTwoDecimals(svc.price * 0.90),
              })),
              totalCost: totalWashUpsellCost,
            }} : {}),
          }
        };

        console.log("Booking amount:", { nexiOrderId, amount: bookingData.price_total });

        // CHECK: If discount covers full amount (€0 total), skip Nexi and book directly
        if (Math.round(grandTotal * 100) <= 0) {
          console.log("Zero-total booking: discount covers full amount, skipping Nexi payment");

          // Insert directly into bookings table (no payment needed)
          bookingData.status = 'confirmed';
          bookingData.payment_status = 'succeeded';
          bookingData.payment_method = 'discount_code';
          bookingData.vehicle_image_url = item.image;
          bookingData.vehicle_id = formData.selectedVehicleId || null;
          bookingData.deposit_amount = getDeposit();
          // insurance_option is in booking_details.insuranceOption, not a top-level column
          bookingData.booking_usage_zone = formData.usageZone || null;

          const { data: insertedBooking, error: insertError } = await supabase
            .from('bookings')
            .insert(bookingData)
            .select()
            .single();

          if (insertError) {
            console.error("Booking INSERT failed:", insertError);
            throw new Error(`Errore salvataggio prenotazione: ${insertError.message}`);
          }

          console.log("Zero-total booking created:", insertedBooking.id);

          // Send email confirmation
          fetchWithTimeout(`${FUNCTIONS_BASE}/.netlify/functions/send-booking-confirmation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking: insertedBooking }),
          }).catch(e => console.error('Email error', e));

          // Send WhatsApp admin notification
          fetchWithTimeout(`${FUNCTIONS_BASE}/.netlify/functions/send-whatsapp-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking: insertedBooking }),
          }).catch(e => console.error('WhatsApp error', e));

          // Mark discount code as used
          if (appliedDiscount) {
            try {
              await markDiscountCodeAsUsed(insertedBooking.id);
            } catch (discountErr) {
              console.error('Failed to mark discount code as used:', discountErr);
            }
          }

          // Redeem discount code
          if (appliedDiscount?.code) {
            (async () => {
              const { data: { session } } = await supabase.auth.getSession();
              const headers: Record<string, string> = { 'Content-Type': 'application/json' };
              if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
              fetch('/.netlify/functions/redeem-discount-code', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  code: appliedDiscount.code,
                  bookingId: insertedBooking.id,
                  customerName: nFullName,
                  serviceType: categoryContext === 'cars' ? 'supercar'
                    : categoryContext === 'urban-cars' ? 'utilitarie'
                    : categoryContext === 'corporate-fleet' ? 'aziendali'
                    : 'noleggio',
                  discountApplied: Math.round(discountAmount * 100),
                })
              }).catch(e => console.error('Redeem discount error', e));
            })();
          }

          // FIX 2: Invalidate vehicle cache after successful booking
          invalidateVehicleCache();

          onBookingComplete(insertedBooking);

          // WhatsApp customer message
          const bookingId = insertedBooking.id.substring(0, 8).toUpperCase();
          const whatsappMessage = `Ciao! Ho appena completato una prenotazione con codice sconto.\n\n` +
            `*Dettagli Prenotazione*\n` +
            `*ID:* DR7-${bookingId}\n` +
            `*Nome:* ${nFullName}\n` +
            `*Telefono:* ${nPhone}\n` +
            `*Veicolo:* ${vehicleName}\n` +
            `*Ritiro:* ${formData.pickupDate} ${formData.pickupTime}\n` +
            (selectedUpsellWash ? `*Lavaggio Auto:* ${selectedUpsellWash.name} (€${washUpsellCost.toFixed(2)}) - ${upsellCarInput}\n` : '') +
          (selectedUpsellExtras.length > 0 ? `*Servizi Aggiuntivi:* ${selectedUpsellExtras.map(s => `${s.name} (€${roundToTwoDecimals(s.price * 0.90).toFixed(2)})`).join(', ')}\n` : '') +
            `*Totale:* €0.00 (coperto da codice sconto)\n\n` +
            `Grazie!`;
          // WhatsApp sent automatically via Netlify functions — no manual window needed

          isSubmittingRef.current = false;
          setIsProcessing(false);
          return;
        }

        // Normal Nexi flow: amount > 0
        // 3. Insert booking immediately into bookings table as pending/unpaid
        //    This blocks the calendar slot so no one else can book the same car
        bookingData.status = 'pending';
        bookingData.payment_status = 'unpaid';
        bookingData.vehicle_image_url = item.image;
        bookingData.vehicle_id = formData.selectedVehicleId || null;
        bookingData.deposit_amount = getDeposit();
        // insurance_option is in booking_details.insuranceOption, not a top-level column
        bookingData.booking_usage_zone = formData.usageZone || null;
        bookingData.booking_details = {
          ...bookingData.booking_details,
          nexi_order_id: nexiOrderId,
          payment_link_created_at: new Date().toISOString(),
          payment_link_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        };

        const { data: insertedPendingBooking, error: bookingInsertError } = await supabase
          .from('bookings')
          .insert(bookingData)
          .select()
          .single();

        if (bookingInsertError) {
          console.error("Booking INSERT failed:", bookingInsertError);
          throw new Error(`Errore salvataggio prenotazione: ${bookingInsertError.message}`);
        }

        console.log("Pending booking created in bookings table:", insertedPendingBooking.id);

        // Also store in pending_nexi_bookings as backup for PaymentSuccessPage fallback
        await supabase
          .from('pending_nexi_bookings')
          .insert({
            nexi_order_id: nexiOrderId,
            booking_data: { ...bookingData, booking_id: insertedPendingBooking.id }
          }).catch(e => console.warn("pending_nexi_bookings backup insert failed:", e));

        // 4. Validate amount before calling Nexi
        const amountCents = eurosToCents(grandTotal);
        if (!amountCents || isNaN(amountCents) || amountCents <= 0) {
          console.error('Invalid payment amount:', { grandTotal, amountCents });
          throw new Error("Importo non valido per il pagamento. Controlla i dati della prenotazione.");
        }

        // 5. Initiate Nexi Payment
        const nexiResponse = await fetch('/.netlify/functions/create-nexi-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: nexiOrderId,
            amount: amountCents,
            currency: 'EUR',
            description: `Noleggio ${vehicleName} - ${days} giorni`,
            customerEmail: nEmail,
            customerName: nFullName
          })
        });

        const nexiData = await nexiResponse.json();

        if (!nexiResponse.ok) {
          throw new Error(nexiData.error || "Errore durante l'inizializzazione del pagamento");
        }

        if (!nexiData.paymentUrl) {
          throw new Error("URL di pagamento non ricevuto da Nexi");
        }

        // 5. Store orderId in sessionStorage as fallback for PaymentSuccessPage
        try {
          sessionStorage.setItem('dr7_pending_order', nexiOrderId);
          sessionStorage.setItem('dr7_pending_type', 'booking');
        } catch (e) { /* sessionStorage may be unavailable */ }

        // 6. Redirect to Nexi HPP
        console.log("Redirecting to Nexi:", nexiData.paymentUrl);
        window.location.href = nexiData.paymentUrl;

      } catch (err: any) {
        console.error("Booking Error:", err.message || err, { code: err?.code, details: err?.details, hint: err?.hint });
        setPaymentError(err.message || "Si è verificato un errore durante la prenotazione.");
        isSubmittingRef.current = false;
        setIsProcessing(false);
      }
    } else {
      // Fallback: should never reach here after normalization, but guard against it explicitly
      console.error('[handleSubmit] Ramo non raggiungibile — paymentMethod:', rawPaymentMethod, 'normalized:', normalizedPaymentMethod);
      clearTimeout(safetyTimer);
      setPaymentError('Metodo di pagamento non riconosciuto. Ricarica la pagina e riprova.');
      isSubmittingRef.current = false;
      setIsProcessing(false);
    }

    } catch (outerErr: any) {
      // Catch-all safety net for any unhandled errors
      console.error("Unhandled booking error:", outerErr);
      setPaymentError("Errore imprevisto. Riprova.");
      isSubmittingRef.current = false;
      setIsProcessing(false);
    } finally {
      clearTimeout(safetyTimer);
    }
  };

  const handleNext = () => {
    if (!validateStep()) return;

    // Show wash upsell modal on Step 3 → 4 transition
    if (step === 3) {
      setShowWashUpsell(true);
      return;
    }

    setStep(s => s + 1);
  };

  const handleWashUpsellAccept = () => {
    setShowWashUpsell(false);
    setShowSubscriptionUpsell(true);
  };

  const handleWashUpsellDecline = () => {
    setSelectedUpsellWash(null);
    setSelectedUpsellExtras([]);
    setUpsellCarInput('');
    setUpsellCarCategory(null);
    setUpsellCarModel(null);
    setUpsellTargaInput('');
    setUpsellTargaError(null);
    setUpsellTargaResult(null);
    setUpsellTargaLoading(false);
    setUpsellTargaManualCategory(null);
    setShowWashUpsell(false);
    setShowSubscriptionUpsell(true);
  };

  const handleSubscriptionAccept = () => {
    setShowSubscriptionUpsell(false);
    if (selectedSubscription) {
      const subExtra = selectedSubscription === 'monthly' ? 'subscription_monthly' : 'subscription_annual';
      setFormData(prev => ({
        ...prev,
        extras: [...prev.extras.filter(e => !e.startsWith('subscription_')), subExtra]
      }));
    }
    setStep(4);
  };

  const handleSubscriptionDecline = () => {
    setShowSubscriptionUpsell(false);
    setSelectedSubscription(null);
    setFormData(prev => ({
      ...prev,
      extras: prev.extras.filter(e => !e.startsWith('subscription_'))
    }));
    setStep(4);
  };

  const handleUpsellTargaSearch = async () => {
    const plate = normalizePlate(upsellTargaInput);
    if (!isValidItalianPlate(plate)) {
      setUpsellTargaError('Targa non valida. Inserisci una targa italiana (es. EX117YA).');
      return;
    }
    setUpsellTargaLoading(true);
    setUpsellTargaError(null);
    setUpsellTargaResult(null);
    setUpsellTargaManualCategory(null);
    setUpsellCarCategory(null);
    setUpsellCarModel(null);
    setSelectedUpsellWash(null);
    try {
      const result = await lookupTarga(plate);
      setUpsellTargaResult(result);
      const makeModel = `${result.carMake} ${result.carModel}`.trim();
      setUpsellCarInput(makeModel);
      const washClass = classifyWashVehicle({
        brand: result.carMake,
        model: result.carModel,
        version: result.version || result.description,
        bodyType: result.bodyType,
      });
      setUpsellCarCategory(washClass.toLowerCase() as 'urban' | 'maxi');
      setUpsellCarModel(makeModel || null);
    } catch (err: any) {
      setUpsellTargaError(err.message || 'Errore nella ricerca.');
    } finally {
      setUpsellTargaLoading(false);
    }
  };

  const handleBack = () => setStep(s => s - 1);

  const steps = [
    { id: 1, name: t('STEP 1: Date e Località') },
    { id: 2, name: t('STEP 2: Informazioni Conducente') },
    { id: 3, name: t('STEP 3: Opzioni e Assicurazioni') },
    { id: 4, name: t('STEP 4: Pagamento e Conferma') }
  ];

  const renderStepContent = () => {
    // Insurance is now automatic (KASKO included) - no selection UI needed


    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            {/* Car Image Preview */}
            <div className="mb-6">
              <img
                src={item.image}
                alt={item.name}
                className="w-full h-48 object-contain rounded-lg border border-gray-700 bg-gray-800/30"
              />
              <h2 className="text-2xl font-bold text-white mt-3">{item.name}</h2>
              {/* Prezzo base nascosto */}
            </div>

            {/* Tariffa warning — show when return time is 30+ min after default (pickupTime - 1h30) */}
            {(() => {
              if (!formData.pickupTime || !formData.returnTime) return null;
              const [pH, pM] = formData.pickupTime.split(':').map(Number);
              const [rH, rM] = formData.returnTime.split(':').map(Number);
              const defaultReturnMin = pH * 60 + pM - 90; // pickupTime - 1h30
              const returnMin = rH * 60 + rM;
              if (returnMin >= defaultReturnMin + 30) return (
                <div className="p-3 bg-red-900/30 border border-red-500 rounded-lg">
                  <p className="text-red-300 font-semibold text-sm">La tariffa può subire variazioni</p>
                  <p className="text-red-300/80 text-xs mt-1">La restituzione del veicolo è prevista entro 1 ora e 30 minuti prima dell'orario di uscita, al fine di evitare eventuali variazioni.</p>
                </div>
              );
              return null;
            })()}

            {isFromSearch ? (
              /* Read-only summary when coming from Prenota Ora search */
              <div className="p-4 rounded-lg border border-gray-700 bg-gray-800/30 space-y-2">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Riepilogo Prenotazione</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 block text-xs">Ritiro</span>
                    <span className="text-white">{new Date(formData.pickupDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' })}</span>
                    <span className="text-gray-400 ml-1">{formData.pickupTime}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Restituzione</span>
                    <span className="text-white">{new Date(formData.returnDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' })}</span>
                    <span className="text-gray-400 ml-1">{formData.returnTime}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500 block text-xs">Luogo</span>
                    <span className="text-white">{
                      pickupLocs.find(l => l.id === formData.pickupLocation)?.label?.it
                      || (formData.pickupLocation === 'dr7-cagliari' ? 'DR7 Cagliari — Viale Marconi 229, 09131' : null)
                      || new URLSearchParams(window.location.search).get('pickupLocLabel')
                      || formData.pickupLocation
                    }</span>
                  </div>
                </div>
              </div>
            ) : (
            <>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">LOCATION SELECTION</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 font-semibold mb-2 block">Luogo di ritiro *</label>
                  {pickupLocs.map(loc => (
                    <div key={loc.id} className="flex items-start mt-2 p-2 rounded hover:bg-gray-800/30 transition-colors">
                      <input type="radio" id={`pickup-${loc.id}`} name="pickupLocation" value={loc.id} checked={formData.pickupLocation === loc.id} onChange={handleChange} className="w-4 h-4 mt-1 text-white bg-gray-700 border-gray-600 focus:ring-white" />
                      <label htmlFor={`pickup-${loc.id}`} className="ml-2 text-white flex-1">
                        {getTranslated(loc.label)}
                      </label>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-sm text-gray-400 font-semibold mb-2 block">Luogo di riconsegna *</label>
                  {returnLocs.map(loc => (
                    <div key={loc.id} className="flex items-start mt-2 p-2 rounded hover:bg-gray-800/30 transition-colors">
                      <input type="radio" id={`return-${loc.id}`} name="returnLocation" value={loc.id} checked={formData.returnLocation === loc.id} onChange={handleChange} className="w-4 h-4 mt-1 text-white bg-gray-700 border-gray-600 focus:ring-white" />
                      <label htmlFor={`return-${loc.id}`} className="ml-2 text-white flex-1">
                        {getTranslated(loc.label)}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery address — PICKUP domicilio */}
              {formData.pickupLocation === 'home_delivery' && (
                <div className="mt-4 p-4 rounded-lg border border-gray-700 bg-gray-800/40">
                  <label className="text-sm text-white font-semibold mb-3 block">Indirizzo consegna veicolo *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <input type="text" placeholder="Via *" value={formData.deliveryPickupVia || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryPickupVia: e.target.value }))} className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-white focus:outline-none" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <input type="text" placeholder="N. civico *" value={formData.deliveryPickupNumero || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryPickupNumero: e.target.value }))} className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-white focus:outline-none" />
                    </div>
                    <input type="text" placeholder="CAP *" value={formData.deliveryPickupCap || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryPickupCap: e.target.value }))} className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-white focus:outline-none" />
                    <input type="text" placeholder="Città *" value={formData.deliveryPickupCitta || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryPickupCitta: e.target.value }))} className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-white focus:outline-none" />
                    <input type="text" placeholder="Provincia *" value={formData.deliveryPickupProvincia || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryPickupProvincia: e.target.value }))} className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-white focus:outline-none" />
                    <div>
                      <input type="number" min="1" placeholder="Km dalla sede *" value={formData.deliveryPickupKm || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryPickupKm: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-white focus:outline-none" />
                    </div>
                  </div>
                  {formData.deliveryPickupKm > 0 && (
                    <p className="text-sm text-white mt-3 font-semibold">
                      Costo consegna: {formData.deliveryPickupKm} km × €{ACTIVE_DELIVERY_PRICE_PER_KM} = €{(formData.deliveryPickupKm * ACTIVE_DELIVERY_PRICE_PER_KM).toFixed(2)}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">La distanza sarà verificata da DR7. In caso di discrepanza, verrà applicata la distanza reale.</p>
                </div>
              )}

              {/* Delivery address — RETURN domicilio */}
              {formData.returnLocation === 'home_delivery' && (
                <div className="mt-4 p-4 rounded-lg border border-gray-700 bg-gray-800/40">
                  <label className="text-sm text-white font-semibold mb-3 block">Indirizzo ritiro/riconsegna veicolo *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <input type="text" placeholder="Via *" value={formData.deliveryReturnVia || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryReturnVia: e.target.value }))} className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-white focus:outline-none" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <input type="text" placeholder="N. civico *" value={formData.deliveryReturnNumero || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryReturnNumero: e.target.value }))} className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-white focus:outline-none" />
                    </div>
                    <input type="text" placeholder="CAP *" value={formData.deliveryReturnCap || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryReturnCap: e.target.value }))} className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-white focus:outline-none" />
                    <input type="text" placeholder="Città *" value={formData.deliveryReturnCitta || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryReturnCitta: e.target.value }))} className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-white focus:outline-none" />
                    <input type="text" placeholder="Provincia *" value={formData.deliveryReturnProvincia || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryReturnProvincia: e.target.value }))} className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-white focus:outline-none" />
                    <div>
                      <input type="number" min="1" placeholder="Km dalla sede *" value={formData.deliveryReturnKm || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryReturnKm: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-white focus:outline-none" />
                    </div>
                  </div>
                  {formData.deliveryReturnKm > 0 && (
                    <p className="text-sm text-white mt-3 font-semibold">
                      Costo riconsegna: {formData.deliveryReturnKm} km × €{ACTIVE_DELIVERY_PRICE_PER_KM} = €{(formData.deliveryReturnKm * ACTIVE_DELIVERY_PRICE_PER_KM).toFixed(2)}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">La distanza sarà verificata da DR7. In caso di discrepanza, verrà applicata la distanza reale.</p>
                </div>
              )}

              {/* Legacy delivery info removed — replaced by structured address fields above */}
            </div>


            {/* Utilitarie deadline - calendar max date handles blocking, no message needed */}

            {/* Availability is handled directly by date picker validation — no separate box needed */}

            <div>
              <h3 className="text-lg font-semibold text-white mb-4">DATE AND TIME SELECTION</h3>
              <div className="space-y-4">
                {/* Pickup Date & Time */}
                <div className="p-4 rounded-lg border border-gray-700 bg-gray-800/30">
                  <h4 className="text-white font-semibold mb-3 flex items-center">
                    <span className="mr-2"></span> Ritiro del veicolo
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Data di ritiro *
                        {formData.pickupDate && (
                          <span className="ml-2 text-xs text-green-400">Selezionata</span>
                        )}
                      </label>
                      <input
                        type="date"
                        name="pickupDate"
                        value={formData.pickupDate}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (!value) return;

                          // Block Sundays & holidays — use local-time helper to avoid UTC-shift bugs
                          if (getDayOfWeek(value) === 0 || isHoliday(value)) {
                            setErrors(prev => ({ ...prev, pickupDate: 'Data non disponibile (domenica o festivo). Seleziona un altro giorno.' }));
                            return;
                          }
                          setErrors(prev => { const next = { ...prev }; delete next.pickupDate; return next; });

                          // Block urban/corporate vehicles after March 25
                          if (isUtilitaria && value > UTILITARIE_MAX_DATE) {
                            setShowMaxDatePopup(true);
                            return;
                          }

                          // Auto-Clear Return Date if Pickup > Return or invalid
                          // Reset return date if same day or before pickup (minimum 1 day rental)
                          const newPickup = value;
                          const currentReturn = formData.returnDate;

                          if (currentReturn && newPickup >= currentReturn) {
                            // Add 1 day via string math (avoids UTC-parse drift)
                            const [yStr, mStr, dStr] = value.split('-').map(Number);
                            const tmp = new Date(yStr, mStr - 1, dStr + 1);
                            const nextDayStr = `${tmp.getFullYear()}-${String(tmp.getMonth() + 1).padStart(2, '0')}-${String(tmp.getDate()).padStart(2, '0')}`;
                            setFormData(prev => ({ ...prev, pickupDate: value, returnDate: nextDayStr, returnTime: prev.returnTime || '09:00' }));
                          } else {
                            // Just update pickup
                            handleChange(e);
                          }
                        }}
                        // FIX: Ensure min date is never in the past, even if availability says so (which we fixed in logic, but safety first)
                        min={earliestAvailability?.earliestAvailableDate && earliestAvailability.earliestAvailableDate > today
                          ? earliestAvailability.earliestAvailableDate
                          : today}
                        max={isUtilitaria ? UTILITARIE_MAX_DATE : maxBookableDate}
                        required
                        style={{ colorScheme: 'dark' }}
                        className={`w-full bg-gray-800 rounded-md px-3 py-2.5 text-white text-sm border-2 transition-colors cursor-pointer min-h-[44px] ${errors.pickupDate || (formData.pickupDate && availabilityError)
                          ? 'border-red-500 focus:border-red-400'
                          : formData.pickupDate
                            ? 'border-green-500 focus:border-green-400'
                            : 'border-gray-700 focus:border-white'
                          }`}
                      />
                      {errors.pickupDate && (
                        <p className="text-xs text-red-400 mt-1 flex items-center">
                          <span className="mr-1"></span> {errors.pickupDate}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Ora di ritiro *
                        {formData.pickupTime && (
                          <span className="ml-2 text-xs text-green-400">{formData.pickupTime}</span>
                        )}
                      </label>
                      <select
                        name="pickupTime"
                        value={formData.pickupTime}
                        onChange={handleChange}
                        required
                        disabled={!formData.pickupDate || getValidPickupTimes(formData.pickupDate).length === 0}
                        className={`w-full bg-gray-800 rounded-md px-3 py-2 text-white text-sm border-2 transition-colors ${!formData.pickupDate || getValidPickupTimes(formData.pickupDate).length === 0
                          ? 'border-gray-700 opacity-50 cursor-not-allowed'
                          : formData.pickupTime
                            ? 'border-green-500 focus:border-green-400'
                            : 'border-gray-700 focus:border-white'
                          }`}
                      >
                        {getValidPickupTimes(formData.pickupDate).length > 0 ? (
                          getValidPickupTimes(formData.pickupDate).map(time => <option key={time} value={time}>{time}</option>)
                        ) : (
                          <option value="">Seleziona prima una data feriale</option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Return Date & Time */}
                <div className="p-4 rounded-lg border border-gray-700 bg-gray-800/30">
                  <h4 className="text-white font-semibold mb-3 flex items-center">
                    <span className="mr-2"></span> Riconsegna del veicolo
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Data di riconsegna *
                        {formData.returnDate && (
                          <span className="ml-2 text-xs text-green-400">Selezionata</span>
                        )}
                      </label>
                      <input
                        type="date"
                        name="returnDate"
                        value={formData.returnDate}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (!value) return;

                          // Block Sundays & holidays — use local-time helper to avoid UTC-shift bugs
                          if (getDayOfWeek(value) === 0 || isHoliday(value)) {
                            setErrors(prev => ({ ...prev, returnDate: 'Data non disponibile (domenica o festivo). Seleziona un altro giorno.' }));
                            return;
                          }
                          setErrors(prev => { const next = { ...prev }; delete next.returnDate; return next; });

                          // Block urban/corporate vehicles after March 25
                          if (isUtilitaria && value > UTILITARIE_MAX_DATE) {
                            setShowMaxDatePopup(true);
                            return;
                          }

                          // STRICT VALIDATION: Return Date must be at least the day after Pickup Date
                          if (formData.pickupDate && value <= formData.pickupDate) {
                            setErrors(prev => ({ ...prev, returnDate: 'Il noleggio minimo è di 1 giorno. Seleziona almeno il giorno successivo al ritiro.' }));
                            return;
                          }

                          // Check if return date is a Sunday or holiday
                          const returnDayOfWeek = getDayOfWeek(value);
                          if (returnDayOfWeek === 0) {
                            setErrors(prev => ({ ...prev, returnDate: 'Siamo chiusi la domenica. Seleziona un altro giorno.' }));
                            return;
                          }
                          if (isHoliday(value)) {
                            setErrors(prev => ({ ...prev, returnDate: 'Siamo chiusi nei giorni festivi. Seleziona un altro giorno.' }));
                            return;
                          }

                          // Clear return date errors if valid
                          setErrors(prev => ({ ...prev, returnDate: undefined, date: undefined }));

                          // CRITICAL: Check if this date has ANY valid return times
                          const validTimesForDate = getValidReturnTimes(value);
                          if (validTimesForDate.length === 0) {
                            setErrors(prev => ({ ...prev, returnDate: 'Questa data non è disponibile. Seleziona una data compatibile.' }));
                            return;
                          }

                          handleChange(e);
                        }}
                        min={formData.pickupDate ? (() => { const d = new Date(formData.pickupDate); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })() : today}
                        max={isUtilitaria ? UTILITARIE_MAX_DATE : maxReturnDate}
                        disabled={!formData.pickupDate || !formData.pickupTime}
                        required
                        style={{ colorScheme: 'dark' }}
                        className={`w-full bg-gray-800 rounded-md px-3 py-2.5 text-white text-sm border-2 transition-colors min-h-[44px] ${!formData.pickupDate || !formData.pickupTime
                          ? 'border-gray-700 opacity-50 cursor-not-allowed'
                          : errors.returnDate || errors.date || (formData.returnDate && availabilityError)
                            ? 'border-red-500 focus:border-red-400 cursor-pointer'
                            : formData.returnDate
                              ? 'border-green-500 focus:border-green-400 cursor-pointer'
                              : 'border-gray-700 focus:border-white cursor-pointer'
                          }`}
                      />
                      {(errors.returnDate || errors.date) && (
                        <p className="text-xs text-red-400 mt-1 flex items-center">
                          <span className="mr-1"></span> {errors.returnDate || errors.date}
                        </p>
                      )}
                      {!formData.pickupDate && (
                        <p className="text-xs text-gray-400 mt-1">Seleziona prima la data di ritiro</p>
                      )}
                      {formData.pickupDate && !formData.pickupTime && (
                        <p className="text-xs text-gray-400 mt-1">Seleziona prima l'ora di ritiro</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Ora di riconsegna *
                        <span className="ml-2 text-xs text-gray-400">(auto-calcolata, modificabile)</span>
                      </label>
                      <select
                        name="returnTime"
                        value={formData.returnTime}
                        onChange={handleChange}
                        required
                        disabled={!formData.returnDate || getValidReturnTimes(formData.returnDate).length === 0}
                        className={`w-full bg-gray-800 rounded-md px-3 py-2 text-white text-sm border-2 transition-colors ${!formData.returnDate || getValidReturnTimes(formData.returnDate).length === 0
                          ? 'border-gray-700 opacity-50 cursor-not-allowed'
                          : formData.returnTime
                            ? 'border-green-500 focus:border-green-400'
                            : 'border-gray-700 focus:border-white'
                          }`}
                      >
                        {getValidReturnTimes(formData.returnDate).length > 0 ? (
                          getValidReturnTimes(formData.returnDate).map(time => <option key={time} value={time}>{time}</option>)
                        ) : (
                          <option value="">Seleziona prima una data</option>
                        )}
                      </select>
                      <p className="text-xs text-gray-400 mt-1">Ritiro - 1h30 (auto), adattato alla disponibilità</p>
                    </div>
                  </div>
                  {/* Vehicle Availability Check */}
                  {isCheckingAvailability && (
                    <div className="mt-4 p-3 bg-blue-900/20 border border-blue-600 rounded-lg">
                      <p className="text-blue-300 text-sm">Verifica disponibilità veicolo...</p>
                    </div>
                  )}
                  {availabilityError && (
                    <div className="mt-4 p-4 bg-red-900/30 border-2 border-red-500 rounded-lg">
                      <p className="text-red-300 font-semibold">{availabilityError}</p>
                    </div>
                  )}
                  {partialUnavailabilityWarning && !availabilityError && (
                    <div className="mt-4 p-4 bg-gray-800/50 border-2 border-white/40 rounded-lg">
                      <p className="text-white font-semibold">{partialUnavailabilityWarning}</p>
                    </div>
                  )}
                  {shortSlotWarning && !availabilityError && (
                    <div className="mt-4 p-4 bg-amber-900/30 border-2 border-amber-500 rounded-lg">
                      <p className="text-amber-200 font-semibold">{shortSlotWarning}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Info message about KM */}
              <div className="mt-6 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
                <p className="text-gray-400 text-xs text-center">
                  La tariffa finale può subire variazioni in base a orari, disponibilità e durata effettiva del noleggio.
                </p>
              </div>
            </div>
            </>
            )}
          </div>
        );
      case 2:
        const renderDriverForm = (driverType: 'main' | 'second') => {
          const driverData = driverType === 'main' ? formData : formData.secondDriver;
          const prefix = driverType === 'main' ? '' : 'secondDriver.';

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="text-sm text-gray-400">Nome *</label><input type="text" name={`${prefix}firstName`} value={(driverData as any).firstName} onChange={handleChange} autoComplete="given-name" className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-2.5 mt-1 text-white text-sm min-h-[44px]" style={{ colorScheme: 'dark' }} />{errors[`${prefix}firstName`] && <p className="text-xs text-red-400 mt-1">{errors[`${prefix}firstName`]}</p>}</div>
              <div><label className="text-sm text-gray-400">Cognome *</label><input type="text" name={`${prefix}lastName`} value={(driverData as any).lastName} onChange={handleChange} autoComplete="family-name" className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-2.5 mt-1 text-white text-sm min-h-[44px]" style={{ colorScheme: 'dark' }} />{errors[`${prefix}lastName`] && <p className="text-xs text-red-400 mt-1">{errors[`${prefix}lastName`]}</p>}</div>
              <div><label className="text-sm text-gray-400">Email *</label><input type="email" name={`${prefix}email`} value={(driverData as any).email} onChange={handleChange} autoComplete="email" className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-2.5 mt-1 text-white text-sm min-h-[44px]" style={{ colorScheme: 'dark' }} />{errors[`${prefix}email`] && <p className="text-xs text-red-400 mt-1">{errors[`${prefix}email`]}</p>}</div>
              <div><label className="text-sm text-gray-400">Telefono *</label><input type="tel" name={`${prefix}phone`} value={(driverData as any).phone} onChange={handleChange} autoComplete="tel" className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-2.5 mt-1 text-white text-sm min-h-[44px]" style={{ colorScheme: 'dark' }} />{errors[`${prefix}phone`] && <p className="text-xs text-red-400 mt-1">{errors[`${prefix}phone`]}</p>}</div>
              {driverType === 'main' && (
                <>
                  <div>
                    <label className="text-sm text-gray-400">Codice Fiscale *</label>
                    <div className="flex gap-2 mt-1">
                      <input type="text" name="codiceFiscale" value={formData.codiceFiscale} onChange={handleChange} placeholder="es. RSSMRA85M01H501Z" className="flex-1 bg-gray-800 border-gray-700 rounded-md px-3 py-1.5 text-white text-sm uppercase" />
                      <CalcolaCFButton
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-md whitespace-nowrap transition-colors"
                        config={{
                          getCognome: () => formData.lastName,
                          getNome: () => formData.firstName,
                          getDataNascita: () => formData.birthDate,
                          getSesso: () => formData.sesso,
                          getLuogoNascita: () => formData.luogoNascita,
                          getCodiceFiscale: () => formData.codiceFiscale,
                          setCodiceFiscale: (v) => setFormData(p => ({ ...p, codiceFiscale: v })),
                          setSesso: (v) => setFormData(p => ({ ...p, sesso: v })),
                          setDataNascita: (v) => setFormData(p => ({ ...p, birthDate: v })),
                          setLuogoNascita: (v) => setFormData(p => ({ ...p, luogoNascita: v })),
                          setProvinciaNascita: (v) => setFormData(p => ({ ...p, provinciaNascita: v })),
                        }}
                      />
                    </div>
                    {errors.codiceFiscale && <p className="text-xs text-red-400 mt-1">{errors.codiceFiscale}</p>}
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Sesso</label>
                    <select name="sesso" value={formData.sesso} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-1.5 mt-1 text-white text-sm">
                      <option value="">Seleziona...</option>
                      <option value="M">Maschio</option>
                      <option value="F">Femmina</option>
                    </select>
                  </div>
                  <div><label className="text-sm text-gray-400">Luogo di nascita</label><input type="text" name="luogoNascita" value={formData.luogoNascita} onChange={handleChange} placeholder="es. Cagliari" className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-1.5 mt-1 text-white text-sm" /></div>
                  <div><label className="text-sm text-gray-400">Provincia di nascita</label><input type="text" name="provinciaNascita" value={formData.provinciaNascita} onChange={(e) => setFormData(p => ({ ...p, provinciaNascita: e.target.value.toUpperCase() }))} placeholder="es. CA" maxLength={2} className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-1.5 mt-1 text-white text-sm uppercase" /></div>
                </>
              )}
              <div><label className="text-sm text-gray-400">Data di nascita *</label><input type="date" name={`${prefix}birthDate`} value={(driverData as any).birthDate} onChange={handleChange} max={new Date().toISOString().split('T')[0]} className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-2.5 mt-1 text-white text-sm min-h-[44px]" style={{ colorScheme: 'dark' }} />{errors[`${prefix}birthDate`] && <p className="text-xs text-red-400 mt-1">{errors[`${prefix}birthDate`]}</p>}</div>
              <div><label className="text-sm text-gray-400">Numero patente *</label><input type="text" name={`${prefix}licenseNumber`} value={(driverData as any).licenseNumber} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-2.5 mt-1 text-white text-sm min-h-[44px]" style={{ colorScheme: 'dark' }} />{errors[`${prefix}licenseNumber`] && <p className="text-xs text-red-400 mt-1">{errors[`${prefix}licenseNumber`]}</p>}</div>
              <div><label className="text-sm text-gray-400">Data rilascio patente *</label><input type="date" name={`${prefix}licenseIssueDate`} value={(driverData as any).licenseIssueDate} onChange={handleChange} max={new Date().toISOString().split('T')[0]} className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-2.5 mt-1 text-white text-sm min-h-[44px]" style={{ colorScheme: 'dark' }} />{errors[`${prefix}licenseIssueDate`] && <p className="text-xs text-red-400 mt-1">{errors[`${prefix}licenseIssueDate`]}</p>}</div>
              {driverType === 'main' && (
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-400">Indirizzo di residenza *</label>
                  {/* Mirror the typed value into BOTH `address` (autocomplete UI
                      state) and `residenza` (the field the validator and the
                      cauzione/pricing logic actually read). Previously the
                      input only wrote to `address`; validation checked
                      `residenza` which was either empty or auto-filled from
                      the saved profile, so customers could click Avanti
                      without entering a real address even though it changes
                      the cauzione price. */}
                  <AddressAutocomplete
                    value={formData.address || formData.residenza}
                    onChange={(val) => {
                      // Digitazione libera: l'eventuale paese di una selezione
                      // precedente non vale più finché non si sceglie dall'elenco.
                      setResidenzaCountryCode('');
                      setFormData(prev => ({ ...prev, address: val, residenza: val }));
                    }}
                    onSelect={(d) => setResidenzaCountryCode((d.countryCode || '').toLowerCase())}
                    className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-1.5 mt-1 text-white text-sm"
                    placeholder="Via Roma 10, 09100 Cagliari"
                  />
                  <p className="text-[11px] text-red-400 mt-1">
                    Seleziona l'indirizzo dall'elenco (anche estero) — necessario per la fattura.
                  </p>
                  {(errors.residenza || errors.address) && <p className="text-xs text-red-400 mt-1">{errors.residenza || errors.address}</p>}
                </div>
              )}
              {driverType === 'second' && (
                <>
                  <div><label className="text-sm text-gray-400">Data scadenza patente *</label><input type="date" name={`${prefix}licenseExpiryDate`} value={(driverData as any).licenseExpiryDate} onChange={handleChange} min={new Date().toISOString().split('T')[0]} className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-2.5 mt-1 text-white text-sm min-h-[44px]" style={{ colorScheme: 'dark' }} />{errors[`${prefix}licenseExpiryDate`] && <p className="text-xs text-red-400 mt-1">{errors[`${prefix}licenseExpiryDate`]}</p>}</div>
                  <div><label className="text-sm text-gray-400">Paese di rilascio *</label><input type="text" name={`${prefix}countryOfIssue`} value={(driverData as any).countryOfIssue} onChange={handleChange} placeholder="es. Italia" className="w-full bg-gray-800 border-gray-700 rounded-md px-3 py-2.5 mt-1 text-white text-sm min-h-[44px]" style={{ colorScheme: 'dark' }} />{errors[`${prefix}countryOfIssue`] && <p className="text-xs text-red-400 mt-1">{errors[`${prefix}countryOfIssue`]}</p>}</div>
                </>
              )}
            </div>
          );
        };

        const driverAgeLocal = driverAge;
        const licenseYearsLocal = licenseYears;

        return (
          <div className="space-y-8">
            {/* Document Upload — FIRST, for automatic data extraction */}
            <section>
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                A. CARICA DOCUMENTI
                <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded">OBBLIGATORIO</span>
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Per noleggiare un veicolo è <strong className="text-red-400">obbligatorio</strong> caricare patente di guida e documento d'identità (o passaporto). Senza questi documenti non è possibile proseguire con la prenotazione.
              </p>

              {/* Check if documents are already on file */}
              {(hasStoredDocs.licensePath && hasStoredDocs.idPath) ? (
                <div className="bg-green-900/20 border border-green-600/50 rounded-lg p-4 flex items-center mb-4">
                  <div className="mr-3 bg-green-500/20 p-2 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-green-400 font-semibold">Documenti già presenti in archivio</p>
                    <p className="text-sm text-gray-400">Non è necessario caricare nuovamente i documenti.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* License Uploader */}
                  {hasStoredDocs.licensePath ? (
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 opacity-75">
                      <p className="text-green-400 text-sm font-medium mb-1">✓ Patente di Guida presente</p>
                      <p className="text-xs text-gray-500">Già in archivio</p>
                    </div>
                  ) : (
                    <div>
                      <DocumentUploader
                        title="1. PATENTE DI GUIDA *"
                        details={["Solo fronte/retro", "Foto chiara e leggibile", "Formati: JPG, PNG, PDF (max 5MB)", "Campo obbligatorio"]}
                        onFileChange={(file) => setFormData(prev => ({ ...prev, licenseImage: file }))}
                      />
                      {errors.licenseImage && <p className="text-xs text-red-400 mt-1 font-semibold">⚠ {errors.licenseImage}</p>}
                    </div>
                  )}

                  {/* ID Uploader */}
                  {hasStoredDocs.idPath ? (
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 opacity-75">
                      <p className="text-green-400 text-sm font-medium mb-1">✓ Carta d'Identità presente</p>
                      <p className="text-xs text-gray-500">Già in archivio</p>
                    </div>
                  ) : (
                    <div>
                      <DocumentUploader
                        title="2. CARTA D'IDENTITÀ / PASSAPORTO *"
                        details={["Documento valido", "Foto chiara e leggibile", "Formati: JPG, PNG, PDF (max 5MB)", "Campo obbligatorio"]}
                        onFileChange={(file) => setFormData(prev => ({ ...prev, idImage: file }))}
                      />
                      {errors.idImage && <p className="text-xs text-red-400 mt-1 font-semibold">⚠ {errors.idImage}</p>}
                    </div>
                  )}

                  {/* Compila button — auto-fill from uploaded documents */}
                  {(formData.licenseImage || formData.idImage) && (
                    <div className="mt-4">
                      <CompilaButton
                        documents={[
                          { file: formData.licenseImage, label: 'Patente' },
                          { file: formData.idImage, label: 'Documento Identità' },
                        ]}
                        currentData={{
                          nome: formData.firstName,
                          cognome: formData.lastName,
                          data_nascita: formData.birthDate,
                          codice_fiscale: formData.codiceFiscale,
                          patente_numero: formData.licenseNumber,
                          patente_rilascio: formData.licenseIssueDate,
                        }}
                        onDataExtracted={(data) => {
                          setFormData(prev => ({
                            ...prev,
                            ...(data.nome && !prev.firstName && { firstName: data.nome }),
                            ...(data.cognome && !prev.lastName && { lastName: data.cognome }),
                            ...(data.data_nascita && !prev.birthDate && { birthDate: data.data_nascita }),
                            ...(data.codice_fiscale && !prev.codiceFiscale && { codiceFiscale: data.codice_fiscale }),
                            ...(data.indirizzo && !prev.residenza && { residenza: `${data.indirizzo}${data.numero_civico ? ' ' + data.numero_civico : ''}, ${data.codice_postale || ''} ${data.citta_residenza || ''} ${data.provincia_residenza || ''}`.trim() }),
                            ...(data.patente_numero && !prev.licenseNumber && { licenseNumber: data.patente_numero }),
                            // Anzianità patente: usa la data REALE di conseguimento dal RETRO
                            // (colonna 10 cat. B). Fallback alla 4a del fronte solo se manca.
                            ...((data.patente_conseguimento || data.patente_rilascio) && !prev.licenseIssueDate && { licenseIssueDate: data.patente_conseguimento || data.patente_rilascio }),
                          }))
                        }}
                        onError={(err) => console.error('Compila error:', err)}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Main Driver Form — after documents for auto-fill */}
            <section className="border-t border-gray-700 pt-6">
              <h3 className="text-lg font-bold text-white mb-4">B. DATI CONDUCENTE</h3>
              {renderDriverForm('main')}
            </section>

            {/* Automatic Validation & Tier Classification */}
            <section className="border-t border-gray-700 pt-6">
              <h3 className="text-lg font-bold text-white mb-4">C. VERIFICA REQUISITI</h3>
              <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 space-y-2">
                <p>Età conducente: {driverAgeLocal || '--'} anni</p>
                <p>Anzianità patente: {licenseYearsLocal || '--'} anni</p>
                {driverTierInfo && (
                  <div className={`mt-3 p-3 rounded-lg border ${
                    driverTierInfo.tier === 'TIER_2' ? 'bg-green-900/20 border-green-600' :
                    driverTierInfo.tier === 'TIER_1' ? 'bg-gray-800/40 border-white/30' :
                    'bg-red-900/20 border-red-600'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                        driverTierInfo.tier === 'TIER_2' ? 'bg-green-600 text-white' :
                        driverTierInfo.tier === 'TIER_1' ? 'bg-white text-black' :
                        'bg-red-600 text-white'
                      }`}>
                        {driverTierInfo.tier === 'TIER_2' ? 'TIER 2' : driverTierInfo.tier === 'TIER_1' ? 'TIER 1' : 'NON IDONEO'}
                      </span>
                      <span className={`text-sm ${
                        driverTierInfo.tier === 'BLOCKED' ? 'text-red-300 font-bold' : 'text-gray-300'
                      }`}>
                        {driverTierInfo.reason}
                      </span>
                    </div>
                    {driverTierInfo.tier === 'BLOCKED' && (
                      <p className="text-red-400 text-sm mt-2 font-semibold">
                        Non è possibile procedere con la prenotazione.
                      </p>
                    )}
                  </div>
                )}
                {(() => {
                  const isBMW_M4 = item.name?.includes('BMW M4') || item.name?.includes('M4 Competition');
                  const requiredYears = isBMW_M4 ? 5 : 3;

                  if (licenseYearsLocal < requiredYears && formData.licenseIssueDate) {
                    return (
                      <p className="text-red-500 font-bold mt-2">
                        ATTENZIONE: {isBMW_M4
                          ? 'Per la BMW M4 è richiesta una patente con almeno 5 anni di anzianità.'
                          : 'È richiesta una patente con almeno 3 anni di anzianità per noleggiare.'}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            </section>

            {/* Second Driver */}
            <section className="border-t border-gray-700 pt-6">
              <h3 className="text-lg font-bold text-white mb-4">D. SECONDO CONDUCENTE (OPZIONALE)</h3>
              <div className="flex items-start mb-4">
                <input
                  type="checkbox"
                  name="addSecondDriver"
                  checked={formData.addSecondDriver}
                  onChange={handleChange}
                  id="add-second-driver"
                  className="h-4 w-4 mt-1 text-white bg-gray-700 border-gray-600 rounded focus:ring-white"
                />
                <label htmlFor="add-second-driver" className="ml-2 text-white">
                  Aggiungi un secondo conducente autorizzato
                </label>
              </div>

              <AnimatePresence>
              {formData.addSecondDriver && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                <div className="mt-4 p-4 bg-gray-800/30 rounded-lg border border-gray-700 space-y-4">
                  <p className="text-sm text-amber-300">Tutti i campi sono obbligatori per il secondo conducente.</p>
                  {renderDriverForm('second')}

                  {/* Second Driver Document Upload */}
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      Documenti secondo conducente
                      <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded">OBBLIGATORIO</span>
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <DocumentUploader
                          title="PATENTE SECONDO CONDUCENTE *"
                          details={["Solo fronte/retro", "Foto chiara e leggibile", "Formati: JPG, PNG, PDF (max 5MB)", "Campo obbligatorio"]}
                          onFileChange={(file) => setFormData(prev => ({
                            ...prev,
                            secondDriver: { ...prev.secondDriver, licenseImage: file }
                          }))}
                        />
                        {errors['secondDriver.licenseImage'] && <p className="text-xs text-red-400 mt-1 font-semibold">⚠ {errors['secondDriver.licenseImage']}</p>}
                      </div>
                      <div>
                        <DocumentUploader
                          title="DOCUMENTO SECONDO CONDUCENTE *"
                          details={["Carta d'identità o passaporto", "Foto chiara e leggibile", "Formati: JPG, PNG, PDF (max 5MB)", "Campo obbligatorio"]}
                          onFileChange={(file) => setFormData(prev => ({
                            ...prev,
                            secondDriver: { ...prev.secondDriver, idImage: file }
                          }))}
                        />
                        {errors['secondDriver.idImage'] && <p className="text-xs text-red-400 mt-1 font-semibold">⚠ {errors['secondDriver.idImage']}</p>}
                      </div>
                    </div>

                    {/* Compila button — auto-fill second driver from uploaded documents */}
                    {(formData.secondDriver.licenseImage instanceof File || formData.secondDriver.idImage instanceof File) && (
                      <div className="mt-4">
                        <CompilaButton
                          documents={[
                            { file: formData.secondDriver.licenseImage instanceof File ? formData.secondDriver.licenseImage : null, label: 'Patente Secondo Conducente' },
                            { file: formData.secondDriver.idImage instanceof File ? formData.secondDriver.idImage : null, label: 'Documento Secondo Conducente' },
                          ]}
                          currentData={{
                            nome: formData.secondDriver.firstName,
                            cognome: formData.secondDriver.lastName,
                            data_nascita: formData.secondDriver.birthDate,
                            patente_numero: formData.secondDriver.licenseNumber,
                            patente_rilascio: formData.secondDriver.licenseIssueDate,
                            patente_scadenza: formData.secondDriver.licenseExpiryDate,
                          }}
                          onDataExtracted={(data) => {
                            setFormData(prev => ({
                              ...prev,
                              secondDriver: {
                                ...prev.secondDriver,
                                ...(data.nome && !prev.secondDriver.firstName && { firstName: data.nome }),
                                ...(data.cognome && !prev.secondDriver.lastName && { lastName: data.cognome }),
                                ...(data.data_nascita && !prev.secondDriver.birthDate && { birthDate: data.data_nascita }),
                                ...(data.patente_numero && !prev.secondDriver.licenseNumber && { licenseNumber: data.patente_numero }),
                                // 2° guidatore: anzianità patente dalla data REALE di conseguimento (retro, col.10 cat.B).
                                ...((data.patente_conseguimento || data.patente_rilascio) && !prev.secondDriver.licenseIssueDate && { licenseIssueDate: data.patente_conseguimento || data.patente_rilascio }),
                                ...(data.patente_scadenza && !prev.secondDriver.licenseExpiryDate && { licenseExpiryDate: data.patente_scadenza }),
                                ...(data.patente_ente && !prev.secondDriver.countryOfIssue && { countryOfIssue: data.patente_ente }),
                              },
                            }))
                          }}
                          onError={(err) => console.error('Compila second-driver error:', err)}
                        />
                      </div>
                    )}
                  </div>
                </div>
                </motion.div>
              )}
              </AnimatePresence>
            </section>

            {/* Sardinian residency question REMOVED — deposit now same for all */}

            {/* Final Checkbox */}
            <section className="border-t border-gray-700 pt-6">
              <div className="flex items-start">
                <input type="checkbox" name="confirmsInformation" checked={formData.confirmsInformation} onChange={handleChange} id="confirms-information" className="h-4 w-4 mt-1 text-white bg-gray-700 border-gray-600 rounded focus:ring-white" />
                <label htmlFor="confirms-information" className="ml-2 text-white">Dichiaro che i dati inseriti sono veritieri e conformi ai requisiti richiesti.</label>
              </div>
              {errors.confirmsInformation && <p className="text-xs text-red-400 mt-1">{errors.confirmsInformation}</p>}
            </section>
          </div>
        );
      case 3: {
        const unlimitedOptions = getUnlimitedKmOptions(item.name);
        const isPremium = isPremiumVehicle(item.name);
        const displayVehicleType = getVehicleType(item);
        const activeTier = driverTier || 'TIER_2'; // fallback
        const tierPricing = ACTIVE_TIER_PRICING[activeTier] || ACTIVE_TIER_PRICING.TIER_2;
        // Insurance options from Centralina per vehicle category
        const insuranceOptions = getInsuranceForVehicle(displayVehicleType, activeTier);
        // Deposit options from Centralina Pro (per-category). RESIDENT o NON_RESIDENT
        // a seconda dell'indirizzo del cliente (provincia CA/SU = residente).
        const depositKey = `${activeTier}_${residencySuffix}` as 'TIER_1_RESIDENT' | 'TIER_2_RESIDENT' | 'TIER_1_NON_RESIDENT' | 'TIER_2_NON_RESIDENT';
        const rawDepositOptions = pickDepositOptions(configOverlay, displayVehicleType, depositKey, (item as any).category);
        // Ensure "Nessuna cauzione" is always offered as a request for Fascia B as well —
        // Centralina Pro only lists no_deposit for Fascia A, but Fascia B must still be
        // able to submit a request. Borrow the Fascia A config when missing.
        // NB: i clienti NON residenti NON hanno mai l'opzione "Nessuna cauzione"
        // (cauzione non-residente = solo carta), quindi non la prendiamo in prestito.
        const depositOptions = (() => {
          const hasNoDeposit = rawDepositOptions.some((o: { id: string }) => o.id === 'no_deposit');
          if (hasNoDeposit || isNonResidentCustomer) return rawDepositOptions;
          // If Centralina Pro defines no_deposit on Fascia A, mirror that exact entry to
          // Fascia B (so Fascia B can also request it). NO hardcoded fallback — if Pro
          // hasn't configured it anywhere, the option simply isn't offered and the admin
          // must add it via Centralina Pro > Cauzioni.
          const fasciaA = pickDepositOptions(configOverlay, displayVehicleType, 'TIER_2_RESIDENT', (item as any).category);
          const fasciaAnoDep = fasciaA.find((o: { id: string }) => o.id === 'no_deposit');
          if (!fasciaAnoDep) return rawDepositOptions;
          return [fasciaAnoDep, ...rawDepositOptions];
        })();
        const experienceServices = ACTIVE_EXPERIENCE_SERVICES.filter(s => !s.tierOnly || s.tierOnly === activeTier);

        // Check if "no deposit" requires Kasko (cannot select no_deposit with RCA only)
        const selectedInsuranceIsRCA = formData.insuranceOption === 'RCA';
        const noDepositRequiresKasko = formData.depositOption === 'no_deposit' && selectedInsuranceIsRCA;

        // VIP view removed — all customers use standard flow
        if (false) {
          return (
            <div className="space-y-6">
              <div className="text-center mb-2">
                <span className="text-xs font-bold text-white bg-white/10 px-4 py-1.5 rounded-full uppercase tracking-widest">Cliente VIP</span>
              </div>

              <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 space-y-4">
                <h3 className="text-lg font-bold text-white mb-4">Riepilogo Noleggio VIP</h3>

                <div className="flex justify-between items-center py-3 border-b border-gray-700">
                  <span className="text-gray-400">Veicolo</span>
                  <span className="text-white font-semibold">{item.name}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-700">
                  <span className="text-gray-400">Ritiro</span>
                  <span className="text-white font-semibold">{formData.pickupDate} — {formData.pickupTime}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-700">
                  <span className="text-gray-400">Riconsegna</span>
                  <span className="text-white font-semibold">{formData.returnDate} — {formData.returnTime}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-700">
                  <span className="text-gray-400">Durata</span>
                  <span className="text-white font-semibold">{Math.max(1, duration.days)} {Math.max(1, duration.days) === 1 ? 'giorno' : 'giorni'}{duration.hours > 0 ? ` ${duration.hours}h` : ''}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-700">
                  <span className="text-gray-400">Copertura assicurativa</span>
                  <span className="text-green-400 font-semibold">Kasko Base — Inclusa</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-700">
                  <span className="text-gray-400">Chilometri</span>
                  <span className="text-green-400 font-semibold">Illimitati — Inclusi</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-700">
                  <span className="text-gray-400">Lavaggio</span>
                  <span className="text-green-400 font-semibold">Incluso</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-700">
                  <span className="text-gray-400">Cauzione</span>
                  <span className="text-green-400 font-semibold">Nessuna</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between items-center py-3 border-b border-gray-700">
                    <span className="text-gray-400">Consegna/Ritiro a domicilio</span>
                    <span className="text-white font-semibold">{formatPrice(deliveryFee)}</span>
                  </div>
                )}

                {discountAmount > 0 && (
                  <div className="flex justify-between items-center py-3 border-b border-gray-700">
                    <span className="text-white">Codice Sconto</span>
                    <span className="text-white font-semibold">-{formatPrice(discountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-4">
                  <span className="text-xl font-bold text-white">TOTALE</span>
                  <div className="flex items-center gap-3">
                    {discountAmount > 0 && (
                      <span className="text-lg text-gray-500 line-through">€{rentalCost}</span>
                    )}
                    <span className="text-2xl font-bold text-white">{formatPrice(grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Codice Sconto — also available for VIP */}
              <div className="border-t border-gray-600 pt-4">
                <p className="font-bold text-base text-white mb-3">CODICE SCONTO</p>
                {appliedDiscount ? (
                  <div className="flex items-center justify-between p-3 bg-green-900/30 border border-green-500/50 rounded-lg">
                    <div>
                      <p className="text-green-400 font-bold">{appliedDiscount.code}</p>
                      <p className="text-green-300 text-sm">
                        {appliedDiscount.type === 'percentage'
                          ? `Sconto del ${Math.round(Number(appliedDiscount.amount))}% applicato (-€${discountAmount.toFixed(2)})`
                          : `Sconto di €${Number(appliedDiscount.amount).toFixed(2)} applicato`}
                      </p>
                    </div>
                    <button type="button" onClick={removeDiscount} className="text-red-400 hover:text-red-300 text-sm underline">Rimuovi</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      placeholder="Inserisci codice (es. BDAY-XXXX-XXXX)"
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 text-sm uppercase"
                    />
                    <button
                      type="button"
                      onClick={validateDiscountCode}
                      disabled={isValidatingCode || !discountCode.trim()}
                      className="px-4 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {isValidatingCode ? 'Verifica...' : 'Applica'}
                    </button>
                  </div>
                )}
                {discountCodeError && (
                  <p className="text-red-400 text-sm mt-2">{discountCodeError}</p>
                )}
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-8">
            {/* === A. ASSICURAZIONE (tier-conditional) === */}
            <section>
              <h3 className="text-lg font-bold text-white mb-4">A. COPERTURA ASSICURATIVA</h3>
              {false ? (
                <div className="p-4 rounded-lg border-2 border-green-500 bg-green-500/10">
                  <div className="flex items-center">
                    <span className="font-bold text-white">Kasko Base</span>
                    <span className="ml-auto text-green-400 font-bold">Inclusa</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Copertura assicurativa inclusa nel tuo piano VIP.</p>
                </div>
              ) : (
              <>
              <p className="text-sm text-gray-400 mb-4">Seleziona il livello di protezione desiderato.</p>
              <div className="space-y-3">
                {insuranceOptions.map(opt => {
                  const isSelected = formData.insuranceOption === opt.id;
                  const isRCA = opt.id === 'RCA';
                  return (
                    <div
                      key={opt.id}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${isSelected
                        ? isRCA ? 'border-red-500 bg-red-500/10' : 'border-green-500 bg-green-500/10'
                        : 'border-gray-600 hover:border-gray-500'}`}
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          insuranceOption: opt.id,
                          // If selecting RCA, force credit_card deposit (mandatory)
                          depositOption: opt.id === 'RCA' ? 'credit_card' : (prev.depositOption === 'no_deposit' ? '' : prev.depositOption),
                        }));
                      }}
                    >
                      <div className="flex items-center">
                        <input
                          type="radio"
                          name="insuranceOption"
                          value={opt.id}
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 flex-shrink-0"
                        />
                        <div className="ml-3 flex-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-white">{opt.name}</span>
                            <span className={`font-bold ${isRCA ? 'text-gray-400' : opt.id === 'KASKO_DR7' ? 'text-green-400' : 'text-white'}`}>
                              {opt.dailyPrice > 0 ? `€${opt.dailyPrice}/giorno` : 'Inclusa'}
                            </span>
                          </div>
                          {!isRCA && (
                            <p className="text-xs text-gray-400 mt-1">{opt.coverage}</p>
                          )}
                          <p className={`text-xs mt-1 ${opt.id === 'KASKO_DR7' ? 'text-green-400 font-semibold' : 'text-gray-300'}`}>
                            Da risarcire: {opt.deductible}
                          </p>
                          {isRCA && isSelected && opt.mandatoryDeposit && (
                            <div className="mt-2 p-2 bg-red-900/30 border border-red-500/50 rounded">
                              <p className="text-red-300 text-xs font-semibold">
                                ATTENZIONE: Senza Kasko è richiesta una cauzione obbligatoria di €{opt.mandatoryDeposit.toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
              )}
            </section>

            {/* === B. CHILOMETRI === */}
            <section className="border-t border-gray-700 pt-6">
              <h3 className="text-lg font-bold text-white mb-4">B. CHILOMETRI</h3>
              {/* 2026-05-16: rendering unificato del blocco Km per TUTTI i veicoli.
                  Prima esisteva un branch separato "non-SUPERCAR" che mostrava
                  pacchetti come selezione singola (no + buttons, no qty),
                  perdendo i pacchetti cumulativi per Porsche 911 / categorie
                  custom (Hypercar, Suv Luxury). Forziamo sempre il branch nuovo
                  cosi' la stessa UI vale per ogni categoria con pacchetti
                  configurati in Centralina Pro. */}
              {true ? (
                <div className="space-y-3">
                  {/* KM inclusi (auto-calcolati da Centralina) */}
                  <div
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${(formData.kmPackageType === 'none' && Object.values(formData.kmPackages || {}).every(q => !q))
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-gray-600 hover:border-gray-500'}`}
                    onClick={() => setFormData(prev => ({ ...prev, kmPackageType: 'none' as any, kmPackages: {} }))}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-bold text-white">{includedKm >= 9999 ? 'Illimitati' : includedKm > 0 ? `${includedKm} km inclusi` : 'KM inclusi nel noleggio'}</span>
                        <p className="text-sm text-gray-400">Calcolati in base alla durata del noleggio</p>
                      </div>
                      <span className="font-bold text-green-400">Inclusi</span>
                    </div>
                  </div>
                  {/* === PACCHETTI KM (2026-05-16) ===
                      Pacchetti KM extra acquistabili (es. Pacchetto 100 km a
                      sconto). Letti da Centralina Pro per categoria.
                      Mostrati fra "Km inclusi" e "Km illimitati". */}
                  {(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rawCat = String(((item as any).category ?? '')).toLowerCase().trim()
                    const pkgs = resolvePacchetti(rawCat, configOverlay?.pacchettiByCategory)
                    if (pkgs.length === 0) return null
                    return pkgs.map((pkg: any) => {
                      // 2026-05-16: pacchetti CUMULATIVI con qty per ciascuno.
                      // Sempre visibile selettore − qty +. max = 1 (toggle) per
                      // pacchetti non quantity-buyable, max = max_quantity
                      // altrimenti (default 2). qty=0 → non selezionato.
                      const isQtyBuyable = !!pkg.is_quantity_buyable
                      const maxQty = isQtyBuyable ? Math.max(1, Number(pkg.max_quantity) || 2) : 1
                      const qty = formData.kmPackages?.[pkg.id] || 0
                      const isSelected = qty > 0
                      const isUnlimitedActive = formData.kmPackageType === 'unlimited'
                      const setQty = (q: number) => {
                        const clamped = Math.max(0, Math.min(maxQty, q))
                        setFormData(prev => {
                          const next = { ...(prev.kmPackages || {}) }
                          if (clamped === 0) delete next[pkg.id]
                          else next[pkg.id] = clamped
                          // Selezionando un pacchetto disattiva automaticamente "illimitati"
                          const nextType = clamped > 0 && prev.kmPackageType === 'unlimited'
                            ? 'none' as any
                            : prev.kmPackageType
                          return { ...prev, kmPackages: next, kmPackageType: nextType }
                        })
                      }
                      return (
                        <div key={pkg.id}
                          className={`p-4 rounded-lg border-2 transition-colors ${
                            isUnlimitedActive ? 'opacity-50 border-gray-700'
                            : isSelected ? 'border-dr7-gold bg-dr7-gold/10'
                            : 'border-gray-600 hover:border-gray-500 cursor-pointer'
                          }`}
                          onClick={() => { if (!isSelected && !isUnlimitedActive) setQty(1) }}
                        >
                          <div className="flex justify-between items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <span className="font-bold text-white">{pkg.label} ({pkg.km} km)</span>
                              <p className="text-sm text-gray-400">
                                {pkg.sconto_pct > 0
                                  ? `Sconto ${pkg.sconto_pct}% sul sforo (${pkg.km} km a prezzo agevolato)`
                                  : `${pkg.km} km extra inclusi nel pacchetto`}
                                {isQtyBuyable && !isSelected && (
                                  <span className="block text-xs text-dr7-gold mt-1">+ Aggiungi più volte (max {maxQty})</span>
                                )}
                              </p>
                              {isSelected && qty > 1 && (
                                <p className="text-xs text-dr7-gold font-semibold mt-1">Totale: {qty * pkg.km} km · {formatPrice(pkg.price * qty)}</p>
                              )}
                            </div>
                            {isSelected ? (
                              <div className="flex items-center gap-2">
                                <button type="button" disabled={isUnlimitedActive} onClick={(e) => { e.stopPropagation(); setQty(qty - 1) }}
                                  className="w-8 h-8 rounded-full bg-gray-700 text-white text-xl font-bold leading-none flex items-center justify-center hover:bg-gray-600 disabled:opacity-50">−</button>
                                <span className="text-white font-bold min-w-[1.5rem] text-center">{qty}</span>
                                <button type="button" disabled={isUnlimitedActive || qty >= maxQty} onClick={(e) => { e.stopPropagation(); setQty(qty + 1) }}
                                  className="w-8 h-8 rounded-full bg-white text-black text-xl font-bold leading-none flex items-center justify-center hover:bg-gray-200 disabled:opacity-50" title="Aggiungi pacchetto">+</button>
                                <span className="font-bold text-dr7-gold ml-2">+{formatPrice(pkg.price * qty)}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-dr7-gold">+{formatPrice(pkg.price)}</span>
                                <button type="button" disabled={isUnlimitedActive} onClick={(e) => { e.stopPropagation(); setQty(1) }}
                                  className="w-8 h-8 rounded-full bg-white text-black text-xl font-bold leading-none flex items-center justify-center hover:bg-gray-200 disabled:opacity-50" title="Aggiungi pacchetto">+</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  })()}
                  {/* KM illimitati (supplemento) — SOLO se prezzo > 0
                      (l'opzione viene nascosta dall'admin via toggle OFF
                      o se semplicemente il prezzo non e' configurato).
                      BUG FIX 2026-05-16: prima l'opzione veniva sempre mostrata
                      anche con prezzo 0 → cliente prenotava km illimitati a €0
                      (revenue loss). */}
                  {(() => {
                    const tier = (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2'
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rawCat = String(((item as any).category ?? '')).toLowerCase().trim()
                    const byCat = configOverlay?.unlimitedKmByCategory
                    // 2026-05-22: distingui "configurato a 0" da "non configurato".
                    // Admin puo' attivare Km illimitati con prezzo 0 (gratis/incluso)
                    // → l'opzione DEVE mostrarsi come "Incluso".
                    // Se invece la categoria NON ha unlimitedKmByCategory[cat][tier]
                    // (undefined), l'opzione resta nascosta.
                    let unlimitedPrice: number | null = null
                    if (rawCat && byCat) {
                      const aliases = (rawCat === 'supercars' || rawCat === 'supercar') ? ['supercars', 'exotic', 'supercar']
                                    : rawCat === 'exotic' ? ['exotic', 'supercars', 'supercar']
                                    : [rawCat]
                      for (const k of aliases) {
                        const v = byCat[k]?.[tier]
                        if (typeof v === 'number') { unlimitedPrice = v; break }
                      }
                    }
                    if (unlimitedPrice === null) return null
                    // 2026-05-22: se la categoria ha km_included.unlimited=true
                    // (urban) la card standard mostra gia' "Illimitati - Inclusi".
                    // Niente duplicato. Controllo sulla CONFIG (statica), non
                    // su includedKm dinamico — altrimenti al click si vedeva
                    // riapparire la card duplicata.
                    if (getKmIncludedForVehicle((item as any).category, vehicleType) === null) return null
                    return (
                      <div
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${formData.kmPackageType === 'unlimited'
                          ? 'border-white/40 bg-white/10'
                          : 'border-gray-600 hover:border-gray-500'}`}
                        onClick={() => setFormData(prev => ({ ...prev, kmPackageType: 'unlimited' as any }))}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-bold text-white">Km illimitati</span>
                            <p className="text-sm text-gray-400">Senza limiti di percorrenza</p>
                          </div>
                          <span className="font-bold text-white">{unlimitedPrice > 0 ? `+€${unlimitedPrice}/giorno` : 'Incluso'}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                // Non-supercar km selection
                <div className="space-y-3">
                  {/* Standard auto-calculated km option */}
                  <div
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${(formData.kmPackageType === 'none' && Object.values(formData.kmPackages || {}).every(q => !q))
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-gray-600 hover:border-gray-500'}`}
                    onClick={() => setFormData(prev => ({ ...prev, kmPackageType: 'none' as any, kmPackages: {} }))}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-bold text-white">{calculateIncludedKm(duration.days || 1, getKmIncludedForVehicle((item as any).category, vehicleType)) || 0} km inclusi</span>
                        <p className="text-sm text-gray-400">Calcolati sulla durata del noleggio ({duration.days || 1} {(duration.days || 1) === 1 ? 'giorno' : 'giorni'})</p>
                      </div>
                      <span className="font-bold text-green-400">Incluso</span>
                    </div>
                  </div>
                  {/* === PACCHETTI KM (2026-05-16) === stesso meccanismo
                      del branch supercar — mostrati fra Inclusi e Illimitati. */}
                  {(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rawCat = String(((item as any).category ?? '')).toLowerCase().trim()
                    const pkgs = resolvePacchetti(rawCat, configOverlay?.pacchettiByCategory) as Array<{ id: string; km: number; sconto_pct: number; price: number; label: string }>
                    if (pkgs.length === 0) return null
                    return pkgs.map(pkg => {
                      const selKey = `pacchetto:${pkg.id}`
                      const isSelected = (formData.kmPackageType as string) === selKey
                      return (
                        <div key={pkg.id}
                          className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${isSelected ? 'border-dr7-gold bg-dr7-gold/10' : 'border-gray-600 hover:border-gray-500'}`}
                          onClick={() => setFormData(prev => ({ ...prev, kmPackageType: selKey as any }))}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-bold text-white">{pkg.label} ({pkg.km} km)</span>
                              <p className="text-sm text-gray-400">
                                {pkg.sconto_pct > 0
                                  ? `Sconto ${pkg.sconto_pct}% sul sforo`
                                  : `${pkg.km} km extra inclusi`}
                              </p>
                            </div>
                            <span className="font-bold text-dr7-gold">+{formatPrice(pkg.price)}</span>
                          </div>
                        </div>
                      )
                    })
                  })()}
                  {/* Unlimited km option — solo se prezzo > 0.
                      BUG FIX 2026-05-16: nascondi l'opzione quando l'admin
                      ha disattivato Km Illimitati (unlimitedKm_enabled=false)
                      o quando il prezzo non e' configurato. Prima si vedeva
                      "Gratis" e il cliente prenotava km illimitati a €0. */}
                  {(() => {
                    const days = duration.days || 1;
                    const tier = (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2';
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rawCat = String(((item as any).category ?? '')).toLowerCase().trim()
                    const byCat = configOverlay?.unlimitedKmByCategory
                    // 2026-05-22: legge la categoria del veicolo da Centralina Pro.
                    // Entry assente = toggle OFF (opzione nascosta).
                    // Entry presente con 0 = toggle ON gratis ("Incluso").
                    let perDay: number | null = null
                    if (rawCat && byCat) {
                      const aliases = (rawCat === 'supercars' || rawCat === 'supercar') ? ['supercars', 'exotic', 'supercar']
                                    : rawCat === 'exotic' ? ['exotic', 'supercars', 'supercar']
                                    : [rawCat]
                      for (const k of aliases) {
                        const v = byCat[k]?.[tier]
                        if (typeof v === 'number') { perDay = v; break }
                      }
                    }
                    if (perDay === null) return null
                    return (
                      <div
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${formData.kmPackageType === 'unlimited'
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-gray-600 hover:border-gray-500'}`}
                        onClick={() => setFormData(prev => ({ ...prev, kmPackageType: 'unlimited' as any }))}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-bold text-white">Km illimitati</span>
                            <p className="text-sm text-gray-400">Senza limiti di percorrenza</p>
                          </div>
                          <span className="font-bold text-white">
                            {perDay > 0 ? formatPrice(perDay * days) : 'Incluso'}
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </section>

            {/* === C. SERVIZI AGGIUNTIVI (tier-conditional prices) ===
                BUG FIX 2026-05-16: nascondi opzioni con prezzo <= 0. Stesso
                rischio di Km Illimitati: admin disattiva un servizio in
                Centralina Pro (o non lo configura), il cliente lo selezione
                a €0 e prenota gratis. Adesso se prezzo non valido → opzione
                non appare. */}
            {(tierPricing.lavaggio > 0 || tierPricing.secondDriverPerDay > 0) && (
            <section className="border-t border-gray-700 pt-6">
              <h3 className="text-lg font-bold text-white mb-4">C. SERVIZI AGGIUNTIVI</h3>
              <div className="space-y-3">
                {/* Lavaggio finale — solo se prezzo > 0 */}
                {tierPricing.lavaggio > 0 && (
                <div className={`flex items-center p-3 rounded-md border ${'bg-gray-800/50 border-gray-700'}`}>
                  <input type="checkbox" checked disabled className="h-4 w-4" />
                  <span className="ml-3 text-white">Pulizia finale</span>
                  <span className={`ml-auto font-semibold ${'text-white'}`}>
                    {`€${tierPricing.lavaggio.toFixed(2)}`}
                  </span>
                </div>
                )}

                {/* Second driver with tier price — solo se prezzo > 0 */}
                {tierPricing.secondDriverPerDay > 0 && (
                <div
                  className={`p-3 rounded-md border cursor-pointer transition-all ${formData.addSecondDriver
                    ? 'border-white bg-white/5' : 'border-gray-700 hover:border-gray-500'}`}
                  onClick={() => setFormData(prev => ({ ...prev, addSecondDriver: !prev.addSecondDriver }))}
                >
                  <div className="flex items-center">
                    <input type="checkbox" checked={formData.addSecondDriver} onChange={() => {}} className="h-4 w-4" />
                    <span className="ml-3 text-white">Secondo guidatore</span>
                    <span className="ml-auto font-semibold text-white">€{tierPricing.secondDriverPerDay}/giorno</span>
                  </div>
                </div>
                )}
              </div>
            </section>
            )}

            {/* === D. CAUZIONE — from Centralina for ALL vehicles === */}
            {getMembershipTierName(user) !== 'gold' && getMembershipTierName(user) !== 'platinum' ? (
              /* Supercar: tier-based deposit options */
              <section className="border-t border-gray-700 pt-6">
                <h3 className="text-lg font-bold text-white mb-2">D. CAUZIONE</h3>
                <p className="text-sm text-gray-400 mb-4">Scegli come gestire la cauzione.</p>
                {(() => {
                  const rcaOpt = insuranceOptions.find((o: any) => o.id === 'RCA');
                  const mandatoryAmount = rcaOpt?.mandatoryDeposit || 0;
                  if (selectedInsuranceIsRCA && mandatoryAmount > 0) {
                    return (
                      <div className="p-4 rounded-lg border-2 border-red-500/50 bg-red-500/10">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white">Cauzione obbligatoria (solo RCA)</span>
                          <span className="font-bold text-red-400">€{mandatoryAmount.toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">Senza Kasko è richiesta una cauzione di €{mandatoryAmount.toLocaleString()} su carta di credito.</p>
                      </div>
                    );
                  }
                  return null;
                })()}
                {!selectedInsuranceIsRCA && <div className="space-y-3">
                  {depositOptions.map(opt => {
                    const isSelected = formData.depositOption === opt.id;
                    // no_deposit: disabled only if insurance is RCA (Kasko required).
                    // Both Fascia A and Fascia B can request approval via the popup.
                    const isDisabled = opt.id === 'no_deposit' && selectedInsuranceIsRCA;
                    return (
                      <div
                        key={opt.id}
                        className={`p-4 rounded-lg border-2 transition-colors ${isDisabled
                          ? 'border-gray-700 opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'border-green-500 bg-green-500/10 cursor-pointer'
                            : 'border-gray-600 hover:border-gray-500 cursor-pointer'}`}
                        onClick={() => {
                          if (opt.id === 'no_deposit') {
                            // Elite/Member: no approval needed, select directly
                            if (isLoyalCustomer) {
                              setFormData(prev => ({ ...prev, depositOption: 'no_deposit' }));
                              return;
                            }
                            // Non-loyal: reflect the choice in the wizard immediately
                            // (recap + price update) and open the approval popup.
                            // Without this, the riepilogo still shows "Cauzione €2000"
                            // because formData.depositOption stays on the previous pick.
                            setFormData(prev => ({ ...prev, depositOption: 'no_deposit' }));
                            setShowNoCauzionePopup(true);
                            return;
                          }
                          if (isDisabled) return;
                          if (opt.id === 'vehicle_deposit') {
                            // Don't set depositOption yet — wait for popup confirmation
                            setShowVehicleDepositPopup(true);
                            return;
                          }
                          setFormData(prev => ({ ...prev, depositOption: opt.id }));
                        }}
                      >
                        <div className="flex items-center">
                          <input type="radio" name="depositOption" checked={isSelected} disabled={isDisabled} onChange={() => {}} className="w-4 h-4" />
                          <div className="ml-3 flex-1">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-white">{opt.label}</span>
                              <span className="font-bold text-white">
                                {opt.surchargePerDay ? `€${opt.surchargePerDay}/giorno` : opt.amount > 0 ? `€${opt.amount.toLocaleString()}` : ''}
                              </span>
                            </div>
                            <p className="text-sm text-gray-400 mt-1">{opt.description}</p>
                            {isDisabled && (
                              <p className="text-xs text-red-400 mt-1">Disponibile solo con acquisto Kasko</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>}
                {noCauzioneRequested && formData.depositOption === 'no_deposit' && (
                  <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <p className="text-green-400 text-sm font-medium">Richiesta No Cauzione inviata! Sarai contattato per conferma.</p>
                  </div>
                )}
                {errors.depositOption && <p className="text-xs text-red-400 mt-2">{errors.depositOption}</p>}
              </section>
            ) : null}

            {/* No Cauzione Request Popup */}
            {showNoCauzionePopup && (
              <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowNoCauzionePopup(false)}>
                <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full max-h-[90dvh] overflow-y-auto overscroll-contain" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-white mb-3">Richiesta No Cauzione</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    L'opzione "Nessuna Cauzione" richiede l'approvazione del team DR7.
                    Invieremo la tua richiesta e sarai contattato per conferma.
                  </p>
                  <p className="text-white text-sm mb-1">Supplemento: <span className="font-bold text-white">€{ACTIVE_NO_DEPOSIT_SURCHARGE}/giorno</span></p>
                  <p className="text-gray-500 text-xs mb-4">Richiede Kasko attiva. Soggetto a verifica e approvazione del team DR7.</p>
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-4">
                    <p className="text-red-400 text-xs font-bold mb-1">ATTENZIONE</p>
                    <p className="text-gray-300 text-xs leading-relaxed">
                      Il pagamento con carta prepagata comporta l'obbligo di cauzione secondo modalità standard.
                      Senza cauzione, il veicolo non verrà consegnato.
                      Procedendo, il cliente accetta integralmente tale condizione.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowNoCauzionePopup(false)}
                      className="flex-1 py-3 border border-gray-600 text-white rounded-full font-semibold text-sm hover:bg-gray-800 transition-colors"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={() => {
                        setFormData(prev => ({ ...prev, depositOption: 'no_deposit' }));
                        setNoCauzioneRequested(true);
                        setShowNoCauzionePopup(false);
                      }}
                      className="flex-1 py-3 bg-white text-black rounded-full font-bold text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                      {noCauzioneSending ? 'Invio...' : 'Invia Richiesta'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Vehicle Deposit Popup — Targa check + Upload libretto + reminder */}
            {showVehicleDepositPopup && (
              <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => { setShowVehicleDepositPopup(false); if (!vehicleDepositVerified) setFormData(prev => ({ ...prev, depositOption: '' })); }}>
                <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full max-h-[90dvh] overflow-y-auto overscroll-contain" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-white mb-3">Cauzione con Veicolo</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Il veicolo deve essere di proprietà e immatricolato dal <strong className="text-white">2020 in poi</strong>. Supplemento: <span className="font-bold text-white">€20/giorno</span>.
                  </p>

                  {/* Step 1: Enter targa */}
                  {!vehicleDepositVerified && (
                    <>
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-white mb-2">Inserisci la Targa del tuo veicolo</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={vehicleDepositTarga}
                            onChange={e => { setVehicleDepositTarga(e.target.value.toUpperCase()); setVehicleDepositError(null); }}
                            placeholder="es. AB123CD"
                            maxLength={8}
                            className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white uppercase text-center font-bold text-lg tracking-widest"
                          />
                          <button
                            onClick={async () => {
                              if (!vehicleDepositTarga || vehicleDepositTarga.length < 5) {
                                setVehicleDepositError('Inserisci una targa valida');
                                return;
                              }
                              setVehicleDepositLoading(true);
                              setVehicleDepositError(null);
                              try {
                                const res = await fetch(`/.netlify/functions/lookupTarga?plate=${encodeURIComponent(vehicleDepositTarga)}`);
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.error || 'Targa non trovata');
                                const year = parseInt(data.registrationYear);
                                if (isNaN(year) || year < 2020) {
                                  setVehicleDepositError(`Veicolo immatricolato nel ${data.registrationYear || '?'} — deve essere dal 2020 in poi. Scegli un\'altra opzione di cauzione.`);
                                  setVehicleDepositInfo(`${data.carMake} ${data.carModel} (${data.registrationYear})`);
                                } else {
                                  setVehicleDepositVerified(true);
                                  setVehicleDepositInfo(`${data.carMake} ${data.carModel} (${data.registrationYear})`);
                                  setVehicleDepositError(null);
                                }
                              } catch (err: any) {
                                setVehicleDepositError(err.message || 'Errore verifica targa');
                              } finally {
                                setVehicleDepositLoading(false);
                              }
                            }}
                            disabled={vehicleDepositLoading || vehicleDepositTarga.length < 5}
                            className="px-4 py-2.5 bg-white text-black font-bold rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm"
                          >
                            {vehicleDepositLoading ? '...' : 'Verifica'}
                          </button>
                        </div>
                        {vehicleDepositInfo && !vehicleDepositVerified && (
                          <p className="text-gray-400 text-xs mt-1">{vehicleDepositInfo}</p>
                        )}
                        {vehicleDepositError && (
                          <p className="text-red-400 text-sm mt-2">{vehicleDepositError}</p>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setFormData(prev => ({ ...prev, depositOption: '' }));
                            setShowVehicleDepositPopup(false);
                            setVehicleDepositTarga('');
                            setVehicleDepositError(null);
                            setVehicleDepositInfo(null);
                          }}
                          className="flex-1 py-3 border border-gray-600 text-white rounded-full font-semibold text-sm hover:bg-gray-800 transition-colors"
                        >
                          Annulla
                        </button>
                      </div>
                    </>
                  )}

                  {/* Step 2: Verified — owner check + upload libretto + reminder */}
                  {vehicleDepositVerified && (
                    <>
                      <div className="p-3 bg-green-900/20 border border-green-500/50 rounded-lg mb-4">
                        <p className="text-green-400 text-sm font-semibold">✓ Veicolo verificato: {vehicleDepositInfo}</p>
                        <p className="text-green-300 text-xs mt-1">Targa: {vehicleDepositTarga}</p>
                      </div>

                      {/* Owner check */}
                      <div className="mb-4">
                        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-gray-500 transition-colors">
                          <input
                            type="checkbox"
                            checked={vehicleDepositIsOwner}
                            onChange={e => setVehicleDepositIsOwner(e.target.checked)}
                            className="w-5 h-5 rounded"
                          />
                          <span className="text-white font-semibold text-sm">Sono il proprietario del veicolo</span>
                        </label>
                      </div>

                      {/* Different owner form */}
                      {!vehicleDepositIsOwner && (
                        <div className="mb-4 p-4 bg-gray-800/50 border border-gray-600 rounded-lg space-y-3">
                          <p className="text-white font-semibold text-sm mb-2">Dati del Proprietario del Veicolo</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Nome *</label>
                              <input type="text" value={vehicleDepositOwner.nome} onChange={e => setVehicleDepositOwner(p => ({ ...p, nome: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" placeholder="Nome" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Cognome *</label>
                              <input type="text" value={vehicleDepositOwner.cognome} onChange={e => setVehicleDepositOwner(p => ({ ...p, cognome: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" placeholder="Cognome" />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">Codice Fiscale *</label>
                            <input type="text" value={vehicleDepositOwner.codiceFiscale} onChange={e => setVehicleDepositOwner(p => ({ ...p, codiceFiscale: e.target.value.toUpperCase() }))} maxLength={16} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm uppercase" placeholder="RSSMRA85M01H501Z" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Data di Nascita *</label>
                              <input type="date" value={vehicleDepositOwner.dataNascita} onChange={e => setVehicleDepositOwner(p => ({ ...p, dataNascita: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Luogo di Nascita *</label>
                              <input type="text" value={vehicleDepositOwner.luogoNascita} onChange={e => setVehicleDepositOwner(p => ({ ...p, luogoNascita: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" placeholder="Cagliari" />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">Indirizzo *</label>
                            <input type="text" value={vehicleDepositOwner.indirizzo} onChange={e => setVehicleDepositOwner(p => ({ ...p, indirizzo: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" placeholder="Via Roma 1" />
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Città *</label>
                              <input type="text" value={vehicleDepositOwner.citta} onChange={e => setVehicleDepositOwner(p => ({ ...p, citta: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" placeholder="Cagliari" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">CAP *</label>
                              <input type="text" value={vehicleDepositOwner.cap} onChange={e => setVehicleDepositOwner(p => ({ ...p, cap: e.target.value }))} maxLength={5} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" placeholder="09100" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Provincia</label>
                              <input type="text" value={vehicleDepositOwner.provincia} onChange={e => setVehicleDepositOwner(p => ({ ...p, provincia: e.target.value.toUpperCase() }))} maxLength={2} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm uppercase" placeholder="CA" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Telefono *</label>
                              <input type="tel" value={vehicleDepositOwner.telefono} onChange={e => setVehicleDepositOwner(p => ({ ...p, telefono: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" placeholder="+39 333 1234567" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Email</label>
                              <input type="email" value={vehicleDepositOwner.email} onChange={e => setVehicleDepositOwner(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" placeholder="email@esempio.it" />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Upload libretto fronte */}
                      <div className="mb-3">
                        <label className="block text-sm font-semibold text-white mb-2">Libretto di Circolazione — Fronte *</label>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => setVehicleDepositLibretto(e.target.files?.[0] || null)}
                          className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-white file:text-black hover:file:bg-gray-200"
                        />
                        {vehicleDepositLibretto && (
                          <p className="text-green-400 text-xs mt-1">✓ {vehicleDepositLibretto.name}</p>
                        )}
                      </div>

                      {/* Upload libretto verso */}
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-white mb-2">Libretto di Circolazione — Verso <span className="text-gray-400 font-normal">(opzionale)</span></label>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => setVehicleDepositLibrettoVerso(e.target.files?.[0] || null)}
                          className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-white file:text-black hover:file:bg-gray-200"
                        />
                        {vehicleDepositLibrettoVerso && (
                          <p className="text-green-400 text-xs mt-1">✓ {vehicleDepositLibrettoVerso.name}</p>
                        )}
                      </div>

                      {!vehicleDepositLibretto && (
                        <p className="text-red-400 text-xs mb-3">* Il caricamento del Libretto di Circolazione (fronte) è obbligatorio per procedere</p>
                      )}

                      {/* Reminder */}
                      <div className="p-3 bg-gray-800/40 border border-white/30 rounded-lg mb-6">
                        <p className="text-white text-sm font-semibold">Ricordati di portare al ritiro:</p>
                        <ul className="mt-2 space-y-1 text-white text-sm">
                          <li>• Libretto di Circolazione originale</li>
                          <li>• Chiave del veicolo</li>
                          <li>• Veicolo (la macchina deve essere presente al ritiro)</li>
                        </ul>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setFormData(prev => ({ ...prev, depositOption: '' }));
                            setShowVehicleDepositPopup(false);
                            setVehicleDepositVerified(false);
                            setVehicleDepositTarga('');
                            setVehicleDepositInfo(null);
                            setVehicleDepositIsOwner(true);
                          }}
                          className="flex-1 py-3 border border-gray-600 text-white rounded-full font-semibold text-sm hover:bg-gray-800 transition-colors"
                        >
                          Annulla
                        </button>
                        <button
                          disabled={
                            !vehicleDepositLibretto || !vehicleDepositVerified ||
                            (!vehicleDepositIsOwner && (!vehicleDepositOwner.nome || !vehicleDepositOwner.cognome || !vehicleDepositOwner.codiceFiscale || !vehicleDepositOwner.telefono))
                          }
                          onClick={async () => {
                            // Upload libretto fronte
                            if (vehicleDepositLibretto && user?.id) {
                              try {
                                const ext = vehicleDepositLibretto.name.split('.').pop();
                                const path = `${user.id}/libretto_fronte_${Date.now()}.${ext}`;
                                await supabase.storage.from('driver-licenses').upload(path, vehicleDepositLibretto);
                              } catch (e) {
                                console.error('Libretto fronte upload error:', e);
                              }
                            }
                            // Upload libretto verso
                            if (vehicleDepositLibrettoVerso && user?.id) {
                              try {
                                const ext = vehicleDepositLibrettoVerso.name.split('.').pop();
                                const path = `${user.id}/libretto_verso_${Date.now()}.${ext}`;
                                await supabase.storage.from('driver-licenses').upload(path, vehicleDepositLibrettoVerso);
                              } catch (e) {
                                console.error('Libretto verso upload error:', e);
                              }
                            }
                            // Set depositOption NOW that all data is confirmed
                            setFormData(prev => ({ ...prev, depositOption: 'vehicle_deposit' }));
                            setShowVehicleDepositPopup(false);
                          }}
                          className="flex-1 py-3 bg-white text-black rounded-full font-bold text-sm hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Conferma
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}


            {/* === F. SERVIZI EXPERIENCE (hidden for VIP) === */}
            <section className="border-t border-gray-700 pt-6">
              <h3 className="text-lg font-bold text-white mb-2">F. SERVIZI EXPERIENCE</h3>
              <p className="text-sm text-gray-400 mb-4">Personalizza la tua esperienza con servizi esclusivi.</p>
              <div className="space-y-3">
                {experienceServices.map(svc => {
                  const qty = formData.selectedExperiences[svc.id] || 0;
                  const isSelected = qty > 0;
                  const unitLabel = svc.unit === 'per_day' ? '/giorno' : svc.unit === 'per_hour' ? '/ora' : svc.unit === 'per_item' ? '/unità' : '';
                  return (
                    <div
                      key={svc.id}
                      className={`p-3 rounded-md border transition-all ${isSelected
                        ? 'border-white bg-white/5' : 'border-gray-700 hover:border-gray-500'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <span className="text-white font-medium">{svc.name}</span>
                          <p className="text-xs text-gray-400 mt-0.5">{svc.description}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <span className="font-semibold text-white text-sm whitespace-nowrap">€{svc.price.toFixed(2)}{unitLabel}</span>
                          {(svc.unit === 'per_item' || svc.unit === 'per_hour') ? (
                            <div className="flex items-center gap-1">
                              <button type="button" className="w-7 h-7 rounded bg-gray-700 text-white font-bold hover:bg-gray-600"
                                onClick={() => setFormData(prev => ({
                                  ...prev,
                                  selectedExperiences: { ...prev.selectedExperiences, [svc.id]: Math.max(0, qty - 1) }
                                }))}>-</button>
                              <span className="w-6 text-center text-white text-sm">{qty}</span>
                              <button type="button" className="w-7 h-7 rounded bg-gray-700 text-white font-bold hover:bg-gray-600"
                                onClick={() => setFormData(prev => ({
                                  ...prev,
                                  selectedExperiences: { ...prev.selectedExperiences, [svc.id]: qty + 1 }
                                }))}>+</button>
                            </div>
                          ) : (
                            <button type="button"
                              className={`px-3 py-1 rounded text-sm font-bold ${isSelected ? 'bg-white text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                              onClick={() => setFormData(prev => ({
                                ...prev,
                                selectedExperiences: { ...prev.selectedExperiences, [svc.id]: isSelected ? 0 : 1 }
                              }))}
                            >
                              {isSelected ? 'Aggiunto' : svc.unit === 'per_day' ? 'Aggiungi' : 'Aggiungi'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* DR7 FLEX rimosso come addon dedicato — ora è un servizio
                 in EXPERIENCE_SERVICES via Centralina Pro. */}
          </div>
        );
      }
      case 4:
        // No Cauzione flow: save as preventivo (except Elite/Member who pay directly)
        if (formData.depositOption === 'no_deposit' && !isLoyalCustomer) {
          if (noCauzioneSaved) {
            return (
              <div className="space-y-6 text-center py-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/20 rounded-full mb-4">
                  <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white">Richiesta Inviata!</h2>
                <p className="text-gray-400 max-w-md mx-auto">
                  La tua richiesta per la formula senza cauzione è stata registrata. Il team DR7 la contatterà via WhatsApp con l'esito e, in caso di approvazione, il link di pagamento.
                </p>
                <button
                  type="button"
                  onClick={() => window.location.href = '/'}
                  className="mt-4 px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors"
                >
                  Torna alla Home
                </button>
              </div>
            );
          }
          return (
            <div className="space-y-6">
              <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
                  <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Riepilogo Preventivo</h3>
                <p className="text-gray-400 text-sm mb-6">
                  Cliccando "Salva Preventivo" la tua richiesta verrà inviata al team DR7 per approvazione. Riceverai un messaggio WhatsApp con l'esito.
                </p>
              </div>

              <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Veicolo</span><span className="text-white font-semibold">{item.name}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Ritiro</span><span className="text-white">{formData.pickupDate ? new Date(formData.pickupDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }) : '—'} — {formData.pickupTime || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Riconsegna</span><span className="text-white">{formData.returnDate ? new Date(formData.returnDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }) : '—'} — {formData.returnTime || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Durata</span><span className="text-white">{Math.max(1, duration.days)} {Math.max(1, duration.days) === 1 ? 'giorno' : 'giorni'}</span></div>
                <hr className="border-gray-600 my-1" />
                <div className="flex justify-between"><span className="text-gray-400">Noleggio {item.name}</span><span className="text-white">{formatPrice(rentalCost)}</span></div>
                {insuranceCost > 0 && <div className="flex justify-between"><span className="text-gray-400">Assicurazione {(() => { const opts = getInsuranceForVehicle(vehicleType, (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2'); return opts.find(o => o.id === formData.insuranceOption)?.name || formData.insuranceOption?.replace(/_/g, ' '); })()}</span><span className="text-white">{formatPrice(insuranceCost)}</span></div>}
                {lavaggioFee > 0 && <div className="flex justify-between"><span className="text-gray-400">Lavaggio</span><span className="text-white">{formatPrice(lavaggioFee)}</span></div>}
                {/* 2026-05-16: Quando il cliente sceglie un pacchetto, mostriamo
                    SIA la riga "X km inclusi" (totale post-somma con il pacchetto)
                    SIA la riga del pacchetto col prezzo. Per Km illimitati si
                    mostra solo "Km illimitati". Per la scelta di default ("none"),
                    solo "X km inclusi" senza riga di costo. */}
                {(() => {
                  // 2026-05-16: pacchetti CUMULATIVI. Render:
                  //   - "Chilometri: X km inclusi" (base, sempre tranne Illimitati)
                  //   - una riga per ciascun pacchetto selezionato
                  //   - oppure "Km illimitati" se attivo
                  const isIllimitati = formData.kmPackageType === 'unlimited'
                  if (isIllimitati && kmPackageCost > 0) {
                    return <div className="flex justify-between"><span className="text-gray-400">Km illimitati</span><span className="text-white">{formatPrice(kmPackageCost)}</span></div>
                  }
                  const rawCat = String((item as any).category ?? '').toLowerCase().trim()
                  const pkgsList = resolvePacchetti(rawCat, configOverlay?.pacchettiByCategory)
                  const selectedPkgs = pkgsList
                    .map(pkg => ({ pkg, qty: formData.kmPackages?.[pkg.id] || 0 }))
                    .filter(x => x.qty > 0)
                  const pkgKmSum = selectedPkgs.reduce((s, x) => s + x.pkg.km * x.qty, 0)
                  const baseKm = Math.max(0, includedKm - pkgKmSum)
                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Chilometri</span>
                        <span className="text-white">{baseKm >= 9999 ? 'Illimitati inclusi' : `${baseKm} km inclusi`}</span>
                      </div>
                      {selectedPkgs.map(({ pkg, qty }) => (
                        <div key={pkg.id} className="flex justify-between">
                          <span className="text-gray-400">
                            {qty > 1 ? `${pkg.label} × ${qty} (${pkg.km * qty} km)` : `${pkg.label} (${pkg.km} km)`}
                          </span>
                          <span className="text-white">{formatPrice(pkg.price * qty)}</span>
                        </div>
                      ))}
                    </>
                  )
                })()}
                <div className="flex justify-between"><span className="text-green-400">Supplemento No Cauzione</span><span className="text-green-400">{formatPrice(noDepositSurcharge)}</span></div>
                {hasDynamicDiscount && <div className="flex justify-between text-blue-400"><span>Sconto Revenue ({dynamicDiscountPct}%)</span><span>-{formatPrice(listSubtotal - subtotal)}</span></div>}
                <hr className="border-gray-600 my-1" />
                <div className="flex justify-between text-lg font-bold"><span className="text-white">TOTALE</span><span className="text-white">{formatPrice(grandTotal)}</span></div>
              </div>

              <button
                type="button"
                disabled={noCauzioneSending}
                onClick={async () => {
                  setNoCauzioneSending(true);
                  try {
                    // Build booking data same as normal flow but with pending status
                    const pDate = formData.pickupDate || new Date().toISOString().split('T')[0];
                    const rDate = formData.returnDate || pDate;
                    const pTime = formData.pickupTime || '10:30';
                    const rTime = formData.returnTime || '09:00';
                    const pickupDateTime = new Date(`${pDate}T${pTime}:00`);
                    const dropoffDateTime = new Date(`${rDate}T${rTime}:00`);
                    if (isNaN(pickupDateTime.getTime()) || isNaN(dropoffDateTime.getTime())) {
                      throw new Error('Date o orari non validi. Torna allo step 1 e seleziona date e orari.');
                    }
                    const bookingData = {
                      service_type: 'car_rental',
                      customer_name: `${formData.firstName} ${formData.lastName}`,
                      customer_email: formData.email,
                      customer_phone: formData.phone,
                      vehicle_name: item.name,
                      vehicle_id: formData.selectedVehicleId || null,
                      vehicle_plate: null,
                      pickup_date: pickupDateTime.toISOString(),
                      dropoff_date: dropoffDateTime.toISOString(),
                      pickup_location: formData.pickupLocation,
                      dropoff_location: formData.returnLocation,
                      price_total: Math.round(grandTotal * 100),
                      currency: 'EUR',
                      status: 'pending',
                      payment_status: 'pending',
                      payment_method: 'Nexi Pay by Link',
                      // insurance_option stored in booking_details.insuranceOption (not a top-level column)
                      booked_at: new Date().toISOString(),
                      user_id: user?.id || null,
                      booking_details: {
                        no_cauzione_request: true,
                        depositOption: 'no_deposit',
                        noDepositSurcharge: noDepositSurcharge,
                        driver_tier: driverTier,
                        insurance_cost: insuranceCost,
                        km_cost: kmPackageCost,
                        lavaggio_fee: lavaggioFee,
                        rental_cost: rentalCost,
                        customer: { firstName: formData.firstName, lastName: formData.lastName, email: formData.email, phone: formData.phone },
                      },
                    };
                    const { error } = await supabase.from('bookings').insert(bookingData);
                    if (error) throw error;

                    // Send WhatsApp to admin
                    const msg = `*RICHIESTA NO CAUZIONE DAL SITO*\n\n`
                      + `*Cliente:* ${formData.firstName} ${formData.lastName}\n`
                      + `*Email:* ${formData.email}\n`
                      + `*Tel:* ${formData.phone}\n`
                      + `*Veicolo:* ${item?.name || 'N/A'}\n`
                      + `*Date:* ${formData.pickupDate} → ${formData.returnDate}\n`
                      + `*Totale:* €${grandTotal.toFixed(2)}\n`
                      + `*Supplemento No Cauzione:* €${ACTIVE_NO_DEPOSIT_SURCHARGE}/giorno`;
                    await fetch('/.netlify/functions/send-whatsapp-notification', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ customMessage: msg }),
                    });

                    // Send confirmation to customer
                    const customerPhone = formData.phone?.replace(/[\s\-\+()]/g, '') || '';
                    if (customerPhone) {
                      const customerMsg = `Gentile ${formData.firstName},\n\n`
                        + `abbiamo ricevuto la sua richiesta per la formula senza cauzione relativa alla prenotazione appena effettuata.\n\n`
                        + `Il nostro team sta effettuando una verifica rapida per confermarne l'idoneità.\n\n`
                        + `Riceverà a breve un aggiornamento con l'esito e, in caso di approvazione, il link di pagamento per completare la prenotazione.\n\n`
                        + `Restiamo a disposizione.\n\nCordiali saluti,\nDR7`;
                      await fetch('/.netlify/functions/send-whatsapp-notification', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ customMessage: customerMsg, customPhone: customerPhone }),
                      }).catch(() => {});
                    }

                    setNoCauzioneSaved(true);
                  } catch (err: any) {
                    setPaymentError(err.message || 'Errore salvataggio preventivo');
                  } finally {
                    setNoCauzioneSending(false);
                  }
                }}
                className="w-full py-4 bg-white text-black font-bold text-lg rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {noCauzioneSending ? 'Salvataggio...' : 'SALVA PREVENTIVO'}
              </button>
              {paymentError && <p className="text-red-400 text-sm text-center">{paymentError}</p>}
            </div>
          );
        }

        return (
          <div className="space-y-8">
            <section>
              <h3 className="text-lg font-bold text-white mb-4">METODO DI PAGAMENTO</h3>
              <div className="flex border-b border-gray-700 mb-6">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, paymentMethod: 'credit' }))}
                  className={`flex-1 py-2 text-sm font-semibold ${formData.paymentMethod === 'credit' ? 'text-white border-b-2 border-white' : 'text-gray-400'}`}
                >
                  Credit Wallet
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, paymentMethod: 'nexi' }))}
                  className={`flex-1 py-2 text-sm font-semibold ${formData.paymentMethod === 'nexi' ? 'text-white border-b-2 border-white' : 'text-gray-400'}`}
                >
                  Carta
                </button>
              </div>
              {/* DR7 Club separate payment notice */}
              {formData.extras.some(e => e.startsWith('subscription_')) && (
                <div className="mb-4 p-3 bg-white/10 border border-white/20 rounded-lg text-sm">
                  <p className="text-white font-semibold">DR7 Club — Pagamento separato</p>
                  <p className="text-white/70 text-xs mt-1">
                    {formData.paymentMethod === 'credit'
                      ? 'Il noleggio sarà pagato con il wallet. Riceverai un link separato per il pagamento DR7 Club (€39/anno) con carta.'
                      : 'Il noleggio e DR7 Club (€39/anno) saranno pagati insieme con carta.'}
                  </p>
                </div>
              )}

              {
                formData.paymentMethod === 'credit' ? (
                  <div className="text-center py-6">
                    {isLoadingBalance ? (
                      <div className="flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-t-white border-gray-600 rounded-full animate-spin"></div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-400 mb-2">Saldo Disponibile</p>
                        <p className="text-4xl font-bold text-white mb-4">€{creditBalance.toFixed(2)}</p>
                        {creditBalance < total ? (
                          <p className="text-sm text-red-400">Credito insufficiente. Richiesto: €{total.toFixed(2)}</p>
                        ) : (
                          <p className="text-sm text-green-400">✓ Saldo sufficiente</p>
                        )}
                      </>
                    )}
                    {paymentError && (
                      <div className="mt-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
                        <p className="text-sm text-red-400 text-center">{paymentError}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <h4 className="text-base font-semibold text-white mb-3">METODO DI PAGAMENTO</h4>
                    <div className="p-4 bg-gray-800 rounded-lg">
                      <div className="flex items-center justify-center gap-3 mb-3">
                        <svg viewBox="0 0 131.39 86.9" className="h-6 opacity-70" aria-label="Mastercard"><rect width="131.39" height="86.9" rx="8" fill="#000"/><circle cx="48.37" cy="43.45" r="27.5" fill="#eb001b"/><circle cx="83.02" cy="43.45" r="27.5" fill="#f79e1b"/><path d="M65.7 20.8a27.4 27.4 0 0 0-10.2 21.4c0 8.6 3.9 16.3 10.2 21.4a27.4 27.4 0 0 0 10.2-21.4c0-8.6-3.9-16.3-10.2-21.4Z" fill="#ff5f00"/></svg>
                        <svg viewBox="0 0 780 500" className="h-6 opacity-70" aria-label="Visa"><path d="M293.2 348.7l33.4-195.8h53.4l-33.4 195.8zM541.4 157.6a131.8 131.8 0 0 0-48.4-8.8c-53.2 0-90.7 27-91 65.7-.3 28.6 26.8 44.6 47.2 54.1 21 9.7 28 16 27.9 24.7-.1 13.3-16.7 19.4-32.2 19.4-21.5 0-32.9-3-50.6-10.4l-6.9-3.2-7.5 44.5c12.6 5.5 35.8 10.3 59.9 10.6 56.6 0 93.3-26.7 93.7-68 .2-22.7-14.2-40-45.3-54.2-18.9-9.2-30.4-15.4-30.3-24.7 0-8.3 9.8-17.2 30.9-17.2 17.6-.3 30.4 3.6 40.4 7.6l4.8 2.3 7.3-42.4z" fill="#1434cb"/><path d="M630.6 152.9h-41.6c-12.9 0-22.5 3.5-28.2 16.5l-79.9 182.3h56.5s9.2-24.5 11.3-29.9h69.1c1.6 7 6.5 29.9 6.5 29.9h50l-43.6-198.8zm-66.4 128.3c4.5-11.5 21.5-55.8 21.5-55.8-.3.5 4.4-11.5 7.1-19l3.6 17.2s10.3 47.6 12.5 57.6h-44.7zM232.8 152.9l-52.8 133.5-5.6-27.5c-9.8-31.5-40.2-65.7-74.3-82.8l48.2 172.4 57 0 84.7-195.8h-57.2z" fill="#1434cb"/><path d="M131.9 152.9H46.5l-.7 3.8c67.6 16.5 112.3 56.3 130.9 104.2l-18.9-91.6c-3.2-12.5-12.8-16-25.9-16.4z" fill="#f7a600"/></svg>
                        <svg viewBox="0 0 780 500" className="h-6 opacity-70" aria-label="PayPal"><path d="M622.8 201.7c-8.5-9.6-23.7-13.7-43.3-13.7h-56.6c-4 0-7.4 2.9-8 6.8l-23.5 149.4c-.5 3 1.8 5.8 4.9 5.8h37.6l-2.6 16.7c-.4 2.7 1.6 5 4.3 5h30.1c3.5 0 6.5-2.5 7-6l.3-1.5 5.6-35.2.4-1.9c.5-3.4 3.5-6 7-6h4.4c28.5 0 50.8-11.6 57.3-45 2.7-14-1.3-25.6-9-33.4z" fill="#179bd7"/><path d="M622.8 201.7c-8.5-9.6-23.7-13.7-43.3-13.7h-56.6c-4 0-7.4 2.9-8 6.8l-23.5 149.4c-.5 3 1.8 5.8 4.9 5.8h37.6l9.4-59.8-.3 1.9c.6-3.9 4-6.8 8-6.8h16.6c32.6 0 58.2-13.3 65.6-51.6.2-1.1.4-2.2.5-3.3 2.2-14.2-.0-23.8-11-32.7z" fill="#253b80"/><path d="M342.3 201.7c-8.5-9.6-23.7-13.7-43.3-13.7h-56.6c-4 0-7.4 2.9-8 6.8L211 344.2c-.5 3 1.8 5.8 4.9 5.8h38.5l9.7-61.4-.3 1.9c.6-3.9 4-6.8 8-6.8h16.6c32.6 0 58.2-13.3 65.6-51.6.2-1.1.4-2.2.5-3.3-1-.5-1-.5 0 0 2.2-14.2-.0-23.8-12.2-27.1z" fill="#253b80"/><path d="M342.3 201.7c-8.5-9.6-23.7-13.7-43.3-13.7h-56.6c-4 0-7.4 2.9-8 6.8L211 344.2c-.5 3 1.8 5.8 4.9 5.8h38.5l9.7-61.4 9.4-59.8-.3 1.9c.6-3.9 4-6.8 8-6.8h16.6c32.6 0 58.2-13.3 65.6-51.6.2-1.1.4-2.2.5-3.3 2.2-14.2-.0-23.8-11-32.7-1-.5-1-.5-1.1-27.6z" fill="#179bd7"/></svg>
                      </div>
                      <p className="text-gray-400 text-sm text-center">
                        Sarai reindirizzato a una pagina di pagamento sicura per completare la transazione.
                      </p>
                    </div>
                  </>
                )
              }
            </section >

            <section className="border-t border-gray-700 pt-6">
              <h3 className="text-lg font-bold text-white mb-4 uppercase">Conferme Finali</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-start">
                    <input id="confirms-documents" name="confirmsDocuments" type="checkbox" checked={formData.confirmsDocuments} onChange={handleChange} className="h-4 w-4 mt-1 rounded border-gray-600 bg-gray-700 text-white focus:ring-white" />
                    <label htmlFor="confirms-documents" className="ml-3 block text-sm font-medium text-white">
                      Confermo che i documenti caricati sono corretti e appartengono al conducente principale.
                    </label>
                  </div>
                  {errors.confirmsDocuments && <p className="text-xs text-red-400 mt-1 pl-7">{errors.confirmsDocuments}</p>}
                </div>
                <div>
                  <div className="flex items-start">
                    <input id="agrees-to-terms" name="agreesToTerms" type="checkbox" checked={formData.agreesToTerms} onChange={handleChange} className="h-4 w-4 mt-1 rounded border-gray-600 bg-gray-700 text-white focus:ring-white" />
                    <label htmlFor="agrees-to-terms" className="ml-3 block text-sm font-medium text-white">
                      Ho letto e accetto i <Link to="/rental-agreement" target="_blank" className="underline hover:text-white">termini e le condizioni di noleggio</Link>.
                    </label>
                  </div>
                  {errors.agreesToTerms && <p className="text-xs text-red-400 mt-1 pl-7">{errors.agreesToTerms}</p>}
                </div>
                <div>
                  <div className="flex items-start">
                    <input id="agrees-to-privacy" name="agreesToPrivacy" type="checkbox" checked={formData.agreesToPrivacy} onChange={handleChange} className="h-4 w-4 mt-1 rounded border-gray-600 bg-gray-700 text-white focus:ring-white" />
                    <label htmlFor="agrees-to-privacy" className="ml-3 block text-sm font-medium text-white">
                      Ho letto e accetto l'<Link to="/privacy-policy" target="_blank" className="underline hover:text-white">informativa sulla privacy</Link>.
                    </label>
                  </div>
                  {errors.agreesToPrivacy && <p className="text-xs text-red-400 mt-1 pl-7">{errors.agreesToPrivacy}</p>}
                </div>
              </div>
            </section>

            <section className="border-t border-gray-700 pt-6">
              <h3 className="text-lg font-bold text-white mb-4 uppercase">Riepilogo Completo Prenotazione</h3>
              <div className="p-6 bg-gray-800/50 rounded-lg border border-gray-700 space-y-6 text-sm">
                <div>
                  <p className="font-bold text-base text-white mb-2">VEICOLO SELEZIONATO</p>
                  <hr className="border-gray-600 mb-2" />
                  <p>{item.name}</p>
                </div>

                <div>
                  <p className="font-bold text-base text-white mb-2">DATE E LOCALITÀ</p>
                  <hr className="border-gray-600 mb-2" />
                  <p>Ritiro: {formData.pickupDate ? new Date(formData.pickupDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }) : '—'} alle {formData.pickupTime || '—'} - {pickupLocs.find(l => l.id === formData.pickupLocation)?.label?.it || formData.pickupLocation}</p>
                  <p>Riconsegna: {formData.returnDate ? new Date(formData.returnDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }) : '—'} alle {formData.returnTime || '—'} - {returnLocs.find(l => l.id === formData.returnLocation)?.label?.it || formData.returnLocation}</p>
                  <p>Durata: {Math.max(1, duration.days)} {Math.max(1, duration.days) === 1 ? 'giorno' : 'giorni'}</p>
                  {extraDayApplied && (
                    <div className="mt-1 p-2 bg-amber-900/30 border border-amber-500/50 rounded">
                      <p className="text-amber-300 text-xs font-semibold">L'orario di riconsegna supera il margine di 1h30 prima del ritiro: viene conteggiato 1 giorno aggiuntivo.</p>
                    </div>
                  )}
                  <p>Pacchetto km: {(formData.kmPackageType === 'unlimited' || includedKm >= 9999) ? 'ILLIMITATI' : `${includedKm} km`}</p>
                </div>

                <div>
                  <p className="font-bold text-base text-white mb-2">CONDUCENTE/I</p>
                  <hr className="border-gray-600 mb-2" />
                  <p>Principale: {formData.firstName} {formData.lastName}</p>
                  <p className="text-xs text-gray-400">{formData.email} - {formData.phone}</p>
                  <p className="text-xs text-gray-400">{driverAge} anni - Patente: {licenseYears} anni</p>
                  {(formData.licenseImage || formData.idImage) && <p className="text-xs text-green-400">Documenti caricati</p>}
                  {formData.addSecondDriver && (
                    <div className="mt-2">
                      <p>Secondo: {formData.secondDriver.firstName} {formData.secondDriver.lastName}</p>
                      <p className="text-xs text-gray-400">{formData.secondDriver.email} - {formData.secondDriver.phone}</p>
                      <p className="text-xs text-gray-400">Patente: {formData.secondDriver.licenseNumber} - Rilascio: {formData.secondDriver.licenseIssueDate} - Scadenza: {formData.secondDriver.licenseExpiryDate}</p>
                      <p className="text-xs text-gray-400">Paese di rilascio: {formData.secondDriver.countryOfIssue}</p>
                    </div>
                  )}
                </div>

                {/* DETTAGLIO COSTI — Full itemized breakdown */}
                <div>
                  <p className="font-bold text-base text-white mb-2">DETTAGLIO COSTI</p>
                  <hr className="border-gray-600 mb-2" />

                  {/* Noleggio base */}
                  <div className="flex justify-between">
                    <span>Noleggio ({Math.max(1, duration.days)} gg × {effectivePricePerDay ? formatPrice(effectivePricePerDay) : '€0'})</span>
                    <span>{formatPrice(rentalCost)}</span>
                  </div>

                  {/* Assicurazione */}
                  {insuranceCost > 0 && (
                    <div className="flex justify-between">
                      <span>Assicurazione {(() => {
                        const vType = getVehicleType(item);
                        const activeTier = (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2';
                        const allOpts = getInsuranceForVehicle(vType, activeTier);
                        const opt = allOpts.find(o => o.id === formData.insuranceOption);
                        return opt?.name || formData.insuranceOption?.replace(/_/g, ' ');
                      })()} ({Math.max(1, duration.days)} gg × €{(() => {
                        const vType = getVehicleType(item);
                        const activeTier = (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2';
                        const allOpts = getInsuranceForVehicle(vType, activeTier);
                        const opt = allOpts.find(o => o.id === formData.insuranceOption);
                        return opt?.dailyPrice || 0;
                      })()})</span>
                      <span>{formatPrice(insuranceCost)}</span>
                    </div>
                  )}
                  {insuranceCost === 0 && (
                    <div className="flex justify-between text-gray-400">
                      <span>Assicurazione ({formData.insuranceOption === 'RCA' ? 'Solo RCA' : 'Inclusa'})</span>
                      <span>€0,00</span>
                    </div>
                  )}

                  {/* KM — show inclusi line + pacchetto/illimitati line */}
                  {(() => {
                    const t = String(formData.kmPackageType || '')
                    const isIllimitati = formData.kmPackageType === 'unlimited'
                    if (isIllimitati && kmPackageCost > 0) {
                      return (
                        <div className="flex justify-between">
                          <span>Km illimitati ({Math.max(1, duration.days)} gg × €{(kmPackageCost / Math.max(1, duration.days)).toFixed(2)})</span>
                          <span>{formatPrice(kmPackageCost)}</span>
                        </div>
                      )
                    }
                    // Pacchetti cumulativi
                    const rawCat = String((item as any).category ?? '').toLowerCase().trim()
                    const pkgsList = resolvePacchetti(rawCat, configOverlay?.pacchettiByCategory)
                    const selectedPkgs = pkgsList
                      .map(pkg => ({ pkg, qty: formData.kmPackages?.[pkg.id] || 0 }))
                      .filter(x => x.qty > 0)
                    const pkgKmSum = selectedPkgs.reduce((s, x) => s + x.pkg.km * x.qty, 0)
                    const baseKm = Math.max(0, includedKm - pkgKmSum)
                    return (
                      <>
                        <div className="flex justify-between">
                          <span>Km inclusi nel noleggio</span>
                          <span>{baseKm} km</span>
                        </div>
                        {selectedPkgs.map(({ pkg, qty }) => (
                          <div key={pkg.id} className="flex justify-between">
                            <span>{qty > 1 ? `${pkg.label} × ${qty}` : pkg.label}{qty > 1 ? <span className="text-gray-400"> (+{pkg.km * qty} km)</span> : <span className="text-gray-400"> (+{pkg.km} km)</span>}</span>
                            <span>{formatPrice(pkg.price * qty)}</span>
                          </div>
                        ))}
                        {selectedPkgs.length > 0 && (
                          <div className="flex justify-between pt-1 mt-1 border-t border-gray-700/60 font-semibold">
                            <span className="text-dr7-gold">Totale km disponibili</span>
                            <span className="text-dr7-gold">{baseKm + pkgKmSum} km</span>
                          </div>
                        )}
                      </>
                    )
                  })()}
                  {formData.kmPackageType === '50km' && (
                    <div className="flex justify-between text-gray-400"><span>Pacchetto km (50 km/giorno)</span> <span>Incluso nel noleggio</span></div>
                  )}

                  {/* Secondo guidatore */}
                  {secondDriverFee > 0 && (
                    <div className="flex justify-between">
                      <span>Secondo guidatore ({Math.max(1, duration.days)} gg × €{(driverTier === 'TIER_1' || driverTier === 'TIER_2') ? ACTIVE_TIER_PRICING[driverTier].secondDriverPerDay : ACTIVE_TIER_PRICING.TIER_2.secondDriverPerDay})</span>
                      <span>{formatPrice(secondDriverFee)}</span>
                    </div>
                  )}

                  {/* Lavaggio / pulizia finale */}
                  {lavaggioFee > 0 && (
                    <div className="flex justify-between">
                      <span>Pulizia finale</span>
                      <span>{formatPrice(lavaggioFee)}</span>
                    </div>
                  )}

                  {/* Experience services */}
                  {experienceCost > 0 && Object.entries(formData.selectedExperiences).filter(([_, qty]) => qty > 0).map(([svcId, qty]) => {
                    const svc = ACTIVE_EXPERIENCE_SERVICES.find(s => s.id === svcId);
                    if (!svc) return null;
                    const unitLabel = svc.unit === 'per_day' ? `${Math.max(1, duration.days)} gg` : `${qty}x`;
                    const lineCost = svc.unit === 'per_day' ? svc.price * duration.days * qty : svc.price * qty;
                    return (
                      <div key={svcId} className="flex justify-between">
                        <span>{svc.name} ({unitLabel} × €{svc.price.toFixed(2)})</span>
                        <span>{formatPrice(lineCost)}</span>
                      </div>
                    );
                  })}

                  {/* DR7 Flex addon rimosso — ora è un servizio in EXPERIENCE_SERVICES */}

                  {/* Deposit surcharges */}
                  {noDepositSurcharge > 0 && (
                    <div className="flex justify-between text-white">
                      <span>{`Supplemento cauzione (${(() => {
                        const days = Math.max(1, duration.days);
                        const depositKey = `${(driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2'}_${residencySuffix}` as 'TIER_1_RESIDENT' | 'TIER_2_RESIDENT' | 'TIER_1_NON_RESIDENT' | 'TIER_2_NON_RESIDENT';
                        const depOpts = pickDepositOptions(configOverlay, vehicleType, depositKey, (item as any).category);
                        const selectedDep = depOpts.find((d: { id: string }) => d.id === formData.depositOption);
                        const perDay = selectedDep?.surchargePerDay || 0;
                        return perDay > 0 ? `${days} gg × €${perDay}` : `${days} gg`;
                      })()})`}</span>
                      <span>{formatPrice(noDepositSurcharge)}</span>
                    </div>
                  )}

                  {/* Additional surcharges from ours */}
                  {youngDriverFee > 0 && <div className="flex justify-between"><span>Supplemento under 25 ({Math.max(1, duration.days)} gg × €10)</span> <span>{formatPrice(youngDriverFee)}</span></div>}
                  {recentLicenseFee > 0 && <div className="flex justify-between"><span>Supplemento patente recente ({Math.max(1, duration.days)} gg × €20)</span> <span>{formatPrice(recentLicenseFee)}</span></div>}

                  <hr className="border-gray-500 my-2" />

                  {/* Subtotal, discounts, total */}
                  {hasDynamicDiscount && (
                    <>
                      <div className="flex justify-between text-gray-500 text-sm">
                        <span>Prezzo listino</span>
                        <span className="line-through">{formatPrice(listSubtotal)}</span>
                      </div>
                      <div className="flex justify-between text-green-400 text-sm">
                        <span className="flex items-center gap-1">
                          Prezzo dinamico
                          <span className={`text-xs px-1 py-0.5 rounded-full font-semibold ${dynamicDiscountPct > 0 ? 'bg-green-500/20' : 'bg-red-500/20 text-red-400'}`}>
                            {dynamicDiscountPct > 0 ? `-${dynamicDiscountPct}%` : `+${Math.abs(dynamicDiscountPct)}%`}
                          </span>
                        </span>
                        <span className="font-semibold">{formatPrice(uncappedSubtotal)}</span>
                      </div>
                    </>
                  )}
                  {!hasDynamicDiscount && (
                    <div className="flex justify-between text-gray-400"><span>Subtotale</span> <span>{formatPrice(uncappedSubtotal || finalTotal)}</span></div>
                  )}

                  {/* Coefficient breakdown — toggle reveals each coefficient
                      from Centralina Pro (occupazione flotta, occupazione
                      veicolo, anticipo, durata, stagione, gap, tipo giorno,
                      promo). Same UX as admin's ReservationsTab. */}
                  {dynamicPricing?.breakdown && dynamicPricing.breakdown.length > 0 && (
                    <div className="text-xs">
                      <button
                        type="button"
                        onClick={() => setCoeffExpanded(!coeffExpanded)}
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        {coeffExpanded ? 'Nascondi dettagli coefficienti' : 'Mostra dettagli coefficienti'}
                      </button>
                      {coeffExpanded && (
                        <div className="space-y-1 pt-2 mt-1 border-t border-gray-700">
                          {dynamicPricing.selectedBaseRateEur != null && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Base selezionata</span>
                              <span className="text-white">€{dynamicPricing.selectedBaseRateEur.toFixed(2)}/g</span>
                            </div>
                          )}
                          {dynamicPricing.breakdown.map((item, i) => (
                            <div key={i} className="flex justify-between">
                              <span className="text-gray-400">{item.label} <span className="text-gray-500">({item.description})</span></span>
                              <span className={`font-mono ${item.coeff > 1 ? 'text-red-400' : item.coeff < 1 ? 'text-green-400' : 'text-white'}`}>
                                ×{item.coeff.toFixed(2)}
                              </span>
                            </div>
                          ))}
                          <div className="flex justify-between pt-1 border-t border-gray-700/50">
                            <span className="text-gray-400">Coefficiente combinato</span>
                            <span className="font-mono text-white">
                              ×{(dynamicPricing.breakdown.reduce((acc, b) => acc * b.coeff, 1)).toFixed(3)}
                            </span>
                          </div>
                          {/* 2026-05-27: mirror del riepilogo admin Preventivi.
                              Mostra ESATTAMENTE quali voci sono entrate nel
                              calcolo del coefficiente e quali sono rimaste a
                              listino. I flag arrivano da Centralina Pro >
                              Automazioni > Inclusione coefficiente. Stesso
                              default-fallback del calcolo (vedi useMemo sopra). */}
                          {(() => {
                            const ci = configOverlay?.coefficientInclusion
                            // 2026-05-27: mostra TUTTE le voci toggle-driven anche
                            // se l'importo e' 0 (il cliente non ha aggiunto
                            // quell'opzione). Cosi' direzione/cliente vede sempre
                            // lo stato corrente di ogni toggle Centralina Pro.
                            const items: { label: string; on: boolean }[] = [
                              { label: 'Assicurazione',        on: ci?.insurance        ?? true  },
                              { label: 'Lavaggio',             on: ci?.lavaggio         ?? true  },
                              { label: 'No Cauzione',          on: ci?.no_cauzione      ?? true  },
                              { label: 'Cauzione veicoli',     on: ci?.cauzione_veicoli ?? true  },
                              { label: 'Secondo guidatore',    on: ci?.second_driver    ?? true  },
                              { label: 'DR7 FLEX',             on: ci?.dr7_flex         ?? true  },
                              { label: 'KM Illimitati',        on: ci?.unlimited_km     ?? false },
                              { label: 'Pacchetti KM',         on: ci?.km_packages      ?? false },
                              { label: 'Servizi Experience',   on: ci?.experience       ?? false },
                              { label: 'Consegna a domicilio', on: ci?.delivery         ?? false },
                              { label: 'Ritiro a domicilio',   on: ci?.pickup           ?? false },
                            ]
                            const inList = items.filter(i => i.on).map(i => i.label)
                            const outList = items.filter(i => !i.on).map(i => i.label)
                            return (
                              <div className="pt-2 mt-1 border-t border-gray-700/50 space-y-0.5">
                                <div className="text-[11px] text-gray-400">
                                  <span className="text-emerald-400">Incluse nel coefficiente:</span> Noleggio{inList.length > 0 ? `, ${inList.join(', ')}` : ''}
                                </div>
                                <div className="text-[11px] text-gray-400">
                                  <span className="text-rose-400">Escluse (a listino):</span> {outList.length > 0 ? outList.join(', ') : '—'}
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Min/Max clamp indicator (Prezzi Base in Centralina Pro).
                      Shown only when the uncapped price was clipped. Experience
                      services are excluded from the clamp — they're added on
                      top of the "Nuovo totale". */}
                  {clampHit && (
                    <>
                      <div className="flex justify-between text-yellow-400 text-sm">
                        <span className="flex items-center gap-1">
                          ⚠️ Limite {clampHit === 'max' ? 'Max' : 'Min'} Raggiunto
                          {clampLimitDaily != null && (
                            <span className="text-gray-400 text-xs">({formatPrice(clampLimitDaily)}/g × {Math.max(1, duration.days)}gg, escl. experience)</span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-white font-semibold">
                        <span>Nuovo totale</span>
                        <span>{formatPrice(subtotal)}</span>
                      </div>
                    </>
                  )}

                  {membershipDiscount > 0 && (
                    <div className="flex justify-between text-green-400 text-sm">
                      <span>Sconto {membershipTier} ({(membershipDiscount / originalTotal * 100).toFixed(0)}%)</span>
                      <span>-{formatPrice(membershipDiscount)}</span>
                    </div>
                  )}
                  {onlineDiscountAmount > 0 && (
                    <div className="flex justify-between text-green-400 text-sm">
                      <span>Sconto Online -5%</span>
                      <span>-{formatPrice(onlineDiscountAmount)}</span>
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-white text-sm">
                      <span>Codice Sconto ({appliedDiscount?.code})</span>
                      <span>-{formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  {selectedUpsellWash && (
                    <div className="flex justify-between text-blue-400 text-sm">
                      <span>Lavaggio {selectedUpsellWash.name} (-10%)</span>
                      <span>+{formatPrice(washUpsellCost)}</span>
                    </div>
                  )}

                  <hr className="border-gray-500 my-2" />
                  <div className="flex justify-between font-bold text-lg text-white"><span>TOTALE</span> <span>{formatPrice(grandTotal)}</span></div>

                  {/* DR7 Club reward preview */}
                  {grandTotal > 0 && (
                    <div className="flex justify-between text-green-400 text-sm mt-1">
                      <span>Guadagna fino al 4% in credito wallet con DR7 Club</span>
                      <span>fino a +€{(Math.floor(grandTotal * 4) / 100).toFixed(2)}</span>
                    </div>
                  )}

                  {/* Cauzione info */}
                  {(() => {
                    if (formData.depositOption === 'no_deposit') {
                      return (
                        <div className="mt-3 p-3 bg-green-900/30 border border-green-500/30 rounded-lg">
                          <p className="text-sm font-semibold text-green-400">NESSUNA CAUZIONE</p>
                          <p className="text-sm text-white mt-1">Supplemento: €{ACTIVE_NO_DEPOSIT_SURCHARGE}/giorno ({Math.max(1, duration.days)} gg = {formatPrice(noDepositSurcharge)})</p>
                          <p className="text-xs text-gray-500 mt-1">Richiede approvazione DR7</p>
                        </div>
                      );
                    }
                    // Read the amount + label DIRECTLY from the chosen option in
                    // configOverlay, not via getDeposit(). getDeposit returns €0
                    // for Gold/Platinum members and Loyal customers, which used
                    // to hide the amount line entirely from the recap. The
                    // customer still picked an explicit option (€1000 / €2000 /
                    // €4999) and expects to see what they chose.
                    if (formData.depositOption) {
                      const depKey = `${(driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2'}_${residencySuffix}` as 'TIER_1_RESIDENT' | 'TIER_2_RESIDENT' | 'TIER_1_NON_RESIDENT' | 'TIER_2_NON_RESIDENT';
                      const opts = pickDepositOptions(configOverlay, vehicleType, depKey, (item as any).category);
                      const opt = opts.find((d: { id: string }) => d.id === formData.depositOption);
                      const optAmount = Number(opt?.amount || 0);
                      const optLabel = opt?.label || formData.depositOption;
                      return (
                        <div className="mt-3 p-3 bg-gray-700/50 rounded-lg">
                          <p className="text-sm font-semibold text-white">CAUZIONE AL RITIRO</p>
                          {optAmount > 0 && (
                            <p className="text-sm text-gray-300 mt-1">Importo: €{optAmount.toLocaleString()}</p>
                          )}
                          {!isUrbanOrCorporate && (
                            <p className="text-sm text-gray-400 mt-1">Tipo: {optLabel}</p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Codice Sconto - Available for ALL customers */}
                <div className="border-t border-gray-600 pt-4">
                  <p className="font-bold text-base text-white mb-3">CODICE SCONTO</p>
                  {appliedDiscount ? (
                    <div className="flex items-center justify-between p-3 bg-green-900/30 border border-green-500/50 rounded-lg">
                      <div>
                        <p className="text-green-400 font-bold">{appliedDiscount.code}</p>
                        <p className="text-green-300 text-sm">
                          {appliedDiscount.type === 'percentage'
                            ? `Sconto del ${Math.round(Number(appliedDiscount.amount))}% applicato (-€${discountAmount.toFixed(2)})`
                            : `Sconto di €${Number(appliedDiscount.amount).toFixed(2)} applicato`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={removeDiscount}
                        className="text-red-400 hover:text-red-300 text-sm underline"
                      >
                        Rimuovi
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={discountCode}
                        onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                        placeholder="Inserisci codice (es. BDAY-XXXX-XXXX)"
                        className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 text-sm uppercase"
                      />
                      <button
                        type="button"
                        onClick={validateDiscountCode}
                        disabled={isValidatingCode || !discountCode.trim()}
                        className="px-4 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {isValidatingCode ? 'Verifica...' : 'Applica'}
                      </button>
                    </div>
                  )}
                  {discountCodeError && (
                    <p className="text-red-400 text-sm mt-2">{discountCodeError}</p>
                  )}
                </div>

                {/* Maggiori informazioni */}
                <div className="border-t border-gray-600 pt-3">
                  <details className="group">
                    <summary className="cursor-pointer text-sm text-gray-300 hover:text-white flex items-center gap-2 font-semibold">
                      <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                      Maggiori informazioni
                    </summary>
                    <div className="mt-3 pl-4 space-y-3 border-l-2 border-gray-600">
                      <p className="text-sm text-gray-300">
                        Profilo conducente: {driverTierInfo?.tier === 'TIER_1' ? 'Tier 1 (21-25 anni o patente 3-4 anni)' : 'Tier 2 (26-69 anni, patente 5+ anni)'}
                      </p>
                      <p className="text-sm text-gray-300">
                        Prenotazione soggetta a verifica documenti. Se i documenti non sono validi, la prenotazione potrà essere annullata.
                      </p>
                    </div>
                  </details>
                </div>
              </div>
            </section>
          </div>
        );
      default:
        return null;
    }
  };

  if (authLoading) {
    return (
      <div className="bg-gray-900/50 p-8 rounded-lg border border-gray-800 relative text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Loading...</h2>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-gray-900/50 p-8 rounded-lg border border-gray-800 relative text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold text-white mb-4">Accesso Richiesto</h2>
        <p className="text-gray-300 mb-6">Devi effettuare l'accesso o registrarti per poter completare una prenotazione.</p>
        <div className="flex justify-center space-x-4">
          <Link to="/signin" onClick={onClose} className="px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors">Accedi</Link>
          <Link to="/signup" onClick={onClose} className="px-8 py-3 bg-gray-700 text-white font-bold rounded-full hover:bg-gray-600 transition-colors">Registrati</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Full-screen modal overlay */}
      <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/95">
        <div className="min-h-dvh px-2 sm:px-4 py-4 sm:py-8">
          <div className="max-w-6xl mx-auto">

            <AnimatePresence>
              {isCameraOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4"
                >
                  <video ref={videoRef} autoPlay playsInline className="max-w-full max-h-[70vh] rounded-lg mb-4" style={{ transform: 'scaleX(-1)' }}></video>
                  <div className="flex space-x-4">
                    <button type="button" onClick={handleTakePhoto} className="px-6 py-2 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors">
                      {t('Take_Photo')}
                    </button>
                    <button type="button" onClick={handleCloseCamera} className="px-6 py-2 bg-gray-700 text-white font-bold rounded-full hover:bg-gray-600 transition-colors">
                      {t('Close')}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {/* Wash Upsell Modal */}
              {showWashUpsell && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
                  onClick={handleWashUpsellDecline}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl p-5 sm:p-8 max-w-2xl w-full max-h-[90dvh] overflow-y-auto overscroll-contain"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header image */}
                    <img
                      src="/prime-wash-header.jpeg"
                      alt="Prime Wash"
                      className="w-full h-48 sm:h-56 object-cover rounded-xl mb-5"
                    />

                    {/* Header */}
                    <div className="text-center mb-5 sm:mb-6">
                      <h3 className="text-xl sm:text-2xl font-bold text-white tracking-wide mb-1">
                        APPROFITTA SUBITO
                      </h3>
                      <div className="w-12 h-0.5 bg-white/30 mx-auto mb-4"></div>
                      <p className="text-gray-300 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
                        Grazie per aver prenotato il tuo noleggio.
                      </p>
                      <p className="text-gray-300 text-sm sm:text-base leading-relaxed max-w-md mx-auto mt-1">
                        Mentre ti godi la tua {categoryContext === 'urban-cars' || categoryContext === 'corporate-fleet' ? 'utilitaria' : 'supercar'}, lascia a noi la cura della <strong className="text-white">tua auto</strong>.
                      </p>
                      <p className="text-white font-semibold text-base sm:text-lg mt-3">
                        Solo per i clienti noleggio: <span className="text-green-400">–10%</span> su qualsiasi servizio lavaggio.
                      </p>
                    </div>

                    {/* Targa Search */}
                    <div className="mb-5">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={upsellTargaInput}
                          onChange={(e) => setUpsellTargaInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                          onKeyDown={(e) => { if (e.key === 'Enter' && isValidItalianPlate(upsellTargaInput)) handleUpsellTargaSearch(); }}
                          placeholder="es. EX117YA"
                          className="flex-1 bg-gray-800/80 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-white/50 transition-colors font-mono tracking-widest uppercase text-center"
                          maxLength={8}
                        />
                        <button
                          type="button"
                          onClick={handleUpsellTargaSearch}
                          disabled={!isValidItalianPlate(upsellTargaInput) || upsellTargaLoading}
                          className={`px-5 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
                            isValidItalianPlate(upsellTargaInput) && !upsellTargaLoading
                              ? 'bg-white text-black hover:bg-gray-200'
                              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {upsellTargaLoading ? '...' : 'Cerca'}
                        </button>
                      </div>
                      {upsellTargaError && (
                        <div className="mt-3 text-center">
                          <p className="text-red-400 text-sm mb-2">{upsellTargaError}</p>
                          <p className="text-gray-400 text-xs mb-2">Seleziona manualmente la categoria del tuo veicolo:</p>
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => { setUpsellTargaManualCategory('urban'); setUpsellCarCategory('urban'); setUpsellCarInput('Veicolo cliente'); }}
                              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                upsellTargaManualCategory === 'urban'
                                  ? 'bg-emerald-600/20 text-emerald-400 border-2 border-emerald-500'
                                  : 'bg-gray-800 text-gray-300 border border-gray-600 hover:border-emerald-500'
                              }`}
                            >
                              URBAN
                            </button>
                            <button
                              type="button"
                              onClick={() => { setUpsellTargaManualCategory('maxi'); setUpsellCarCategory('maxi'); setUpsellCarInput('Veicolo cliente'); }}
                              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                upsellTargaManualCategory === 'maxi'
                                  ? 'bg-amber-600/20 text-amber-400 border-2 border-amber-500'
                                  : 'bg-gray-800 text-gray-300 border border-gray-600 hover:border-amber-500'
                              }`}
                            >
                              MAXI
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Always-available manual category override. The auto-
                          detected tier is preselected, but the customer can
                          retap Urban/Maxi to override what drives the wash
                          price grid and what is saved (carCategory). */}
                      {upsellTargaResult && (
                        <div className="mt-3 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-gray-700/60 text-white border border-gray-600">
                              {upsellTargaResult.plate}
                            </span>
                            {upsellCarModel && (
                              <span className="text-gray-400 text-xs">{upsellCarModel}</span>
                            )}
                          </div>
                          <p className="text-gray-400 text-xs mb-2">Seleziona manualmente la categoria:</p>
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => { setUpsellTargaManualCategory('urban'); setUpsellCarCategory('urban'); setSelectedUpsellWash(null); }}
                              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                upsellCarCategory === 'urban'
                                  ? 'bg-emerald-600/20 text-emerald-400 border-2 border-emerald-500'
                                  : 'bg-gray-800 text-gray-300 border border-gray-600 hover:border-emerald-500'
                              }`}
                            >
                              PRIME URBAN
                            </button>
                            <button
                              type="button"
                              onClick={() => { setUpsellTargaManualCategory('maxi'); setUpsellCarCategory('maxi'); setSelectedUpsellWash(null); }}
                              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                upsellCarCategory === 'maxi'
                                  ? 'bg-amber-600/20 text-amber-400 border-2 border-amber-500'
                                  : 'bg-gray-800 text-gray-300 border border-gray-600 hover:border-amber-500'
                              }`}
                            >
                              PRIME MAXI
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Service grid — card design with images */}
                    {upsellCarCategory && (
                      <div className="grid grid-cols-2 gap-3 mb-5">
                        {(upsellCarCategory === 'urban' ? upsellUrbanServices : upsellMaxiServices).map((svc) => {
                          const discountedPrice = roundToTwoDecimals(svc.price * 0.90);
                          const isSelected = selectedUpsellWash?.id === svc.id;
                          return (
                            <button
                              key={svc.id}
                              type="button"
                              onClick={() => setSelectedUpsellWash(isSelected ? null : svc)}
                              className={`text-left rounded-xl border overflow-hidden transition-all ${
                                isSelected
                                  ? 'border-white ring-2 ring-white/50'
                                  : 'border-gray-700 hover:border-gray-500'
                              }`}
                            >
                              <img
                                src={svc.image || '/luxurywash.jpeg'}
                                alt={svc.name}
                                className="w-full h-auto object-contain"
                              />
                              <div className="p-2.5">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-gray-500 line-through text-xs">€{svc.price % 1 === 0 ? svc.price : svc.price.toFixed(2)}</span>
                                  <span className="text-white font-bold text-sm">€{discountedPrice % 1 === 0 ? discountedPrice : discountedPrice.toFixed(2)}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Servizi Aggiuntivi — multi-select extras */}
                    {upsellCarCategory && (
                      <div className="mb-5">
                        <h4 className="text-white font-bold text-sm tracking-widest mb-3">SERVIZI AGGIUNTIVI</h4>
                        <div className="grid grid-cols-2 gap-3">
                          {upsellExtras.map((svc) => {
                            const discountedPrice = roundToTwoDecimals(svc.price * 0.90);
                            const isSelected = selectedUpsellExtras.some(s => s.id === svc.id);
                            return (
                              <button
                                key={svc.id}
                                type="button"
                                onClick={() => setSelectedUpsellExtras(prev =>
                                  isSelected ? prev.filter(s => s.id !== svc.id) : [...prev, svc]
                                )}
                                className={`text-left rounded-xl border overflow-hidden transition-all ${
                                  isSelected
                                    ? 'border-blue-400 ring-2 ring-blue-400/50'
                                    : 'border-gray-700 hover:border-gray-500'
                                }`}
                              >
                                <img
                                  src={svc.image || '/luxurywash.jpeg'}
                                  alt={svc.name}
                                  className="w-full h-auto object-contain"
                                />
                                <div className="p-2.5">
                                  <p className="text-white text-[11px] font-semibold leading-tight mb-1">{svc.name}</p>
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-gray-500 line-through text-xs">€{svc.price % 1 === 0 ? svc.price : svc.price.toFixed(2)}</span>
                                    <span className="text-white font-bold text-sm">€{discountedPrice % 1 === 0 ? discountedPrice : discountedPrice.toFixed(2)}</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={handleWashUpsellAccept}
                        disabled={!selectedUpsellWash && selectedUpsellExtras.length === 0}
                        className={`w-full py-3.5 rounded-full font-bold text-sm sm:text-base transition-all ${
                          selectedUpsellWash || selectedUpsellExtras.length > 0
                            ? 'bg-white text-black hover:bg-gray-100'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {selectedUpsellWash || selectedUpsellExtras.length > 0
                          ? `Aggiungi servizi – €${totalWashUpsellCost % 1 === 0 ? totalWashUpsellCost : totalWashUpsellCost.toFixed(2)}`
                          : 'Seleziona un servizio'}
                      </button>
                      <button
                        type="button"
                        onClick={handleWashUpsellDecline}
                        className="w-full py-3 text-gray-400 hover:text-white text-sm transition-colors"
                      >
                        No, grazie
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
              {/* Subscription Upsell Popup */}
              {showSubscriptionUpsell && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
                  onClick={handleSubscriptionDecline}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl p-5 sm:p-8 max-w-lg w-full max-h-[90dvh] overflow-y-auto overscroll-contain"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Animated gift icon */}
                    <div className="text-center mb-4">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                        className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-white/10 to-white/20 border border-white/20 mb-3"
                      >
                        <span className="text-3xl">🎁</span>
                      </motion.div>
                      <motion.h3
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-xl sm:text-2xl font-bold text-white"
                      >
                        Ricevi fino a <span className="text-green-400">+€{subscriptionWalletCredit.toFixed(2)}</span> di credito wallet
                      </motion.h3>
                      <div className="w-12 h-0.5 bg-white/30 mx-auto my-3"></div>
                      <p className="text-gray-400 text-sm">
                        Attiva DR7 Club e ricevi fino a <strong className="text-white">€{subscriptionWalletCredit.toFixed(2)}</strong> di credito wallet (4% del totale), utilizzabile per il prossimo noleggio o servizio lavaggio.
                      </p>
                    </div>

                    {/* Subscription options */}
                    <div className="space-y-3 mb-5">
                      {/* Monthly */}
                      <button
                        type="button"
                        onClick={() => setSelectedSubscription('monthly')}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                          selectedSubscription === 'monthly'
                            ? 'border-white bg-white/5'
                            : 'border-gray-700 hover:border-gray-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white font-bold text-base">Mensile</p>
                            <p className="text-gray-400 text-xs mt-0.5">Cancella quando vuoi, senza vincoli</p>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-bold text-lg">€4,90<span className="text-gray-400 text-xs font-normal">/mese</span></p>
                          </div>
                        </div>
                      </button>

                      {/* Annual */}
                      <button
                        type="button"
                        onClick={() => setSelectedSubscription('annual')}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all relative overflow-hidden ${
                          selectedSubscription === 'annual'
                            ? 'border-green-400 bg-green-400/5'
                            : 'border-gray-700 hover:border-gray-500'
                        }`}
                      >
                        <div className="absolute top-0 right-0 bg-green-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
                          6 MESI GRATIS
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white font-bold text-base">Annuale</p>
                            <p className="text-gray-400 text-xs mt-0.5">Paga 6 mesi, ricevi 12 — il piano migliore</p>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-bold text-lg">€39<span className="text-gray-400 text-xs font-normal">/anno</span></p>
                            <p className="text-gray-500 line-through text-xs">€58,80/anno</p>
                          </div>
                        </div>
                      </button>
                    </div>

                    {/* What you get */}
                    <div className="bg-gray-800/50 rounded-xl p-4 mb-5 text-sm">
                      <p className="text-white font-semibold mb-2">Con DR7 Club ottieni:</p>
                      <ul className="space-y-1.5 text-gray-300">
                        <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span> Fino a €{subscriptionWalletCredit.toFixed(2)} di credito wallet (4% del totale)</li>
                        <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span> Sconti esclusivi su noleggi e lavaggi</li>
                        <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span> Accesso prioritario alle nuove supercar</li>
                        <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span> Promozioni riservate ai membri</li>
                        <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span> DR7 Wallet Bonus fino al 33%</li>
                        <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span> DR7 Wallet Privilege fino al 36%</li>
                      </ul>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={handleSubscriptionAccept}
                        disabled={!selectedSubscription}
                        className={`w-full py-3.5 rounded-full font-bold text-sm sm:text-base transition-all ${
                          selectedSubscription
                            ? 'bg-white text-black hover:bg-gray-100'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {selectedSubscription
                          ? `Attiva DR7 Club — €${selectedSubscription === 'monthly' ? '4,90/mese' : '39/anno'}`
                          : 'Seleziona un piano'}
                      </button>
                      <button
                        type="button"
                        onClick={handleSubscriptionDecline}
                        className="w-full py-3 text-gray-400 hover:text-white text-sm transition-colors"
                      >
                        No, grazie
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <canvas ref={canvasRef} className="hidden"></canvas>

            <div className="w-full max-w-4xl mx-auto mb-6 sm:mb-12 px-2 sm:px-4">
              <div className="flex items-center justify-between">
                {steps.map((s, index) => (
                  <React.Fragment key={s.id}>
                    <div className="flex flex-col items-center text-center flex-shrink-0">
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 text-sm sm:text-base transition-all duration-300 ${step >= s.id ? 'bg-white border-white text-black' : 'border-gray-600 text-gray-400'}`}>{s.id}</div>
                      <p className={`mt-1 sm:mt-2 text-[10px] sm:text-xs font-semibold max-w-[60px] sm:max-w-none leading-tight ${step >= s.id ? 'text-white' : 'text-gray-500'}`}>{s.name}</p>
                    </div>
                    {index < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 sm:mx-4 transition-colors duration-300 ${step > s.id ? 'bg-white' : 'bg-gray-700'}`}></div>}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className={step === 4 ? "lg:grid lg:grid-cols-3 lg:gap-8 px-2 sm:px-4" : "px-2 sm:px-4"}>
              {step === 4 && (
                <aside className="hidden lg:block lg:col-span-1 lg:sticky lg:top-32 self-start mb-8 lg:mb-0">
                  <div className="bg-gray-900/50 p-6 rounded-lg border border-gray-800">
                    <p className="text-xs text-green-400 font-medium mb-2">Prezzo dinamico attivo, blocca ORA, potrebbe aumentare</p>
                    <h2 className="text-2xl font-bold text-white mb-4">RIEPILOGO COSTI</h2>
                    <img src={item.image} alt={item.name} className="w-full h-40 object-contain rounded-md mb-4 bg-gray-800/30" />
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-400">Durata noleggio:</span><span className="text-white font-medium">{Math.max(1, duration.days)} {Math.max(1, duration.days) === 1 ? 'giorno' : 'giorni'}</span></div>
                      {extraDayApplied && (
                        <div className="p-2 bg-amber-900/30 border border-amber-500/50 rounded">
                          <p className="text-amber-300 text-xs font-semibold">+1 giorno: l'orario di riconsegna supera il margine di 1h30 prima dell'orario di ritiro.</p>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-400">Km pacchetto:</span>
                        <span className="text-white font-medium">
                          {(formData.kmPackageType === 'unlimited' || (includedKm && includedKm >= 9999)) ? 'ILLIMITATI' : `${includedKm} km`}
                        </span>
                      </div>

                      <div className="border-t border-gray-700 my-2"></div>

                      <div className="flex justify-between"><span className="text-gray-400">Noleggio {item.name}</span><span className="text-white font-medium">{formatPrice(rentalCost)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400 notranslate">Assicurazione {(() => { const opts = getInsuranceForVehicle(vehicleType, (driverTier === 'TIER_1' || driverTier === 'TIER_2') ? driverTier : 'TIER_2'); return opts.find(o => o.id === formData.insuranceOption)?.name || formData.insuranceOption?.replace(/_/g, ' '); })()}</span><span className="text-white font-medium">{formatPrice(insuranceCost)}</span></div>
                      {/* Lavaggio is now included in the price - no additional fee */}
                      {pickupFee > 0 && <div className="flex justify-between"><span className="text-gray-400">Spese di ritiro</span><span className="text-white font-medium">{formatPrice(pickupFee)}</span></div>}
                      {dropoffFee > 0 && <div className="flex justify-between"><span className="text-gray-400">Spese di riconsegna</span><span className="text-white font-medium">{formatPrice(dropoffFee)}</span></div>}
                      {formData.pickupLocation === 'home_delivery' && formData.deliveryPickupKm > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Consegna a domicilio ({formData.deliveryPickupKm} km × €{ACTIVE_DELIVERY_PRICE_PER_KM})</span>
                          <span className="text-white font-medium">{formatPrice(formData.deliveryPickupKm * ACTIVE_DELIVERY_PRICE_PER_KM)}</span>
                        </div>
                      )}
                      {formData.returnLocation === 'home_delivery' && formData.deliveryReturnKm > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Riconsegna a domicilio ({formData.deliveryReturnKm} km × €{ACTIVE_DELIVERY_PRICE_PER_KM})</span>
                          <span className="text-white font-medium">{formatPrice(formData.deliveryReturnKm * ACTIVE_DELIVERY_PRICE_PER_KM)}</span>
                        </div>
                      )}
                      {secondDriverFee > 0 && <div className="flex justify-between"><span className="text-gray-400">Secondo guidatore</span><span className="text-white font-medium">{formatPrice(secondDriverFee)}</span></div>}
                      {youngDriverFee > 0 && <div className="flex justify-between"><span className="text-gray-400">Supplemento under 25</span><span className="text-white font-medium">{formatPrice(youngDriverFee)}</span></div>}
                      {recentLicenseFee > 0 && <div className="flex justify-between"><span className="text-gray-400">Supplemento patente recente</span><span className="text-white font-medium">{formatPrice(recentLicenseFee)}</span></div>}
                      {noDepositSurcharge > 0 && (
                        <div className="flex justify-between">
                          <span className="text-white">Supplemento cauzione</span>
                          <span className="text-white font-medium">{formatPrice(noDepositSurcharge)}</span>
                        </div>
                      )}
                      {selectedUpsellWash && (
                        <div className="flex justify-between">
                          <span className="text-blue-400">Lavaggio auto (-10%)</span>
                          <span className="text-blue-400 font-medium">{formatPrice(washUpsellCost)}</span>
                        </div>
                      )}
                      {selectedUpsellExtras.map(svc => (
                        <div key={svc.id} className="flex justify-between">
                          <span className="text-blue-400 text-xs">{svc.name} (-10%)</span>
                          <span className="text-blue-400 font-medium">{formatPrice(roundToTwoDecimals(svc.price * 0.90))}</span>
                        </div>
                      ))}

                      <div className="border-t border-white/20 my-2"></div>

                      {/* Dynamic pricing: prezzo barrato */}
                      {hasDynamicDiscount && (
                        <div className="flex justify-between items-center text-sm mb-1">
                          <span className="text-gray-500">Prezzo listino</span>
                          <span className="text-gray-500 line-through">{formatPrice(listSubtotal)}</span>
                        </div>
                      )}
                      {hasDynamicDiscount && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="flex items-center gap-2 text-green-400">
                            Prezzo dinamico
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${dynamicDiscountPct > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              {dynamicDiscountPct > 0 ? `-${dynamicDiscountPct}%` : `+${Math.abs(dynamicDiscountPct)}%`}
                            </span>
                          </span>
                          <span className="text-green-400 font-semibold">{formatPrice(uncappedSubtotal)}</span>
                        </div>
                      )}
                      {clampHit && (
                        <>
                          <div className="flex justify-between items-center text-sm text-yellow-400">
                            <span className="flex items-center gap-1">
                              ⚠️ Limite {clampHit === 'max' ? 'Max' : 'Min'} Raggiunto
                              {clampLimitDaily != null && (
                                <span className="text-gray-400 text-xs">({formatPrice(clampLimitDaily)}/g × {Math.max(1, duration.days)}gg, escl. experience)</span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between text-white font-semibold">
                            <span>Nuovo totale</span>
                            <span>{formatPrice(subtotal)}</span>
                          </div>
                        </>
                      )}

                      {membershipDiscount > 0 ? (
                        <>
                          <div className="flex justify-between text-gray-400 line-through text-sm"><span>Totale</span><span>{formatPrice(originalTotal)}</span></div>
                          <div className="flex justify-between text-green-400 text-sm">
                            <span>Sconto {membershipTier}</span>
                            <span>-{formatPrice(membershipDiscount)}</span>
                          </div>
                          {onlineDiscountAmount > 0 && (
                            <div className="flex justify-between text-green-400 text-sm">
                              <span>Sconto Online -5%</span>
                              <span>-{formatPrice(onlineDiscountAmount)}</span>
                            </div>
                          )}
                          {discountAmount > 0 && (
                            <div className="flex justify-between text-white text-sm">
                              <span>Codice Sconto</span>
                              <span>-{formatPrice(discountAmount)}</span>
                            </div>
                          )}
                          {(selectedUpsellWash || selectedUpsellExtras.length > 0) && (
                            <div className="flex justify-between text-blue-400 text-sm">
                              <span>Lavaggio + Servizi (-10%)</span>
                              <span>+{formatPrice(totalWashUpsellCost)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-xl font-bold">
                      <span className="text-white">TOTALE</span>
                      <span className="text-white">{formatPrice(grandTotal)}</span>
                    </div>
                        </>
                      ) : (
                        <>
                          {!hasDynamicDiscount && (
                            <div className="flex justify-between text-gray-400 text-sm"><span>Subtotale</span><span>{formatPrice(finalTotal)}</span></div>
                          )}
                          {onlineDiscountAmount > 0 && (
                            <div className="flex justify-between text-green-400 text-sm">
                              <span>Sconto Online -5%</span>
                              <span>-{formatPrice(onlineDiscountAmount)}</span>
                            </div>
                          )}
                          {discountAmount > 0 && (
                            <div className="flex justify-between text-white text-sm">
                              <span>Codice Sconto</span>
                              <span>-{formatPrice(discountAmount)}</span>
                            </div>
                          )}
                          {(selectedUpsellWash || selectedUpsellExtras.length > 0) && (
                            <div className="flex justify-between text-blue-400 text-sm">
                              <span>Lavaggio + Servizi (-10%)</span>
                              <span>+{formatPrice(totalWashUpsellCost)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-xl font-bold">
                      <span className="text-white">TOTALE</span>
                      <span className="text-white">{formatPrice(grandTotal)}</span>
                    </div>
                        </>
                      )}
                      {/* Cauzione al ritiro: legata SOLO alla scelta deposito
                          effettiva (getDeposit). Prima il blocco era condizionato
                          a isUrbanOrCorporate (vehicleType UTILITARIA/FURGONE/
                          V_CLASS) e mostrava sempre €ACTIVE_UTILITARIA_DEPOSIT
                          anche quando il cliente aveva selezionato "Senza
                          cauzione" — confusione su Mercedes A45 (category
                          aziendali, label "Supercar"). Ora se la scelta da\'
                          €0 nascondiamo il blocco; se > 0 mostriamo il valore
                          reale della scelta. */}
                      {(() => {
                        const dep = getDeposit();
                        if (formData.depositOption === 'no_deposit' || !dep || dep <= 0) return null;
                        return (
                          <div className="mt-2 pt-2 border-t border-gray-700">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Cauzione al ritiro</span>
                              <span className="text-white font-medium">€{dep.toLocaleString('it-IT')}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Restituita dopo la riconsegna</p>
                          </div>
                        );
                      })()}
                      {/* DR7 Club subscription — separate, card-only */}
                      {formData.extras.some(e => e.startsWith('subscription_')) && (
                        <div className="mt-3 pt-3 border-t border-white/20 bg-white/5 rounded-lg p-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-white font-semibold">DR7 Club</span>
                            <span className="text-white font-bold">
                              {formData.extras.includes('subscription_annual') ? '€39/anno' : '€4,90/mese'}
                            </span>
                          </div>
                          <p className="text-xs text-white/70 mt-1">
                            {formData.paymentMethod === 'credit'
                              ? 'Riceverai un link di pagamento separato via email'
                              : 'Incluso nel pagamento con carta'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
              )}

              <main className={step === 4 ? "lg:col-span-2" : ""}>
                <form onSubmit={handleSubmit}>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -50 }}
                      transition={{ duration: 0.3 }}
                      className="bg-gray-900/50 p-3 sm:p-6 md:p-8 rounded-lg border border-gray-800 relative"
                    >
                      {/* 2026-05-17: X chiudi SEMPRE visibile in top-right.
                          Prima a Step 2+ il pulsante mostrava la freccia
                          back (←) e cliente non aveva modo di chiudere il
                          wizard senza terminare il flusso. Ora due bottoni:
                          freccia back (solo se step > 1) + X chiudi. */}
                      {step > 1 && (
                        <button
                          type="button"
                          onClick={handleBack}
                          className="absolute top-2 right-12 sm:top-4 sm:right-14 text-gray-400 hover:text-white transition-colors z-10 p-2"
                          aria-label="Indietro"
                        >
                          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onClose}
                        className="absolute top-2 right-2 sm:top-4 sm:right-4 text-gray-400 hover:text-white transition-colors z-10 p-2"
                        aria-label="Chiudi"
                      >
                        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      {renderStepContent()}
                    </motion.div>
                  </AnimatePresence>

                  {errors.form && (
                    <div className="mt-4 text-center p-3 rounded-md border border-red-500 bg-red-500/10 text-red-400">
                      <p>{errors.form}</p>
                    </div>
                  )}

                  {/* Show payment error near the button so it's visible on all devices */}
                  {paymentError && step === steps.length && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
                      <p className="text-sm text-red-400 text-center">{paymentError}</p>
                    </div>
                  )}
                  {/* FIX 5: WhatsApp fallback button if popup was blocked after successful booking */}
                  {whatsAppFallbackUrl && (
                    <div className="mt-4 p-4 bg-green-900/20 border border-green-500/50 rounded-lg text-center">
                      <p className="text-green-300 text-sm font-semibold mb-2">Prenotazione completata ✓</p>
                      <p className="text-gray-400 text-xs mb-3">Il popup WhatsApp è stato bloccato dal browser.</p>
                      <a
                        href={whatsAppFallbackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-6 py-2 bg-green-600 text-white font-bold rounded-full hover:bg-green-500 transition-colors text-sm"
                      >
                        Apri WhatsApp
                      </a>
                    </div>
                  )}

                  {/* Show validation errors near the button so user always sees them */}
                  {Object.keys(errors).length > 0 && (
                    <div className="mt-4 p-3 bg-red-900/30 border border-red-500 rounded-lg">
                      {Object.values(errors).map((err, i) => (
                        <p key={i} className="text-red-300 text-sm font-medium">{err as string}</p>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-4 mt-6 sm:mt-8">
                    <button type="button" onClick={handleBack} disabled={step === 1} className="w-full sm:w-auto px-6 sm:px-8 py-3 bg-gray-700 text-white text-sm sm:text-base font-bold rounded-full hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{t('Back')}</button>
                    {step < steps.length ? (
                      <button
                        type="button"
                        onClick={handleNext}
                        className="w-full sm:w-auto px-6 sm:px-8 py-3 bg-white text-black text-sm sm:text-base font-bold rounded-full hover:bg-gray-200 transition-colors disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={(step === 1 && !isFromSearch && isCheckingAvailability) || (step === 1 && !!availabilityError) || (licenseYears < 3 && step === 2) || (step === 2 && !formData.confirmsInformation) || (step === 2 && (() => {
                          // Keep this check in sync with the Step 2 residenza
                          // validator. Strict on CAP + street/city + length;
                          // permissive on house number so Nominatim picks
                          // without a civico still pass.
                          const r = (formData.residenza || formData.address || '').trim();
                          const isForeignAddress = !!residenzaCountryCode && residenzaCountryCode !== 'it';
                          if (!r || r.length < 10) return true;
                          if (!isForeignAddress && !/\b\d{5}\b/.test(r)) return true;
                          if (!/[A-Za-zÀ-ÿ]{3,}/.test(r)) return true;
                          return false;
                        })())}
                      >
                        Continua
                      </button>
                    ) : (
                      <>
                        {extraDayApplied && (
                          <div className="w-full mb-4 p-3 bg-amber-900/30 border border-amber-500/50 rounded-lg">
                            <p className="text-amber-300 text-sm font-semibold">Attenzione: l'orario di riconsegna selezionato supera il margine di 1h30 prima dell'orario di ritiro. Viene conteggiato 1 giorno aggiuntivo ({duration.days} giorni totali invece di {duration.days - 1}).</p>
                          </div>
                        )}
                        {/* Hide CONFERMA/RICHIEDI when No Cauzione flow (SALVA PREVENTIVO is in step 4 content) */}
                        {noCauzioneRequested && formData.depositOption === 'no_deposit' ? null : preventivoSaved ? (
                          <div className="w-full flex flex-col gap-3">
                            <div className="text-center py-4 bg-green-500/10 border border-green-500/30 rounded-2xl">
                              <p className="text-green-400 font-bold text-base">Preventivo salvato!</p>
                              <p className="text-gray-400 text-sm mt-1">Puoi trovarlo nel tuo account in "I Miei Preventivi"</p>
                            </div>
                            <button
                              type="button"
                              onClick={onClose}
                              className="w-full px-6 py-3 bg-white text-black text-sm sm:text-base font-bold rounded-full hover:bg-gray-200 transition-colors"
                              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                            >
                              Chiudi
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-3 w-full">
                            <button
                              type="submit"
                              disabled={isProcessing || !formData.agreesToTerms || !formData.agreesToPrivacy || !formData.confirmsDocuments}
                              className="flex-1 px-6 sm:px-8 py-3 bg-white text-black text-sm sm:text-base font-bold rounded-full hover:bg-gray-200 transition-colors flex items-center justify-center disabled:bg-gray-600 disabled:cursor-not-allowed"
                              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                            >
                              {isProcessing ? 'Elaborazione in corso...' : 'CONFERMA PRENOTAZIONE'}
                            </button>
                            <button
                              type="button"
                              onClick={handleSavePreventivo}
                              disabled={isSavingPreventivo || !formData.agreesToTerms || !formData.agreesToPrivacy}
                              className="flex-1 px-6 sm:px-8 py-3 border border-white text-white text-sm sm:text-base font-bold rounded-full hover:bg-white hover:text-black transition-colors flex items-center justify-center disabled:border-gray-600 disabled:text-gray-600 disabled:cursor-not-allowed"
                              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                            >
                              {isSavingPreventivo ? 'Salvataggio...' : 'RICHIEDI PREVENTIVO'}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </form>
              </main>
            </div>
          </div>
        </div>
      </div>

      {/* Popup: Urban/Corporate vehicles blocked after March 25 — Apple style */}
      {showMaxDatePopup && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          onClick={() => setShowMaxDatePopup(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-[#1c1c1e] border border-white/10 rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-8 pb-5 text-center">
              <div className="w-12 h-12 bg-orange-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-[17px] font-semibold text-white mb-2">Veicolo non disponibile</h3>
              <p className="text-[13px] text-gray-400 leading-relaxed">
                I veicoli della categoria Urban & Utilitarie non sono disponibili oltre il <span className="text-white">25 marzo 2026</span>.
              </p>
              <p className="text-[13px] text-gray-400 leading-relaxed mt-2">
                L'ultimo check-out disponibile è il <span className="text-white font-medium">25/03/2026</span>.
              </p>
            </div>
            <div className="border-t border-white/10">
              <button
                onClick={() => setShowMaxDatePopup(false)}
                className="w-full py-3.5 text-[17px] font-medium text-blue-400 hover:bg-white/5 transition-colors"
              >
                OK
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
};

export default CarBookingWizard;

