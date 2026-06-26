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

// ─── Types ───────────────────────────────────────────────────────────

export type ClubTier = 'access' | 'black' | 'signature'

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

export const CLUB_PLANS = {
  monthly: { price: 4.90, label: 'Mensile', period: '/ mese' },
  annual: { price: 39, label: 'Annuale', period: '/ anno' },
} as const

export const TIER_THRESHOLDS: { tier: ClubTier; min: number; max: number; rewardPercent: number; label: string }[] = [
  { tier: 'access', min: 0, max: 2999, rewardPercent: 2, label: 'Access' },
  { tier: 'black', min: 3000, max: 9999, rewardPercent: 3, label: 'Black' },
  { tier: 'signature', min: 10000, max: Infinity, rewardPercent: 4, label: 'Signature' },
]

export const WALLET_MAX_ORDER_PERCENT = 30
export const SIGNUP_BONUS = 10 // €10 signup bonus
export const ANNUAL_RENEWAL_BONUS = 20 // €20 annual renewal bonus

// ─── Tier Calculation ────────────────────────────────────────────────

export function calculateTier(annualSpend: number): ClubTierInfo {
  const tierDef = TIER_THRESHOLDS.find(t => annualSpend >= t.min && annualSpend <= t.max)
    || TIER_THRESHOLDS[0]

  const tierIdx = TIER_THRESHOLDS.indexOf(tierDef)
  const nextTierDef = tierIdx < TIER_THRESHOLDS.length - 1 ? TIER_THRESHOLDS[tierIdx + 1] : null

  let progress = 100
  if (nextTierDef) {
    const rangeSize = nextTierDef.min - tierDef.min
    const spent = annualSpend - tierDef.min
    progress = Math.min(100, Math.round((spent / rangeSize) * 100))
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
  const { data: purchases, error: purchErr } = await supabase
    .from('credit_wallet_purchases')
    .select('id, recharge_amount')
    .eq('user_id', userId)
    .eq('payment_status', 'succeeded')
    .gte('created_at', cutoffIso)

  if (purchErr) {
    console.error('[dr7club] Error fetching wallet recharges:', purchErr)
  }
  const rechargeEur = (purchases || []).reduce((sum, p) => {
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
  const [subscription, annualSpend] = await Promise.all([
    getClubSubscription(userId),
    getAnnualSpend(userId, email),
  ])

  const tierInfo = calculateTier(annualSpend)

  return {
    subscription,
    tierInfo,
    isActive: !!subscription,
  }
}
