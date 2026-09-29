/**
 * annulla-prenotazione-cliente
 *
 * Il cliente annulla una sua prenotazione da "Le mie prenotazioni".
 *
 * 29/09/2026 — prima faceva tutto il browser: calcolava la percentuale e
 * chiamava add_credits sul 90% di price_total. Una prenotazione mai pagata
 * (link Nexi aperto e abbandonato) annullata cosi' ha regalato 704,62 EUR, e
 * add_credits era chiamabile dalla console da chiunque.
 *
 * Qui, lato server:
 *   1. il chiamante deve essere il titolare della prenotazione;
 *   2. la regola (Centralina Pro > Regole di cancellazione) si applica con la
 *      stessa funzione del sito (utils/regoleAnnullamento.ts); "Elite" = DR7
 *      Club attivo nel database, non un campo del profilo che il cliente puo'
 *      scriversi da solo;
 *   3. si rimborsa una percentuale di quanto e' stato DAVVERO incassato:
 *      addebiti wallet collegati alla prenotazione, oppure ordine Nexi
 *      verificato su Nexi. Senza una prova d'incasso niente accredito
 *      automatico: la richiesta resta all'ufficio (pending_card_refund).
 *
 * POST { bookingId }  —  Authorization: Bearer <jwt del cliente>
 */

import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsOrigin } from './utils/cors'
import { normalizzaRegole, pickRule, detectDr7Flex } from '../../utils/regoleAnnullamento'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { leggiOrdineNexi } = require('./utils/nexiOrdine')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const PAGATI = ['paid', 'succeeded', 'completed']

/** Il numero d'ordine compare solo su questa prenotazione (nessun'altra riga lo usa)? */
async function ordineSoloDiQuesta(sb: any, ordine: string, bookingId: string): Promise<boolean> {
  const controlli: Array<[string, (q: any) => any]> = [
    ['bookings', (q) => q.eq('nexi_order_id', ordine).neq('id', bookingId)],
    ['bookings', (q) => q.eq('booking_details->>nexi_order_id', ordine).neq('id', bookingId)],
    ['credit_wallet_purchases', (q) => q.eq('nexi_order_id', ordine)],
    ['membership_purchases', (q) => q.eq('nexi_order_id', ordine)],
    ['dr7_club_subscriptions', (q) => q.eq('nexi_order_id', ordine)],
    ['prevendite_clienti', (q) => q.eq('nexi_order_id', ordine)],
  ]
  for (const [tabella, filtro] of controlli) {
    const { data, error } = await filtro(sb.from(tabella).select('id')).limit(1)
    if (error || (data && data.length > 0)) return false
  }
  return true
}

