/**
 * useCentralinaProConfig — single source of truth for website pricing.
 *
 * Reads the singleton `centralina_pro_config` row (managed by admin
 * Centralina Pro tab) and exposes it in the shape the rest of the
 * website already knows (WebsiteConfigOverlay from configOverlay.ts).
 *
 * Shapes mirror the admin's CentralinaProTab PersistedSnapshot exactly
 * (camelCase where admin uses camelCase). Missing fields surface as
 * undefined/empty — the CarBookingWizard keeps its existing fallback
 * behavior for fields Pro hasn't populated.
 */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { DynamicRentalDayRates } from '../utils/multiDayPricing'
import type { InsuranceTierOption, DepositOption, ExperienceService } from '../types'

// ── Types inlined here so the website no longer depends on utils/configOverlay.ts
// (which can be safely deleted along with hooks/useRentalConfig.ts once
// rental_config is removed from Supabase).
export interface RentalDayRates {
  exotic: {
    resident: Record<string, number>
    non_resident?: Record<string, number>
  }
  urban: { flat: Record<string, number>; extrapolation: string }
  furgone: { flat: Record<string, number> }
}

export interface KmIncludedConfig {
  table: Record<string, number>
  extra_per_day: number
}

export interface KmPackagePrices {
  supercar50kmPerDay: number
  unlimitedSupercarT1PerDay: number
  unlimitedSupercarT2PerDay: number
  unlimitedFurgonePerDay: number
  unlimitedNccPerDay: number
  unlimitedUrbanPerDay: number
}

export interface WebsiteConfigOverlay {
  insuranceTier1: InsuranceTierOption[]
  insuranceTier2: InsuranceTierOption[]
  urbanInsurance: InsuranceTierOption[]
  utilitaireInsurance: InsuranceTierOption[]
  furgoneInsurance: InsuranceTierOption[]
  /** Per-category insurance keyed da raw category id (supercars / urban /
   *  aziendali / hypercar_elit / suv_luxury / qualsiasi categoria
   *  configurata in Centralina Pro). Wizard la legge per PRIMA. */
  insuranceByCategory?: Record<string, { TIER_1: InsuranceTierOption[]; TIER_2: InsuranceTierOption[]; _all_tiers: InsuranceTierOption[] }>
  tierPricing: {
    TIER_1: { unlimitedKmPerDay: number; secondDriverPerDay: number; lavaggio: number }
    TIER_2: { unlimitedKmPerDay: number; secondDriverPerDay: number; lavaggio: number }
  }
  noDepositSurchargePerDay: number
  deliveryPricePerKm: number
  experienceServices: ExperienceService[]
  dr7Flex: { enabled: boolean; dailyPrice: number; refundPercent: number; tierRestriction: string }
  depositOptions: {
    TIER_1_RESIDENT: DepositOption[]
    TIER_2_RESIDENT: DepositOption[]
    TIER_1_NON_RESIDENT: DepositOption[]
    TIER_2_NON_RESIDENT: DepositOption[]
    /** Per-vehicle-category overrides. Key = raw category id; preserves
     *  ogni categoria configurata in Centralina Pro (legacy + nuove). */
    byCategory?: Record<string, { TIER_1_RESIDENT: DepositOption[]; TIER_2_RESIDENT: DepositOption[]; TIER_1_NON_RESIDENT: DepositOption[]; TIER_2_NON_RESIDENT: DepositOption[] }>
  }
  rentalDayRates: RentalDayRates | null
  kmIncluded: KmIncludedConfig | null
  kmIncludedSupercars?: KmIncludedConfig | null
  kmIncludedUrban?: KmIncludedConfig | null
  kmIncludedAziendali: KmIncludedConfig | null
  /** Per-category km map. Key = raw category id. Wizard la legge per
   *  PRIMA per scegliere la tabella km inclusi per il veicolo. */
  kmIncludedByCategory?: Record<string, KmIncludedConfig | { unlimited: true }>
  kmPackagePrices: KmPackagePrices
  sforoPerKm: number
  /** Per-category sforo €/km. Key = raw category id. */
  sforoByCategory?: Record<string, number>
  /** Per-category km illimitati €/giorno per fascia. */
  unlimitedKmByCategory?: Record<string, { TIER_1: number; TIER_2: number }>
  /** 2026-05-18: toggle Centralina Pro > Automazioni > Inclusione
   *  coefficiente. Per ogni voce dice se entra nel calcolo del
   *  coefficiente dinamico. Default mirror del PreventiviTab admin:
   *  unlimited_km e km_packages false (a listino), tutti gli altri true. */
  coefficientInclusion?: {
    insurance: boolean
    lavaggio: boolean
    no_cauzione: boolean
    second_driver: boolean
    dr7_flex: boolean
    cauzione_veicoli: boolean
    unlimited_km: boolean
    km_packages: boolean
    experience?: boolean
    delivery?: boolean
    pickup?: boolean
  }
}

