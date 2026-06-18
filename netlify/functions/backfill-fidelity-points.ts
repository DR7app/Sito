import type { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

/**
 * ONE-OFF BACKFILL — accredita i punti fedeltà mancanti a TUTTI i clienti.
 *
 * Bug (giugno 2026): per i lavaggi pagati online il booking veniva creato solo
 * DOPO il pagamento (nexi-callback) ma i punti non venivano assegnati, quindi
 * molti clienti sono rimasti a 0 punti pur avendo pagato.
 *
 * Questa funzione trova TUTTI i lavaggi PAGATI senza un award di punti e
 * richiama /award-fidelity-points per ciascuno, in ordine cronologico, così
 * il calcolo cumulativo (1€ = 1 punto, voucher €25 a 250 punti) e i voucher
 * risultano corretti. È IDEMPOTENTE: award-fidelity-points blocca i doppioni
 * via fidelity_point_awards.booking_id UNIQUE, quindi rilanciarla è sicuro.
 *
 * Protetta da un confirm token per evitare trigger accidentali (invia voucher
 * + WhatsApp): chiamare con ?confirm=BACKFILL-FIDELITY-2026
 * (opzionale &dryRun=1 per vedere quanti candidati senza inviare nulla).
 */
const CONFIRM_TOKEN = "BACKFILL-FIDELITY-2026"

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ""
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

export const handler: Handler = async (event) => {
  if ((event.queryStringParameters?.confirm || "") !== CONFIRM_TOKEN) {
    return { statusCode: 403, body: JSON.stringify({ error: "Confirm token mancante o errato" }) }
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Supabase env mancante" }) }
  }
  const dryRun = (event.queryStringParameters?.dryRun || "") === "1"
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  const siteUrl = process.env.URL || process.env.DEPLOY_URL || ""

  // 1. Tutti i lavaggi PAGATI, dal più vecchio al più recente.
  const paid: Array<{ id: string; created_at: string }> = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, created_at")
      .in("service_type", ["car_wash", "carwash"])
      .in("payment_status", ["paid", "succeeded", "completed"])
      .order("created_at", { ascending: true })
      .range(start, start + 999)
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
    if (!data || data.length === 0) break
    paid.push(...data)
    if (data.length < 1000) break
  }

  // 2. Quali hanno già un award → escludili.
  const awarded = new Set<string>()
  for (let start = 0; ; start += 1000) {
    const { data } = await supabase
      .from("fidelity_point_awards")
      .select("booking_id")
      .range(start, start + 999)
    if (!data || data.length === 0) break
    data.forEach((r: { booking_id: string }) => awarded.add(r.booking_id))
    if (data.length < 1000) break
  }
  const todo = paid.filter((b) => !awarded.has(b.id))

  if (dryRun) {
    return { statusCode: 200, body: JSON.stringify({ dryRun: true, paid: paid.length, candidates: todo.length }) }
  }

  // 3. Richiama award-fidelity-points per ciascuno (idempotente), in ordine.
  let processed = 0, awardedOk = 0, vouchers = 0, skipped = 0, errors = 0
  const detail: Array<Record<string, unknown>> = []
  for (const b of todo) {
    try {
      const res = await fetch(`${siteUrl}/.netlify/functions/award-fidelity-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: b.id }),
      })
      const j = await res.json().catch(() => ({} as Record<string, unknown>))
      processed++
      if (j?.skipped) skipped++
      else { awardedOk++; if (j?.voucher) vouchers++ }
      detail.push({ bookingId: b.id, ...j })
    } catch (e) {
      errors++
      detail.push({ bookingId: b.id, error: String(e) })
    }
    await new Promise((r) => setTimeout(r, 150)) // throttle: non floodare WhatsApp
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      candidates: todo.length,
      processed, awarded: awardedOk, vouchers, skipped, errors,
      detail: detail.slice(0, 200),
    }),
  }
}
