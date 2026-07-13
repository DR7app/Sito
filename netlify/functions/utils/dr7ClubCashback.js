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

  const { data: bookings } = await supabase
    .from('bookings')
    .select('price_total, total_amount, payment_method, payment_status, status, created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
    .in('payment_status', ['paid', 'completed', 'succeeded']);

  let totalEur = 0;
  for (const b of (bookings || [])) {
    const pm = String(b.payment_method || '').toLowerCase();
    if (!pm.includes('nexi') && !pm.includes('card') && !pm.includes('stripe')) continue;
    const status = String(b.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'annullata') continue;
    // 2026-07-13 FIX: bookings.price_total è in CENTESIMI. Prima veniva sommato
    // come euro → spesa annua gonfiata 100x → tutti finivano nel tier più alto
    // (4%) invece del loro reale (es. Runchina 3% -> 4%). Ora /100.
    const amount = Number(b.price_total != null ? b.price_total / 100 : (b.total_amount != null ? b.total_amount : 0));
    if (amount > 0) totalEur += amount;
  }

  const { data: recharges } = await supabase
    .from('credit_wallet_purchases')
    .select('recharge_amount, payment_status, created_at')
    .eq('user_id', userId)
    .eq('payment_status', 'succeeded')
    .gte('created_at', sinceIso);

  for (const r of (recharges || [])) {
    const amount = Number(r.recharge_amount || 0);
    if (amount > 0) totalEur += amount;
  }

  return Math.round(totalEur * 100) / 100;
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
  loadActiveTiers,
  calculateTier,
  hasActiveClub,
  getAnnualSpendEur,
  getClubCashbackPct,
};
