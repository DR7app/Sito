import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabaseClient'
import { getUserCreditBalance, getCreditTransactions } from '../../utils/creditWallet'
import type { CreditTransaction } from '../../utils/creditWallet'
import { useTranslation } from '../../hooks/useTranslation'
import ClubTiersBoard from '../../components/ui/ClubTiersBoard'
import { dateLocale } from '../../utils/i18nDate'
import {
  getClubStatus,
  isClubBloccato,
  getClubTiers,
  getClubPlans,
  CLUB_PLANS,
  type ClubPlan,
  type ClubTierDef,
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
  // Uscita definitiva dal Club: chi conferma non puo' piu' rientrare, quindi
  // il bottone passa sempre dal popup e lo stato "bloccato" arriva dal
  // database, non dalla sessione.
  const [bloccato, setBloccato] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [interestAccruals, setInterestAccruals] = useState<{ accrual_date: string; principal_eur: number; accrual_eur: number; paid_out_at: string | null }[]>([])
  // Livelli e prezzi arrivano da Centralina Pro: qui dentro non c'e' piu'
  // nessuna soglia scritta a mano.
  const [tiers, setTiers] = useState<ClubTierDef[]>([])
  const [plans, setPlans] = useState<{ monthly: ClubPlan; annual: ClubPlan }>(CLUB_PLANS)

  useEffect(() => {
    if (!user?.id) return
    loadClubData()
  }, [user])

  const loadClubData = async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const [clubStatus, balance, txns, clubTiers, clubPlans, clubBloccato] = await Promise.all([
        getClubStatus(user.id, user.email),
        getUserCreditBalance(user.id),
        getCreditTransactions(user.id, 10),
        getClubTiers(),
        getClubPlans(),
        isClubBloccato(),
      ])
      setBloccato(clubBloccato)
      setTiers(clubTiers)
      setPlans(clubPlans)
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
    // Ha gia' lasciato il Club: l'adesione e' personale e non si riattiva.
    if (bloccato) {
      setSubscribeError(t({
        it: 'Hai già cancellato la tua adesione al DR7 Club. La cancellazione è definitiva e personale: non è possibile iscriversi di nuovo.',
        en: 'You have already cancelled your DR7 Club membership. The cancellation is final and personal: you cannot join again.',
      }))
      return
    }
    setSubscribing(true)
    setSubscribeError(null)
    try {
      const planInfo = plans[plan]
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

  const handleCancelClub = async () => {
    if (!user?.id) return
    setCancelling(true)
    setCancelError(null)
    try {
      // La chiusura passa dal server: oltre a chiudere l'abbonamento deve
      // registrare il blocco (email + codice fiscale + patente), che dal
      // browser non e' scrivibile.
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      if (!token) {
        throw new Error(t({ it: 'Sessione scaduta. Esci e accedi di nuovo.', en: 'Session expired. Please log out and log in again.' }))
      }
      const res = await fetch('/.netlify/functions/cancel-dr7-club', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: user.id, token }),
      })
      const result = await res.json()
      if (!res.ok || !result.success) {
        throw new Error(result.error || t({ it: 'Cancellazione non riuscita', en: 'Cancellation failed' }))
      }
      setShowCancelModal(false)
      await loadClubData()
    } catch (err: any) {
      setCancelError(err.message || t({ it: 'Cancellazione non riuscita', en: 'Cancellation failed' }))
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-8 text-center">
        <p className="text-gray-400">{t({ it: "Caricamento DR7 Club...", en: "Loading DR7 Club..." })}</p>
      </div>
    )
  }

  // I livelli sono quelli configurati in Centralina Pro e possono essere
  // decine: il colore non puo' piu' venire da una mappa per id (con trenta
  // livelli `tierColors[tier]` era undefined e la pagina andava in errore).
  // Regola: livello piu' alto in oro, gli altri neutri.
  const topTier = tiers.length > 0 ? tiers[tiers.length - 1].tier : null
  const GOLD = { bg: 'bg-[#C9A96E]/10', border: 'border-[#C9A96E]/40', text: 'text-[#D4B896]', badge: 'bg-[#C9A96E]/15 text-[#D4B896] border border-[#C9A96E]/40' }
  const NEUTRAL = { bg: 'bg-gray-800/50', border: 'border-gray-600', text: 'text-gray-300', badge: 'bg-gray-600 text-white' }
  const colorsFor = (tier: string) => (tier === topTier ? GOLD : NEUTRAL)

  const currentColors = colorsFor(tierInfo?.tier || '')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">DR7 Club</h2>
          {isActive ? (
            <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm font-bold">{t({ it: "Attivo", en: "Active" })}</span>
          ) : (
            <span className="px-3 py-1 bg-gray-700 text-gray-400 text-sm font-bold">{t({ it: "Non iscritto", en: "Not enrolled" })}</span>
          )}
        </div>
        <p className="text-gray-400 text-sm">
          {t({ it: "Guadagna fino al", en: "Earn up to" })} {tiers.length > 0 ? tiers[tiers.length - 1].rewardPercent : 0}% {t({ it: "in credito wallet su ogni noleggio. Più spendi, più guadagni.", en: "in wallet credit on every rental. The more you spend, the more you earn." })}
        </p>
      </div>

      {/* Chi ha lasciato il Club non vede piu' i piani: l'adesione e'
          personale e non si riattiva. */}
      {!isActive && bloccato && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-2">{t({ it: 'Adesione cancellata', en: 'Membership cancelled' })}</h3>
          <p className="text-gray-400 text-sm">
            {t({
              it: 'Hai cancellato la tua adesione al DR7 Club. La cancellazione è definitiva e personale: non è possibile riattivare l’adesione né effettuare una nuova iscrizione.',
              en: 'You cancelled your DR7 Club membership. The cancellation is final and personal: the membership cannot be reactivated and a new enrolment is not possible.',
            })}
          </p>
        </div>
      )}

      {/* Subscription Plans (if not active) */}
      {!isActive && !bloccato && (
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
                  <h4 className="text-white font-bold text-lg">{plans.monthly.label}</h4>
                  <p className="text-gray-400 text-sm">{t({ it: "Flessibile, senza vincoli", en: "Flexible, no commitment" })}</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-white">€{plans.monthly.price.toFixed(2)}</span>
                  <span className="text-gray-400 text-sm">{plans.monthly.period}</span>
                </div>
              </div>
              <button
                onClick={() => handleSubscribe('monthly')}
                disabled={subscribing}
                className="w-full mt-3 py-2.5 bg-white text-black font-bold hover:bg-gray-200 transition-colors text-sm"
              >
                {t({ it: "Iscriviti ora", en: "Join now" })}
              </button>
            </div>

            {/* Annual */}
            <div className="border-2 border-[#C9A96E]/50 rounded-lg p-5 relative">
              <div className="absolute -top-3 left-4 px-2 py-0.5 bg-[#C9A96E] text-black text-xs font-bold">{t({ it: "RISPARMIA 33%", en: "SAVE 33%" })}</div>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="text-white font-bold text-lg">{plans.annual.label}</h4>
                  <p className="text-gray-400 text-sm">+ €{ANNUAL_RENEWAL_BONUS} {t({ it: "bonus rinnovo", en: "renewal bonus" })}</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-[#D4B896]">€{plans.annual.price}</span>
                  <span className="text-gray-400 text-sm">{plans.annual.period}</span>
                </div>
              </div>
              <button
                onClick={() => handleSubscribe('annual')}
                disabled={subscribing}
                className="w-full mt-3 py-2.5 bg-[#C9A96E] text-black font-bold hover:bg-[#D4B896] transition-colors text-sm"
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

          <div className="mt-6 pt-4 border-t border-gray-800 flex justify-end">
            <button
              onClick={() => { setCancelError(null); setShowCancelModal(true) }}
              className="px-5 py-2.5 border border-red-500/50 text-red-400 font-bold hover:bg-red-600 hover:text-white transition-colors text-sm"
            >
              {t({ it: 'Elimina DR7 Club', en: 'Delete DR7 Club' })}
            </button>
          </div>
        </div>
      )}

      {/* Tier & Progress */}
      {tierInfo && (
        <div className={`${currentColors.bg} border ${currentColors.border} rounded-lg p-6`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 text-sm font-bold ${currentColors.badge}`}>
                {tierInfo.label}
              </span>
              <div>
                <p className="text-white font-bold">{t({ it: "Livello", en: "Tier" })} {tierInfo.label}</p>
                <p className="text-gray-400 text-sm">{t({ it: "Premio:", en: "Reward:" })} {tierInfo.rewardPercent}% {t({ it: "su ogni noleggio", en: "on every rental" })}</p>
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
                <span>{t({ it: "Livello", en: "Tier" })} {tiers.find(x => x.tier === tierInfo.nextTier)?.label} (€{tierInfo.nextTierThreshold.toLocaleString()})</span>
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
            <p className="mt-3 text-sm text-[#D4B896] font-medium">{t({ it: "Hai raggiunto il livello massimo!", en: "You have reached the top tier!" })} {tierInfo.rewardPercent}% {t({ it: "di premio su ogni noleggio.", en: "reward on every rental." })}</p>
          )}
        </div>
      )}

      {/* Tiers Table — le vignette dei livelli, le stesse che vede il
          pubblico su /membership: un solo componente, cosi' non possono
          divergere. La lista viene da Centralina Pro; se l'operatore ha spento
          tutti i livelli non c'e' nulla da mostrare. */}
      {tiers.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">{t({ it: "Livelli DR7 Club", en: "DR7 Club tiers" })}</h3>
          <ClubTiersBoard
            bare
            lang={lang}
            eyebrow=""
            title=""
            currentTier={tierInfo?.tier || null}
          />
        </div>
      )}

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
            <span>{t({ it: 'Pagamento anticipato (100%): premio base fino al', en: 'Full upfront payment (100%): base reward up to' })} {tiers.length > 0 ? tiers[tiers.length - 1].rewardPercent : 0}%</span>
          </li>
        </ul>
      </div>

      {/* Variazione del prezzo e cancellazione.
          Testo contrattuale: il prezzo dell'abbonamento si aggiorna nel tempo
          e il rinnovo addebita il listino del momento, quindi la regola deve
          stare scritta dove l'abbonato la legge, non solo nelle condizioni. */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-3">
          {t({ it: "Variazione del prezzo e cancellazione", en: "Price changes and cancellation" })}
        </h3>
        <div className="space-y-3 text-sm text-gray-400">
          <p>
            {t({
              it: "Il prezzo dell'abbonamento DR7 Club potrà essere aggiornato nel tempo. Eventuali variazioni saranno comunicate preventivamente al Cliente e saranno applicate a partire dal rinnovo indicato nella comunicazione.",
              en: "The price of the DR7 Club subscription may be updated over time. Any change will be communicated to the Customer in advance and will apply from the renewal indicated in that communication.",
            })}
          </p>
          <p>
            {t({
              it: "Prima dell'entrata in vigore del nuovo prezzo, il Cliente potrà scegliere se proseguire l'abbonamento alle nuove condizioni oppure cancellarlo senza alcuna penale.",
              en: "Before the new price takes effect, the Customer may choose either to continue the subscription under the new terms or to cancel it without any penalty.",
            })}
          </p>
          <p>
            {t({
              it: "La cancellazione comporta la cessazione dell'adesione al DR7 Club e la conseguente perdita dei privilegi e dei benefici connessi allo status di membro, secondo quanto previsto dalle Condizioni del Club. Una volta cancellata, l'adesione non potrà essere riattivata.",
              en: "Cancellation ends the DR7 Club membership and with it the privileges and benefits attached to member status, as set out in the Club Conditions. Once cancelled, the membership cannot be reactivated.",
            })}
          </p>
        </div>
      </div>

      {/* Conferma di uscita dal Club. Il testo dice per intero cosa succede
          — perdita dei benefici, cancellazione definitiva e personale — perche'
          dopo la conferma non c'e' modo di tornare indietro. */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-lg w-full p-5 md:p-6 max-h-[90dvh] overflow-y-auto">
            <h3 className="text-xl md:text-2xl font-bold text-white mb-4">
              {t({ it: 'Sei sicuro di voler lasciare DR7 Club?', en: 'Are you sure you want to leave DR7 Club?' })}
            </h3>
            <div className="space-y-3 text-sm text-gray-300 mb-6">
              <p>
                {t({
                  it: 'Cancellando l’abbonamento, perderai tutti i privilegi e i benefici connessi al tuo status di membro DR7 Club.',
                  en: 'By cancelling the subscription you will lose every privilege and benefit attached to your DR7 Club member status.',
                })}
              </p>
              <p>
                {t({
                  it: 'La cancellazione è definitiva e personale. Una volta confermata, non sarà possibile riattivare l’adesione né effettuare una nuova iscrizione al DR7 Club, anche tramite un nuovo account o profilo associato ai medesimi dati personali e documenti.',
                  en: 'The cancellation is final and personal. Once confirmed, the membership cannot be reactivated and no new DR7 Club enrolment will be possible, including through a new account or profile linked to the same personal data and documents.',
                })}
              </p>
              <p className="text-white font-medium">
                {t({ it: 'Vuoi procedere con la cancellazione?', en: 'Do you want to proceed with the cancellation?' })}
              </p>
            </div>
            {cancelError && (
              <p className="text-sm text-red-400 bg-red-900/20 p-3 rounded-md mb-4">{cancelError}</p>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => { setShowCancelModal(false); setCancelError(null) }}
                disabled={cancelling}
                className="flex-1 px-5 py-2.5 bg-white text-black font-bold hover:bg-gray-200 transition-colors text-sm disabled:opacity-50"
              >
                {t({ it: 'Mantieni il mio DR7 Club', en: 'Keep my DR7 Club' })}
              </button>
              <button
                onClick={handleCancelClub}
                disabled={cancelling}
                className="flex-1 px-5 py-2.5 bg-red-600 text-white font-bold hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
              >
                {cancelling
                  ? t({ it: 'Cancellazione in corso...', en: 'Cancelling...' })
                  : t({ it: 'Conferma cancellazione definitiva', en: 'Confirm permanent cancellation' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DR7Club
