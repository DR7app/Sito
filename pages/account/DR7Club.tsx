import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabaseClient'
import { getUserCreditBalance, getCreditTransactions } from '../../utils/creditWallet'
import type { CreditTransaction } from '../../utils/creditWallet'
import { useTranslation } from '../../hooks/useTranslation'
import { dateLocale } from '../../utils/i18nDate'
import {
  getClubStatus,
  CLUB_PLANS,
  TIER_THRESHOLDS,
  WALLET_MAX_ORDER_PERCENT,
  SIGNUP_BONUS,
  ANNUAL_RENEWAL_BONUS,
  type ClubSubscription,
  type ClubTierInfo,
} from '../../utils/dr7club'

const DR7Club = () => {
  const { t, lang } = useTranslation()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState<ClubSubscription | null>(null)
  const [tierInfo, setTierInfo] = useState<ClubTierInfo | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [walletBalance, setWalletBalance] = useState(0)
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [subscribing, setSubscribing] = useState(false)
  const [interestAccruals, setInterestAccruals] = useState<{ accrual_date: string; principal_eur: number; accrual_eur: number; paid_out_at: string | null }[]>([])

  useEffect(() => {
    if (!user?.id) return
    loadClubData()
  }, [user])

  const loadClubData = async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const [clubStatus, balance, txns] = await Promise.all([
        getClubStatus(user.id, user.email),
        getUserCreditBalance(user.id),
        getCreditTransactions(user.id, 10),
      ])
      setSubscription(clubStatus.subscription)
      setTierInfo(clubStatus.tierInfo)
      setIsActive(clubStatus.isActive)
      setWalletBalance(balance)
      setTransactions(txns)

      // DR7 Club daily interest accruals (last 90 days). The cron
      // accrue-club-wallet-interest writes 0.1%/day on the card-paid
      // wallet portion; payout-club-wallet-interest stamps paid_out_at
      // on the 1st of each month when the monthly total is credited.
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0]
      const { data: accruals } = await supabase
        .from('wallet_interest_accruals')
        .select('accrual_date, principal_eur, accrual_eur, paid_out_at')
        .eq('user_id', user.id)
        .gte('accrual_date', ninetyDaysAgo)
        .order('accrual_date', { ascending: false })
      setInterestAccruals(accruals || [])
    } catch (err) {
      console.error('Error loading club data:', err)
    } finally {
      setLoading(false)
    }
  }

  const [subscribeError, setSubscribeError] = useState<string | null>(null)

  const handleSubscribe = async (plan: 'monthly' | 'annual') => {
    if (!user?.id) return
    setSubscribing(true)
    setSubscribeError(null)
    try {
      const planInfo = CLUB_PLANS[plan]
      const price = planInfo.price

      // Calculate expiry
      const expiresAt = new Date()
      if (plan === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1)
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1)
      }

      // 1. Insert pending subscription
      const { data: subData, error: dbError } = await supabase
        .from('dr7_club_subscriptions')
        .insert({
          user_id: user.id,
          plan,
          status: 'pending',
          price,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single()

      if (dbError) throw new Error(dbError.message)

      // 2. Generate Nexi order ID
      const nexiOrderId = `DR7CLUB${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`

      // 3. Create Nexi payment with recurring tokenization
      const nexiResponse = await fetch('/.netlify/functions/create-nexi-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: nexiOrderId,
          amount: Math.round(price * 100),
          currency: 'EUR',
          description: `DR7 Club - Piano ${planInfo.label}`,
          customerEmail: user.email,
          customerName: user.fullName,
          recurringType: 'MIT_SCHEDULED',
          billingCycle: plan,
        }),
      })

      const nexiData = await nexiResponse.json()
      if (!nexiResponse.ok) throw new Error(nexiData.error || 'Errore creazione pagamento')

      // 4. Save order reference + nexi_order_id for callback matching
      await supabase
        .from('dr7_club_subscriptions')
        .update({ payment_reference: nexiOrderId, nexi_order_id: nexiOrderId })
        .eq('id', subData.id)

      sessionStorage.setItem('dr7_pending_order', nexiOrderId)
      sessionStorage.setItem('dr7_pending_type', 'dr7_club')

      // 5. Redirect to Nexi payment page
      window.location.href = nexiData.paymentUrl
    } catch (err: any) {
      setSubscribeError(err.message || 'Errore durante il pagamento')
      setSubscribing(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-8 text-center">
        <p className="text-gray-400">{t({ it: "Caricamento DR7 Club...", en: "Loading DR7 Club..." })}</p>
      </div>
    )
  }

  const tierColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    access: { bg: 'bg-gray-800/50', border: 'border-gray-600', text: 'text-gray-300', badge: 'bg-gray-600 text-white' },
    black: { bg: 'bg-gray-900/80', border: 'border-white/30', text: 'text-white', badge: 'bg-black text-white border border-white/30' },
    signature: { bg: 'bg-[#C9A96E]/10', border: 'border-[#C9A96E]/40', text: 'text-[#D4B896]', badge: 'bg-[#C9A96E]/15 text-[#D4B896] border border-[#C9A96E]/40' },
  }

  const currentColors = tierColors[tierInfo?.tier || 'access']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">DR7 Club</h2>
          {isActive ? (
            <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm font-bold rounded-full">{t({ it: "Attivo", en: "Active" })}</span>
          ) : (
            <span className="px-3 py-1 bg-gray-700 text-gray-400 text-sm font-bold rounded-full">{t({ it: "Non iscritto", en: "Not enrolled" })}</span>
          )}
        </div>
        <p className="text-gray-400 text-sm">
          {t({ it: "Guadagna fino al 4% in credito wallet su ogni noleggio. Più spendi, più guadagni.", en: "Earn up to 4% in wallet credit on every rental. The more you spend, the more you earn." })}
        </p>
      </div>

      {/* Subscription Plans (if not active) */}
      {!isActive && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">{t({ it: "Iscriviti al DR7 Club", en: "Join the DR7 Club" })}</h3>
          <p className="text-gray-400 text-sm mb-6">
            {t({ it: 'Scegli il tuo piano e inizia a guadagnare credito wallet su ogni prenotazione.', en: 'Choose your plan and start earning wallet credit on every booking.' })}
            {t({ it: 'Bonus di', en: 'Bonus of' })} €{SIGNUP_BONUS} {t({ it: 'alla prima iscrizione!', en: 'when you first join!' })}
          </p>
          {subscribeError && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg">
              <p className="text-red-300 text-sm">{subscribeError}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Monthly */}
            <div className="border border-gray-700 rounded-lg p-5 hover:border-white/30 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="text-white font-bold text-lg">{CLUB_PLANS.monthly.label}</h4>
                  <p className="text-gray-400 text-sm">{t({ it: "Flessibile, senza vincoli", en: "Flexible, no commitment" })}</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-white">€{CLUB_PLANS.monthly.price.toFixed(2)}</span>
                  <span className="text-gray-400 text-sm">{CLUB_PLANS.monthly.period}</span>
                </div>
              </div>
              <button
                onClick={() => handleSubscribe('monthly')}
                disabled={subscribing}
                className="w-full mt-3 py-2.5 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                {t({ it: "Iscriviti ora", en: "Join now" })}
              </button>
            </div>

            {/* Annual */}
            <div className="border-2 border-[#C9A96E]/50 rounded-lg p-5 relative">
              <div className="absolute -top-3 left-4 px-2 py-0.5 bg-[#C9A96E] text-black text-xs font-bold rounded">{t({ it: "RISPARMIA 33%", en: "SAVE 33%" })}</div>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="text-white font-bold text-lg">{CLUB_PLANS.annual.label}</h4>
                  <p className="text-gray-400 text-sm">+ €{ANNUAL_RENEWAL_BONUS} {t({ it: "bonus rinnovo", en: "renewal bonus" })}</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-[#D4B896]">€{CLUB_PLANS.annual.price}</span>
                  <span className="text-gray-400 text-sm">{CLUB_PLANS.annual.period}</span>
                </div>
              </div>
              <button
                onClick={() => handleSubscribe('annual')}
                disabled={subscribing}
                className="w-full mt-3 py-2.5 bg-[#C9A96E] text-black font-bold rounded-lg hover:bg-[#D4B896] transition-colors text-sm"
              >
                {t({ it: "Iscriviti ora", en: "Join now" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Subscription */}
      {isActive && subscription && (
        <div className="bg-gray-900/50 border border-green-500/30 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">{t({ it: "Piano attivo", en: "Active plan" })}</p>
              <p className="text-white font-bold text-lg">
                {subscription.plan === 'monthly' ? t({ it: "Mensile", en: "Monthly" }) : t({ it: "Annuale", en: "Annual" })} — €{subscription.price}{subscription.plan === 'monthly' ? t({ it: "/mese", en: "/month" }) : t({ it: "/anno", en: "/year" })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-sm">{t({ it: "Scade il", en: "Expires on" })}</p>
              <p className="text-white font-medium">
                {new Date(subscription.expires_at).toLocaleDateString(dateLocale(lang), { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tier & Progress */}
      {tierInfo && (
        <div className={`${currentColors.bg} border ${currentColors.border} rounded-lg p-6`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 text-sm font-bold rounded-full ${currentColors.badge}`}>
                {tierInfo.label}
              </span>
              <div>
                <p className="text-white font-bold">{t({ it: "Livello", en: "Tier" })} {tierInfo.label}</p>
                <p className="text-gray-400 text-sm">{t({ it: "Reward:", en: "Reward:" })} {tierInfo.rewardPercent}% {t({ it: "su ogni noleggio", en: "on every rental" })}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-sm">{t({ it: "Spesa annuale", en: "Annual spend" })}</p>
              <p className="text-white font-bold text-xl">€{tierInfo.annualSpend.toLocaleString(dateLocale(lang), { minimumFractionDigits: 0 })}</p>
            </div>
          </div>

          {/* Progress bar */}
          {tierInfo.nextTier && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{t({ it: "Livello", en: "Tier" })} {tierInfo.label}</span>
                <span>{t({ it: "Livello", en: "Tier" })} {TIER_THRESHOLDS.find(x => x.tier === tierInfo.nextTier)?.label} (€{tierInfo.nextTierThreshold.toLocaleString()})</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div
                  className="bg-[#C9A96E] h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${tierInfo.progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {t({ it: 'Mancano', en: 'Still' })} €{(tierInfo.nextTierThreshold - tierInfo.annualSpend).toLocaleString(dateLocale(lang))} {t({ it: 'per il livello successivo', en: 'to the next tier' })}
              </p>
            </div>
          )}

          {!tierInfo.nextTier && (
            <p className="mt-3 text-sm text-[#D4B896] font-medium">{t({ it: "Hai raggiunto il livello massimo!", en: "You have reached the top tier!" })} {tierInfo.rewardPercent}% {t({ it: "di reward su ogni noleggio.", en: "reward on every rental." })}</p>
          )}
        </div>
      )}

      {/* Tiers Table */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">{t({ it: "Livelli DR7 Club", en: "DR7 Club tiers" })}</h3>
        <div className="grid grid-cols-3 gap-3">
          {TIER_THRESHOLDS.map(tier => (
            <div
              key={tier.tier}
              className={`p-4 rounded-lg border text-center ${tierInfo?.tier === tier.tier
                ? `${tierColors[tier.tier].border} ${tierColors[tier.tier].bg}`
                : 'border-gray-700 bg-gray-800/30'}`}
            >
              <p className={`font-bold text-lg ${tierInfo?.tier === tier.tier ? tierColors[tier.tier].text : 'text-gray-400'}`}>
                {tier.label}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                {tier.max === Infinity ? `${t({ it: 'da', en: 'from' })} €${tier.min.toLocaleString()}` : `€${tier.min.toLocaleString()} – €${tier.max.toLocaleString()}`}
              </p>
              <p className={`text-2xl font-bold mt-2 ${tierInfo?.tier === tier.tier ? 'text-[#D4B896]' : 'text-gray-500'}`}>
                {tier.rewardPercent}%
              </p>
              <p className="text-gray-500 text-xs">{t({ it: 'reward', en: 'reward' })}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Interesse Wallet — 0.1%/giorno DR7 Club */}
      {isActive && (() => {
        const todayRome = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
        const todayRow = interestAccruals.find(a => a.accrual_date === todayRome)
        const month = todayRome.slice(0, 7)
        const monthAccruals = interestAccruals.filter(a => a.accrual_date.startsWith(month))
        const monthUnpaid = monthAccruals.filter(a => !a.paid_out_at).reduce((s, a) => s + Number(a.accrual_eur || 0), 0)
        const totalPaid = interestAccruals.filter(a => a.paid_out_at).reduce((s, a) => s + Number(a.accrual_eur || 0), 0)
        return (
          <div className="bg-gradient-to-br from-yellow-900/20 to-gray-900/50 border border-yellow-700/40 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-white">{t({ it: "Interesse DR7 CLUB PRIVILEGE", en: "DR7 CLUB PRIVILEGE interest" })}</h3>
              <span className="text-xs text-yellow-400 font-medium">{t({ it: "0,1% / giorno", en: "0.1% / day" })}</span>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              {t({ it: "Ogni giorno guadagni lo 0,1% sul saldo del wallet pagato con carta. Accredito automatico il 1° del mese successivo.", en: "Every day you earn 0.1% on the card-paid wallet balance. Automatically credited on the 1st of the following month." })}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border border-yellow-700/40 bg-yellow-900/10 p-3">
                <p className="text-xs text-gray-400 mb-1">{t({ it: "Maturato oggi", en: "Accrued today" })}</p>
                <p className="text-2xl font-bold text-yellow-400">
                  {todayRow ? `+€${Number(todayRow.accrual_eur).toFixed(4)}` : '—'}
                </p>
                <p className="text-[10px] text-gray-500 mt-1">
                  {todayRow
                    ? `${t({ it: 'su', en: 'on' })} €${Number(todayRow.principal_eur).toFixed(2)} ${t({ it: 'di capitale', en: 'of principal' })}`
                    : t({ it: 'in calcolo questa notte', en: 'being calculated tonight' })}
                </p>
              </div>
              <div className="rounded-lg border border-yellow-700/40 bg-yellow-900/10 p-3">
                <p className="text-xs text-gray-400 mb-1">{t({ it: "Mese in corso (in attesa)", en: "Current month (pending)" })}</p>
                <p className="text-2xl font-bold text-amber-400">€{(Math.round(monthUnpaid * 100) / 100).toFixed(2)}</p>
                <p className="text-[10px] text-gray-500 mt-1">
                  {monthAccruals.length} {monthAccruals.length === 1 ? t({ it: "giorno", en: "day" }) : t({ it: "giorni", en: "days" })}
                </p>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                <p className="text-xs text-gray-400 mb-1">{t({ it: "Accreditato (ultimi 90gg)", en: "Credited (last 90 days)" })}</p>
                <p className="text-2xl font-bold text-green-400">€{(Math.round(totalPaid * 100) / 100).toFixed(2)}</p>
              </div>
            </div>
            {interestAccruals.length === 0 ? (
              <p className="text-xs text-gray-400 italic">
                {t({ it: "Il primo interesse viene calcolato la notte successiva alla tua iscrizione. Torna domani per vedere il maturato giornaliero.", en: "The first interest is calculated the night after you join. Come back tomorrow to see the daily accrual." })}
              </p>
            ) : (
              <details className="text-sm">
                <summary className="cursor-pointer text-yellow-400 hover:text-yellow-300 font-medium">
                  {t({ it: "Mostra storico giornaliero", en: "Show daily history" })}
                </summary>
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {interestAccruals.slice(0, 31).map(a => (
                    <div key={a.accrual_date} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                      <div>
                        <p className="text-white text-sm">
                          {new Date(a.accrual_date).toLocaleDateString(dateLocale(lang), { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {t({ it: 'Capitale:', en: 'Principal:' })} €{Number(a.principal_eur).toFixed(2)} · {a.paid_out_at ? t({ it: "Accreditato", en: "Credited" }) : t({ it: "In attesa", en: "Pending" })}
                        </p>
                      </div>
                      <span className="font-bold text-sm text-yellow-400">
                        +€{Number(a.accrual_eur).toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )
      })()}

      {/* Wallet */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">DR7 Wallet</h3>
          <span className="text-2xl font-bold text-green-400">€{walletBalance.toFixed(2)}</span>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          {t({ it: 'Utilizzabile fino al', en: 'Usable for up to' })} {WALLET_MAX_ORDER_PERCENT}% {t({ it: 'di un ordine. Non convertibile in denaro. Nessuna scadenza.', en: 'of an order. Not convertible into cash. No expiry.' })}
        </p>

        {/* Recent transactions */}
        {transactions.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">{t({ it: "Ultimi movimenti", en: "Recent transactions" })}</h4>
            <div className="space-y-2">
              {transactions.slice(0, 5).map(tx => (
                <div key={tx.id} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-white text-sm">{tx.description}</p>
                    <p className="text-gray-500 text-xs">
                      {new Date(tx.created_at).toLocaleDateString(dateLocale(lang), { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span className={`font-bold text-sm ${tx.transaction_type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.transaction_type === 'credit' ? '+' : '-'}€{tx.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rules */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-3">{t({ it: "Come funziona", en: "How it works" })}</h3>
        <ul className="space-y-2 text-sm text-gray-400">
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-0.5">+</span>
            <span>{t({ it: 'Pagamento anticipato (100%): reward base fino al', en: 'Full upfront payment (100%): base reward up to' })} {TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1].rewardPercent}%</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-0.5">+</span>
            <span>{t({ it: "Pagamento con acconto (30%): reward dimezzato (min 1%)", en: "Deposit payment (30%): reward halved (min 1%)" })}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-0.5">+</span>
            <span>{t({ it: "Servizi Lavaggio & Meccanica: reward 3%", en: "Car Wash & Mechanics services: 3% reward" })}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-0.5">+</span>
            <span>{t({ it: "Servizi extra: reward 2%", en: "Extra services: 2% reward" })}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#D4B896] mt-0.5">!</span>
            <span>{t({ it: "Il credito viene accreditato solo a noleggio completato", en: "Credit is only awarded once the rental is completed" })}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">-</span>
            <span>{t({ it: "Non utilizzabile per cauzioni, penali, danni o franchigie", en: "Cannot be used for deposits, penalties, damages or excesses" })}</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default DR7Club
