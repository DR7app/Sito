import type { Stripe, StripeElements } from '@stripe/stripe-js';

export type Language = 'en' | 'it';
export type Currency = 'usd' | 'eur';

export interface Translations {
  [key: string]: {
    en: string;
    it: string;
  };
}

export interface RentalSpec {
  label: { en: string; it: string };
  value: string;
  icon: React.FC<{ className?: string }>;
}

export interface Amenity {
  icon: React.FC<{ className?: string }>;
  title: { en: string; it: string };
  description: { en: string; it: string };
}

export interface RentalItem {
  id: string;
  name: string;
  image: string;
  available?: boolean;
  pricePerDay?: {
    usd: number;
    eur: number;
    crypto: number;
  };
  specs: RentalSpec[];

  // Categoria DB del veicolo (es. 'hypercar', 'supercar_elite', ecc.) —
  // usata per i chip filtro dinamici dalle categorie Centralina Pro.
  category?: string | null;

  // New optional fields for villas
  location?: string;
  distanceToBeach?: string;
  size?: string;
  images?: string[];
  description?: { en: string; it: string };
  amenities?: Amenity[];
  features?: { en: string[]; it: string[] };

  // New optional fields for jets
  petsAllowed?: boolean;
  smokingAllowed?: boolean;
}

export interface RentalCategory {
  // Note: 'villas' and 'mechanical-services' are defined but not in RENTAL_CATEGORIES
  // 'helicopters' is nested within 'jets' category
  id: 'cars' | 'yachts' | 'villas' | 'jets' | 'helicopters' | 'urban-cars' | 'corporate-fleet' | 'car-wash-services' | 'mechanical-services' | 'membership' | 'credit-wallet';
  label: { en: string, it: string };
  data: RentalItem[];
  icon: React.FC<{ className?: string }>;
}

export interface MembershipTier {
  id: string;
  name: { en: string; it: string };
  price: {
    monthly: { usd: number; eur: number; crypto: number };
    annually: { usd: number; eur: number; crypto: number };
  };
  features: {
    en: (string | { icon: React.FC<{ className?: string }>; text: string })[];
    it: (string | { icon: React.FC<{ className?: string }>; text: string })[];
  };
  isPopular?: boolean;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  provider?: string;
  role: 'personal' | 'business';
  companyName?: string;
  phone?: string;
  profilePicture?: string; // base64 string
  membership?: {
    tierId: string;
    billingCycle: 'monthly' | 'annually';
    renewalDate: string;
    isRecurring?: boolean;
    subscriptionStatus?: 'active' | 'cancelled' | 'renewal_failed';
  };
  verification: {
    idStatus: 'unverified' | 'pending' | 'verified';
    idFrontImage?: string; // base64 string
    idBackImage?: string; // base64 string
    cardStatus: 'none' | 'verified';
    cardLast4?: string;
    cardExpiry?: string;
    cardholderName?: string;
    phoneStatus: 'none' | 'verified';
  };
  businessVerification?: {
    status: 'unverified' | 'pending' | 'verified';
    registrationDoc?: string; // base64 string
    address?: string;
    vatNumber?: string;
    payoutMethod?: 'iban' | 'paypal';
    payoutDetails?: string; // IBAN or PayPal email
  };
  notifications: {
    bookingConfirmations: boolean;
    specialOffers: boolean;
    newsletter: boolean;
    marketingConsent?: boolean;
  };
  paymentMethods: {
    id: string;
    type: 'card';
    brand: string;
    last4: string;
    isDefault: boolean;
  }[];
}

export interface Booking {
  bookingId: string;
  userId: string;
  itemId: string;
  itemName: string;
  image: string;
  itemCategory: 'cars' | 'yachts' | 'villas' | 'jets' | 'helicopters';
  pickupDate: string;
  pickupTime: string;
  returnDate: string;
  returnTime: string;
  duration: string; // e.g., "2 days, 5 hours"
  totalPrice: number;
  currency: 'USD' | 'EUR';
  customer: {
    fullName: string;
    email: string;
    phone: string;
    age: number;
    countryOfResidency: string;
  };
  driverLicenseImage: string; // Stores the path to the image in Supabase storage
  driverIdImage?: string; // Stores the path to the ID image in Supabase storage
  paymentMethod: 'stripe' | 'crypto' | 'agency';
  bookedAt: string;
  pickupLocation?: string;
  insuranceOption?: string; // e.g., 'premium'
  extras?: string[]; // e.g., ['gps', 'child_seat']
}

export interface Inquiry {
  inquiryId: string;
  userId: string;
  itemId: string;
  itemName: string;
  image: string;
  itemCategory: 'jets' | 'helicopters';
  customer: {
    fullName: string;
    email: string;
    phone: string;
  };
  details: {
    tripType: 'one-way' | 'round-trip';
    departurePoint: string;
    arrivalPoint: string;
    departureDate: string;
    departureTime: string;
    returnDate?: string;
    returnTime?: string;
    passengers: number;
    petsAllowed: boolean;
    smokingAllowed: boolean;
  };
  inquiredAt: string;
}


export interface Villa {
  id: number;
  title: string;
  location: string;
  distanceToBeach: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  images: string[];
  description: string | { en: string; it: string };
  rating?: number;
  reviewCount?: number;
  size?: string;
  amenities?: Amenity[];
  features?: { en: string[]; it: string[] };
}

export interface StripeContextType {
  stripe: Stripe | null;
  elements: StripeElements | null;
}

// === TIER-BASED BOOKING SYSTEM ===

export type DriverTier = 'TIER_1' | 'TIER_2' | 'BLOCKED';

export interface TierClassification {
  tier: DriverTier;
  reason: string;
  driverAge: number;
  licenseYears: number;
}

export interface InsuranceTierOption {
  id: string;
  name: string;
  dailyPrice: number;
  deductible: string;
  mandatoryDeposit?: number; // Only for RCA (no kasko)
  coverage: string;
}

export interface DepositOption {
  id: string;
  label: string;
  amount: number;
  surchargePerDay?: number;
  description: string;
  requiresVehicle2020?: boolean;
}

export interface ExperienceService {
  id: string;
  name: string;
  price: number;
  unit: 'per_day' | 'per_hour' | 'per_item' | 'flat';
  tierOnly?: DriverTier;
  description: string;
  /** 19/11/2026: ore minime prima del ritiro (Centralina Pro). 0 = nessun limite. */
  preavvisoOre?: number;
}

export type PaymentMode = 'full' | 'deposit_30';