/**
 * DR7 Club tier-based cashback helper (website Netlify functions).
 *
 * Mirrors `DR7-empire-admin-temp/netlify/functions/utils/dr7ClubCashback.ts`.
 * Both surfaces read the same `centralina_pro_config.config.dr7_club.tiers`
 * row, so a tier change in admin Centralina Pro propagates to the website
 * without a deploy.
 *
 * Public API:
 *   const { getClubCashbackPct } = require('./utils/dr7ClubCashback');
 *   const pct = await getClubCashbackPct(supabase, userId);
 *   if (pct == null) return; // no active club / no matching tier
 *
 * Bonus credits are recorded in `credit_transactions` with
 * `reference_type='card_bonus'` so the daily interest accrual
 * (`accrue-club-wallet-interest.ts`) excludes them from principal.
 */

// ────────────────────────────────────────────────────────────────────────────
// REGOLE SPESA ANNUA — devono restare IDENTICHE in tre punti:
//   1. Sito/utils/dr7club.ts::getAnnualSpend            (cosa VEDE il cliente)
//   2. Sito/netlify/functions/utils/dr7ClubCashback.js  (questo file)
//   3. DR7-staging/netlify/functions/utils/dr7ClubCashback.ts (admin)
// Prima del 2026-08-08 divergevano: solo il frontend escludeva le ricariche
// registrate in doppio, quindi il backend calcolava una spesa più alta e
// versava il cashback del tier superiore (Runchina: mostrato 3%, versato 4%).
// ────────────────────────────────────────────────────────────────────────────

/** Stati prenotazione che contano come spesa. */
const BOOKING_COUNTED_STATUSES = ['completed', 'completata', 'confirmed', 'active'];

/**
 * Ricariche registrate DUE VOLTE in credit_wallet_purchases (pagate una sola
 * volta dal cliente). Vanno escluse: gonfiano il tier e quindi il cashback.
 * Fallback usato quando la colonna `excluded_from_tier` non è ancora presente.
 */
const DUPLICATE_PURCHASE_IDS = new Set([
  '39a4c9cd-5670-465c-977d-cce805514c38', // Runchina 26/02 €1.000 — doppione
  '4e6364d9-8707-4f12-897d-e02d63e0682d', // Runchina 05/05 €2.000 — doppione
]);

/**
 * Spesa "congelata" pre-fix per clienti grandfathered. È un PAVIMENTO, mai una
 * sostituzione. Mirror di Sito/utils/dr7club.ts::TIER_SPEND_OVERRIDES.
 */
const TIER_SPEND_OVERRIDES = {
  '3b896d05-3d65-4819-a46a-ea9894343935': 3155.20, // Massimo Runchina
};

/** true se il metodo di pagamento è wallet/gift card (credito riciclato). */
function isWalletOrGiftMethod(pm) {
  const m = String(pm || '').toLowerCase().trim();
  if (!m) return false;
  return m === 'credit' || m === 'credito' || m.includes('wallet') || m.includes('gift');
}

/** Email dell'utente, per agganciare le prenotazioni create in admin. */
async function getUserEmail(supabase, userId) {
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    return (data && data.user && data.user.email) || null;
  } catch (err) {
    console.warn('[dr7ClubCashback] getUserEmail failed (non-blocking):', err.message);
    return null;
  }
}

/**
 * Somma delle ricariche wallet pagate negli ultimi 12 mesi, in euro.
 * Usa `recharge_amount` (quanto ha pagato il cliente), NON `received_amount`
 * (che include il bonus pacchetto). Esclude i doppioni.
 */
async function getRechargeSpendEur(supabase, userId, sinceIso) {
  // La colonna excluded_from_tier arriva con la migrazione 20260808000000: se
  // non c'è ancora, si ripiega sulla lista statica senza far fallire il calcolo
  // (un errore qui azzererebbe la spesa e quindi il cashback di tutti).
  let rows = null;
  const withFlag = await supabase
    .from('credit_wallet_purchases')
    .select('id, recharge_amount, excluded_from_tier')
    .eq('user_id', userId)
    .eq('payment_status', 'succeeded')
    .gte('created_at', sinceIso);
  if (withFlag.error) {
    const fallback = await supabase
      .from('credit_wallet_purchases')
      .select('id, recharge_amount')
      .eq('user_id', userId)
      .eq('payment_status', 'succeeded')
      .gte('created_at', sinceIso);
    rows = fallback.data;
  } else {
    rows = withFlag.data;
  }

  let total = 0;
  for (const r of (rows || [])) {
    if (r.excluded_from_tier === true) continue;
    if (DUPLICATE_PURCHASE_IDS.has(String(r.id))) continue;
    const amount = Number(r.recharge_amount || 0);
    if (amount > 0) total += amount;
  }
  return total;
}

/** Default tiers — fallback ONLY when Centralina Pro has never been saved. */
const TIER_THRESHOLDS = [
  { tier: 'access',    min: 0,     max: 2999,     rewardPercent: 2, label: 'Access' },
  { tier: 'black',     min: 3000,  max: 9999,     rewardPercent: 3, label: 'Black' },
  { tier: 'signature', min: 10000, max: Infinity, rewardPercent: 4, label: 'Signature' },
];

