/**
 * Default rental config — matches the seed values in the SQL migration.
 * Used as fallback when Supabase fetch fails.
 */

import type { RentalConfig } from '../types/rentalConfig'

export const DEFAULT_RENTAL_CONFIG: RentalConfig = {
  schema_version: 2,

  km_packages: [
    { id: 'supercar_50km', name: '50 km/giorno (Supercar)', price: 199, price_unit: 'per_day', is_active: true, display_order: 0, description: 'Pacchetto 50km al giorno per supercar' },
    { id: 'unlimited_km_supercar_t1', name: 'KM Illimitati (Supercar Fascia B)', price: 289, price_unit: 'per_day', is_active: true, display_order: 1 },
    { id: 'unlimited_km_supercar_t2', name: 'KM Illimitati (Supercar Fascia A)', price: 189, price_unit: 'per_day', is_active: true, display_order: 2 },
    { id: 'unlimited_km_furgone', name: 'KM Illimitati (Ducato)', price: 94.50, price_unit: 'per_day', is_active: true, display_order: 3 },
    { id: 'unlimited_km_ncc', name: 'KM Illimitati (Vito/NCC)', price: 189, price_unit: 'per_day', is_active: true, display_order: 4 },
  ],

  tier_rules: {
    blocked: { min_age: 21, max_age: 70, min_license_years: 3 },
    TIER_1: { label: 'Fascia B — Conducente giovane o patente recente', age_range: [21, 25], license_years_range: [3, 4] },
    TIER_2: { label: 'Fascia A — Conducente esperto', min_age: 26, max_age: 69, min_license_years: 5 },
  },

  vehicle_categories: {
    exotic: { label: 'Supercar / Exotic' },
    urban: { label: 'Urban' },
    utilitaire: { label: 'Utilitaria / Aziendali' },
    furgone: { label: 'Furgone / NCC' },
  },

  // Nessuna assicurazione di fabbrica: l'unica fonte e' Centralina Pro >
  // Assicurazioni. Prima qui c'era un listino completo (RCA / Kasko Base /
  // Black / Signature / DR7) che rientrava dalla finestra ogni volta che la
  // Centralina non aveva ancora risposto.
  insurance: ({
    eligibility: {},
    deductibles: {},
  }) as RentalConfig['insurance'],

  km_included: {
    _global: { table: { '1': 100, '2': 180, '3': 240, '4': 280, '5': 300 }, extra_per_day: 60 },
    urban: { unlimited: true, table: {}, extra_per_day: 0 },
    furgone: { table: { '1': 200, '2': 350, '3': 500, '4': 600, '5': 700 }, extra_per_day: 100 },
  },

  sforo_km: {
    _global: 1.80,
    category: { exotic: 0.89, furgone: 0.49, urban: 0.30 },
    vehicle_overrides: {},
  },

  unlimited_km: {
    exotic: { TIER_1: { per_day: 289 }, TIER_2: { per_day: 189 } },
    furgone: { _all_tiers: { per_day: 0, flat: 100 } },
    urban: { _all_tiers: { per_day: 0 } },
  },

  deposits: {
    TIER_1_RESIDENT: [
      { id: 'vehicle_deposit', label: 'Cauzione con veicolo', amount: 0, surcharge_per_day: 20, requires_vehicle_2020: true },
      { id: 'credit_card', label: 'Carta di credito', amount: 2000 },
      { id: 'cash_prepaid', label: 'Contanti o prepagata', amount: 4999 },
    ],
    TIER_2_RESIDENT: [
      { id: 'no_deposit', label: 'Nessuna cauzione', amount: 0, surcharge_per_day: 49 },
      { id: 'vehicle_deposit', label: 'Cauzione con veicolo', amount: 0, surcharge_per_day: 20, requires_vehicle_2020: true },
      { id: 'credit_card', label: 'Carta di credito', amount: 1000 },
      { id: 'cash_prepaid', label: 'Contanti o prepagata', amount: 4999 },
    ],
    TIER_1_NON_RESIDENT: [
      { id: 'credit_card', label: 'Carta di credito', amount: 5000 },
      { id: 'vehicle_deposit', label: 'Cauzione con veicolo', amount: 0, surcharge_per_day: 20, requires_vehicle_2020: true },
    ],
    TIER_2_NON_RESIDENT: [
      { id: 'credit_card', label: 'Carta di credito', amount: 3500 },
      { id: 'vehicle_deposit', label: 'Cauzione con veicolo', amount: 0, surcharge_per_day: 20, requires_vehicle_2020: true },
    ],
    category_defaults: { utilitaire: 1000, furgone: 2500, exotic: 10000 },
  },

  second_driver: { TIER_1: 20, TIER_2: 10 },

  lavaggio: { fee: 9.90, mandatory: true },

  delivery: { price_per_km: 3, by_category: {} },

  no_cauzione_surcharge: { per_day: 49, tier_restriction: 'TIER_2', requires_kasko: true },

  experience_services: [
    { id: 'bouquet', name: 'Bouquet di rose', price: 7.90, unit: 'per_item', is_active: true, tier_only: null },
    { id: 'wedding', name: 'Allestimento matrimonio interno/esterno', price: 150, unit: 'flat', is_active: true, tier_only: null },
    { id: 'personal_driver', name: 'Autista personale', price: 150, unit: 'per_hour', is_active: true, tier_only: null },
    { id: 'restaurant', name: 'Prenotazione ristorante', price: 10, unit: 'flat', is_active: true, tier_only: null },
    { id: 'video_drone', name: 'Video Maker + Drone shooting', price: 200, unit: 'per_hour', is_active: true, tier_only: null },
    { id: 'premium_24h', name: 'Assistenza premium 24h dedicata', price: 19.90, unit: 'per_day', is_active: true, tier_only: null },
    { id: 'vehicle_replacement', name: 'Sostituzione immediata veicolo', price: 19.90, unit: 'per_day', is_active: true, tier_only: 'TIER_2' },
    { id: 'chauffeur_vip', name: 'Noleggio con autista + itinerario VIP', price: 189, unit: 'per_hour', is_active: true, tier_only: null },
  ],

  dr7_flex: {
    daily_price: 19.90,
    refund_percent: 90,
    tier_restriction: 'TIER_2',
    description: 'Cancella fino al giorno del noleggio — rimborso del 90% come credito DR7 Wallet',
  },

  rental_day_rates: {
    exotic: {
      resident: { '1': 349, '2': 698, '3': 980, '4': 1290, '5': 1590, '6': 1990, '7': 2290 },
      extrapolation: 'day7_average',
    },
    urban: {
      flat: { '1': 39, '2': 78, '3': 109, '4': 129, '5': 149, '6': 179, '7': 189, '30': 689 },
      extrapolation: 'interpolate_7_30',
    },
    furgone: {
      flat: { '1': 139, '2': 278, '3': 389, '4': 490, '5': 590, '6': 649, '7': 689 },
      extrapolation: 'day7_average',
    },
  },

  payment_modes: [
    { id: 'full', label: 'Paga tutto subito', surcharge_percent: 0 },
    { id: 'deposit_30', label: 'Prenota con il 30%', surcharge_percent: 50 },
  ],
}