// ── Pro snapshot types (match CentralinaProTab PersistedSnapshot) ──

export interface ProTariffaGiornaliera {
  id: string // 'supercars' | 'urban' | 'furgone' | custom category id
  label?: string
  mode?: 'unica' | 'per_residenza'
  days?: string[]
  unica?: Record<string, number | ''>
  residente?: Record<string, number | ''>
  non_residente?: Record<string, number | ''>
  extraPerDay?: number | ''
}

export interface ProKmEntry {
  id: string // category id
  label?: string
  table?: Record<string, number | ''>
  extraPerDay?: number | ''
  sforo?: number | ''
  unlimitedPerDay?: number | ''
  unlimitedKm_enabled?: boolean
  unlimitedByFascia?: Record<string, number | ''>
  unlimitedMode?: 'per_fascia' | 'all_tiers'
  // 2026-05-16: Pacchetti KM acquistabili dal cliente come opzione
  // additiva. Ciascun pacchetto = km extra inclusi a sforo scontato.
  pacchetti?: ProPacchettoKm[]
}

/**
 * Pacchetto KM extra acquistabile dal cliente. Prezzo finale calcolato:
 *   price = km × sforo_categoria × (1 - sconto_pct/100)
 * con sforo_categoria letto da snapshot.km[id_categoria].sforo.
 */
export interface ProPacchettoKm {
  id: string
  km: number | ''
  sconto_pct: number | ''
  is_active: boolean
  label?: string
  /** 2026-05-16: se true il pacchetto e' acquistabile piu' volte (qty
   *  selector con + sul wizard). Se false → toggle si/no. */
  is_quantity_buyable?: boolean
  /** 2026-05-16: limite max quantita' acquistabile quando
   *  is_quantity_buyable=true. Default 2 quando non specificato. */
  max_quantity?: number | ''
}

export interface ProInsuranceOption {
  id?: string
  name: string
  daily_price: number | ''
  mandatory_deposit?: number | ''
  deductible_fixed?: number | ''
  deductible_percent?: number | ''
}

export interface ProInsuranceCategory {
  id: string // category id
  label?: string
  mode?: 'per_fascia' | 'all_tiers'
  byFascia?: Record<string, ProInsuranceOption[]> // fascia id → options
  all?: ProInsuranceOption[]
}

export interface ProDepositOption {
  id?: string
  label: string
  amount: number | ''
  surcharge_per_day?: number | ''
}

export interface ProDepositsByFascia {
  residente?: ProDepositOption[]
  non_residente?: ProDepositOption[]
}
// New shape (post April 2026): deposits[category][fascia] = { residente, non_residente }
// Old shape (pre April 2026): deposits[fascia] = { residente, non_residente }
// Both are accepted at runtime — see buildWebsiteConfigOverlayFromPro for migration.
export type ProDepositsByFasciaMap = Record<string, ProDepositsByFascia> // fascia id → options
export type ProDepositsConfig =
  | ProDepositsByFasciaMap                                // legacy
  | Record<string, ProDepositsByFasciaMap>                // category → fascia → options

export interface ProExperienceService {
  id?: string
  name: string
  price: number | ''
  unit: 'per_day' | 'per_hour' | 'per_item' | 'flat'
  is_active?: boolean
  /** Quando true il servizio è disponibile SOLO in admin (utile per voci
   *  che l'operatore aggiunge a mano alle prenotazioni e che non devono
   *  comparire nel wizard del sito — es. Pacchetto KM Extra). */
  admin_only?: boolean
  tier_only?: string // fascia id
  description?: string
}

export interface ProServiziConfig {
  experience?: ProExperienceService[]
  dr7_flex?: {
    enabled?: boolean
    daily_price?: number | ''
    refund_percent?: number | ''
    tier_restriction?: string
    description?: string
  }
  lavaggio?: { fee?: number | ''; mandatory?: boolean }
  delivery?: { price_per_km?: number | '' }
  second_driver?: Record<string, number | ''> // keyed by fascia id
}