/**
 * Load the active DR7 Club tier list from Centralina Pro. Returns:
 *  - TIER_THRESHOLDS when the config row has no `dr7_club` key (never saved).
 *  - The operator-edited list otherwise — even if empty (operator disabled
 *    every tier → cashback turned off by intent).
 */
async function loadActiveTiers(supabase) {
  try {
    const { data } = await supabase
      .from('centralina_pro_config')
      .select('config')
      .eq('id', 'main')
      .maybeSingle();
    const cfg = (data && data.config) || null;
    const dr7Club = cfg && cfg.dr7_club;
    const tiersRaw = dr7Club && dr7Club.tiers;
    if (!Array.isArray(tiersRaw)) return TIER_THRESHOLDS;
    const active = tiersRaw
      .filter((t) => t && t.is_active !== false)
      .map((t) => {
        const label = String(t.label != null ? t.label : (t.id != null ? t.id : 'Tier'));
        const idStr = String(t.id != null ? t.id : label).toLowerCase().replace(/\s+/g, '_') || 'tier';
        const min = typeof t.min_annual_spend === 'number' ? t.min_annual_spend : Number(t.min_annual_spend || 0);
        const reward = typeof t.rate_pct === 'number' ? t.rate_pct : Number(t.rate_pct || 0);
        return { tier: idStr, label, min, rewardPercent: reward, max: 0 };
      })
      .filter((t) => Number.isFinite(t.min) && Number.isFinite(t.rewardPercent))
      .sort((a, b) => a.min - b.min);
    if (active.length === 0) return [];
    for (let i = 0; i < active.length; i++) {
      active[i].max = i < active.length - 1 ? active[i + 1].min - 1 : Infinity;
    }
    return active;
  } catch (err) {
    console.error('[dr7ClubCashback] loadActiveTiers failed, using defaults:', err);
    return TIER_THRESHOLDS;
  }
}

function calculateTier(annualSpend, tiers) {
  const list = tiers || TIER_THRESHOLDS;
  const t = list.find((x) => annualSpend >= x.min && annualSpend <= x.max);
  if (!t) return { tier: 'none', label: 'Nessun tier', rewardPercent: 0, annualSpend };
  return { tier: t.tier, label: t.label, rewardPercent: t.rewardPercent, annualSpend };
}

async function hasActiveClub(supabase, userId) {
  if (!userId) return false;
  const { data } = await supabase
    .from('dr7_club_subscriptions')
    .select('id, status, expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())
    .maybeSingle();
  return !!data;
}

async function getAnnualSpendEur(supabase, userId) {
  if (!userId) return 0;
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const sinceIso = since.toISOString();

  // Prenotazioni: stessi TRE percorsi di aggancio usati dal frontend, senno'
  // le prenotazioni create in admin o prima dell'account non contano.
  const email = await getUserEmail(supabase, userId);
  const orClauses = [
    `user_id.eq.${userId}`,
    `booking_details->customer->>customerId.eq.${userId}`,
  ];
  if (email) orClauses.push(`customer_email.ilike.${email}`);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('price_total, payment_method, payment_status, status, created_at')
    .or(orClauses.join(','))
    .in('status', BOOKING_COUNTED_STATUSES)
    .in('payment_status', ['paid', 'completed', 'succeeded'])
    .gte('created_at', sinceIso);

  let totalEur = 0;
  for (const b of (bookings || [])) {
    // Conta OGNI metodo che porta denaro nuovo (carta, Nexi, bonifico,
    // contanti...) ed esclude solo wallet/gift card, che sono credito
    // riciclato. Prima qui c'era una whitelist nexi|card|stripe che tagliava
    // fuori i bonifici: divergeva dal frontend.
    if (isWalletOrGiftMethod(b.payment_method)) continue;
    // bookings.price_total è in CENTESIMI.
    const amount = Number(b.price_total || 0) / 100;
    if (amount > 0) totalEur += amount;
  }

  totalEur += await getRechargeSpendEur(supabase, userId, sinceIso);

  const computed = Math.round(totalEur * 100) / 100;
  const override = TIER_SPEND_OVERRIDES[userId];
  // L'override è un PAVIMENTO (mai una sostituzione): il cliente non scende
  // sotto la cifra congelata pre-fix, ma se la spesa reale la supera vince
  // quella. Stessa regola del frontend.
  return typeof override === 'number' ? Math.max(override, computed) : computed;
}

async function getClubCashbackPct(supabase, userId) {
  if (!(await hasActiveClub(supabase, userId))) return null;
  const [spend, tiers] = await Promise.all([
    getAnnualSpendEur(supabase, userId),
    loadActiveTiers(supabase),
  ]);
  const pct = calculateTier(spend, tiers).rewardPercent;
  return pct > 0 ? pct : null;
}

module.exports = {
  TIER_THRESHOLDS,
  BOOKING_COUNTED_STATUSES,
  DUPLICATE_PURCHASE_IDS,
  TIER_SPEND_OVERRIDES,
  isWalletOrGiftMethod,
  getRechargeSpendEur,
  loadActiveTiers,
  calculateTier,
  hasActiveClub,
  getAnnualSpendEur,
  getClubCashbackPct,
};
