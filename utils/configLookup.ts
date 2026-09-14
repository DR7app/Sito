/**
 * Centralina Unica — Config Lookup Helpers
 * Priority chain: vehicle override > category > global default
 * IMPORTANT: Keep in sync with admin copy at src/utils/configLookup.ts
 */

import type { RentalConfig, InsuranceOption, ExperienceService, DepositOption, DriverTier } from '../types/rentalConfig'

/**
 * Resolve a category lookup against its alias set. Centralina Pro renamed
 * "exotic" to "supercars" (April 2026); convertProConfig still writes the
 * bucket under "exotic". Without alias resolution a vehicle saved with
 * category="supercars" misses the bucket and falls through to an empty
 * `_global`, producing NaN downstream (e.g. "NaN Km" in WhatsApp templates).
 */
function lookupByCategoryAlias<T>(
  bag: Record<string, T> | undefined,
  category: string,
): T | undefined {
  if (!bag) return undefined
  const candidates = (
    category === 'supercars' ? ['supercars', 'exotic'] :
    category === 'exotic' ? ['exotic', 'supercars'] :
    [category]
  )
  for (const cat of candidates) {
    if (bag[cat] != null) return bag[cat]
  }
  return undefined
}

/** Get sforo KM for a vehicle. Priority: vehicle > category > global */
export function getSforoKm(config: RentalConfig, vehicleId: string, category: string): number {
  return config.sforo_km.vehicle_overrides?.[vehicleId]
    ?? lookupByCategoryAlias(config.sforo_km.category, category)
    ?? config.sforo_km._global
}

/** Opzione assicurativa per id, cercata in tutte le categorie/fasce della
 *  Centralina Pro (l'id e' unico). Unica fonte: la Centralina. */
export function getInsuranceOptionById(config: RentalConfig | null | undefined, id: string): InsuranceOption | null {
  if (!config?.insurance || !id) return null
  for (const [catKey, catConfig] of Object.entries(config.insurance)) {
    if (catKey === 'eligibility' || catKey === 'deductibles' || catKey === 'category_labels') continue
    if (!catConfig || typeof catConfig !== 'object') continue
    for (const tierKey of ['TIER_1', 'TIER_2', '_all_tiers']) {
      const opts = (catConfig as Record<string, InsuranceOption[]>)[tierKey]
      if (!Array.isArray(opts)) continue
      const match = opts.find(o => o.id === id)
      if (match) return match
    }
  }
  return null
}

/** L'opzione scelta e' una RCA (nessuna Kasko)? Lo dice il NOME che le ha
 *  dato la direzione in Centralina Pro: gli id sono codici generati. */
export function isRcaInsurance(config: RentalConfig | null | undefined, insuranceId: string): boolean {
  const opt = getInsuranceOptionById(config, insuranceId)
  if (!opt) return false
  return /^\s*rca\b/i.test(opt.name || '')
}

/** Get insurance options for a category + tier */
export function getConfigInsuranceOptions(config: RentalConfig, category: string, tier: DriverTier): InsuranceOption[] {
  const catConfig = lookupByCategoryAlias(config.insurance, category)
  if (!catConfig) return []
  if (tier === 'BLOCKED') return []
  return (catConfig as Record<string, InsuranceOption[]>)[tier]
    ?? (catConfig as Record<string, InsuranceOption[]>)._all_tiers
    ?? []
}

/** Get KM included for a number of rental days + vehicle category */
export function getKmIncluded(config: RentalConfig, days: number, category: string): number | 'unlimited' {
  if (!Number.isFinite(days) || days < 1) return 0

  const catConfig = lookupByCategoryAlias(config.km_included, category)

  if (catConfig && 'unlimited' in catConfig && catConfig.unlimited) {
    return 'unlimited'
  }

  const entry = (catConfig && 'table' in catConfig) ? catConfig : config.km_included._global
  if (!entry || !('table' in entry)) return 0

  const table = entry.table
  const tableKeys = Object.keys(table)
  // Empty/missing table would produce Math.max() = -Infinity and
  // Infinity × extra_per_day = NaN downstream.
  if (tableKeys.length === 0) return 0

  const maxTableDay = Math.max(...tableKeys.map(Number))

  if (days <= maxTableDay) {
    return table[String(days)] ?? table[String(maxTableDay)] ?? 0
  }

  const lastValue = table[String(maxTableDay)] ?? 0
  const extraDays = days - maxTableDay
  return lastValue + (extraDays * (entry.extra_per_day || 0))
}