export interface ProFascia {
  id: string
  label?: string
  description?: string
  min_age?: number | ''
  max_age?: number | ''
  min_license_years?: number | ''
}

export interface ProCentralinaSnapshot {
  categories?: Array<{ id: string; label: string }>
  fasce?: ProFascia[]
  insurance?: ProInsuranceCategory[]
  km?: ProKmEntry[]
  deposits?: ProDepositsConfig
  servizi?: ProServiziConfig
  prezzoDinamico?: {
    tariffe?: ProTariffaGiornaliera[]
    dynamic?: Record<string, unknown>
  }
  preventivi?: Record<string, unknown>
  // Centralina Pro > Automazioni > Inclusione coefficiente.
  // Per ogni voce di costo decide se entra nel calcolo del coefficiente
  // dinamico (true) o resta a listino (false). Default mirror del
  // PreventiviTab admin: insurance/lavaggio/no_cauzione/second_driver/
  // dr7_flex/cauzione_veicoli true; unlimited_km false.
  automations?: {
    coefficient_unlimited_km?: boolean
    coefficient_insurance?: boolean
    coefficient_lavaggio?: boolean
    coefficient_no_cauzione?: boolean
    coefficient_second_driver?: boolean
    coefficient_dr7_flex?: boolean
    coefficient_cauzione_veicoli?: boolean
    coefficient_km_packages?: boolean
    coefficient_experience?: boolean
    coefficient_delivery?: boolean
    coefficient_pickup?: boolean
    [k: string]: unknown
  }
}

// ────────────────────────────────────────────────────────────────────

interface UseProConfigResult {
  snapshot: ProCentralinaSnapshot | null
  loading: boolean
  error: string | null
}

const ROW_ID = 'main'

export function useCentralinaProConfig(): UseProConfigResult {
  const [snapshot, setSnapshot] = useState<ProCentralinaSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error: err } = await supabase
          .from('centralina_pro_config')
          .select('config')
          .eq('id', ROW_ID)
          .maybeSingle()
        if (cancelled) return
        if (err) throw err
        const cfg = (data?.config ?? null) as ProCentralinaSnapshot | null
        setSnapshot(cfg)
      } catch (e) {
        if (cancelled) return
        console.error('[CentralinaPro] load failed:', e)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return { snapshot, loading, error }
}

// ── Helpers ────────────────────────────────────────────────────────

function num(v: number | '' | null | undefined, fallback: number): number {
  if (v === '' || v === null || v === undefined) return fallback
  const n = Number(v)
  return isNaN(n) ? fallback : n
}

function cleanNumMap(src: Record<string, number | ''> | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  if (!src) return out
  for (const [k, v] of Object.entries(src)) {
    if (v !== '' && v !== undefined && v !== null && !isNaN(Number(v))) {
      out[k] = Number(v)
    }
  }
  return out
}

// Project rule: Fascia A = TIER_2 (experienced), Fascia B = TIER_1 (young/new licence)
const FASCIA_A_ID = 'A'
const FASCIA_B_ID = 'B'

const DEFAULT_COVERAGE = 'RCA - Furto (solo in caso di restituzione chiave, altrimenti 100% del valore del veicolo) - Atti vandalici - Agenti atmosferici - Incendio - Danni & distruzione totale'

function toInsuranceOpts(arr: ProInsuranceOption[] | undefined): InsuranceTierOption[] {
  if (!arr) return []
  // 2026-05-15: filtra opzioni con is_active === false (toggle ON/OFF
  // Centralina Pro). Default true per backwards compat.
  return arr.filter(o => (o as { is_active?: boolean }).is_active !== false).map(o => {
    const fixed = num(o.deductible_fixed, 0)
    const percent = num(o.deductible_percent, 0)
    const deductibleParts: string[] = []
    if (fixed > 0) deductibleParts.push(`€${fixed}`)
    if (percent > 0) deductibleParts.push(`${percent}% del danno`)
    const deductible = deductibleParts.length > 0 ? deductibleParts.join(' + ') : 'Nessuna franchigia'
    return {
      id: o.id || o.name,
      name: o.name,
      dailyPrice: num(o.daily_price, 0),
      deductible,
      mandatoryDeposit: num(o.mandatory_deposit, 0) || undefined,
      coverage: DEFAULT_COVERAGE,
    }
  })
}

function pickInsuranceForFascia(cat: ProInsuranceCategory | undefined, fasciaId: string): InsuranceTierOption[] {
  if (!cat) return []
  if (cat.mode === 'all_tiers' && cat.all && cat.all.length > 0) return toInsuranceOpts(cat.all)
  const arr = cat.byFascia?.[fasciaId]
  return toInsuranceOpts(arr)
}

