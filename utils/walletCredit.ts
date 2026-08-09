/**
 * FONTE UNICA di verita' per la classificazione del credito wallet.
 *
 * Il saldo di un cliente e' composto da due nature di denaro:
 *
 *   CREDITO REALE  = soldi effettivamente incassati da DR7
 *                    (ricarica pagata con carta, ricarica registrata a mano
 *                    dall'operatore, rimborso di un pagamento reale)
 *   BONUS          = denaro regalato da DR7
 *                    (bonus pacchetto ricarica, cashback DR7 Club, referral,
 *                    omaggi, interessi Club)
 *
 * La natura si legge da `credit_transactions.reference_type`. Prima del
 * 2026-08-08 questa lista era ricopiata a mano in QUATTRO punti diversi
 * (ProfileSettings, accrue-club-wallet-interest, i due dr7ClubCashback) e le
 * copie NON coincidevano: `wallet_package_bonus` mancava lato sito, quindi il
 * bonus pacchetto veniva mostrato come credito reale, mentre `admin_manual`
 * (una ricarica REALE registrata dall'operatore) veniva mostrato come bonus.
 * Risultato: ricarica e bonus invertiti sul profilo (caso Runchina: 1.000 di
 * ricarica mostrati come bonus, 290 di bonus mostrati come credito).
 *
 * REGOLA DI CONSUMO (decisa dalla direzione, 2026-08-08): quando il cliente
 * spende dal wallet si consuma PRIMA il credito reale, il bonus per ULTIMO.
 * Quindi:
 *     bonusResiduo   = min(saldo, somma storica dei bonus accreditati)
 *     creditoReale   = saldo - bonusResiduo
 * E' la stessa formula usata dal cron degli interessi DR7 Club
 * (`accrue-club-wallet-interest.ts`), cosi' il "capitale" su cui matura lo
 * 0,1%/giorno e il "Credito reale" mostrato al cliente sono sempre lo stesso
 * numero.
 *
 * Il mirror lato admin e' `DR7-staging/netlify/functions/utils/walletCredit.ts`
 * (platform.dr7ai.com). Le due liste DEVONO restare identiche: modificando una,
 * modificare anche l'altra.
 */

/**
 * reference_type che rappresentano denaro REGALATO da DR7.
 * Tutto cio' che non e' in questa lista e' considerato credito reale.
 */
export const WALLET_BONUS_REFERENCE_TYPES: ReadonlySet<string> = new Set([
  // Cashback su pagamenti con carta (tier DR7 Club)
  'card_bonus',
  'cashback_3_percent',      // legacy: cashback fisso 3% pre-migrazione tier
  // Bonus del pacchetto ricarica (received_amount - recharge_amount)
  'wallet_package_bonus',
  // Bonus di benvenuto / registrazione
  'welcome_bonus',
  'registration_bonus',
  // Bonus iscrizione DR7 Club
  'dr7_club_signup_bonus',
  'club_signup_bonus',
  // Programma referral
  'referral',
  'referral_bonus',
  'referral_friend_topup',
  'milestone',
  'milestone_10_friends',
  // Interessi DR7 Club Privilege accreditati
  'club_interest_payout',
  // Credito inserito dall'operatore in admin come OMAGGIO (scelta esplicita
  // nella tab Wallet di platform.dr7ai.com).
  'admin_bonus',
  // Ricarica ricorrente assegnata dalla direzione (es. ogni 15 del mese):
  // e' un regalo, non denaro incassato -> non e' capitale, non fa interessi.
  'wallet_auto_recharge',
  // Omaggi generici
  'gift',
  'voucher',
  'compensation',
])

/**
 * reference_type che rappresentano denaro REALMENTE INCASSATO da DR7.
 * Elencati per documentazione e per intercettare i typo: la classificazione
 * effettiva e' "non presente in WALLET_BONUS_REFERENCE_TYPES".
 *
 * NOTA sul credito inserito da admin: la natura NON e' deducibile dall'importo
 * ne' dal canale, la sceglie l'operatore nella tab Wallet di
 * platform.dr7ai.com. Un bonifico registrato a mano e' credito reale; una
 * ricarica ricorrente assegnata dalla direzione (es. ogni 15 del mese) e' un
 * omaggio. Per questo esistono due reference_type distinti: `admin_topup`
 * (incasso reale, qui sotto) e `admin_bonus` (omaggio, nella lista bonus).
 */
