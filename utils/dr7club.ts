/**
 * DR7 Club — Membership tiers, reward engine, wallet rules
 *
 * Tiers based on annual spend:
 *   Access: €0–€2,999 → 2% reward
 *   Black:  €3,000–€9,999 → 3% reward
 *   Signature: €10,000+ → 4% reward
 *
 * Wallet rules:
 *   - Max 30% of order
 *   - Not usable for: cauzioni, penali, danni, franchigie
 *   - Credits expire after 12 months
 *   - Credits added ONLY after rental completion
 *   - Rewards only for active DR7 Club subscribers
 */

import { supabase } from '../supabaseClient'
import { loadCentralinaConfigOnce, getDr7ClubPlanCopy } from './siteCopy'

// ─── Types ───────────────────────────────────────────────────────────

// I livelli non sono piu' tre fissi: si aggiungono da Centralina Pro > DR7
// Club, quindi l'id e' una stringa qualsiasi. 'none' = spesa sotto la soglia
// piu' bassa configurata (l'operatore puo' aver tolto il livello di ingresso).
export type ClubTier = string

export interface ClubSubscription {
  id: string
  user_id: string
  plan: 'monthly' | 'annual'
  status: 'pending' | 'active' | 'cancelled' | 'expired'
  price: number
  started_at: string
  expires_at: string
  created_at: string
}

export interface ClubTierInfo {
  tier: ClubTier
  label: string
  rewardPercent: number
  annualSpend: number
  nextTier: ClubTier | null
  nextTierThreshold: number
  progress: number // 0-100%
}

// ─── Constants ───────────────────────────────────────────────────────

export interface ClubPlan {
  price: number
  label: string
  period: string
}

/**
 * Prezzi di fabbrica dell'abbonamento. Valgono solo come fallback: quelli veri
 * si leggono con `getClubPlans()` da Centralina Pro > Sito > DR7 Club — Piano,
 * gli stessi che la pagina /membership mostra al pubblico. Prima questa pagina
 * li aveva scritti dentro e vendeva l'abbonamento a un prezzo diverso da
 * quello esposto sul sito.
 */
export const CLUB_PLANS: { monthly: ClubPlan; annual: ClubPlan } = {
  monthly: { price: 4.90, label: 'Mensile', period: '/ mese' },
  annual: { price: 39, label: 'Annuale', period: '/ anno' },
}

/** Prezzi abbonamento come configurati in Centralina Pro. */
export async function getClubPlans(): Promise<{ monthly: ClubPlan; annual: ClubPlan }> {
  try {
    const plan = await getDr7ClubPlanCopy()
    return {
      monthly: { ...CLUB_PLANS.monthly, price: Number(plan.monthly_eur) || CLUB_PLANS.monthly.price },
      annual: { ...CLUB_PLANS.annual, price: Number(plan.annually_eur) || CLUB_PLANS.annual.price },
    }
  } catch (err) {
    console.error('[dr7club] lettura prezzi piano fallita, uso i default:', err)
    return CLUB_PLANS
  }
}

export interface ClubTierDef {
  tier: ClubTier
  min: number
  max: number
  rewardPercent: number
  label: string
}

/**
 * Livelli di fabbrica. Valgono SOLO finche' Centralina Pro non ha mai salvato
 * la sezione DR7 Club: la lista vera si legge con `getClubTiers()`.
 */
export const TIER_THRESHOLDS: ClubTierDef[] = [
  { tier: 'access', min: 0, max: 2999, rewardPercent: 2, label: 'Access' },
  { tier: 'black', min: 3000, max: 9999, rewardPercent: 3, label: 'Black' },
  { tier: 'signature', min: 10000, max: Infinity, rewardPercent: 4, label: 'Signature' },
]

interface RawCentralinaTier {
  id?: unknown
  label?: unknown
  min_annual_spend?: unknown
  rate_pct?: unknown
  is_active?: unknown
}

let tiersCache: ClubTierDef[] | null = null
let tiersPending: Promise<ClubTierDef[]> | null = null

/**
 * Livelli DR7 Club come configurati dall'operatore in Centralina Pro
 * (`centralina_pro_config.config.dr7_club.tiers`).
 *
 * 04/09/2026 — Erano stati aggiunti trenta livelli in Centralina e il cliente
 * continuava a vedere Access / Black / Signature: questo file li aveva scritti
 * dentro, mentre il motore del cashback
 * (`DR7-AI/netlify/functions/utils/dr7ClubCashback.ts::loadActiveTiers`) li
 * leggeva gia' dal database. Il cliente vedeva il 4% e ne incassava un altro.
 * La normalizzazione qui sotto e' il gemello di quella funzione — e di
 * `DR7-AI/src/utils/dr7ClubTiers.ts` lato gestionale: se cambia una regola,
 * cambiano tutte e tre.
 */
