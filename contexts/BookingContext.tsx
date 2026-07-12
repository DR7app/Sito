import React, { createContext, useState, useMemo, useEffect, useCallback } from 'react';
import type { RentalItem } from '../types';

export interface PrefilledBookingData {
  pickupLocation: string;
  returnLocation: string;
  pickupDate: string;
  pickupTime: string;
  returnDate: string;
  returnTime: string;
  ageBracket: 'under26' | '26to69';
  vehicleId: string;
  vehicleIds: string[];
  availableVehicleIds: string[];
  plates: string[];
  dailyRate: number;
  rentalDays: number;
  totalPrice: number;
  isUrban: boolean;
}

export interface SearchDates {
  pickupDate: string;       // YYYY-MM-DD
  pickupTime: string;       // HH:MM
  returnDate: string;       // YYYY-MM-DD
  returnTime: string;       // HH:MM
  pickupLocation: string;   // location id
  returnLocation: string;   // location id
  // Pre-filled from preventivo
  insuranceOption?: string;
  depositOption?: string;
  unlimitedKm?: boolean;
  dr7Flex?: boolean;
  secondDriver?: boolean;
  experienceServices?: Record<string, number>;
  // Pacchetti KM ripristinati dal preventivo (es. Pacchetto 300 km).
  // kmPackageType e' la modalita' selezionata ('none' | 'unlimited' | '50km' | <pkgId>);
  // kmPackages e' la mappa { [pkgId]: qty } per i pacchetti acquistabili.
  kmPackageType?: string;
  kmPackages?: Record<string, number>;
  preventivoId?: string;
  preventivoTotal?: number;
  // 2026-07-12: indirizzo consegna/ritiro a domicilio inserito già nella barra
  // di ricerca (modifica). Il prezzo consegna e' km × €/km e viene calcolato
  // nel wizard; questi campi lo prefillano cosi' il cliente non li reinserisce.
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
  // 2026-05-21: when true, wizard is in EDIT mode (customer clicked
  // "Modifica" on MyPreventivi). On save, the wizard sends the preventivoId
  // to the backend which UPDATES the row instead of creating a new one.
  // Also: wizard stays on step 1 instead of auto-jumping to step 4.
  editMode?: boolean;
}

interface BookingContextType {
  bookingItem: RentalItem | null;
  isBookingOpen: boolean;
  bookingCategory: 'yachts' | 'villas' | 'cars' | null;
  openBooking: (item: RentalItem, categoryId: 'yachts' | 'villas' | 'cars') => void;
  closeBooking: () => void;

  // Car booking wizard state
  isCarWizardOpen: boolean;
  openCarWizard: (item: RentalItem, categoryContext?: string) => void;
  openCarWizardWithPrefill: (item: RentalItem, categoryContext: string, prefill: PrefilledBookingData) => void;
  closeCarWizard: () => void;
  selectedCar: RentalItem | null;
  wizardCategory: string | null;
  prefilledData: PrefilledBookingData | null;

  // URL-derived search dates to pre-fill the wizard
  initialSearchDates: SearchDates | null;
  setInitialSearchDates: (dates: SearchDates | null) => void;
}

export const BookingContext = createContext<BookingContextType | undefined>(undefined);

export const BookingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingItem, setBookingItem] = useState<RentalItem | null>(null);
  const [bookingCategory, setBookingCategory] = useState<'yachts' | 'villas' | 'cars' | null>(null);

  const [isCarWizardOpen, setCarWizardOpen] = useState(false);
  const [selectedCar, setSelectedCar] = useState<RentalItem | null>(null);

  const [wizardCategory, setWizardCategory] = useState<string | null>(null);
  const [prefilledData, setPrefilledData] = useState<PrefilledBookingData | null>(null);

  const [initialSearchDates, setInitialSearchDates] = useState<SearchDates | null>(null);

  useEffect(() => {
    if (isBookingOpen || isCarWizardOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isBookingOpen, isCarWizardOpen]);


  const openBooking = useCallback((item: RentalItem, categoryId: 'yachts' | 'villas' | 'cars') => {
    setBookingItem(item);
    setBookingCategory(categoryId);
    setIsBookingOpen(true);
  }, []);

  const closeBooking = useCallback(() => {
    setIsBookingOpen(false);
    setTimeout(() => {
      setBookingItem(null);
      setBookingCategory(null);
    }, 300);
  }, []);

  const openCarWizard = useCallback((item: RentalItem, categoryContext?: string) => {
    console.log('BookingContext openCarWizard called with:', item, 'categoryContext:', categoryContext);
    setSelectedCar(item);
    setWizardCategory(categoryContext || null);
    setPrefilledData(null);
    setCarWizardOpen(true);
  }, []);

  const openCarWizardWithPrefill = useCallback((item: RentalItem, categoryContext: string, prefill: PrefilledBookingData) => {
    setSelectedCar(item);
    setWizardCategory(categoryContext);
    setPrefilledData(prefill);
    setCarWizardOpen(true);
  }, []);

  const closeCarWizard = useCallback(() => {
    setCarWizardOpen(false);
    setTimeout(() => {
      setSelectedCar(null);
      setWizardCategory(null);
      setPrefilledData(null);
    }, 300);
  }, []);

  const value = useMemo(() => ({
    bookingItem,
    isBookingOpen,
    bookingCategory,
    openBooking,
    closeBooking,
    isCarWizardOpen,
    openCarWizard,
    openCarWizardWithPrefill,
    closeCarWizard,
    selectedCar,
    wizardCategory,
    prefilledData,
    initialSearchDates,
    setInitialSearchDates,
  }), [bookingItem, isBookingOpen, bookingCategory, openBooking, closeBooking, isCarWizardOpen, openCarWizard, openCarWizardWithPrefill, closeCarWizard, selectedCar, wizardCategory, prefilledData, initialSearchDates]);

  return (
    <BookingContext.Provider value={value}>
      {children}
    </BookingContext.Provider>
  );
};