/** Email dell'account e della sua scheda cliente, in minuscolo. */
async function emailDelCliente(sb: any, userId: string, emailAccount?: string | null): Promise<Set<string>> {
  const { data: schede } = await sb.from('customers_extended').select('email').eq('user_id', userId)
  return new Set(
    [emailAccount, ...((schede || []).map((r: { email?: string }) => r.email))]
      .filter(Boolean).map((e) => String(e).toLowerCase().trim())
  )
}
const r2 = (n: number) => Math.round(n * 100) / 100

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': getCorsOrigin(event.headers.origin || event.headers.Origin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
  const risposta = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers, body: JSON.stringify(body) })

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'POST') return risposta(405, { error: 'Method not allowed' })

  try {
    const { bookingId } = JSON.parse(event.body || '{}')
    if (!bookingId) return risposta(400, { error: 'bookingId obbligatorio' })

    const jwt = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
    if (!jwt) return risposta(401, { error: 'Accesso richiesto' })

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: userData } = await sb.auth.getUser(jwt)
    const userId = userData?.user?.id
    if (!userId) return risposta(401, { error: 'Sessione non valida' })

    const { data: booking, error: bErr } = await sb
      .from('bookings')
      .select('id, user_id, status, payment_status, payment_method, price_total, service_type, service_name, vehicle_name, pickup_date, appointment_date, booking_details, nexi_order_id')
      .eq('id', bookingId)
      .maybeSingle()
    if (bErr || !booking) return risposta(404, { error: 'Prenotazione non trovata' })
    if (booking.user_id !== userId) return risposta(403, { error: 'Prenotazione di un altro account' })
    if (['cancelled', 'annullata', 'canceled'].includes(String(booking.status || '').toLowerCase())) {
      return risposta(409, { error: 'Prenotazione gia\' annullata' })
    }

    // ── Regola ───────────────────────────────────────────────────────────
    const isCarWash = booking.service_type === 'car_wash'
    const dateStr = isCarWash
      ? (booking.appointment_date || booking.pickup_date || '')
      : (booking.pickup_date || booking.appointment_date || '')
    const daysUntilPickup = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    if (!(daysUntilPickup > 0)) return risposta(409, { error: 'Non e\' piu\' possibile cancellare questa prenotazione.' })

    const { data: cfgRow } = await sb.from('centralina_pro_config').select('config').eq('id', 'main').maybeSingle()
    const cfg = (cfgRow?.config ?? {}) as Record<string, any>
    const regole = normalizzaRegole(cfg?.automations?.cancellation_rules)

    // Nomi Experience per riconoscere il DR7 Flex salvato solo per id.
    const expNameById: Record<string, string> = {}
    ;((cfg?.servizi?.experience) || []).forEach((s: { id?: string; name?: string }) => {
      const key = s?.id || s?.name
      if (key) expNameById[key] = s?.name || ''
    })

    const bd = (booking.booking_details || {}) as Record<string, any>
    const { data: club } = await sb
      .from('dr7_club_subscriptions')
      .select('id, expires_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('expires_at', { ascending: false })
      .limit(1)
    const isElite = !!(club && club[0] && (!club[0].expires_at || new Date(club[0].expires_at).getTime() > Date.now()))

    const regola = pickRule(regole, {
      daysUntilPickup,
      serviceType: isCarWash ? 'carwash' : 'rental',
      hasDr7Flex: detectDr7Flex(bd, expNameById),
      hasPrimeFlex: bd.prime_flex === true || bd.prime_flex === 'true',
      isElite,
    })
    if (!regola) return risposta(409, { error: 'Cancellazione non disponibile per questa prenotazione.' })

    // ── Annullamento (una volta sola) ────────────────────────────────────
    const { data: annullata, error: upErr } = await sb
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', booking.id)
      .not('status', 'in', '("cancelled","annullata","canceled")')
      .select('id')
      .maybeSingle()
    if (upErr) return risposta(500, { error: upErr.message })
    if (!annullata) return risposta(409, { error: 'Prenotazione gia\' annullata' })

    // ── Quanto e' stato davvero incassato ─────────────────────────────────
    const statoPagamento = String(booking.payment_status || '').toLowerCase()
    const pagata = PAGATI.includes(statoPagamento)
    // Acconto: qualcosa e' stato pagato, ma non il totale. Niente automatico,
    // decide l'ufficio (prima: nessun rimborso e nessun avviso all'ufficio).
    const parziale = ['partial', 'parziale'].includes(statoPagamento)
    const totaleEur = r2(Number(booking.price_total || 0) / 100)
    let incassatoEur = 0
    let prova: string | null = null

    if (pagata && regola.refundPercent > 0) {
      // Solo i movimenti DEL CLIENTE sul SUO wallet, e ogni rimborso gia' fatto
      // si toglie (storno del trigger e rimborsi di cancellazione). Prima si
      // contavano anche gli addebiti di altri account sulla stessa prenotazione.
      const { data: movimenti } = await sb
        .from('credit_transactions')
        .select('transaction_type, reference_type, amount')
        .eq('reference_id', booking.id)
        .eq('user_id', userId)
      const dalWallet = (movimenti || []).reduce((acc: number, m: { transaction_type: string; reference_type: string | null; amount: number }) => {
        if (m.transaction_type === 'debit') return acc + Number(m.amount || 0)
        if (['booking_refund', 'refund', 'booking_cancellation_refund'].includes(String(m.reference_type))) return acc - Number(m.amount || 0)
        return acc
      }, 0)
      if (dalWallet > 0.009) {
        incassatoEur = r2(dalWallet)
        prova = 'wallet'
      } else {
        const ordine = String(booking.nexi_order_id || bd.nexi_order_id || '')
        // L'ordine Nexi vale come prova solo se: e' di questa prenotazione e
        // di nessun'altra riga, e su Nexi e' intestato a questo cliente. La
        // prenotazione la scrive il browser: senza questi controlli ci si
        // poteva mettere il numero di un ordine pagato da qualcun altro.
        if (/^[A-Za-z0-9]{6,50}$/.test(ordine) && await ordineSoloDiQuesta(sb, ordine, booking.id)) {
          try {
            const esito = await leggiOrdineNexi(ordine)
            const emailValide = await emailDelCliente(sb, userId, userData?.user?.email)
            if (esito.paid && esito.importoCents > 0 && emailValide.has(esito.clienteOrdine)) {
              incassatoEur = r2(esito.importoCents / 100)
              prova = 'nexi'
            }
          } catch (e) {
            console.warn('[annulla-prenotazione-cliente] verifica Nexi fallita:', (e as Error).message)
          }
        }
      }
      incassatoEur = Math.min(incassatoEur, totaleEur)
    }

    const baseEur = incassatoEur
    const rimborsoEur = r2((baseEur * regola.refundPercent) / 100)
    const itemLabel = booking.service_name || booking.vehicle_name || 'Prenotazione'
    const hasFlex = regola.requiresService !== 'none'

    // Pagata ma senza prova d'incasso automatica, oppure regola "su carta":
    // la decide l'ufficio.
    const manuale = (pagata || parziale) && regola.refundPercent > 0 && (regola.refundMethod === 'card' || !prova || parziale)
    if (manuale) {
      const importoIndicativo = rimborsoEur > 0 ? rimborsoEur : r2((totaleEur * regola.refundPercent) / 100)
      await sb
        .from('bookings')
        .update({
          booking_details: {
            ...bd,
            pending_card_refund: {
              amount_eur: importoIndicativo,
              refund_pct: regola.refundPercent,
              requested_at: new Date().toISOString(),
              status: 'pending',
              note: regola.refundMethod === 'card'
                ? 'Cancellazione cliente — admin deve processare rimborso su carta via Nexi terminal'
                : parziale
                  ? 'Cancellazione cliente — prenotazione con acconto: controllare quanto incassato e rimborsare a mano'
                  : 'Cancellazione cliente — incasso non verificabile in automatico: controllare il pagamento e rimborsare a mano',
            },
          },
        })
        .eq('id', booking.id)
      return risposta(200, { ok: true, rimborso: 'manuale', refundPercent: regola.refundPercent, refundMethod: regola.refundMethod })
    }

    if (pagata && rimborsoEur > 0) {
      const description = hasFlex
        ? `Rimborso DR7 Flex (${regola.refundPercent}%) — ${itemLabel}`
        : `Rimborso cancellazione (${regola.refundPercent}%) — ${itemLabel}`
      const { data: acc, error: accErr } = await sb.rpc('add_credits', {
        p_user_id: userId,
        p_amount: rimborsoEur,
        p_description: description,
        p_reference_id: booking.id,
        p_reference_type: 'refund',
      })
      const esito = Array.isArray(acc) ? acc[0] : acc
      if (accErr || !esito?.success) {
        console.error('[annulla-prenotazione-cliente] accredito rimborso fallito:', accErr?.message || esito?.error_message)
        await sb
          .from('bookings')
          .update({
            booking_details: {
              ...bd,
              pending_card_refund: {
                amount_eur: rimborsoEur,
                refund_pct: regola.refundPercent,
                requested_at: new Date().toISOString(),
                status: 'pending',
                note: `Cancellazione cliente — accredito wallet automatico fallito (${accErr?.message || esito?.error_message || 'errore'}): accreditare a mano`,
              },
            },
          })
          .eq('id', booking.id)
        // Annullata comunque: il rimborso passa all'ufficio.
        return risposta(200, { ok: true, rimborso: 'manuale', refundPercent: regola.refundPercent, refundMethod: 'wallet' })
      }
      return risposta(200, { ok: true, rimborso: 'wallet', refundPercent: regola.refundPercent, refundEuros: rimborsoEur })
    }

    return risposta(200, { ok: true, rimborso: 'nessuno', refundPercent: 0 })
  } catch (err) {
    console.error('[annulla-prenotazione-cliente]', (err as Error).message)
    return risposta(500, { error: 'Errore interno' })
  }
}