export async function getClubTiers(): Promise<ClubTierDef[]> {
  if (tiersCache) return tiersCache
  if (tiersPending) return tiersPending
  tiersPending = (async () => {
    try {
      const { config } = await loadCentralinaConfigOnce()
      const dr7Club = config.dr7_club as Record<string, unknown> | undefined
      const tiersRaw = dr7Club?.tiers as RawCentralinaTier[] | undefined
      // Chiave assente = istanza mai configurata: si ripiega sui default.
      if (!Array.isArray(tiersRaw)) return TIER_THRESHOLDS
      const active: ClubTierDef[] = tiersRaw
        .filter((t) => t && t.is_active !== false)
        .map((t) => {
          const label = String(t.label ?? t.id ?? 'Tier')
          const tier = String(t.id ?? label).toLowerCase().replace(/\s+/g, '_') || 'tier'
          return {
            tier,
            label,
            min: Number(t.min_annual_spend ?? 0),
            rewardPercent: Number(t.rate_pct ?? 0),
            max: 0,
          }
        })
        .filter((t) => Number.isFinite(t.min) && Number.isFinite(t.rewardPercent))
        .sort((a, b) => a.min - b.min)
      // Lista vuota = l'operatore ha spento tutti i livelli. E' una scelta,
      // non un errore: non si ripiega sui default.
      if (active.length === 0) {
        tiersCache = []
        return tiersCache
      }
      for (let i = 0; i < active.length; i++) {
        active[i].max = i < active.length - 1 ? active[i + 1].min - 1 : Infinity
      }
      tiersCache = active
      return tiersCache
    } catch (err) {
      console.error('[dr7club] lettura livelli fallita, uso i default:', err)
      return TIER_THRESHOLDS
    } finally {
      tiersPending = null
    }
  })()
  return tiersPending
}

export const WALLET_MAX_ORDER_PERCENT = 30
export const SIGNUP_BONUS = 10 // €10 signup bonus
export const ANNUAL_RENEWAL_BONUS = 20 // €20 annual renewal bonus

// ─── Tier Calculation ────────────────────────────────────────────────

export function calculateTier(annualSpend: number, tiers: ClubTierDef[] = TIER_THRESHOLDS): ClubTierInfo {
  if (tiers.length === 0) {
    return { tier: 'none', label: 'Nessun livello', rewardPercent: 0, annualSpend, nextTier: null, nextTierThreshold: 0, progress: 100 }
  }

  const tierIdx = tiers.findIndex(t => annualSpend >= t.min && annualSpend <= t.max)

  // Spesa sotto la soglia piu' bassa configurata: nessun livello raggiunto,
  // ma il primo traguardo esiste e la barra deve puntare a quello. Prima qui
  // si ripiegava sul primo livello, regalando la sua percentuale a chi non
  // l'aveva raggiunta.
  if (tierIdx === -1) {
    const first = tiers[0]
    const progress = first.min > 0
      ? Math.min(100, Math.max(0, Math.round((annualSpend / first.min) * 100)))
      : 0
    return { tier: 'none', label: 'Nessun livello', rewardPercent: 0, annualSpend, nextTier: first.tier, nextTierThreshold: first.min, progress }
  }

  const tierDef = tiers[tierIdx]
  const nextTierDef = tierIdx < tiers.length - 1 ? tiers[tierIdx + 1] : null

  let progress = 100
  if (nextTierDef) {
    const rangeSize = nextTierDef.min - tierDef.min
    const spent = annualSpend - tierDef.min
    progress = rangeSize > 0 ? Math.min(100, Math.max(0, Math.round((spent / rangeSize) * 100))) : 100
  }

  return {
    tier: tierDef.tier,
    label: tierDef.label,
    rewardPercent: tierDef.rewardPercent,
    annualSpend,
    nextTier: nextTierDef?.tier || null,
    nextTierThreshold: nextTierDef?.min || 0,
    progress,
  }
}

// ─── Reward Calculation ──────────────────────────────────────────────