/** Get unlimited KM price per day for a category + tier */
export function getUnlimitedKmPrice(config: RentalConfig, category: string, tier: DriverTier): number {
  const catConfig = lookupByCategoryAlias(config.unlimited_km, category)
  if (!catConfig) return 0

  if (tier !== 'BLOCKED' && catConfig[tier]) {
    return catConfig[tier]!.per_day ?? 0
  }

  if (catConfig._all_tiers) {
    return catConfig._all_tiers.flat ?? catConfig._all_tiers.per_day ?? 0
  }

  return 0
}

/** Get second driver price per day for a tier */
export function getSecondDriverPrice(config: RentalConfig, tier: DriverTier): number {
  if (tier === 'BLOCKED') return 0
  return config.second_driver?.[tier] ?? 10
}

/** Get no cauzione surcharge per day */
export function getNoCauzioneSurcharge(config: RentalConfig): number {
  return config.no_cauzione_surcharge?.per_day ?? 49
}

/** Check if no cauzione is available for a given tier + insurance */
export function isNoCauzioneAvailable(config: RentalConfig, tier: DriverTier, insuranceId: string): boolean {
  const restriction = config.no_cauzione_surcharge?.tier_restriction
  if (restriction && tier !== restriction) return false
  if (config.no_cauzione_surcharge?.requires_kasko && isRcaInsurance(config, insuranceId)) return false
  return true
}

/** Get experience services filtered by tier */
export function getConfigExperienceServices(config: RentalConfig, tier: DriverTier): ExperienceService[] {
  if (tier === 'BLOCKED') return []
  return (config.experience_services || []).filter(s => {
    if (!s.is_active) return false
    if (s.tier_only && s.tier_only !== tier) return false
    return true
  })
}

/** Check if DR7 Flex is available for a tier */
export function isDr7FlexAvailable(config: RentalConfig, tier: DriverTier): boolean {
  const restriction = config.dr7_flex?.tier_restriction
  if (!restriction) return true
  return tier === restriction
}

/** Get deposit options for a tier */
export function getConfigDepositOptions(config: RentalConfig, tier: DriverTier): DepositOption[] {
  if (tier === 'BLOCKED') return []
  // Try direct tier key first, then fallback to RESIDENT variant for backward compat with admin config
  const directKey = tier as keyof typeof config.deposits
  const residentKey = `${tier}_RESIDENT` as keyof typeof config.deposits
  return (config.deposits?.[directKey] as DepositOption[]) ?? (config.deposits?.[residentKey] as DepositOption[]) ?? []
}

/** Get lavaggio fee */
export function getLavaggioFee(config: RentalConfig): number {
  return config.lavaggio?.fee ?? 9.90
}

/** Get delivery price per km (flat fallback, no category) */
export function getDeliveryPricePerKm(config: RentalConfig): number {
  return config.delivery?.price_per_km ?? 3
}

/**
 * Get delivery price per km for a specific vehicle category.
 * Returns `null` when the category has no value in `by_category`.
 *
 * 2026-05-29: rimosso il flat fallback su `price_per_km` (l'input e'
 * stato tolto dalla Centralina). Unica sorgente: `by_category`.
 *
 * Honors the supercars↔exotic alias.
 */
export function getDeliveryPricePerKmForCategory(
  config: RentalConfig,
  category: string | null | undefined,
): number | null {
  const byCat = config.delivery?.by_category
  if (!category || !byCat) return null
  const v = lookupByCategoryAlias(byCat, category)
  return typeof v === 'number' && v > 0 ? v : null
}

/** Get DR7 Flex daily price */
export function getDr7FlexPrice(config: RentalConfig): number {
  return config.dr7_flex?.daily_price ?? 19.90
}