function toDepositOpts(arr: ProDepositOption[] | undefined): DepositOption[] {
  if (!arr) return []
  // 2026-05-15: filtra opzioni con is_active === false (toggle ON/OFF
  // in Centralina Pro). Default true per backwards compat.
  return arr
    .filter(o => (o as { is_active?: boolean }).is_active !== false)
    .map(o => ({
      id: o.id || o.label,
      label: o.label,
      amount: num(o.amount, 0),
      surchargePerDay: num(o.surcharge_per_day, 0) || undefined,
    }))
}

// ── Adapters ───────────────────────────────────────────────────────

/**
 * Adapt Pro.prezzoDinamico.tariffe[] → DynamicRentalDayRates
 * (the shape calculateMultiDayPrice expects).
 */
export function adaptPrezzoDinamicoToRates(
  snapshot: ProCentralinaSnapshot | null
): DynamicRentalDayRates | null {
  const tariffe = snapshot?.prezzoDinamico?.tariffe
  if (!tariffe || tariffe.length === 0) return null

  let exoticResident: Record<string, number> | undefined
  let exoticNonResident: Record<string, number> | undefined
  let urbanFlat: Record<string, number> | undefined
  let furgoneFlat: Record<string, number> | undefined

  for (const t of tariffe) {
    const resMap = t.mode === 'per_residenza' ? cleanNumMap(t.residente) : cleanNumMap(t.unica)
    const nonResMap = t.mode === 'per_residenza' ? cleanNumMap(t.non_residente) : undefined
    if (t.id === 'supercars' || t.id === 'exotic') {
      exoticResident = resMap
      exoticNonResident = nonResMap
    } else if (t.id === 'urban' || t.id === 'utilitaria') {
      urbanFlat = resMap
    } else if (t.id === 'furgone' || t.id === 'aziendali') {
      furgoneFlat = resMap
    }
  }

  if (
    (!exoticResident || Object.keys(exoticResident).length === 0) &&
    (!urbanFlat || Object.keys(urbanFlat).length === 0) &&
    (!furgoneFlat || Object.keys(furgoneFlat).length === 0)
  ) {
    return null
  }

  return {
    exotic: {
      resident: exoticResident ?? {},
      ...(exoticNonResident && Object.keys(exoticNonResident).length > 0
        ? { non_resident: exoticNonResident }
        : {}),
    },
    urban: { flat: urbanFlat ?? {} },
    furgone: { flat: furgoneFlat ?? {} },
  }
}

/**
 * Adapt Pro.km[] → KmIncludedConfig for a given category.
 */
export function adaptKmForCategory(
  snapshot: ProCentralinaSnapshot | null,
  categoryId: string
): { table: Record<string, number>; extra_per_day: number } | null {
  const entry = snapshot?.km?.find(k => k.id === categoryId)
  if (!entry) return null
  const table = cleanNumMap(entry.table)
  const extra = num(entry.extraPerDay, 60)
  if (Object.keys(table).length === 0 && extra === 60) return null
  return { table, extra_per_day: extra }
}

/**
 * MAIN ADAPTER: Pro snapshot → WebsiteConfigOverlay.
 *
 * Returns the same shape as buildWebsiteConfigOverlay(rentalConfig), so
 * callers can drop this in as a replacement without touching pricing logic.
 */