export interface RewardPreview {
  baseReward: number
  rewardPercent: number
  tier: ClubTier
  message: string
}

/**
 * Calculate reward for a booking.
 * @param totalCents Total in cents
 * @param paymentType 'full' = 100% paid upfront, 'deposit' = 30% deposit
 * @param tierInfo Club tier info
 * @param serviceType 'car_rental' | 'car_wash' | 'extra'
 */
export function calculateReward(
  totalCents: number,
  paymentType: 'full' | 'deposit',
  tierInfo: ClubTierInfo,
  serviceType: 'car_rental' | 'car_wash' | 'extra' = 'car_rental'
): RewardPreview {
  let rewardPercent = tierInfo.rewardPercent

  // Payment type adjustments
  if (paymentType === 'deposit') {
    rewardPercent = Math.max(1, Math.floor(rewardPercent / 2)) // halved, min 1%
  }

  // Service type bonuses
  if (serviceType === 'car_wash') {
    rewardPercent = 3 // Prime Wash always 3%
  } else if (serviceType === 'extra') {
    rewardPercent = 2 // Extras always 2%
  }

  const totalEuros = totalCents / 100
  const baseReward = Math.round(totalEuros * rewardPercent) / 100

  return {
    baseReward: Math.round(baseReward * 100), // in cents
    rewardPercent,
    tier: tierInfo.tier,
    message: `Riceverai €${baseReward.toFixed(2)} di credito wallet dopo il noleggio`,
  }
}

/**
 * Max wallet amount usable for an order (30% rule).
 * Excludes cauzioni, penali, danni.
 */
export function maxWalletUsable(orderTotalCents: number): number {
  return Math.floor(orderTotalCents * WALLET_MAX_ORDER_PERCENT / 100)
}

// ─── Supabase Queries ────────────────────────────────────────────────

/** Get active DR7 Club subscription for a user */
export async function getClubSubscription(userId: string): Promise<ClubSubscription | null> {
  const { data, error } = await supabase
    .from('dr7_club_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Error fetching club subscription:', error)
    return null
  }
  return data
}

/**
 * Get annual spend (rolling last 12 months) for DR7 Club tier progression.
 *
 * The rule (confirmed with the business):
 *   Tier = money that actually flowed into DR7 from this customer in the
 *   last 12 months.
 *   - Bookings paid by CARD (or other real payment method) → count
 *   - Wallet recharges paid by card (recharge_amount) → count
 *   - Bookings paid FROM THE WALLET → DO NOT count (recycled credit, no new revenue)
 *   - Package bonus on recharges → DO NOT count (it's a reward)
 *   - Cancelled bookings → DO NOT count
 *
 * Bookings are matched via three linkage paths, like the rest of the codebase:
 *   bookings.user_id = userId
 *   bookings.booking_details.customer.customerId = userId
 *   LOWER(bookings.customer_email) = email
 * Without this, admin-created / pre-account / guest bookings are lost.
 *
 * Uses created_at — booked_at is unreliable (nullable on many rows).
 */
// ─── Per-user grandfathered overrides ───────────────────────────────────
// Before the tier rules were corrected, these customers saw a certain
// number on their profile that included bookings paid from the wallet.
// Applying the new card-only rule retroactively would visibly demote them
// (what they saw yesterday disappears today), so for specific customers
// we lock in the displayed spend to the figure they had before the fix
// plus subsequent card recharges. New tier activity going forward still
// uses the real card-only rule — these overrides are a floor, not a
// replacement.
const TIER_SPEND_OVERRIDES: Record<string, number> = {
  // Massimo Runchina — had €2155.20 displayed pre-fix, then recharged
  // €1000 by card after. Business decision: preserve €3155.20 so he
  // sees Black tier (≥€3000) matching what his profile implied.
  '3b896d05-3d65-4819-a46a-ea9894343935': 3155.20,
}

// Ricariche DOPPIONI: stesso pagamento registrato due volte in
// credit_wallet_purchases (pagato UNA sola volta dal cliente). Vanno escluse
// dal calcolo della spesa annua, altrimenti gonfiano livello e reward.
// Runchina: un €1.000 (26/02) e un €2.000 (05/05) doppi. Il pagamento reale
// dell'altra riga della coppia resta contato.
const DUPLICATE_PURCHASE_IDS = new Set<string>([
  '39a4c9cd-5670-465c-977d-cce805514c38', // 26/02 €1.000 — doppione
  '4e6364d9-8707-4f12-897d-e02d63e0682d', // 05/05 €2.000 — doppione
])