export const WALLET_REAL_REFERENCE_TYPES: ReadonlySet<string> = new Set([
  'wallet_purchase',        // ricarica pagata con carta (quota pagata)
  'wallet_purchase_fix',    // correzione manuale di una ricarica non accreditata
  'purchase',               // default storico di add_credits
  'topup',
  'admin_topup',            // incasso reale registrato a mano dall'operatore
  // Legacy: fino al 2026-08-08 ogni credito inserito da admin scriveva
  // 'admin_manual'. Per la direzione un credito inserito da un operatore e'
  // sempre denaro incassato (gli omaggi ricorrenti passano dal cron con
  // 'wallet_auto_recharge'), quindi e' credito reale. La migrazione
  // 20260809000000 riscrive queste righe come 'admin_topup'.
  'admin_manual',
  'admin_credit',
  'refund',                 // rimborso di un pagamento reale
  'booking_cancellation_refund',
])

/** true se il reference_type rappresenta denaro regalato da DR7. */
export function isBonusReferenceType(referenceType: string | null | undefined): boolean {
  return WALLET_BONUS_REFERENCE_TYPES.has(String(referenceType || '').toLowerCase())
}

/** Etichette italiane per il dettaglio "da dove arriva il bonus". */
export const WALLET_REFERENCE_LABELS: Record<string, string> = {
  card_bonus: 'Cashback pagamento con carta',
  cashback_3_percent: 'Cashback pagamento con carta',
  wallet_package_bonus: 'Bonus pacchetto ricarica',
  welcome_bonus: 'Bonus di benvenuto',
  registration_bonus: 'Bonus registrazione',
  dr7_club_signup_bonus: 'Bonus iscrizione DR7 Club',
  club_signup_bonus: 'Bonus iscrizione DR7 Club',
  referral: 'Bonus invito amico',
  referral_bonus: 'Bonus invito amico',
  referral_friend_topup: 'Bonus amico referral',
  milestone: 'Traguardo invito amico',
  milestone_10_friends: 'Traguardo 10 amici',
  club_interest_payout: 'Interesse DR7 CLUB PRIVILEGE',
  gift: 'Regalo / omaggio',
  voucher: 'Buono / voucher',
  compensation: 'Indennizzo',
}

export interface WalletTransactionLike {
  amount: number | string | null
  transaction_type?: string | null
  reference_type?: string | null
}

export interface WalletSplit {
  /** Saldo totale del wallet. */
  balanceEur: number
  /** Quota di saldo derivante da denaro realmente pagato dal cliente. */
  realEur: number
  /** Quota di saldo derivante da bonus/omaggi DR7. */
  bonusEur: number
  /** Dettaglio dei bonus accreditati nel tempo, per reference_type. */
  bonusBreakdown: Array<{ referenceType: string; label: string; amount: number; count: number }>
}

/**
 * Divide il saldo attuale in credito reale + bonus applicando la regola di
 * consumo "prima il credito reale, il bonus per ultimo".
 *
 * `transactions` deve contenere TUTTE le transazioni del cliente (non solo le
 * ultime N): il bonus e' una somma storica.
 */
export function splitWalletBalance(
  balanceEur: number,
  transactions: WalletTransactionLike[] | null | undefined
): WalletSplit {
  const balance = Number(balanceEur) || 0
  let lifetimeBonus = 0
  const breakdown = new Map<string, { amount: number; count: number }>()

  for (const t of transactions || []) {
    if (t.transaction_type !== 'credit') continue
    const ref = String(t.reference_type || '').toLowerCase()
    if (!WALLET_BONUS_REFERENCE_TYPES.has(ref)) continue
    const amt = Number(t.amount || 0)
    if (!Number.isFinite(amt) || amt <= 0) continue
    lifetimeBonus += amt
    const cur = breakdown.get(ref) || { amount: 0, count: 0 }
    breakdown.set(ref, { amount: cur.amount + amt, count: cur.count + 1 })
  }

  // Il bonus si consuma per ultimo -> il residuo non puo' superare il saldo.
  const bonusEur = Math.round(Math.min(Math.max(balance, 0), lifetimeBonus) * 100) / 100
  const realEur = Math.round(Math.max(0, balance - bonusEur) * 100) / 100

  const bonusBreakdown = Array.from(breakdown.entries())
    .map(([referenceType, v]) => ({
      referenceType,
      label: WALLET_REFERENCE_LABELS[referenceType] || referenceType,
      amount: Math.round(v.amount * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => b.amount - a.amount)

  return { balanceEur: balance, realEur, bonusEur, bonusBreakdown }
}