export function buildWebsiteConfigOverlayFromPro(snapshot: ProCentralinaSnapshot | null): WebsiteConfigOverlay | null {
  if (!snapshot) return null

  const insuranceByCatId = new Map<string, ProInsuranceCategory>()
  for (const c of snapshot.insurance || []) insuranceByCatId.set(c.id, c)

  const supercarsIns = insuranceByCatId.get('supercars') ?? insuranceByCatId.get('exotic')
  const urbanIns = insuranceByCatId.get('urban') ?? insuranceByCatId.get('utilitaria')
  const furgoneIns = insuranceByCatId.get('furgone') ?? insuranceByCatId.get('aziendali')

  const insuranceTier1 = pickInsuranceForFascia(supercarsIns, FASCIA_B_ID) // Fascia B = TIER_1
  const insuranceTier2 = pickInsuranceForFascia(supercarsIns, FASCIA_A_ID) // Fascia A = TIER_2
  const urbanInsurance = pickInsuranceForFascia(urbanIns, FASCIA_A_ID)
    .concat(pickInsuranceForFascia(urbanIns, FASCIA_B_ID).filter(o => !pickInsuranceForFascia(urbanIns, FASCIA_A_ID).some(a => a.id === o.id)))
  const furgoneInsurance = pickInsuranceForFascia(furgoneIns, FASCIA_A_ID)
    .concat(pickInsuranceForFascia(furgoneIns, FASCIA_B_ID).filter(o => !pickInsuranceForFascia(furgoneIns, FASCIA_A_ID).some(a => a.id === o.id)))

  // Per-category insurance map — keyed da raw category id (Hypercar Elitè,
  // Supercar Pro, Suv Luxury, supercars, ecc.). Cattura OGNI categoria
  // configurata in Centralina Pro > Assicurazioni. Il wizard la legge per
  // PRIMA via configOverlay.insuranceByCategory[item.category].
  const insuranceByCategory: Record<string, { TIER_1: InsuranceTierOption[]; TIER_2: InsuranceTierOption[]; _all_tiers: InsuranceTierOption[] }> = {}
  for (const cat of snapshot.insurance || []) {
    insuranceByCategory[cat.id] = {
      TIER_1: pickInsuranceForFascia(cat, FASCIA_B_ID), // Fascia B = TIER_1
      TIER_2: pickInsuranceForFascia(cat, FASCIA_A_ID), // Fascia A = TIER_2
      _all_tiers: cat.mode === 'all_tiers' ? toInsuranceOpts(cat.all) : [],
    }
  }

  // km per category
  const kmSupercars = snapshot.km?.find(k => k.id === 'supercars' || k.id === 'exotic')
  const kmUrban = snapshot.km?.find(k => k.id === 'urban' || k.id === 'utilitaria')
  const kmFurgone = snapshot.km?.find(k => k.id === 'furgone' || k.id === 'aziendali')

  // No hardcoded fallbacks — if Pro has nothing, price is 0 and the gap is visible.
  // Aziendali category drives BOTH Furgone (Ducato) and NCC (V_CLASS) unlimited prices.
  // Helper: legge il prezzo unlimited per-tier. Se la categoria è in modalità
  // "per_fascia" (A=189, B=289), ritorna il valore della fascia richiesta.
  // Altrimenti usa il valore unico "Tutte le fasce".
  // Fascia A ↔ TIER_2, Fascia B ↔ TIER_1 (convenzione DR7).
  const unlimitedFor = (cat: any, tier: 'TIER_1' | 'TIER_2'): number => {
    if (!cat) return 0
    // 2026-05-15: rispetta toggle ON/OFF (unlimitedKm_enabled) della
    // Centralina Pro. Se false → Km Illimitati non disponibili → ritorna 0.
    // Default true per backwards compat.
    if (cat.unlimitedKm_enabled === false) return 0
    const mode = cat.unlimitedMode || 'all_tiers'
    if (mode === 'per_fascia' && cat.unlimitedByFascia) {
      const key = tier === 'TIER_2' ? 'A' : 'B'
      const v = num(cat.unlimitedByFascia[key], 0)
      if (v > 0) return v
      // Fallback: se il valore della fascia richiesta è 0 ma l'altro è > 0,
      // usa il maggiore tra i due invece di ritornare 0 (evita sotto-prezzo).
      const other = num(cat.unlimitedByFascia[key === 'A' ? 'B' : 'A'], 0)
      if (other > 0) return other
    }
    return num(cat.unlimitedPerDay, 0)
  }

  const unlimitedSupercarT1 = unlimitedFor(kmSupercars, 'TIER_1')
  const unlimitedSupercarT2 = unlimitedFor(kmSupercars, 'TIER_2')
  const unlimitedAziendaliT1 = unlimitedFor(kmFurgone, 'TIER_1')
  const unlimitedAziendaliT2 = unlimitedFor(kmFurgone, 'TIER_2')
  const unlimitedUrbanT1 = unlimitedFor(kmUrban, 'TIER_1')
  const unlimitedUrbanT2 = unlimitedFor(kmUrban, 'TIER_2')
  // Legacy single-tier vars kept for fields that don't split by tier
  const unlimitedSupercar = unlimitedSupercarT2 || unlimitedSupercarT1
  const unlimitedAziendali = unlimitedAziendaliT2 || unlimitedAziendaliT1
  const unlimitedUrban = unlimitedUrbanT2 || unlimitedUrbanT1
  const sforoSupercar = num(kmSupercars?.sforo, 0)

  // No hardcoded fallbacks
  const secondDriverFasciaA = num(snapshot.servizi?.second_driver?.[FASCIA_A_ID], 0)
  const secondDriverFasciaB = num(snapshot.servizi?.second_driver?.[FASCIA_B_ID], 0)
  const lavaggioFee = num(snapshot.servizi?.lavaggio?.fee, 0)

  // Deposits — accept BOTH new shape (deposits[category][fascia]) and legacy
  // (deposits[fascia]). Detection: a category-keyed value would itself be an
  // object whose entries are { residente, non_residente }; a fascia-keyed
  // value has those fields directly.
  const rawDeposits = (snapshot.deposits || {}) as Record<string, ProDepositsByFascia | ProDepositsByFasciaMap>
  const firstDepValue = Object.values(rawDeposits)[0] as Record<string, unknown> | undefined
  const isLegacyDepositShape = !!firstDepValue
    && typeof firstDepValue === 'object'
    && ('residente' in firstDepValue || 'non_residente' in firstDepValue)

  const pickFasciaFor = (catId?: string) => {
    if (isLegacyDepositShape || !catId) {
      return {
        A: (rawDeposits[FASCIA_A_ID] as ProDepositsByFascia | undefined) ?? {},
        B: (rawDeposits[FASCIA_B_ID] as ProDepositsByFascia | undefined) ?? {},
      }
    }
    const cat = (rawDeposits[catId] as ProDepositsByFasciaMap | undefined) ?? {}
    return {
      A: cat[FASCIA_A_ID] ?? {},
      B: cat[FASCIA_B_ID] ?? {},
    }
  }
  // Legacy / fallback (used when no per-category data is available — copies
  // the supercars set into the flat keys for back-compat with non-category
  // call sites).
  const fallbackCat = isLegacyDepositShape ? undefined : 'supercars'
  const flatPick = pickFasciaFor(fallbackCat)
  const depFasciaA = flatPick.A
  const depFasciaB = flatPick.B
  // Per-category sets — only emitted when the new shape is in use.
  const buildCatSet = (catId: string) => {
    const f = pickFasciaFor(catId)
    return {
      TIER_1_RESIDENT: toDepositOpts(f.B.residente),
      TIER_2_RESIDENT: toDepositOpts(f.A.residente),
      TIER_1_NON_RESIDENT: toDepositOpts(f.B.non_residente),
      TIER_2_NON_RESIDENT: toDepositOpts(f.A.non_residente),
    }
  }
  // Per-category deposits: emit per OGNI category id presente in raw
  // deposits (non solo i 3 legacy). Le categorie nuove di Centralina
  // Pro (Hypercar Elitè, Supercar Pro, Suv Luxury, ecc.) erano
  // silenziosamente droppate, e il wizard cadeva sulle cauzioni
  // Supercar di default.
  const depositByCategory = (() => {
    if (isLegacyDepositShape) return undefined
    const out: Record<string, ReturnType<typeof buildCatSet>> = {}
    for (const catId of Object.keys(rawDeposits)) {
      out[catId] = buildCatSet(catId)
    }
    return out
  })()

  const experienceServices: ExperienceService[] = (snapshot.servizi?.experience || [])
    .filter(s => s.is_active !== false)
    // admin_only: il servizio è destinato SOLO all'operatore admin, non
    // deve comparire nel wizard del sito (es. Pacchetto KM Extra).
    .filter(s => !s.admin_only)
    .map(s => ({
      id: s.id || s.name,
      name: s.name,
      price: num(s.price, 0),
      unit: s.unit,
      tierOnly: s.tier_only === FASCIA_A_ID ? 'TIER_2' : s.tier_only === FASCIA_B_ID ? 'TIER_1' : undefined,
      description: s.description || '',
    }))

  // rentalDayRates: reuse the adapter
  const dynamicRates = adaptPrezzoDinamicoToRates(snapshot)
  const rentalDayRates: RentalDayRates | null = dynamicRates
    ? {
        exotic: dynamicRates.exotic,
        urban: {
          flat: dynamicRates.urban.flat,
          extrapolation: dynamicRates.urban.extrapolation || 'interpolate_7_30',
        },
        furgone: dynamicRates.furgone,
      }
    : null

  // kmIncluded per category — supercars is the default, aziendali for furgone/ncc
  const kmIncluded: KmIncludedConfig | null = kmSupercars
    ? {
        table: cleanNumMap(kmSupercars.table),
        extra_per_day: num(kmSupercars.extraPerDay, 60),
      }
    : null

  const kmAziendaliEntry = (snapshot.km || []).find(k => k.id === 'aziendali')
  const kmIncludedAziendali: KmIncludedConfig | null = kmAziendaliEntry
    ? {
        table: cleanNumMap(kmAziendaliEntry.table),
        extra_per_day: num(kmAziendaliEntry.extraPerDay, 0),
      }
    : null

  // Per-category km + sforo + km illimitati. Cattura OGNI categoria in
  // Centralina Pro (Hypercar Elite, Supercar Pro, Suv Luxury, ecc.).
  const kmIncludedByCategory: Record<string, KmIncludedConfig | { unlimited: true }> = {}
  const sforoByCategory: Record<string, number> = {}
  const unlimitedKmByCategory: Record<string, { TIER_1: number; TIER_2: number }> = {}
  // 2026-05-16: pacchetti KM per categoria. Solo quelli con is_active=true
  // e km>0 finiscono nell'output (il wizard non deve mostrare placeholder).
  // price = km × sforo × (1 - sconto_pct/100); fallback sforo=0 se non
  // configurato → il pacchetto risulta gratis (admin bug, ma non blocca).
  const pacchettiByCategory: Record<string, Array<{ id: string; km: number; sconto_pct: number; price: number; label: string; is_quantity_buyable: boolean; max_quantity: number }>> = {}
  for (const k of snapshot.km || []) {
    const table = cleanNumMap(k.table)
    const hasLimits = Object.values(table).some(v => v > 0)
    if (!hasLimits && num(k.extraPerDay, 0) === 0) {
      kmIncludedByCategory[k.id] = { unlimited: true }
    } else {
      kmIncludedByCategory[k.id] = { table, extra_per_day: num(k.extraPerDay, 0) }
    }
    const s = num(k.sforo, 0)
    if (s > 0) sforoByCategory[k.id] = s
    // 2026-07-09: quando il toggle Km Illimitati e' OFF per la categoria
    // (unlimitedKm_enabled === false) NON creiamo l'entry, cosi' il wizard
    // NASCONDE del tutto l'opzione (nel render perDay === null → return null).
    // Prima impostavamo sempre { TIER_1: 0, TIER_2: 0 } e il wizard la mostrava
    // come "Incluso"/gratis per TUTTE le auto invece di rimuoverla. Entry
    // presente con 0 = toggle ON gratis (Incluso); entry assente = toggle OFF.
    if (k.unlimitedKm_enabled !== false) {
      unlimitedKmByCategory[k.id] = {
        TIER_1: unlimitedFor(k, 'TIER_1'),
        TIER_2: unlimitedFor(k, 'TIER_2'),
      }
    }
    const pkgs = (k.pacchetti || [])
      .filter(p => p && p.is_active === true)
      .map(p => {
        const km = num(p.km, 0)
        const sconto = num(p.sconto_pct, 0)
        const price = Math.round((km * s * (1 - sconto / 100)) * 100) / 100
        const label = String(p.label || '').trim() || `Pacchetto ${km} km`
        // 2026-05-16: pacchetti >=300 km SEMPRE quantity-buyable.
        // 2026-05-17: max_quantity 99 (effettivamente illimitato — direzione
        // vuole poter aggiungere 300 km piu' volte senza tetto). 100/200
        // restano si/no di default a meno che admin non spunti il toggle
        // "Acquistabile piu' volte".
        const isQty = km >= 300 || p.is_quantity_buyable === true
        const maxQ = isQty ? Math.max(99, num(p.max_quantity, 99) || 99) : 1
        return { id: String(p.id), km, sconto_pct: sconto, price, label, is_quantity_buyable: isQty, max_quantity: maxQ }
      })
      .filter(p => p.km > 0)
    if (pkgs.length > 0) pacchettiByCategory[k.id] = pkgs
  }

  // NCC (V_CLASS) reads from the Aziendali category, same as Furgone (Ducato).
  const kmPackagePrices: KmPackagePrices = {
    supercar50kmPerDay: 0, // Not yet in Pro — keep at 0 until admin adds a field
    unlimitedSupercarT1PerDay: unlimitedSupercarT1,
    unlimitedSupercarT2PerDay: unlimitedSupercarT2,
    unlimitedFurgonePerDay: unlimitedAziendali,
    unlimitedNccPerDay: unlimitedAziendali,
    unlimitedUrbanPerDay: unlimitedUrban,
  }

  return {
    insuranceTier1,
    insuranceTier2,
    urbanInsurance,
    utilitaireInsurance: urbanInsurance, // Pro has 'urban' covering both
    furgoneInsurance,
    tierPricing: {
      TIER_1: {
        // Fascia B (TIER_1) usa il prezzo Fascia B dell'Admin Pro, non un valore
        // condiviso. Se admin imposta A=189 B=289, TIER_1 riceve 289.
        unlimitedKmPerDay: unlimitedSupercarT1,
        secondDriverPerDay: secondDriverFasciaB,
        lavaggio: lavaggioFee,
      },
      TIER_2: {
        unlimitedKmPerDay: unlimitedSupercarT2,
        secondDriverPerDay: secondDriverFasciaA,
        lavaggio: lavaggioFee,
      },
    },
    noDepositSurchargePerDay: 0, // Pro stores surcharge per deposit option, not a global
    deliveryPricePerKm: num(snapshot.servizi?.delivery?.price_per_km, 0),
    experienceServices,
    dr7Flex: {
      // Default true so existing tenants keep showing the option until they
      // explicitly disable it from Centralina Pro > Servizi.
      enabled: snapshot.servizi?.dr7_flex?.enabled !== false,
      dailyPrice: num(snapshot.servizi?.dr7_flex?.daily_price, 0),
      refundPercent: num(snapshot.servizi?.dr7_flex?.refund_percent, 0),
      tierRestriction: snapshot.servizi?.dr7_flex?.tier_restriction === FASCIA_A_ID
        ? 'TIER_2'
        : snapshot.servizi?.dr7_flex?.tier_restriction === FASCIA_B_ID
          ? 'TIER_1'
          : (snapshot.servizi?.dr7_flex?.tier_restriction || 'TIER_2'),
    },
    depositOptions: {
      TIER_1_RESIDENT: toDepositOpts(depFasciaB.residente),
      TIER_2_RESIDENT: toDepositOpts(depFasciaA.residente),
      TIER_1_NON_RESIDENT: toDepositOpts(depFasciaB.non_residente),
      TIER_2_NON_RESIDENT: toDepositOpts(depFasciaA.non_residente),
      ...(depositByCategory ? { byCategory: depositByCategory } : {}),
    },
    insuranceByCategory,
    rentalDayRates,
    kmIncluded,
    kmIncludedSupercars: kmIncluded,
    kmIncludedUrban: null,
    kmIncludedAziendali,
    kmIncludedByCategory,
    kmPackagePrices,
    sforoPerKm: sforoSupercar,
    sforoByCategory,
    unlimitedKmByCategory,
    pacchettiByCategory,
    // 2026-05-18: porta i toggle Centralina Pro > Automazioni nel
    // overlay cosi\' il CarBookingWizard sa quali voci includere nel
    // calcolo del coefficiente dinamico. Default mirror PreventiviTab
    // admin: unlimited_km e km_packages a listino, gli altri scontabili.
    coefficientInclusion: {
      insurance:        snapshot.automations?.coefficient_insurance        !== false,
      lavaggio:         snapshot.automations?.coefficient_lavaggio         !== false,
      no_cauzione:      snapshot.automations?.coefficient_no_cauzione      !== false,
      second_driver:    snapshot.automations?.coefficient_second_driver    !== false,
      dr7_flex:         snapshot.automations?.coefficient_dr7_flex         !== false,
      cauzione_veicoli: snapshot.automations?.coefficient_cauzione_veicoli !== false,
      unlimited_km:     !!snapshot.automations?.coefficient_unlimited_km,
      km_packages:      !!snapshot.automations?.coefficient_km_packages,
      // 2026-05-27: nuovi toggle per voci prima sempre-escluse.
      experience:       !!snapshot.automations?.coefficient_experience,
      delivery:         !!snapshot.automations?.coefficient_delivery,
      pickup:           !!snapshot.automations?.coefficient_pickup,
    },
  }
}

/**
 * Composite hook: returns the Pro-derived WebsiteConfigOverlay ready to use.
 * Drop-in replacement for useRentalConfig + buildWebsiteConfigOverlay.
 */
export function useCentralinaProOverlay(): { overlay: WebsiteConfigOverlay | null; loading: boolean; snapshot: ProCentralinaSnapshot | null } {
  const { snapshot, loading } = useCentralinaProConfig()
  const overlay = useMemo(() => buildWebsiteConfigOverlayFromPro(snapshot), [snapshot])
  return { overlay, loading, snapshot }
}