export async function getAnnualSpend(userId: string, email?: string | null): Promise<number> {
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const cutoffIso = oneYearAgo.toISOString()

  // 1. Bookings paid by non-wallet methods, within 12mo, confirmed/active
  const orClauses: string[] = [
    `user_id.eq.${userId}`,
    `booking_details->customer->>customerId.eq.${userId}`,
  ]
  if (email) {
    orClauses.push(`customer_email.ilike.${email}`)
  }

  const { data: bookings, error: bookingErr } = await supabase
    .from('bookings')
    .select('price_total, payment_method')
    .or(orClauses.join(','))
    .in('status', ['completed', 'completata', 'confirmed', 'active'])
    .in('payment_status', ['paid', 'completed', 'succeeded'])
    .gte('created_at', cutoffIso)

  if (bookingErr) {
    console.error('[dr7club] Error fetching annual booking spend:', bookingErr)
  }

  const isWalletOrGift = (pm: string | null | undefined): boolean => {
    const m = String(pm || '').toLowerCase().trim()
    if (!m) return false
    return (
      m === 'credit' ||
      m === 'credit_wallet' ||
      m === 'credit wallet' ||
      m === 'creditwallet' ||
      m === 'wallet' ||
      m === 'gift' ||
      m === 'gift_card' ||
      m === 'gift card' ||
      m === 'giftcard' ||
      m.includes('wallet') ||
      m.includes('gift')
    )
  }

  const bookingCents = (bookings || []).reduce((sum, b) => {
    if (isWalletOrGift(b.payment_method)) return sum
    return sum + (b.price_total || 0)
  }, 0)
  const bookingEur = bookingCents / 100

  // 2. Wallet recharges paid by card — recharge_amount is euros actually paid.
  //    received_amount includes the package bonus; we exclude the bonus
  //    (not real spend, just a reward).
  // La colonna excluded_from_tier (migrazione 20260808000000) marca in modo
  // permanente le ricariche registrate in doppio. Se non c'è ancora si ripiega
  // sulla lista statica DUPLICATE_PURCHASE_IDS.
  let purchases: Array<{ id: string; recharge_amount: unknown; excluded_from_tier?: boolean }> | null = null
  const withFlag = await supabase
    .from('credit_wallet_purchases')
    .select('id, recharge_amount, excluded_from_tier')
    .eq('user_id', userId)
    .eq('payment_status', 'succeeded')
    .gte('created_at', cutoffIso)
  if (withFlag.error) {
    const fallback = await supabase
      .from('credit_wallet_purchases')
      .select('id, recharge_amount')
      .eq('user_id', userId)
      .eq('payment_status', 'succeeded')
      .gte('created_at', cutoffIso)
    if (fallback.error) console.error('[dr7club] Error fetching wallet recharges:', fallback.error)
    purchases = fallback.data
  } else {
    purchases = withFlag.data
  }

  const rechargeEur = (purchases || []).reduce((sum, p) => {
    if (p.excluded_from_tier === true) return sum // doppione marcato a DB
    if (DUPLICATE_PURCHASE_IDS.has(String(p.id))) return sum // doppione: non contare
    const raw = p.recharge_amount
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? 0))
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)

  // Apply grandfather override if set — as a FLOOR, not a replacement: il
  // cliente non scende mai sotto la cifra "congelata" pre-fix, ma se la sua
  // spesa reale (noleggi a carta + ricariche a carta negli ultimi 12 mesi)
  // la supera, la barra AVANZA col valore reale. Prima qui si ritornava
  // l'override secco -> la barra restava bloccata (es. Runchina fermo a
  // €3155.20 nonostante ~7k di ricariche).
  const computed = bookingEur + rechargeEur
  const override = TIER_SPEND_OVERRIDES[userId]
  if (typeof override === 'number') {
    return Math.max(override, computed)
  }
  return computed
}

/** Get full club status for a user */
export async function getClubStatus(userId: string, email?: string | null): Promise<{
  subscription: ClubSubscription | null
  tierInfo: ClubTierInfo
  isActive: boolean
}> {
  const [subscription, annualSpend, tiers] = await Promise.all([
    getClubSubscription(userId),
    getAnnualSpend(userId, email),
    getClubTiers(),
  ])

  const tierInfo = calculateTier(annualSpend, tiers)

  return {
    subscription,
    tierInfo,
    isActive: !!subscription,
  }
}
